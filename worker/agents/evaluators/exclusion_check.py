"""Rule 6: Exclusion Check (LLM classification)."""

import agents.policy_engine as pe
from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation


class ExclusionCheckEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        prescription_data = ctx.extracted_data.get("prescription", {})
        diagnosis = prescription_data.get("diagnosis", []) if prescription_data else []
        treatment_desc = prescription_data.get("treatment") if prescription_data else None

        if diagnosis or treatment_desc:
            exclusion_result = pe._classify_exclusion(
                diagnosis, treatment_desc, ctx.category, ctx.policy
            )

            if exclusion_result and exclusion_result.is_excluded:
                return RuleEvaluation(
                    rule_name="EXCLUSION_CHECK",
                    passed=False,
                    details=f"Excluded: {exclusion_result.matched_exclusion}",
                    blocking=True,
                )
            else:
                return RuleEvaluation(
                    rule_name="EXCLUSION_CHECK",
                    passed=True,
                    details="Treatment not excluded under policy",
                    blocking=False,
                )
        else:
            return RuleEvaluation(
                rule_name="EXCLUSION_CHECK",
                passed=True,
                details="No diagnosis available for exclusion check",
                blocking=False,
            )
