from typing import Optional, TypedDict


class ClaimState(TypedDict):
    # Loaded at start (load_context)
    claim_id: str
    member: dict
    policy: dict
    category: str
    claimed_amount: float
    treatment_date: str
    hospital_name: Optional[str]
    documents: list  # [{s3_key, content_type, image_bytes, original_name, metadata...}]
    claim_history: list  # [{claim_id, date, amount, provider, category, status}]
    ytd_approved_total: float

    # Populated by agents
    doc_verification: Optional[dict]
    extracted_data: Optional[dict]
    policy_evaluation: Optional[dict]
    fraud_evaluation: Optional[dict]
    final_decision: Optional[dict]

    # Control flow
    should_stop_early: bool
    early_stop_reason: Optional[str]
    early_stop_message: Optional[str]
    degraded_steps: list
    confidence_score: float
    current_step: str

    # Metadata
    simulate_component_failure: bool
