from typing import Optional
from pydantic import BaseModel, Field


# --- Document Verification ---


class DocumentClassification(BaseModel):
    """LLM output for classifying a single document."""

    type: str = Field(
        description="Document type: PRESCRIPTION, HOSPITAL_BILL, LAB_REPORT, PHARMACY_BILL, or UNKNOWN"
    )
    confidence: float = Field(description="Classification confidence 0.0-1.0")
    quality_score: float = Field(description="Readability quality score 0.0-1.0")
    is_readable: bool = Field(description="Whether the document is readable enough for extraction")
    quality_issues: list[str] = Field(
        default_factory=list,
        description="Issues: BLURRY, PARTIAL, ALTERED, STAMP_OVER_TEXT, HANDWRITTEN_ILLEGIBLE",
    )
    patient_name: Optional[str] = Field(
        default=None, description="Patient name as written on document"
    )


class DocumentVerificationResult(BaseModel):
    """Result for a single document after verification."""

    s3_key: str
    detected_type: str
    classification_confidence: float
    quality_score: float
    is_readable: bool
    quality_issues: list[str] = Field(default_factory=list)
    patient_name_found: Optional[str] = None


class PatientMismatch(BaseModel):
    """Patient name mismatch details."""

    detected: bool
    names_found: list[dict] = Field(default_factory=list)


class DocumentVerificationOutput(BaseModel):
    """Full output of the document verification agent."""

    verified: bool
    documents: list[DocumentVerificationResult]
    missing_required_types: list[str] = Field(default_factory=list)
    patient_mismatch: Optional[PatientMismatch] = None
    should_stop_early: bool = False
    early_stop_reason: Optional[str] = None
    error_message: Optional[str] = None
    confidence: float = 1.0


# --- Document Extraction ---


class MedicineItem(BaseModel):
    name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None


class LineItem(BaseModel):
    description: str
    amount: float


class TestResult(BaseModel):
    name: str
    result: Optional[str] = None
    unit: Optional[str] = None
    normal_range: Optional[str] = None


class PrescriptionExtraction(BaseModel):
    """Extracted prescription data."""

    doctor_name: Optional[str] = None
    doctor_registration: Optional[str] = None
    doctor_specialization: Optional[str] = None
    patient_name: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    date: Optional[str] = None
    diagnosis: list[str] = Field(default_factory=list)
    medicines: list[MedicineItem] = Field(default_factory=list)
    tests_ordered: list[str] = Field(default_factory=list)
    hospital_name: Optional[str] = None
    treatment: Optional[str] = None
    field_confidences: dict = Field(default_factory=dict)


class HospitalBillExtraction(BaseModel):
    """Extracted hospital bill data."""

    hospital_name: Optional[str] = None
    patient_name: Optional[str] = None
    date: Optional[str] = None
    bill_number: Optional[str] = None
    line_items: list[LineItem] = Field(default_factory=list)
    total: Optional[float] = None
    field_confidences: dict = Field(default_factory=dict)


class LabReportExtraction(BaseModel):
    """Extracted lab report data."""

    lab_name: Optional[str] = None
    patient_name: Optional[str] = None
    tests: list[TestResult] = Field(default_factory=list)
    referring_doctor: Optional[str] = None
    date: Optional[str] = None
    field_confidences: dict = Field(default_factory=dict)


class PharmacyBillExtraction(BaseModel):
    """Extracted pharmacy bill data."""

    pharmacy_name: Optional[str] = None
    patient_name: Optional[str] = None
    medicines: list[dict] = Field(default_factory=list)
    total: Optional[float] = None
    prescribing_doctor: Optional[str] = None
    date: Optional[str] = None
    field_confidences: dict = Field(default_factory=dict)


class ExtractionOutput(BaseModel):
    """Full output of document extraction agent."""

    prescription: Optional[PrescriptionExtraction] = None
    hospital_bill: Optional[HospitalBillExtraction] = None
    lab_report: Optional[LabReportExtraction] = None
    pharmacy_bill: Optional[PharmacyBillExtraction] = None
    extraction_confidence: float = 0.9


# --- Policy Engine ---


class ConditionClassification(BaseModel):
    """LLM classification of diagnosis against waiting period conditions."""

    matches_condition: bool = Field(
        description="Whether the diagnosis matches a waiting period condition"
    )
    matched_condition: Optional[str] = Field(
        default=None, description="Which condition it matches (e.g., 'diabetes')"
    )
    confidence: float = Field(description="Confidence in classification 0.0-1.0")


class ExclusionMatch(BaseModel):
    """LLM classification of diagnosis against exclusion list."""

    is_excluded: bool = Field(description="Whether treatment is excluded under policy")
    matched_exclusion: Optional[str] = Field(
        default=None, description="Which exclusion it matches"
    )
    confidence: float = Field(description="Confidence in classification 0.0-1.0")


class RuleEvaluation(BaseModel):
    """Result of evaluating a single policy rule."""

    rule_name: str
    passed: bool
    details: str
    blocking: bool = False


class LineItemDecision(BaseModel):
    """Decision for a single line item (dental/vision)."""

    description: str
    amount: float
    approved: bool
    reason: str


class CalculationBreakdown(BaseModel):
    """Amount calculation details."""

    original_amount: float
    eligible_amount: float
    network_discount_applied: bool = False
    network_discount_percent: int = 0
    discount_amount: float = 0.0
    amount_after_discount: float = 0.0
    copay_percent: int = 0
    copay_amount: float = 0.0
    amount_after_copay: float = 0.0
    final_approved_amount: float = 0.0


class PolicyOutput(BaseModel):
    """Full output of the policy engine agent."""

    eligible: bool
    decision_suggestion: str  # APPROVED, PARTIAL, REJECTED
    approved_amount: Optional[float] = None
    rejection_reasons: list[str] = Field(default_factory=list)
    calculation_breakdown: Optional[CalculationBreakdown] = None
    rule_evaluations: list[RuleEvaluation] = Field(default_factory=list)
    line_item_decisions: Optional[list[LineItemDecision]] = None
    warnings: list[str] = Field(default_factory=list)


# --- Fraud Detection ---


class FraudSignal(BaseModel):
    """A single fraud signal detected."""

    signal_type: str
    severity: float
    weight: float
    description: str
    evidence: str


class FraudOutput(BaseModel):
    """Full output of fraud detection agent."""

    fraud_score: float
    risk_level: str  # LOW, MEDIUM, HIGH, CRITICAL
    requires_manual_review: bool
    signals: list[FraudSignal] = Field(default_factory=list)


# --- Final Decision ---


class FinalDecisionOutput(BaseModel):
    """Full output of the final decision agent."""

    decision: str  # APPROVED, PARTIAL, REJECTED, MANUAL_REVIEW
    approved_amount: Optional[float] = None
    confidence_score: float
    confidence_deductions: list[dict] = Field(default_factory=list)
    rejection_reasons: list[str] = Field(default_factory=list)
    line_item_decisions: Optional[list[dict]] = None
    user_message: str
    ops_summary: str
    calculation_breakdown: Optional[dict] = None
    recommendations: list[str] = Field(default_factory=list)
