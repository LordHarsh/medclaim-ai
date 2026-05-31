"""Rule 4: Initial Waiting Period check."""

import agents.policy_engine as pe
from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation


class InitialWaitingPeriodEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        join_date_str = ctx.member.join_date

        if join_date_str:
            join_date = pe._parse_date(str(join_date_str))
            initial_waiting_days = ctx.policy.waiting_periods.initial_waiting_period_days
            days_enrolled = (ctx.treatment_date - join_date).days
            passed = days_enrolled >= initial_waiting_days

            return RuleEvaluation(
                rule_name="INITIAL_WAITING_PERIOD",
                passed=passed,
                details=f"Enrolled {days_enrolled} days (minimum: {initial_waiting_days})",
                blocking=not passed,
            )
        else:
            return RuleEvaluation(
                rule_name="INITIAL_WAITING_PERIOD",
                passed=True,
                details="Join date not available, skipping check",
                blocking=False,
            )
