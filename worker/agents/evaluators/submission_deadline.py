"""Rule 2: Submission Deadline check."""

from datetime import date

from agents.evaluators.base import ClauseEvaluator, EvaluationContext
from models.schemas import RuleEvaluation


class SubmissionDeadlineEvaluator(ClauseEvaluator):
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        deadline_days = ctx.policy.submission_rules.deadline_days_from_treatment
        days_since_treatment = (ctx.today - ctx.treatment_date).days
        passed = days_since_treatment <= deadline_days

        return RuleEvaluation(
            rule_name="SUBMISSION_DEADLINE",
            passed=passed,
            details=f"Submitted {days_since_treatment} days after treatment (limit: {deadline_days})",
            blocking=not passed,
        )
