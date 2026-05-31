"""Rule 7: Pre-Authorization check."""

from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation


class PreAuthorizationEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        cat_config = ctx.cat_config
        pre_auth_threshold = cat_config.pre_auth_threshold if cat_config else None
        high_value_tests = cat_config.high_value_tests_requiring_pre_auth if cat_config else []

        if pre_auth_threshold is not None and high_value_tests:
            prescription_data = ctx.extracted_data.get("prescription", {})
            tests_ordered = prescription_data.get("tests_ordered", []) if prescription_data else []
            bill_items = []
            if ctx.extracted_data.get("hospital_bill"):
                bill_items = ctx.extracted_data["hospital_bill"].get("line_items", [])

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

            if has_high_value_test and ctx.claimed_amount > pre_auth_threshold:
                return RuleEvaluation(
                    rule_name="PRE_AUTHORIZATION",
                    passed=False,
                    details=f"Pre-authorization required for high-value diagnostic test above Rs. {pre_auth_threshold}",
                    blocking=True,
                )
            else:
                return RuleEvaluation(
                    rule_name="PRE_AUTHORIZATION",
                    passed=True,
                    details="No pre-authorization required",
                    blocking=False,
                )
        else:
            return RuleEvaluation(
                rule_name="PRE_AUTHORIZATION",
                passed=True,
                details=f"Pre-auth check not applicable for {ctx.category}",
                blocking=False,
            )
