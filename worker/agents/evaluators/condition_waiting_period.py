"""Rule 5: Condition-Specific Waiting Period check (LLM classification)."""

from datetime import timedelta

import agents.policy_engine as pe
from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation


class ConditionWaitingPeriodEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        prescription_data = ctx.extracted_data.get("prescription", {})
        diagnosis = prescription_data.get("diagnosis", []) if prescription_data else []
        treatment_desc = prescription_data.get("treatment") if prescription_data else None

        if diagnosis or treatment_desc:
            condition_result = pe._classify_condition(diagnosis, treatment_desc, ctx.policy)

            if condition_result and condition_result.matches_condition:
                matched_cond = condition_result.matched_condition
                specific_conditions = ctx.policy.waiting_periods.specific_conditions
                required_days = specific_conditions.get(matched_cond, 0)

                join_date = pe._parse_date(str(ctx.member.join_date))
                days_enrolled = (ctx.treatment_date - join_date).days

                passed = days_enrolled >= required_days
                eligible_date = join_date + timedelta(days=required_days)

                return RuleEvaluation(
                    rule_name="CONDITION_WAITING_PERIOD",
                    passed=passed,
                    details=(
                        f"{matched_cond} has {required_days}-day waiting period. "
                        f"Member enrolled {days_enrolled} days. "
                        f"{'Eligible' if passed else f'Eligible from {eligible_date.isoformat()}'}."
                    ),
                    blocking=not passed,
                )
            else:
                return RuleEvaluation(
                    rule_name="CONDITION_WAITING_PERIOD",
                    passed=True,
                    details="Diagnosis does not match any waiting period condition",
                    blocking=False,
                )
        else:
            return RuleEvaluation(
                rule_name="CONDITION_WAITING_PERIOD",
                passed=True,
                details="No diagnosis available for classification",
                blocking=False,
            )
