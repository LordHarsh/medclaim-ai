"""Rule 3: Minimum Claim Amount check."""

from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation


class MinimumAmountEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        min_amount = ctx.policy.submission_rules.minimum_claim_amount
        passed = ctx.claimed_amount >= min_amount

        return RuleEvaluation(
            rule_name="MINIMUM_AMOUNT",
            passed=passed,
            details=f"Claimed amount Rs. {ctx.claimed_amount} vs minimum Rs. {min_amount}",
            blocking=not passed,
        )
