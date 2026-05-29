"""
Agent 5: Final Decision

Synthesizes all agent outputs into a final verdict.
Generates user-facing and ops messages via LLM.
"""

from typing import Optional

import logfire
from langchain_core.messages import HumanMessage, SystemMessage

from config import get_llm
from models.schemas import FinalDecisionOutput
from state import ClaimState


MESSAGE_GENERATION_SYSTEM = """You are generating messages for a health insurance claims decision system in India.

Generate two messages:
1. user_message: A friendly, clear message for the insurance member explaining the decision.
   - Use Rs. for amounts
   - Be specific about reasons
   - If approved, state the amount clearly
   - If rejected, explain why and what they can do
   - Keep it under 3 sentences

2. ops_summary: A concise technical summary for the operations team.
   - Include key metrics and reasons
   - Note any flags or concerns
   - Keep it factual and brief (1-2 sentences)"""


def _calculate_confidence(
    state: ClaimState,
    extraction_confidence: float,
    doc_quality_scores: list[float],
    fraud_score: float,
) -> float:
    """
    Calculate final confidence score.

    Base: 0.95
    Deductions:
    - Per degraded step: -0.15
    - extraction_confidence < 0.8: -(0.8 - extraction_confidence) * 0.3
    - Any doc quality_score < 0.6: -0.05 per doc
    - fraud_score > 0.3: -0.10
    - LLM used for blocking rejection: -0.05
    """
    base = 0.95
    deductions = 0.0

    # Degraded steps
    degraded_steps = state.get("degraded_steps", [])
    deductions += len(degraded_steps) * 0.15

    # Extraction confidence
    if extraction_confidence < 0.8:
        deductions += (0.8 - extraction_confidence) * 0.3

    # Document quality
    for score in doc_quality_scores:
        if score < 0.6:
            deductions += 0.05

    # Fraud score
    if fraud_score > 0.3:
        deductions += 0.10

    final = max(0.10, base - deductions)
    return round(final, 3)


def _generate_messages(
    decision: str,
    approved_amount: Optional[float],
    rejection_reasons: list[str],
    policy_evaluation: dict,
    fraud_evaluation: dict,
    degraded_steps: list[str],
    confidence: float,
) -> tuple[str, str]:
    """Generate user message and ops summary using LLM."""
    try:
        llm = get_llm("message_generation")

        context = (
            f"Decision: {decision}\n"
            f"Approved amount: Rs. {approved_amount}\n"
            f"Rejection reasons: {rejection_reasons}\n"
            f"Confidence: {confidence}\n"
            f"Degraded steps: {degraded_steps}\n"
        )

        if policy_evaluation:
            breakdown = policy_evaluation.get("calculation_breakdown")
            if breakdown:
                context += f"Calculation: {breakdown}\n"
            rules = policy_evaluation.get("rule_evaluations", [])
            failed_rules = [r for r in rules if not r.get("passed", True)]
            if failed_rules:
                context += f"Failed rules: {[r.get('rule_name') for r in failed_rules]}\n"
                context += f"Details: {[r.get('details') for r in failed_rules]}\n"

        if fraud_evaluation:
            context += f"Fraud score: {fraud_evaluation.get('fraud_score', 0)}\n"
            context += f"Fraud signals: {[s.get('signal_type') for s in fraud_evaluation.get('signals', [])]}\n"

        from pydantic import BaseModel, Field

        class Messages(BaseModel):
            user_message: str = Field(description="Friendly message for the insurance member")
            ops_summary: str = Field(description="Technical summary for operations team")

        structured_llm = llm.with_structured_output(Messages)
        result = structured_llm.invoke([
            SystemMessage(content=MESSAGE_GENERATION_SYSTEM),
            HumanMessage(content=f"Generate messages for this claims decision:\n\n{context}"),
        ])
        return result.user_message, result.ops_summary

    except Exception as e:
        logfire.error("final_decision.message_generation_failed", error=str(e), _exc_info=True)
        # Fallback template messages
        return _template_messages(decision, approved_amount, rejection_reasons)


def _template_messages(
    decision: str, approved_amount: Optional[float], rejection_reasons: list[str]
) -> tuple[str, str]:
    """Fallback template messages when LLM is unavailable."""
    if decision == "APPROVED":
        user_msg = f"Your claim has been approved for Rs. {approved_amount:.0f}."
        ops_msg = f"Claim approved. Amount: Rs. {approved_amount:.0f}."
    elif decision == "PARTIAL":
        user_msg = (
            f"Your claim has been partially approved for Rs. {approved_amount:.0f}. "
            f"Some items were not covered under your policy."
        )
        ops_msg = f"Partial approval. Amount: Rs. {approved_amount:.0f}. Some items excluded."
    elif decision == "REJECTED":
        reasons_str = ", ".join(rejection_reasons)
        user_msg = f"Your claim has been rejected. Reason: {reasons_str}."
        ops_msg = f"Claim rejected. Reasons: {reasons_str}."
    else:  # MANUAL_REVIEW
        user_msg = (
            "Your claim has been flagged for manual review by our team. "
            "You will be notified once the review is complete."
        )
        ops_msg = f"Routed to manual review. Reasons: {', '.join(rejection_reasons) if rejection_reasons else 'fraud flag'}."

    return user_msg, ops_msg


def run_final_decision(state: ClaimState) -> dict:
    """
    Run the final decision agent.

    Priority:
    1. fraud override → MANUAL_REVIEW
    2. policy rejection → REJECTED
    3. partial → PARTIAL
    4. else → APPROVED

    Safety: confidence < 0.60 → force MANUAL_REVIEW
    """
    policy_evaluation = state.get("policy_evaluation", {})
    fraud_evaluation = state.get("fraud_evaluation")
    doc_verification = state.get("doc_verification", {})
    extracted_data = state.get("extracted_data", {})
    degraded_steps = state.get("degraded_steps", [])

    # Get fraud data (may be None if fraud step was degraded)
    fraud_requires_review = False
    fraud_score = 0.0
    fraud_signals = []

    if fraud_evaluation:
        fraud_requires_review = fraud_evaluation.get("requires_manual_review", False)
        fraud_score = fraud_evaluation.get("fraud_score", 0.0)
        fraud_signals = fraud_evaluation.get("signals", [])

    # Get policy data
    policy_eligible = policy_evaluation.get("eligible", True)
    policy_decision = policy_evaluation.get("decision_suggestion", "APPROVED")
    policy_amount = policy_evaluation.get("approved_amount")
    policy_reasons = policy_evaluation.get("rejection_reasons", [])

    # Get document quality scores
    doc_quality_scores = [
        d.get("quality_score", 0.85) for d in doc_verification.get("documents", [])
    ]

    # Get extraction confidence
    extraction_confidence = extracted_data.get("extraction_confidence", 0.9) if extracted_data else 0.9

    # Calculate confidence
    confidence = _calculate_confidence(
        state, extraction_confidence, doc_quality_scores, fraud_score
    )

    # Determine decision (priority order)
    if fraud_requires_review:
        decision = "MANUAL_REVIEW"
        approved_amount = None
        rejection_reasons = policy_reasons
    elif not policy_eligible:
        decision = "REJECTED"
        approved_amount = None
        rejection_reasons = policy_reasons
    elif policy_decision == "PARTIAL":
        decision = "PARTIAL"
        approved_amount = policy_amount
        rejection_reasons = []
    else:
        decision = "APPROVED"
        approved_amount = policy_amount
        rejection_reasons = []

    # Safety: low confidence forces manual review
    if confidence < 0.60 and decision in ("APPROVED", "PARTIAL"):
        decision = "MANUAL_REVIEW"

    # Generate messages
    user_message, ops_summary = _generate_messages(
        decision, approved_amount, rejection_reasons,
        policy_evaluation, fraud_evaluation,
        degraded_steps, confidence,
    )

    # Build recommendations
    recommendations = []
    if degraded_steps:
        recommendations.append("Manual review recommended due to incomplete processing")
    if fraud_score > 0.3:
        recommendations.append(f"Fraud score elevated ({fraud_score:.2f})")
    if confidence < 0.80:
        recommendations.append(f"Low confidence ({confidence:.2f}), consider manual verification")

    # Build calculation breakdown for output
    calc_breakdown = policy_evaluation.get("calculation_breakdown")

    final_output = FinalDecisionOutput(
        decision=decision,
        approved_amount=approved_amount,
        confidence_score=confidence,
        rejection_reasons=rejection_reasons,
        user_message=user_message,
        ops_summary=ops_summary,
        calculation_breakdown=calc_breakdown,
        recommendations=recommendations,
    )

    return {
        "final_decision": final_output.model_dump(),
        "confidence_score": confidence,
        "current_step": "FINAL_DECISION",
    }
