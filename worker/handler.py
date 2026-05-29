"""
AWS Lambda Handler — SQS Event Entry Point.

Processes insurance claims triggered by SQS messages.
Each message contains a claim_id to process.
"""

import json
import logging
import os
import traceback

import boto3
from dotenv import load_dotenv

# Load env vars (for local development)
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("medclaim-worker")

# Configure LangSmith tracing
if os.getenv("LANGSMITH_TRACING", "true").lower() == "true":
    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_PROJECT", os.getenv("LANGSMITH_PROJECT", "MedClaim.AI"))
    if os.getenv("LANGSMITH_API_KEY"):
        os.environ.setdefault("LANGCHAIN_API_KEY", os.getenv("LANGSMITH_API_KEY"))
    if os.getenv("LANGSMITH_ENDPOINT"):
        os.environ.setdefault("LANGCHAIN_ENDPOINT", os.getenv("LANGSMITH_ENDPOINT"))


def process_claim(claim_id: str):
    """
    Process a single claim through the full pipeline.

    1. Fetch claim + documents + member + policy from Neon
    2. Download document images from S3 (if applicable)
    3. Run LangGraph pipeline
    4. Results are persisted by the pipeline's persist nodes
    """
    from config import AWS_REGION, S3_BUCKET_NAME
    from db import (
        fetch_claim,
        fetch_claim_documents,
        fetch_claim_history,
        fetch_member,
        fetch_policy_config,
        fetch_ytd_approved_total,
        update_claim_status,
    )
    from pipeline import get_pipeline
    from state import ClaimState

    logger.info(f"Processing claim: {claim_id}")

    # Fetch claim from database
    claim = fetch_claim(claim_id)
    if not claim:
        logger.error(f"Claim not found: {claim_id}")
        return

    # Update status to PROCESSING
    update_claim_status(claim_id, "PROCESSING", "LOAD_CONTEXT")

    # Fetch related data
    member = fetch_member(claim["member_id"])
    if not member:
        logger.error(f"Member not found: {claim['member_id']}")
        update_claim_status(claim_id, "FAILED")
        return

    policy = fetch_policy_config(claim["policy_id"])
    if not policy:
        logger.error(f"Policy not found: {claim['policy_id']}")
        update_claim_status(claim_id, "FAILED")
        return

    # Fetch documents
    documents = fetch_claim_documents(claim_id)

    # Download document images from S3
    s3_client = boto3.client("s3", region_name=AWS_REGION)
    for doc in documents:
        try:
            response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=doc["s3_key"])
            doc["image_bytes"] = response["Body"].read()
        except Exception as e:
            logger.warning(f"Failed to fetch document from S3: {doc['s3_key']}: {e}")
            doc["image_bytes"] = None

    # Fetch claim history for fraud detection
    claim_history = fetch_claim_history(claim["member_id"])

    # Calculate YTD approved total
    policy_start = policy.get("policy_holder", {}).get("policy_start_date", "2024-04-01")
    ytd_approved = fetch_ytd_approved_total(claim["member_id"], policy_start)

    # Check for simulate_component_failure flag in trace_json or metadata
    simulate_failure = False
    if claim.get("trace_json") and isinstance(claim["trace_json"], dict):
        simulate_failure = claim["trace_json"].get("simulate_component_failure", False)

    # Build initial state
    initial_state: ClaimState = {
        "claim_id": claim_id,
        "member": member,
        "policy": policy,
        "category": claim["category"],
        "claimed_amount": float(claim["claimed_amount"]),
        "treatment_date": str(claim["treatment_date"]),
        "hospital_name": claim.get("hospital_name"),
        "documents": documents,
        "claim_history": [
            {
                "claim_id": str(h.get("claim_id", "")),
                "date": str(h.get("claim_date", "")),
                "amount": float(h.get("amount", 0)),
                "provider": h.get("provider", ""),
                "category": h.get("category", ""),
                "status": h.get("status", ""),
            }
            for h in claim_history
        ],
        "ytd_approved_total": ytd_approved,
        # Agent outputs (populated during pipeline)
        "doc_verification": None,
        "extracted_data": None,
        "policy_evaluation": None,
        "fraud_evaluation": None,
        "final_decision": None,
        # Control flow
        "should_stop_early": False,
        "early_stop_reason": None,
        "early_stop_message": None,
        "degraded_steps": [],
        "confidence_score": 0.95,
        "current_step": "LOAD_CONTEXT",
        # Metadata
        "simulate_component_failure": simulate_failure,
    }

    # Run pipeline
    pipeline = get_pipeline()
    result = pipeline.invoke(initial_state)

    if result:
        decision = (result.get("final_decision") or {}).get("decision", "N/A")
        logger.info(f"Claim {claim_id} processed. Decision: {decision}")
    else:
        logger.error(f"Claim {claim_id}: pipeline returned None")
        update_claim_status(claim_id, "FAILED")


def lambda_handler(event, context):
    """
    AWS Lambda entry point.

    Processes SQS event records containing claim_ids.
    """
    logger.info(f"Received event with {len(event.get('Records', []))} records")

    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            claim_id = body["claim_id"]
            sqs_message_id = record.get("messageId")

            logger.info(f"Processing SQS message {sqs_message_id} for claim {claim_id}")

            # Idempotency check
            from db import check_idempotency

            if sqs_message_id and check_idempotency(claim_id, sqs_message_id):
                logger.info(f"Claim {claim_id} already processed (idempotency check)")
                continue

            # Process the claim
            process_claim(claim_id)

        except KeyError as e:
            logger.error(f"Invalid SQS message format: missing key {e}")
            logger.error(f"Record body: {record.get('body', 'N/A')}")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in SQS message: {e}")
        except Exception as e:
            logger.error(f"Failed to process claim: {e}")
            logger.error(traceback.format_exc())
            raise  # Re-raise so SQS retries

    return {"statusCode": 200, "body": "OK"}


# For local testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        test_claim_id = sys.argv[1]
        process_claim(test_claim_id)
    else:
        print("Usage: python handler.py <claim_id>")
