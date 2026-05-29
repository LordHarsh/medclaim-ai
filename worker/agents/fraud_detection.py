"""
Agent 4: Fraud Detection

FULLY DETERMINISTIC — no LLM calls.
Computes fraud risk score from behavioral and document signals.
"""

from datetime import date, datetime
from typing import Optional

from models.schemas import FraudOutput, FraudSignal
from state import ClaimState


def _parse_date(date_str) -> date:
    """Parse date string or return date object."""
    if isinstance(date_str, date):
        return date_str
    if isinstance(date_str, datetime):
        return date_str.date()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(str(date_str), fmt).date()
        except (ValueError, TypeError):
            continue
    return date.today()


def _check_same_day_claims(
    member_id: str, treatment_date: date, claim_history: list, limit: int = 2
) -> Optional[FraudSignal]:
    """Signal 1: More claims on the same day than the configured limit."""
    same_day_count = 0
    for claim in claim_history:
        claim_date = _parse_date(claim.get("claim_date", claim.get("date")))
        if claim_date == treatment_date:
            same_day_count += 1

    if same_day_count >= limit:
        return FraudSignal(
            signal_type="SAME_DAY_CLAIMS_EXCEEDED",
            severity=0.8,
            weight=1.0,
            description=f"Member has {same_day_count} prior claims on the same day (limit: {limit})",
            evidence=f"{same_day_count} claims already filed for {treatment_date.isoformat()}",
        )
    return None


def _check_monthly_claims(
    member_id: str, treatment_date: date, claim_history: list, limit: int = 6
) -> Optional[FraudSignal]:
    """Signal 2: More claims in the same month than the configured limit."""
    same_month_count = 0
    for claim in claim_history:
        claim_date = _parse_date(claim.get("claim_date", claim.get("date")))
        if claim_date.year == treatment_date.year and claim_date.month == treatment_date.month:
            same_month_count += 1

    if same_month_count >= limit:
        return FraudSignal(
            signal_type="MONTHLY_CLAIMS_EXCEEDED",
            severity=0.6,
            weight=0.7,
            description=f"Member has {same_month_count} claims this month",
            evidence=f"{same_month_count} claims in {treatment_date.strftime('%B %Y')}",
        )
    return None


def _check_high_value(claimed_amount: float, threshold: float = 25000) -> Optional[FraudSignal]:
    """Signal 3: Claim amount above the configured threshold."""
    if claimed_amount > threshold:
        return FraudSignal(
            signal_type="HIGH_VALUE_CLAIM",
            severity=0.4,
            weight=0.5,
            description=f"High value claim: Rs. {claimed_amount}",
            evidence=f"Amount Rs. {claimed_amount} exceeds threshold of Rs. 25,000",
        )
    return None


def _check_multiple_providers_same_day(
    treatment_date: date, hospital_name: Optional[str], claim_history: list
) -> Optional[FraudSignal]:
    """Signal 4: More than 2 distinct providers on the same day."""
    providers = set()
    if hospital_name:
        providers.add(hospital_name.lower().strip())

    for claim in claim_history:
        claim_date = _parse_date(claim.get("claim_date", claim.get("date")))
        if claim_date == treatment_date:
            provider = claim.get("provider", "")
            if provider:
                providers.add(provider.lower().strip())

    if len(providers) > 2:
        return FraudSignal(
            signal_type="MULTIPLE_PROVIDERS_SAME_DAY",
            severity=0.7,
            weight=0.9,
            description=f"{len(providers)} distinct providers on the same day",
            evidence=f"Providers: {', '.join(providers)}",
        )
    return None


def _check_document_alteration(doc_verification: dict) -> Optional[FraudSignal]:
    """Signal 5: Documents showing signs of alteration."""
    documents = doc_verification.get("documents", [])
    for doc in documents:
        issues = doc.get("quality_issues", [])
        if "ALTERED" in issues:
            return FraudSignal(
                signal_type="DOCUMENT_ALTERATION",
                severity=0.5,
                weight=0.6,
                description="Document shows signs of alteration",
                evidence=f"Alteration detected in {doc.get('detected_type', 'document')}",
            )
    return None


def _check_amount_mismatch(claimed_amount: float, extracted_data: dict) -> Optional[FraudSignal]:
    """Signal 6: Bill total differs from claimed amount by more than 5%."""
    bill_data = extracted_data.get("hospital_bill") or extracted_data.get("pharmacy_bill")
    if not bill_data:
        return None

    bill_total = bill_data.get("total")
    if bill_total is None:
        return None

    bill_total = float(bill_total)
    if bill_total == 0:
        return None

    diff_pct = abs(bill_total - claimed_amount) / bill_total
    if diff_pct > 0.05:
        return FraudSignal(
            signal_type="AMOUNT_MISMATCH",
            severity=0.6,
            weight=0.8,
            description=f"Bill total (Rs. {bill_total}) differs from claimed amount (Rs. {claimed_amount})",
            evidence=f"Difference: {diff_pct*100:.1f}% (threshold: 5%)",
        )
    return None


def _check_date_inconsistency(
    treatment_date: date, extracted_data: dict
) -> Optional[FraudSignal]:
    """Signal 7: Bill date doesn't match treatment date."""
    bill_data = extracted_data.get("hospital_bill", {})
    if not bill_data:
        return None

    bill_date_str = bill_data.get("date")
    if not bill_date_str:
        return None

    try:
        bill_date = _parse_date(bill_date_str)
        if bill_date != treatment_date:
            return FraudSignal(
                signal_type="DATE_INCONSISTENCY",
                severity=0.3,
                weight=0.4,
                description=f"Bill date ({bill_date}) differs from treatment date ({treatment_date})",
                evidence=f"Treatment: {treatment_date.isoformat()}, Bill: {bill_date.isoformat()}",
            )
    except (ValueError, TypeError):
        pass
    return None


def _check_duplicate_claim(
    member_id: str,
    treatment_date: date,
    claimed_amount: float,
    hospital_name: Optional[str],
    claim_history: list,
) -> Optional[FraudSignal]:
    """Signal 8: Exact duplicate — same member, amount, date, provider."""
    for claim in claim_history:
        claim_date = _parse_date(claim.get("claim_date", claim.get("date")))
        claim_amount = float(claim.get("amount", 0))
        claim_provider = claim.get("provider", "")

        if (
            claim_date == treatment_date
            and abs(claim_amount - claimed_amount) < 0.01
            and hospital_name
            and claim_provider
            and claim_provider.lower().strip() == hospital_name.lower().strip()
        ):
            return FraudSignal(
                signal_type="DUPLICATE_CLAIM",
                severity=0.9,
                weight=1.0,
                description="Potential duplicate claim detected",
                evidence=(
                    f"Same member, amount (Rs. {claimed_amount}), "
                    f"date ({treatment_date}), provider ({hospital_name})"
                ),
            )
    return None


def run_fraud_detection(state: ClaimState) -> dict:
    """
    Run fraud detection agent.

    Fully deterministic — no LLM calls.
    Checks 8 fraud signals and computes a risk score.
    Thresholds are read from policy.fraud_thresholds config.
    """
    # Check for simulated failure (TC011)
    if state.get("simulate_component_failure", False):
        raise RuntimeError("Simulated component failure in fraud_detection")

    member_id = state["member"].get("member_id", "")
    treatment_date = _parse_date(state["treatment_date"])
    claimed_amount = state["claimed_amount"]
    hospital_name = state.get("hospital_name")
    claim_history = state.get("claim_history", [])
    doc_verification = state.get("doc_verification", {})
    extracted_data = state.get("extracted_data", {})

    # Read thresholds from policy config
    policy = state.get("policy", {})
    fraud_config = policy.get("fraud_thresholds", {})
    same_day_limit = fraud_config.get("same_day_claims_limit", 2)
    monthly_limit = fraud_config.get("monthly_claims_limit", 6)
    high_value_threshold = fraud_config.get("high_value_claim_threshold", 25000)
    manual_review_threshold = fraud_config.get("auto_manual_review_above", 25000)

    # Run all signal checks (pass config thresholds)
    signals = []

    signal = _check_same_day_claims(member_id, treatment_date, claim_history, same_day_limit)
    if signal:
        signals.append(signal)

    signal = _check_monthly_claims(member_id, treatment_date, claim_history, monthly_limit)
    if signal:
        signals.append(signal)

    signal = _check_high_value(claimed_amount, high_value_threshold)
    if signal:
        signals.append(signal)

    signal = _check_multiple_providers_same_day(
        treatment_date, hospital_name, claim_history
    )
    if signal:
        signals.append(signal)

    signal = _check_document_alteration(doc_verification)
    if signal:
        signals.append(signal)

    signal = _check_amount_mismatch(claimed_amount, extracted_data)
    if signal:
        signals.append(signal)

    signal = _check_date_inconsistency(treatment_date, extracted_data)
    if signal:
        signals.append(signal)

    signal = _check_duplicate_claim(
        member_id, treatment_date, claimed_amount, hospital_name, claim_history
    )
    if signal:
        signals.append(signal)

    # Calculate fraud score
    raw_score = sum(s.severity * s.weight for s in signals)
    fraud_score = min(1.0, raw_score / 2.5)

    # Determine risk level
    if fraud_score >= 0.80:
        risk_level = "CRITICAL"
    elif fraud_score >= 0.50:
        risk_level = "HIGH"
    elif fraud_score >= 0.30:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    # Manual review thresholds (from policy config)
    requires_manual_review = (
        fraud_score >= 0.50 or claimed_amount > manual_review_threshold
    )

    fraud_output = FraudOutput(
        fraud_score=round(fraud_score, 3),
        risk_level=risk_level,
        requires_manual_review=requires_manual_review,
        signals=signals,
    )

    return {
        "fraud_evaluation": fraud_output.model_dump(),
        "current_step": "FRAUD_DETECTION",
    }
