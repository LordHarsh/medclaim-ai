"""Base class and context for all policy clause evaluators."""

from abc import ABC, abstractmethod
from datetime import date
from typing import Optional

from models.schemas import RuleEvaluation
from models.policy import PolicyConfig, OpdCategory


class EvaluationContext:
    """All data needed by evaluators — passed by the orchestrator."""

    def __init__(
        self,
        policy: PolicyConfig,
        member,
        category: str,
        claimed_amount: float,
        treatment_date: date,
        hospital_name: Optional[str],
        extracted_data: dict,
        ytd_approved: float,
        cat_config: Optional[OpdCategory],
    ):
        self.policy = policy
        self.member = member
        self.category = category
        self.claimed_amount = claimed_amount
        self.treatment_date = treatment_date
        self.hospital_name = hospital_name
        self.extracted_data = extracted_data
        self.ytd_approved = ytd_approved
        self.cat_config = cat_config

        # Shared mutable state: set by procedure_coverage, read by amount_calculation
        self.eligible_amount: float = claimed_amount
        self.line_item_decisions: Optional[list] = None


class ClauseEvaluator(ABC):
    """Base class for all policy clause evaluators."""

    @abstractmethod
    def evaluate(self, ctx: EvaluationContext) -> RuleEvaluation:
        """Evaluate this clause. Return RuleEvaluation with passed/failed/details."""
        ...
