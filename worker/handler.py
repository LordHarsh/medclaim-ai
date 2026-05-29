"""
AWS Lambda Handler — SQS Event Entry Point.

Processes insurance claims triggered by SQS messages.
Each message contains a claim_id to process.
"""

import json
import traceback

import boto3
import logfire
from dotenv import load_dotenv
from config import (
    LANGSMITH_API_KEY,
    LANGSMITH_ENDPOINT,
    LANGSMITH_PROJECT,
    LANGSMITH_TRACING,
    LOGFIRE_ENVIRONMENT,
    LOGFIRE_SERVICE_NAME,
    LOGFIRE_TOKEN,
)

# Load env vars (for local development)
load_dotenv()

# Configure logfire — disable sending if no token is set (avoids 401 errors)
if LOGFIRE_TOKEN:
    logfire.configure(
        token=LOGFIRE_TOKEN,
        service_name=LOGFIRE_SERVICE_NAME,
        environment=LOGFIRE_ENVIRONMENT,
        send_to_logfire=True,
    )
else:
    logfire.configure(send_to_logfire=False)

# Configure LangSmith tracing
if LANGSMITH_TRACING:
    import os

    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_PROJECT", LANGSMITH_PROJECT)
    if LANGSMITH_API_KEY:
        os.environ.setdefault("LANGCHAIN_API_KEY", LANGSMITH_API_KEY)
    if LANGSMITH_ENDPOINT:
        os.environ.setdefault("LANGCHAIN_ENDPOINT", LANGSMITH_ENDPOINT)


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

    logfire.info("claim.process.start", claim_id=claim_id)

    # Fetch claim from database
    claim = fetch_claim(claim_id)
    if not claim:
        logfire.error("claim.not_found", claim_id=claim_id, _exc_info=True)
        return

    # Update status to PROCESSING
    update_claim_status(claim_id, "PROCESSING", "LOAD_CONTEXT")

    # Fetch related data
    member = fetch_member(claim["member_id"])
    if not member:
        logfire.error("member.not_found", claim_id=claim_id, member_id=claim["member_id"], _exc_info=True)
        update_claim_status(claim_id, "FAILED")
        return

    policy = fetch_policy_config(claim["policy_id"])
    if not policy:
        logfire.error("policy.not_found", claim_id=claim_id, policy_id=claim["policy_id"], _exc_info=True)
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
            logfire.warning("s3.document_fetch_failed", claim_id=claim_id, s3_key=doc["s3_key"], error=str(e))
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
    with logfire.span("pipeline.invoke", claim_id=claim_id, category=initial_state["category"]):
        result = pipeline.invoke(initial_state)

    if result:
        decision = (result.get("final_decision") or {}).get("decision", "N/A")
        logfire.info("claim.process.complete", claim_id=claim_id, decision=decision)
    else:
        logfire.error("claim.process.pipeline_returned_none", claim_id=claim_id, _exc_info=True)
        update_claim_status(claim_id, "FAILED")
        logfire.error("claim.process.failed", claim_id=claim_id, reason="pipeline_returned_none", _exc_info=True)


def lambda_handler(event, context):
    """
    AWS Lambda entry point.

    Processes SQS event records containing claim_ids.
    """
    record_count = len(event.get("Records", []))
    logfire.info("lambda.batch.received", record_count=record_count, aws_request_id=getattr(context, "aws_request_id", None))

    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            claim_id = body["claim_id"]
            sqs_message_id = record.get("messageId")

            logfire.info("lambda.record.start", claim_id=claim_id, sqs_message_id=sqs_message_id)

            # Idempotency check
            from db import check_idempotency

            if sqs_message_id and check_idempotency(claim_id, sqs_message_id):
                logfire.info("lambda.record.skipped_idempotent", claim_id=claim_id, sqs_message_id=sqs_message_id)
                continue

            # Process the claim
            process_claim(claim_id)

        except KeyError as e:
            logfire.error("lambda.record.invalid_message", error=str(e), record_body=record.get("body", "N/A"), _exc_info=True)
        except json.JSONDecodeError as e:
            logfire.error("lambda.record.invalid_json", error=str(e), _exc_info=True)
        except Exception as e:
            logfire.exception(
                "lambda.record.exception",
                claim_id=locals().get("claim_id"),
                sqs_message_id=locals().get("sqs_message_id"),
                error=str(e),
                traceback=traceback.format_exc(),
            )
            raise  # Re-raise so SQS retries

    return {"statusCode": 200, "body": "OK"}


# Instrument Lambda AFTER lambda_handler is defined (required by logfire API)
if LOGFIRE_TOKEN:
    lambda_handler = logfire.instrument_aws_lambda(lambda_handler)


# For local testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        test_claim_id = sys.argv[1]
        process_claim(test_claim_id)
    else:
        print("Usage: python handler.py <claim_id>")
