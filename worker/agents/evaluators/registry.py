"""Registry mapping rule IDs to evaluator classes."""

from agents.evaluators.base import ClauseEvaluator
from agents.evaluators.member_eligibility import MemberEligibilityEvaluator
from agents.evaluators.submission_deadline import SubmissionDeadlineEvaluator
from agents.evaluators.minimum_amount import MinimumAmountEvaluator
from agents.evaluators.initial_waiting_period import InitialWaitingPeriodEvaluator
from agents.evaluators.condition_waiting_period import ConditionWaitingPeriodEvaluator
from agents.evaluators.exclusion_check import ExclusionCheckEvaluator
from agents.evaluators.pre_authorization import PreAuthorizationEvaluator
from agents.evaluators.per_claim_limit import PerClaimLimitEvaluator
from agents.evaluators.procedure_coverage import ProcedureCoverageEvaluator
from agents.evaluators.amount_calculation import AmountCalculationEvaluator

EVALUATOR_REGISTRY: dict[str, type[ClauseEvaluator]] = {
    "member_eligibility": MemberEligibilityEvaluator,
    "submission_deadline": SubmissionDeadlineEvaluator,
    "minimum_amount": MinimumAmountEvaluator,
    "initial_waiting_period": InitialWaitingPeriodEvaluator,
    "condition_waiting_period": ConditionWaitingPeriodEvaluator,
    "exclusion_check": ExclusionCheckEvaluator,
    "pre_authorization": PreAuthorizationEvaluator,
    "per_claim_limit": PerClaimLimitEvaluator,
    "procedure_coverage": ProcedureCoverageEvaluator,
    "amount_calculation": AmountCalculationEvaluator,
}
