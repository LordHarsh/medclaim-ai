"""Rule 1: Member Eligibility check."""

from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation


class MemberEligibilityEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        renewal_active = ctx.policy.policy_holder.renewal_status == "ACTIVE"
        member_exists = ctx.member is not None and ctx.member.member_id is not None

        passed = member_exists and renewal_active
        return RuleEvaluation(
            rule_name="MEMBER_ELIGIBILITY",
            passed=passed,
            details="Member exists and policy is active" if passed else "Member not found or policy inactive",
            blocking=not passed,
        )
