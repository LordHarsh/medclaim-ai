"""Rule 10: Amount Calculation."""

from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation, CalculationBreakdown


class AmountCalculationEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        # eligible_amount was set by procedure_coverage (or defaults to claimed_amount)
        eligible_amount = ctx.eligible_amount

        # Step B: Network Discount (APPLIED FIRST)
        is_network = ctx.policy.is_network_hospital(ctx.hospital_name)
        network_discount_pct = (
            ctx.cat_config.network_discount_percent if ctx.cat_config else 0
        ) if is_network else 0
        discount_amount = eligible_amount * (network_discount_pct / 100)
        amount_after_discount = eligible_amount - discount_amount

        # Step C: Co-pay (APPLIED AFTER discount)
        copay_pct = ctx.cat_config.copay_percent if ctx.cat_config else 0
        copay_amount = amount_after_discount * (copay_pct / 100)
        amount_after_copay = amount_after_discount - copay_amount

        # Step D: Annual OPD Limit
        annual_opd_limit = ctx.policy.coverage.annual_opd_limit
        remaining = annual_opd_limit - ctx.ytd_approved
        final_amount = min(amount_after_copay, remaining)

        # Step E: Floor
        final_amount = max(0, round(final_amount, 2))

        # Store calculation breakdown on context for orchestrator to use
        ctx._calculation = CalculationBreakdown(
            original_amount=ctx.claimed_amount,
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
        ctx._final_amount = final_amount

        return RuleEvaluation(
            rule_name="AMOUNT_CALCULATION",
            passed=True,
            details=(
                f"Eligible: Rs. {eligible_amount}, "
                f"Network discount: {network_discount_pct}% (Rs. {discount_amount:.2f}), "
                f"Co-pay: {copay_pct}% (Rs. {copay_amount:.2f}), "
                f"Final: Rs. {final_amount}"
            ),
            blocking=False,
        )
