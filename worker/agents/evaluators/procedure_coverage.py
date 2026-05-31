"""Rule 9: Procedure Coverage check."""

import agents.policy_engine as pe
from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation


class ProcedureCoverageEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        has_procedure_coverage = bool(
            ctx.cat_config and (
                ctx.cat_config.covered_procedures or ctx.cat_config.excluded_procedures
                or ctx.cat_config.covered_items or ctx.cat_config.excluded_items
            )
        )

        if has_procedure_coverage:
            bill_data = ctx.extracted_data.get("hospital_bill", {})
            line_items = bill_data.get("line_items", []) if bill_data else []

            if line_items:
                # Convert LineItem models to dicts if needed
                item_dicts = []
                for item in line_items:
                    if isinstance(item, dict):
                        item_dicts.append(item)
                    else:
                        item_dicts.append({"description": item.description, "amount": item.amount})

                decisions, covered_amount = pe._check_procedure_coverage(
                    item_dicts, ctx.category, ctx.policy
                )
                ctx.line_item_decisions = decisions

                all_rejected = all(not d.approved for d in decisions)
                some_rejected = any(not d.approved for d in decisions)

                if all_rejected:
                    ctx.eligible_amount = 0.0
                    return RuleEvaluation(
                        rule_name="PROCEDURE_COVERAGE",
                        passed=False,
                        details="All line items are excluded procedures",
                        blocking=True,
                    )
                elif some_rejected:
                    ctx.eligible_amount = covered_amount
                    return RuleEvaluation(
                        rule_name="PROCEDURE_COVERAGE",
                        passed=True,
                        details=f"Partial coverage: Rs. {covered_amount} of Rs. {ctx.claimed_amount} eligible",
                        blocking=False,
                    )
                else:
                    return RuleEvaluation(
                        rule_name="PROCEDURE_COVERAGE",
                        passed=True,
                        details="All procedures are covered",
                        blocking=False,
                    )
            else:
                return RuleEvaluation(
                    rule_name="PROCEDURE_COVERAGE",
                    passed=True,
                    details="No line items to evaluate",
                    blocking=False,
                )
        else:
            return RuleEvaluation(
                rule_name="PROCEDURE_COVERAGE",
                passed=True,
                details=f"Procedure coverage check not applicable for {ctx.category}",
                blocking=False,
            )
