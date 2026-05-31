from typing import Optional
from pydantic import BaseModel, Field


class EvaluationRule(BaseModel):
    """A single rule definition for the policy engine orchestrator."""
    id: str                     # e.g. "member_eligibility"
    type: str                   # "deterministic" or "llm_classification"
    blocking: bool = True       # if True, failure stops the pipeline
    order: int                  # execution order
    description: str = ""       # human-readable explanation
    config: dict = Field(default_factory=dict)  # rule-specific params


class FamilyFloater(BaseModel):
    enabled: bool
    combined_limit: float
    covered_relationships: list[str]


class Coverage(BaseModel):
    sum_insured_per_employee: float
    annual_opd_limit: float
    per_claim_limit: float
    family_floater: FamilyFloater


class OpdCategory(BaseModel):
    sub_limit: float
    copay_percent: float = 0
    network_discount_percent: float = 0
    requires_prescription: bool = False
    requires_pre_auth: bool = False
    covered: bool = True
    # Pharmacy-specific
    branded_drug_copay_percent: Optional[float] = None
    generic_mandatory: Optional[bool] = None
    # Diagnostic-specific
    pre_auth_threshold: Optional[float] = None
    high_value_tests_requiring_pre_auth: list[str] = Field(default_factory=list)
    # Dental-specific
    requires_dental_report: Optional[bool] = None
    covered_procedures: list[str] = Field(default_factory=list)
    excluded_procedures: list[str] = Field(default_factory=list)
    # Vision-specific
    covered_items: list[str] = Field(default_factory=list)
    excluded_items: list[str] = Field(default_factory=list)
    # Alternative medicine-specific
    requires_registered_practitioner: Optional[bool] = None
    max_sessions_per_year: Optional[int] = None
    covered_systems: list[str] = Field(default_factory=list)


class WaitingPeriods(BaseModel):
    initial_waiting_period_days: int
    pre_existing_conditions_days: int
    specific_conditions: dict[str, int]


class Exclusions(BaseModel):
    conditions: list[str]
    dental_exclusions: list[str] = Field(default_factory=list)
    vision_exclusions: list[str] = Field(default_factory=list)


class PreAuthorization(BaseModel):
    required_for: list[str]
    validity_days: int


class DocumentRequirement(BaseModel):
    required: list[str]
    optional: list[str] = Field(default_factory=list)


class FraudThresholds(BaseModel):
    same_day_claims_limit: int
    monthly_claims_limit: int
    high_value_claim_threshold: float
    auto_manual_review_above: float
    fraud_score_manual_review_threshold: float = 0.80


class SubmissionRules(BaseModel):
    deadline_days_from_treatment: int
    minimum_claim_amount: float
    currency: str


class PolicyHolder(BaseModel):
    company_name: str
    employee_count: int
    policy_start_date: str
    policy_end_date: str
    renewal_status: str


class PolicyConfig(BaseModel):
    policy_id: str
    policy_name: str
    insurer: str
    policy_holder: PolicyHolder
    coverage: Coverage
    opd_categories: dict[str, OpdCategory]
    waiting_periods: WaitingPeriods
    exclusions: Exclusions
    pre_authorization: PreAuthorization
    network_hospitals: list[str]
    submission_rules: SubmissionRules
    document_requirements: dict[str, DocumentRequirement]
    fraud_thresholds: FraudThresholds
    evaluation_rules: list[EvaluationRule] = Field(default_factory=list)

    def get_category(self, category: str) -> Optional[OpdCategory]:
        return self.opd_categories.get(category.lower())

    def is_network_hospital(self, hospital_name: Optional[str]) -> bool:
        if not hospital_name:
            return False
        from thefuzz import fuzz
        return any(
            fuzz.token_set_ratio(hospital_name.lower(), h.lower()) >= 80
            for h in self.network_hospitals
        )
