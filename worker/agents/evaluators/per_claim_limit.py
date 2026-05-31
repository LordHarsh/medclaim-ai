"""Rule 8: Per-Claim Limit check."""

from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation


class PerClaimLimitEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        per_claim_limit = ctx.policy.coverage.per_claim_limit
        # Categories with procedure lists (covered_procedures/excluded_procedures) are exempt —
        # their procedure coverage and sub_limit handle capping instead.
        has_procedure_coverage = bool(
            ctx.cat_config and (
                ctx.cat_config.covered_procedures or ctx.cat_config.excluded_procedures
                or ctx.cat_config.covered_items or ctx.cat_config.excluded_items
            )
        )

        if has_procedure_coverage:
            return RuleEvaluation(
                rule_name="PER_CLAIM_LIMIT",
                passed=True,
                details=f"Per-claim limit not applied to {ctx.category} (handled by procedure coverage and sub_limit)",
                blocking=False,
            )
        else:
            passed = ctx.claimed_amount <= per_claim_limit
            return RuleEvaluation(
                rule_name="PER_CLAIM_LIMIT",
                passed=passed,
                details=f"Claimed Rs. {ctx.claimed_amount} vs per-claim limit Rs. {per_claim_limit}",
                blocking=not passed,
            )
