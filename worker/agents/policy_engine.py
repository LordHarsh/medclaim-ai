from datetime import date, datetime, timedelta
from typing import Optional

import logfire
from langchain_core.messages import HumanMessage, SystemMessage
from thefuzz import fuzz

from core.config import get_llm
from models.schemas import (
    CalculationBreakdown,
    ConditionClassification,
    ExclusionMatch,
    LineItemDecision,
    PolicyOutput,
    RuleEvaluation,
)
from prompts.classification import (
    CLASSIFICATION_SYSTEM_PROMPT,
    build_condition_classification_prompt,
    build_exclusion_classification_prompt,
)
from core.state import ClaimState
from models.policy import PolicyConfig


def _parse_date(date_str: str) -> date:
    """Parse a date string to a date object."""
    if isinstance(date_str, date):
        return date_str
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except (ValueError, TypeError):
            continue
    raise ValueError(f"Cannot parse date: {date_str}")



def _classify_condition(
    diagnosis: list[str], treatment: Optional[str] = None, policy: Optional[PolicyConfig] = None
) -> Optional[ConditionClassification]:
    """Use LLM to classify diagnosis against waiting period conditions."""
    if not diagnosis:
        return ConditionClassification(matches_condition=False, matched_condition=None, confidence=0.95)

    diagnosis_str = ", ".join(diagnosis) if isinstance(diagnosis, list) else str(diagnosis)
    treatment_str = treatment or ""

    try:
        llm = get_llm("text_classification")
        structured_llm = llm.with_structured_output(ConditionClassification)

        prompt = build_condition_classification_prompt(diagnosis_str, treatment_str, policy)
        result = structured_llm.invoke([
            SystemMessage(content=CLASSIFICATION_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        return result
    except Exception as e:
        logfire.error("policy.condition_classification_failed", error=str(e), _exc_info=True)
        raise


def _classify_exclusion(
    diagnosis: list[str], treatment: Optional[str], category: str, policy: Optional[PolicyConfig] = None
) -> Optional[ExclusionMatch]:
    """Use LLM to check if diagnosis/treatment is excluded."""
    if not diagnosis and not treatment:
        return ExclusionMatch(is_excluded=False, matched_exclusion=None, confidence=0.95)

    diagnosis_str = ", ".join(diagnosis) if isinstance(diagnosis, list) else str(diagnosis)
    treatment_str = treatment or ""

    try:
        llm = get_llm("text_classification")
        structured_llm = llm.with_structured_output(ExclusionMatch)

        prompt = build_exclusion_classification_prompt(diagnosis_str, treatment_str, category, policy)
        result = structured_llm.invoke([
            SystemMessage(content=CLASSIFICATION_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        return result
    except Exception as e:
        logfire.error("policy.exclusion_classification_failed", error=str(e), _exc_info=True)
        raise


def _check_procedure_coverage(
    line_items: list[dict], category: str, policy: PolicyConfig
) -> tuple[list[LineItemDecision], float]:
    """
    Check line items against covered/excluded procedure lists.
    Returns (decisions, eligible_amount).
    """
    cat_config = policy.get_category(category)

    covered_procedures = (cat_config.covered_procedures or cat_config.covered_items) if cat_config else []
    excluded_procedures = (cat_config.excluded_procedures or cat_config.excluded_items) if cat_config else []

    decisions = []
    eligible_amount = 0.0

    for item in line_items:
        description = item.get("description", "")
        amount = float(item.get("amount", 0))

        # Check against excluded procedures (fuzzy match)
        is_excluded = False
        matched_exclusion = None
        for excl in excluded_procedures:
            if fuzz.token_set_ratio(description.lower(), excl.lower()) >= 75:
                is_excluded = True
                matched_exclusion = excl
                break

        # Check against covered procedures (fuzzy match)
        is_covered = False
        if not is_excluded:
            for cov in covered_procedures:
                if fuzz.token_set_ratio(description.lower(), cov.lower()) >= 70:
                    is_covered = True
                    break
            # If no covered list exists or item not in excluded, assume covered
            if not covered_procedures:
                is_covered = True

        if is_excluded:
            decisions.append(LineItemDecision(
                description=description,
                amount=amount,
                approved=False,
                reason=f"Excluded procedure: {matched_exclusion}",
            ))
        elif is_covered or not covered_procedures:
            decisions.append(LineItemDecision(
                description=description,
                amount=amount,
                approved=True,
                reason="Covered procedure",
            ))
            eligible_amount += amount
        else:
            # Not in excluded but also not matched to covered - assume covered
            decisions.append(LineItemDecision(
                description=description,
                amount=amount,
                approved=True,
                reason="Procedure not explicitly excluded",
            ))
            eligible_amount += amount

    return decisions, eligible_amount


def run_policy_engine(state: ClaimState) -> dict:
    """
    Run the policy engine agent.

    Evaluates rules in strict order, short-circuits on blocking failure.
    """
    member = state["member"]
    policy = state["policy"]
    category = state["category"]
    claimed_amount = state["claimed_amount"]
    treatment_date_str = state["treatment_date"]
    hospital_name = state.get("hospital_name")
    extracted_data = state.get("extracted_data", {})
    ytd_approved = state.get("ytd_approved_total", 0.0)

    treatment_date = _parse_date(treatment_date_str)
    today = date.today()

    # Get category config
    cat_config = policy.get_category(category)
    coverage = policy.coverage
    waiting_periods = policy.waiting_periods
    submission_rules = policy.submission_rules
    network_hospitals = policy.network_hospitals

    rule_evaluations = []
    rejection_reasons = []
    warnings = []

    # --- RULE 1: Member Eligibility ---
    renewal_active = policy.policy_holder.renewal_status == "ACTIVE"
    member_exists = member is not None and member.member_id is not None

    rule1_passed = member_exists and renewal_active
    rule_evaluations.append(RuleEvaluation(
        rule_name="MEMBER_ELIGIBILITY",
        passed=rule1_passed,
        details="Member exists and policy is active" if rule1_passed else "Member not found or policy inactive",
        blocking=not rule1_passed,
    ))
    if not rule1_passed:
        rejection_reasons.append("MEMBER_NOT_ELIGIBLE")
        return _build_rejected_output(rule_evaluations, rejection_reasons, warnings)

    # --- RULE 2: Submission Deadline ---
    deadline_days = submission_rules.deadline_days_from_treatment
    days_since_treatment = (today - treatment_date).days
    rule2_passed = days_since_treatment <= deadline_days

    rule_evaluations.append(RuleEvaluation(
        rule_name="SUBMISSION_DEADLINE",
        passed=rule2_passed,
        details=f"Submitted {days_since_treatment} days after treatment (limit: {deadline_days})",
        blocking=not rule2_passed,
    ))
    if not rule2_passed:
        rejection_reasons.append("SUBMISSION_DEADLINE_EXCEEDED")
        return _build_rejected_output(rule_evaluations, rejection_reasons, warnings)

    # --- RULE 3: Minimum Amount ---
    min_amount = submission_rules.minimum_claim_amount
    rule3_passed = claimed_amount >= min_amount

    rule_evaluations.append(RuleEvaluation(
        rule_name="MINIMUM_AMOUNT",
        passed=rule3_passed,
        details=f"Claimed amount Rs. {claimed_amount} vs minimum Rs. {min_amount}",
        blocking=not rule3_passed,
    ))
    if not rule3_passed:
        rejection_reasons.append("BELOW_MINIMUM")
        return _build_rejected_output(rule_evaluations, rejection_reasons, warnings)

    # --- RULE 4: Initial Waiting Period ---
    join_date_str = member.join_date
    if join_date_str:
        join_date = _parse_date(str(join_date_str))
        initial_waiting_days = waiting_periods.initial_waiting_period_days
        days_enrolled = (treatment_date - join_date).days
        rule4_passed = days_enrolled >= initial_waiting_days

        rule_evaluations.append(RuleEvaluation(
            rule_name="INITIAL_WAITING_PERIOD",
            passed=rule4_passed,
            details=f"Enrolled {days_enrolled} days (minimum: {initial_waiting_days})",
            blocking=not rule4_passed,
        ))
        if not rule4_passed:
            rejection_reasons.append("WAITING_PERIOD")
            return _build_rejected_output(rule_evaluations, rejection_reasons, warnings)
    else:
        rule_evaluations.append(RuleEvaluation(
            rule_name="INITIAL_WAITING_PERIOD",
            passed=True,
            details="Join date not available, skipping check",
            blocking=False,
        ))

    # --- RULE 5: Condition Waiting Period ---
    # Get diagnosis from extracted data
    prescription_data = extracted_data.get("prescription", {})
    diagnosis = prescription_data.get("diagnosis", []) if prescription_data else []
    treatment_desc = prescription_data.get("treatment") if prescription_data else None

    if diagnosis or treatment_desc:
        condition_result = _classify_condition(diagnosis, treatment_desc, policy)

        if condition_result and condition_result.matches_condition:
            matched_cond = condition_result.matched_condition
            specific_conditions = waiting_periods.specific_conditions
            required_days = specific_conditions.get(matched_cond, 0)

            join_date = _parse_date(str(member.join_date))
            days_enrolled = (treatment_date - join_date).days

            rule5_passed = days_enrolled >= required_days
            eligible_from = join_date.replace(
                day=join_date.day
            )  # placeholder - calculate properly
            eligible_date = join_date + timedelta(days=required_days)

            rule_evaluations.append(RuleEvaluation(
                rule_name="CONDITION_WAITING_PERIOD",
                passed=rule5_passed,
                details=(
                    f"{matched_cond} has {required_days}-day waiting period. "
                    f"Member enrolled {days_enrolled} days. "
                    f"{'Eligible' if rule5_passed else f'Eligible from {eligible_date.isoformat()}'}."
                ),
                blocking=not rule5_passed,
            ))
            if not rule5_passed:
                rejection_reasons.append("WAITING_PERIOD")
                return _build_rejected_output(rule_evaluations, rejection_reasons, warnings)
        else:
            rule_evaluations.append(RuleEvaluation(
                rule_name="CONDITION_WAITING_PERIOD",
                passed=True,
                details="Diagnosis does not match any waiting period condition",
                blocking=False,
            ))
    else:
        rule_evaluations.append(RuleEvaluation(
            rule_name="CONDITION_WAITING_PERIOD",
            passed=True,
            details="No diagnosis available for classification",
            blocking=False,
        ))

    # --- RULE 6: Exclusion Check ---
    if diagnosis or treatment_desc:
        exclusion_result = _classify_exclusion(diagnosis, treatment_desc, category, policy)

        if exclusion_result and exclusion_result.is_excluded:
            rule_evaluations.append(RuleEvaluation(
                rule_name="EXCLUSION_CHECK",
                passed=False,
                details=f"Excluded: {exclusion_result.matched_exclusion}",
                blocking=True,
            ))
            rejection_reasons.append("EXCLUDED_CONDITION")
            return _build_rejected_output(rule_evaluations, rejection_reasons, warnings)
        else:
            rule_evaluations.append(RuleEvaluation(
                rule_name="EXCLUSION_CHECK",
                passed=True,
                details="Treatment not excluded under policy",
                blocking=False,
            ))
    else:
        rule_evaluations.append(RuleEvaluation(
            rule_name="EXCLUSION_CHECK",
            passed=True,
            details="No diagnosis available for exclusion check",
            blocking=False,
        ))

    # --- RULE 7: Pre-Authorization ---
    # Applies to any category that defines pre_auth_threshold in its config
    pre_auth_threshold = cat_config.pre_auth_threshold if cat_config else None
    high_value_tests = cat_config.high_value_tests_requiring_pre_auth if cat_config else []

    if pre_auth_threshold is not None and high_value_tests:

        # Check if any high-value tests are present
        tests_ordered = prescription_data.get("tests_ordered", []) if prescription_data else []
        bill_items = []
        if extracted_data.get("hospital_bill"):
            bill_items = extracted_data["hospital_bill"].get("line_items", [])

        has_high_value_test = False
        for test in high_value_tests:
            # Check in tests_ordered
            for ordered in tests_ordered:
                if test.lower() in ordered.lower():
                    has_high_value_test = True
                    break
            # Check in bill line items
            for item in bill_items:
                desc = item.get("description", "") if isinstance(item, dict) else ""
                if test.lower() in desc.lower():
                    has_high_value_test = True
                    break

        if has_high_value_test and claimed_amount > pre_auth_threshold:
            rule_evaluations.append(RuleEvaluation(
                rule_name="PRE_AUTHORIZATION",
                passed=False,
                details=f"Pre-authorization required for high-value diagnostic test above Rs. {pre_auth_threshold}",
                blocking=True,
            ))
            rejection_reasons.append("PRE_AUTH_MISSING")
            return _build_rejected_output(rule_evaluations, rejection_reasons, warnings)
        else:
            rule_evaluations.append(RuleEvaluation(
                rule_name="PRE_AUTHORIZATION",
                passed=True,
                details="No pre-authorization required",
                blocking=False,
            ))
    else:
        rule_evaluations.append(RuleEvaluation(
            rule_name="PRE_AUTHORIZATION",
            passed=True,
            details=f"Pre-auth check not applicable for {category}",
            blocking=False,
        ))

    # --- RULE 8: Per-Claim Limit ---
    # Categories with procedure lists (covered_procedures/excluded_procedures) are exempt —
    # their procedure coverage and sub_limit handle capping instead.
    per_claim_limit = coverage.per_claim_limit
    has_procedure_coverage = bool(
        cat_config and (
            cat_config.covered_procedures or cat_config.excluded_procedures
            or cat_config.covered_items or cat_config.excluded_items
        )
    )

    if has_procedure_coverage:
        rule_evaluations.append(RuleEvaluation(
            rule_name="PER_CLAIM_LIMIT",
            passed=True,
            details=f"Per-claim limit not applied to {category} (handled by procedure coverage and sub_limit)",
            blocking=False,
        ))
    else:
        rule8_passed = claimed_amount <= per_claim_limit
        rule_evaluations.append(RuleEvaluation(
            rule_name="PER_CLAIM_LIMIT",
            passed=rule8_passed,
            details=f"Claimed Rs. {claimed_amount} vs per-claim limit Rs. {per_claim_limit}",
            blocking=not rule8_passed,
        ))
        if not rule8_passed:
            rejection_reasons.append("PER_CLAIM_EXCEEDED")
            return _build_rejected_output(rule_evaluations, rejection_reasons, warnings)

    # --- RULE 9: Procedure Coverage ---
    # Applies to any category with covered/excluded procedure lists in config
    line_item_decisions = None
    eligible_amount = claimed_amount

    if has_procedure_coverage:
        bill_data = extracted_data.get("hospital_bill", {})
        line_items = bill_data.get("line_items", []) if bill_data else []

        if line_items:
            # Convert LineItem models to dicts if needed
            item_dicts = []
            for item in line_items:
                if isinstance(item, dict):
                    item_dicts.append(item)
                else:
                    item_dicts.append({"description": item.description, "amount": item.amount})

            decisions, covered_amount = _check_procedure_coverage(item_dicts, category, policy)
            line_item_decisions = decisions

            all_rejected = all(not d.approved for d in decisions)
            some_rejected = any(not d.approved for d in decisions)

            if all_rejected:
                rule_evaluations.append(RuleEvaluation(
                    rule_name="PROCEDURE_COVERAGE",
                    passed=False,
                    details="All line items are excluded procedures",
                    blocking=True,
                ))
                rejection_reasons.append("PROCEDURE_NOT_COVERED")
                return _build_rejected_output(
                    rule_evaluations, rejection_reasons, warnings,
                    line_item_decisions=[d.model_dump() for d in decisions] if decisions else None
                )
            elif some_rejected:
                rule_evaluations.append(RuleEvaluation(
                    rule_name="PROCEDURE_COVERAGE",
                    passed=True,
                    details=f"Partial coverage: Rs. {covered_amount} of Rs. {claimed_amount} eligible",
                    blocking=False,
                ))
                eligible_amount = covered_amount
            else:
                rule_evaluations.append(RuleEvaluation(
                    rule_name="PROCEDURE_COVERAGE",
                    passed=True,
                    details="All procedures are covered",
                    blocking=False,
                ))
        else:
            rule_evaluations.append(RuleEvaluation(
                rule_name="PROCEDURE_COVERAGE",
                passed=True,
                details="No line items to evaluate",
                blocking=False,
            ))
    else:
        rule_evaluations.append(RuleEvaluation(
            rule_name="PROCEDURE_COVERAGE",
            passed=True,
            details=f"Procedure coverage check not applicable for {category}",
            blocking=False,
        ))

    # --- RULE 10: Amount Calculation ---
    # Step A: eligible_amount already set above
    original_amount = claimed_amount

    # Step B: Network Discount (APPLIED FIRST)
    is_network = policy.is_network_hospital(hospital_name)
    network_discount_pct = (cat_config.network_discount_percent if cat_config else 0) if is_network else 0
    discount_amount = eligible_amount * (network_discount_pct / 100)
    amount_after_discount = eligible_amount - discount_amount

    # Step C: Co-pay (APPLIED AFTER discount)
    copay_pct = cat_config.copay_percent if cat_config else 0
    copay_amount = amount_after_discount * (copay_pct / 100)
    amount_after_copay = amount_after_discount - copay_amount

    # Step D: Annual OPD Limit
    annual_opd_limit = coverage.annual_opd_limit
    remaining = annual_opd_limit - ytd_approved
    final_amount = min(amount_after_copay, remaining)

    # Step E: Floor
    final_amount = max(0, round(final_amount, 2))

    calculation = CalculationBreakdown(
        original_amount=original_amount,
        eligible_amount=eligible_amount,
        network_discount_applied=is_network,
        network_discount_percent=network_discount_pct,
        discount_amount=round(discount_amount, 2),
        amount_after_discount=round(amount_after_discount, 2),
        copay_percent=copay_pct,
        copay_amount=round(copay_amount, 2),
        amount_after_copay=round(amount_after_copay, 2),
        final_approved_amount=final_amount,
    )

    rule_evaluations.append(RuleEvaluation(
        rule_name="AMOUNT_CALCULATION",
        passed=True,
        details=(
            f"Eligible: Rs. {eligible_amount}, "
            f"Network discount: {network_discount_pct}% (Rs. {discount_amount:.2f}), "
            f"Co-pay: {copay_pct}% (Rs. {copay_amount:.2f}), "
            f"Final: Rs. {final_amount}"
        ),
        blocking=False,
    ))

    # Determine decision
    if eligible_amount < claimed_amount:
        decision_suggestion = "PARTIAL"
    else:
        decision_suggestion = "APPROVED"

    return {
        "policy_evaluation": PolicyOutput(
            eligible=True,
            decision_suggestion=decision_suggestion,
            approved_amount=final_amount,
            rejection_reasons=[],
            calculation_breakdown=calculation,
            rule_evaluations=rule_evaluations,
            line_item_decisions=line_item_decisions,
            warnings=warnings,
        ).model_dump(),
        "current_step": "POLICY_ENGINE",
    }


def _build_rejected_output(
    rule_evaluations: list[RuleEvaluation],
    rejection_reasons: list[str],
    warnings: list[str],
    line_item_decisions=None,
) -> dict:
    """Build a rejection output."""
    return {
        "policy_evaluation": PolicyOutput(
            eligible=False,
            decision_suggestion="REJECTED",
            approved_amount=None,
            rejection_reasons=rejection_reasons,
            calculation_breakdown=None,
            rule_evaluations=rule_evaluations,
            line_item_decisions=line_item_decisions,
            warnings=warnings,
        ).model_dump(),
        "current_step": "POLICY_ENGINE",
    }
