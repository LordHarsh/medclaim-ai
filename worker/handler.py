import json
import os
import sys
import traceback

import boto3
import logfire
from dotenv import load_dotenv
from core.config import (
    AWS_REGION,
    LANGSMITH_API_KEY,
    LANGSMITH_ENDPOINT,
    LANGSMITH_PROJECT,
    LANGSMITH_TRACING,
    LOGFIRE_ENVIRONMENT,
    LOGFIRE_SERVICE_NAME,
    LOGFIRE_TOKEN,
    S3_BUCKET_NAME,
)

from core.db import (
    check_idempotency,
    fetch_claim,
    fetch_claim_documents,
    fetch_claim_history,
    fetch_member,
    fetch_policy_config,
    fetch_ytd_approved_total,
    update_claim_status,
)
from core.pipeline import get_pipeline
from core.state import ClaimState

# Load env vars (for local development)
load_dotenv()

logfire.configure(
    token=LOGFIRE_TOKEN,
    service_name=LOGFIRE_SERVICE_NAME,
    environment=LOGFIRE_ENVIRONMENT,
)

os.environ["LANGCHAIN_TRACING_V2"] = str(LANGSMITH_TRACING).lower()
os.environ["LANGCHAIN_PROJECT"] = LANGSMITH_PROJECT
os.environ["LANGCHAIN_API_KEY"] = LANGSMITH_API_KEY
os.environ["LANGCHAIN_ENDPOINT"] = LANGSMITH_ENDPOINT


def process_claim(claim_id: str):
    """
    Process a single claim through the full pipeline.

    1. Fetch claim + documents + member + policy from Neon
    2. Download document images from S3 (if applicable)
    3. Run LangGraph pipeline
    4. Results are persisted by the pipeline's persist nodes
    """
    logfire.info("claim.process.start", claim_id=claim_id)

    # Fetch claim from database
    claim = fetch_claim(claim_id)
    if not claim:
        logfire.error("claim.not_found", claim_id=claim_id, _exc_info=True)
        return

    update_claim_status(claim_id, "PROCESSING", "DOCUMENT_VERIFICATION")

    # Fetch related data
    member = fetch_member(claim.member_id)
    if not member:
        logfire.error("member.not_found", claim_id=claim_id, member_id=claim.member_id, _exc_info=True)
        update_claim_status(claim_id, "FAILED")
        return

    policy = fetch_policy_config(claim.policy_id)
    if not policy:
        logfire.error("policy.not_found", claim_id=claim_id, policy_id=claim.policy_id, _exc_info=True)
        update_claim_status(claim_id, "FAILED")
        return

    # Fetch documents
    documents = fetch_claim_documents(claim_id)

    # Download document images from S3
    s3_client = boto3.client("s3", region_name=AWS_REGION)
    for doc in documents:
        try:
            response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=doc.s3_key)
            doc.image_bytes = response["Body"].read()
        except Exception as e:
            logfire.warning("s3.document_fetch_failed", claim_id=claim_id, s3_key=doc.s3_key, error=str(e))
            doc.image_bytes = None

    # Fetch claim history for fraud detection
    claim_history = fetch_claim_history(claim.member_id)

    # Calculate YTD approved total
    policy_start = policy.policy_holder.policy_start_date
    ytd_approved = fetch_ytd_approved_total(claim.member_id, policy_start)

    simulate_failure = bool((claim.claim_metadata or {}).get("simulate_component_failure", False))
    eval_freeze_date = (claim.claim_metadata or {}).get("eval_freeze_date")

    # Build initial state
    initial_state: ClaimState = {
        "claim_id": claim_id,
        "member": member,
        "policy": policy,
        "category": claim.category,
        "claimed_amount": float(claim.claimed_amount),
        "treatment_date": str(claim.treatment_date),
        "hospital_name": claim.hospital_name,
        "documents": documents,
        "claim_history": [
            {
                "claim_id": str(h.claim_id),
                "date": str(h.claim_date),
                "amount": float(h.amount),
                "provider": h.provider or "",
                "category": h.category or "",
                "status": h.status or "",
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
        "current_step": "DOCUMENT_VERIFICATION",
        # Metadata
        "simulate_component_failure": simulate_failure,
    }

    # For eval test cases, pass the frozen date through state so policy engine uses it instead of date.today()
    if eval_freeze_date:
        initial_state["eval_date_override"] = eval_freeze_date

    pipeline = get_pipeline()
    try:
        with logfire.span("pipeline.invoke", claim_id=claim_id, category=initial_state["category"]):
            result = pipeline.invoke(initial_state)
    except Exception as e:
        logfire.error("claim.process.pipeline_error", claim_id=claim_id, error=str(e), _exc_info=True)
        update_claim_status(claim_id, "FAILED")
        raise  # Re-raise so lambda_handler can retry via SQS

    if not result:
        logfire.error("claim.process.pipeline_returned_none", claim_id=claim_id)
        update_claim_status(claim_id, "FAILED")
    elif result.get("should_stop_early"):
        logfire.info("claim.process.early_stop", claim_id=claim_id, reason=result.get("early_stop_reason"))
    else:
        decision = result["final_decision"]["decision"]
        logfire.info("claim.process.complete", claim_id=claim_id, decision=decision)

@logfire.instrument()
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
            raise  # Re-raise so SQS retries (claim stays PROCESSING until retries exhausted)

    return {"statusCode": 200, "body": "OK"}


# For local testing
if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_claim_id = sys.argv[1]
        process_claim(test_claim_id)
    else:
        print("Usage: python handler.py <claim_id>")
