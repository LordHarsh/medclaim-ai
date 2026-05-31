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
from models.policy import PolicyConfig, EvaluationRule
from agents.evaluators.base import EvaluationContext
from agents.evaluators.registry import EVALUATOR_REGISTRY


# --- Default rule list (backward compatibility when config has no evaluation_rules) ---

_DEFAULT_RULES = [
    EvaluationRule(id="member_eligibility", type="deterministic", blocking=True, order=1),
    EvaluationRule(id="submission_deadline", type="deterministic", blocking=True, order=2),
    EvaluationRule(id="minimum_amount", type="deterministic", blocking=True, order=3),
    EvaluationRule(id="initial_waiting_period", type="deterministic", blocking=True, order=4),
    EvaluationRule(id="condition_waiting_period", type="llm_classification", blocking=True, order=5),
    EvaluationRule(id="exclusion_check", type="llm_classification", blocking=True, order=6),
    EvaluationRule(id="pre_authorization", type="deterministic", blocking=True, order=7),
    EvaluationRule(id="per_claim_limit", type="deterministic", blocking=True, order=8),
    EvaluationRule(id="procedure_coverage", type="deterministic", blocking=False, order=9),
    EvaluationRule(id="amount_calculation", type="deterministic", blocking=False, order=10),
]


# --- Shared utility functions (kept here so test patches on this module still work) ---


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


# --- Orchestrator ---


def run_policy_engine(state: ClaimState) -> dict:
    """
    Dynamic policy orchestrator — evaluates clauses from config.

    Loads evaluation rules from the policy config (or defaults) and
    executes them in order, short-circuiting on blocking failures.
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

    # Get category config
    cat_config = policy.get_category(category)

    # Build evaluation context
    ctx = EvaluationContext(
        policy=policy,
        member=member,
        category=category,
        claimed_amount=claimed_amount,
        treatment_date=treatment_date,
        hospital_name=hospital_name,
        extracted_data=extracted_data,
        ytd_approved=ytd_approved,
        cat_config=cat_config,
        eval_date_override=state.get("eval_date_override"),
    )

    # Get rules sorted by order — use defaults if evaluation_rules not in config
    rules = policy.evaluation_rules if policy.evaluation_rules else _DEFAULT_RULES
    rules_sorted = sorted(rules, key=lambda r: r.order)

    rule_evaluations = []
    rejection_reasons = []
    warnings = []

    for rule in rules_sorted:
        evaluator_cls = EVALUATOR_REGISTRY.get(rule.id)
        if not evaluator_cls:
            continue

        evaluator = evaluator_cls()
        with logfire.span("evaluator.{rule_id}", rule_id=rule.id, rule_type=rule.type, blocking=rule.blocking):
            result = evaluator.evaluate(ctx)
            logfire.info("evaluator.result", rule_id=rule.id, passed=result.passed, details=result.details)

        rule_evaluations.append(result)

        if not result.passed and rule.blocking:
            rejection_reason = _get_rejection_reason(result.rule_name)
            rejection_reasons.append(rejection_reason)
            logfire.info("evaluator.short_circuit", rule_id=rule.id, rejection_reason=rejection_reason)
            return _build_rejected_output(
                rule_evaluations, rejection_reasons, warnings,
                line_item_decisions=(
                    [d.model_dump() for d in ctx.line_item_decisions]
                    if ctx.line_item_decisions else None
                ),
            )

    # All rules passed — get calculation from context
    calculation = getattr(ctx, "_calculation", None)
    final_amount = getattr(ctx, "_final_amount", 0.0)
    eligible_amount = ctx.eligible_amount

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
            line_item_decisions=ctx.line_item_decisions,
            warnings=warnings,
        ).model_dump(),
        "current_step": "POLICY_ENGINE",
    }


def _get_rejection_reason(rule_name: str) -> str:
    """Map rule names to rejection reason codes."""
    mapping = {
        "MEMBER_ELIGIBILITY": "MEMBER_NOT_ELIGIBLE",
        "SUBMISSION_DEADLINE": "SUBMISSION_DEADLINE_EXCEEDED",
        "MINIMUM_AMOUNT": "BELOW_MINIMUM",
        "INITIAL_WAITING_PERIOD": "WAITING_PERIOD",
        "CONDITION_WAITING_PERIOD": "WAITING_PERIOD",
        "EXCLUSION_CHECK": "EXCLUDED_CONDITION",
        "PRE_AUTHORIZATION": "PRE_AUTH_MISSING",
        "PER_CLAIM_LIMIT": "PER_CLAIM_EXCEEDED",
        "PROCEDURE_COVERAGE": "PROCEDURE_NOT_COVERED",
    }
    return mapping.get(rule_name, rule_name)


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
