"""
Unit tests for the Fraud Detection Agent.

Tests all 8 signals and scoring algorithm.
"""

import sys
import os
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.fraud_detection import (
    run_fraud_detection,
    _check_same_day_claims,
    _check_monthly_claims,
    _check_high_value,
    _check_multiple_providers_same_day,
    _check_document_alteration,
    _check_amount_mismatch,
    _check_date_inconsistency,
    _check_duplicate_claim,
)
from models.policy import PolicyConfig


def _make_minimal_policy() -> PolicyConfig:
    """Create a minimal PolicyConfig with default fraud thresholds for tests."""
    return PolicyConfig.model_validate({
        "policy_id": "TEST_FRAUD_POLICY",
        "policy_name": "Test Policy",
        "insurer": "Test Insurer",
        "policy_holder": {
            "company_name": "Test Corp",
            "employee_count": 10,
            "renewal_status": "ACTIVE",
            "policy_start_date": "2024-04-01",
            "policy_end_date": "2025-03-31",
        },
        "coverage": {
            "sum_insured_per_employee": 500000,
            "annual_opd_limit": 50000,
            "per_claim_limit": 5000,
            "family_floater": {"enabled": False, "combined_limit": 0, "covered_relationships": []},
        },
        "opd_categories": {},
        "waiting_periods": {
            "initial_waiting_period_days": 30,
            "pre_existing_conditions_days": 365,
            "specific_conditions": {},
        },
        "exclusions": {"conditions": []},
        "pre_authorization": {"required_for": [], "validity_days": 30},
        "network_hospitals": [],
        "submission_rules": {
            "deadline_days_from_treatment": 30,
            "minimum_claim_amount": 500,
            "currency": "INR",
        },
        "document_requirements": {},
        "fraud_thresholds": {
            "same_day_claims_limit": 2,
            "monthly_claims_limit": 6,
            "high_value_claim_threshold": 25000,
            "auto_manual_review_above": 25000,
            "fraud_score_manual_review_threshold": 0.80,
        },
    })


@pytest.fixture
def base_state():
    """Base state for fraud detection tests."""
    today = date.today()
    return {
        "claim_id": "test-fraud-001",
        "member": SimpleNamespace(member_id="EMP001", name="Test User"),
        "policy": _make_minimal_policy(),
        "category": "CONSULTATION",
        "claimed_amount": 1500.0,
        "treatment_date": today.isoformat(),
        "hospital_name": "City Clinic",
        "documents": [],
        "claim_history": [],
        "ytd_approved_total": 0.0,
        "doc_verification": {"documents": []},
        "extracted_data": {
            "hospital_bill": {"total": 1500, "date": today.isoformat()},
            "extraction_confidence": 0.95,
        },
        "policy_evaluation": None,
        "fraud_evaluation": None,
        "final_decision": None,
        "should_stop_early": False,
        "early_stop_reason": None,
        "early_stop_message": None,
        "degraded_steps": [],
        "confidence_score": 0.95,
        "current_step": "FRAUD_DETECTION",
        "simulate_component_failure": False,
    }


# --- Individual Signal Tests ---


class TestSignal1SameDayClaims:
    def test_no_prior_claims(self):
        result = _check_same_day_claims("EMP001", date(2024, 11, 1), [])
        assert result is None

    def test_one_prior_claim_no_trigger(self):
        history = [{"date": "2024-11-01", "amount": 1000, "provider": "Clinic A"}]
        result = _check_same_day_claims("EMP001", date(2024, 11, 1), history)
        assert result is None

    def test_two_prior_claims_triggers(self):
        """2 prior claims on same day triggers (limit is >= 2)."""
        history = [
            {"date": "2024-11-01", "amount": 1000, "provider": "Clinic A"},
            {"date": "2024-11-01", "amount": 1500, "provider": "Clinic B"},
        ]
        result = _check_same_day_claims("EMP001", date(2024, 11, 1), history)
        assert result is not None
        assert result.signal_type == "SAME_DAY_CLAIMS_EXCEEDED"
        assert result.severity == 0.8
        assert result.weight == 1.0

    def test_different_day_no_trigger(self):
        history = [
            {"date": "2024-10-31", "amount": 1000, "provider": "Clinic A"},
            {"date": "2024-10-31", "amount": 1500, "provider": "Clinic B"},
            {"date": "2024-10-31", "amount": 2000, "provider": "Clinic C"},
        ]
        result = _check_same_day_claims("EMP001", date(2024, 11, 1), history)
        assert result is None


class TestSignal2MonthlyClaims:
    def test_below_limit(self):
        history = [{"date": "2024-11-01"} for _ in range(5)]
        result = _check_monthly_claims("EMP001", date(2024, 11, 15), history)
        assert result is None

    def test_at_limit_triggers(self):
        history = [{"date": "2024-11-01"} for _ in range(6)]
        result = _check_monthly_claims("EMP001", date(2024, 11, 15), history)
        assert result is not None
        assert result.signal_type == "MONTHLY_CLAIMS_EXCEEDED"


class TestSignal3HighValue:
    def test_below_threshold(self):
        result = _check_high_value(25000)
        assert result is None

    def test_above_threshold(self):
        result = _check_high_value(25001)
        assert result is not None
        assert result.signal_type == "HIGH_VALUE_CLAIM"
        assert result.severity == 0.4
        assert result.weight == 0.5


class TestSignal4MultipleProviders:
    def test_single_provider(self):
        history = [{"date": "2024-11-01", "provider": "Clinic A"}]
        result = _check_multiple_providers_same_day(date(2024, 11, 1), "Clinic A", history)
        assert result is None

    def test_three_providers_triggers(self):
        """More than 2 distinct providers triggers."""
        history = [
            {"date": "2024-11-01", "provider": "Clinic A"},
            {"date": "2024-11-01", "provider": "Clinic B"},
        ]
        # Current claim at "Clinic C" makes 3 distinct providers
        result = _check_multiple_providers_same_day(date(2024, 11, 1), "Clinic C", history)
        assert result is not None
        assert result.signal_type == "MULTIPLE_PROVIDERS_SAME_DAY"


class TestSignal5DocumentAlteration:
    def test_no_alteration(self):
        doc_verification = {"documents": [{"quality_issues": ["BLURRY"]}]}
        result = _check_document_alteration(doc_verification)
        assert result is None

    def test_alteration_detected(self):
        doc_verification = {"documents": [{"quality_issues": ["ALTERED"], "detected_type": "HOSPITAL_BILL"}]}
        result = _check_document_alteration(doc_verification)
        assert result is not None
        assert result.signal_type == "DOCUMENT_ALTERATION"


class TestSignal6AmountMismatch:
    def test_matching_amounts(self):
        extracted = {"hospital_bill": {"total": 1500}}
        result = _check_amount_mismatch(1500, extracted)
        assert result is None

    def test_small_difference_no_trigger(self):
        """4% difference should not trigger (threshold is 5%)."""
        extracted = {"hospital_bill": {"total": 1500}}
        result = _check_amount_mismatch(1560, extracted)  # 4% diff
        assert result is None

    def test_large_difference_triggers(self):
        """10% difference should trigger."""
        extracted = {"hospital_bill": {"total": 1500}}
        result = _check_amount_mismatch(1700, extracted)  # >5% diff
        assert result is not None
        assert result.signal_type == "AMOUNT_MISMATCH"


class TestSignal7DateInconsistency:
    def test_matching_dates(self):
        extracted = {"hospital_bill": {"date": "2024-11-01"}}
        result = _check_date_inconsistency(date(2024, 11, 1), extracted)
        assert result is None

    def test_different_dates_triggers(self):
        extracted = {"hospital_bill": {"date": "2024-11-05"}}
        result = _check_date_inconsistency(date(2024, 11, 1), extracted)
        assert result is not None
        assert result.signal_type == "DATE_INCONSISTENCY"


class TestSignal8DuplicateClaim:
    def test_no_duplicate(self):
        history = [{"date": "2024-11-01", "amount": 1000, "provider": "Clinic A"}]
        result = _check_duplicate_claim("EMP001", date(2024, 11, 1), 1500, "Clinic B", history)
        assert result is None

    def test_duplicate_detected(self):
        history = [{"date": "2024-11-01", "amount": 1500, "provider": "City Clinic"}]
        result = _check_duplicate_claim("EMP001", date(2024, 11, 1), 1500, "City Clinic", history)
        assert result is not None
        assert result.signal_type == "DUPLICATE_CLAIM"
        assert result.severity == 0.9
        assert result.weight == 1.0


# --- Full Agent Tests ---


class TestFraudDetectionAgent:
    def test_no_signals_low_risk(self, base_state):
        """Clean claim should have score 0, risk LOW."""
        result = run_fraud_detection(base_state)
        fraud = result["fraud_evaluation"]
        assert fraud["fraud_score"] == 0.0
        assert fraud["risk_level"] == "LOW"
        assert fraud["requires_manual_review"] is False
        assert len(fraud["signals"]) == 0

    def test_tc009_multiple_same_day(self, base_state):
        """TC009: 3 prior claims from different providers → MANUAL_REVIEW."""
        base_state["claim_history"] = [
            {"date": base_state["treatment_date"], "amount": 1200, "provider": "City Clinic A"},
            {"date": base_state["treatment_date"], "amount": 1800, "provider": "City Clinic B"},
            {"date": base_state["treatment_date"], "amount": 2100, "provider": "Wellness Center"},
        ]
        base_state["hospital_name"] = "Health Hub"

        result = run_fraud_detection(base_state)
        fraud = result["fraud_evaluation"]

        # Should trigger SAME_DAY_CLAIMS_EXCEEDED and MULTIPLE_PROVIDERS_SAME_DAY
        signal_types = [s["signal_type"] for s in fraud["signals"]]
        assert "SAME_DAY_CLAIMS_EXCEEDED" in signal_types
        assert "MULTIPLE_PROVIDERS_SAME_DAY" in signal_types

        # Verify score: (0.8*1.0 + 0.7*0.9) / 2.5 = 1.43/2.5 = 0.572
        expected_raw = 0.8 * 1.0 + 0.7 * 0.9
        expected_score = min(1.0, expected_raw / 2.5)
        assert abs(fraud["fraud_score"] - expected_score) < 0.01

        assert fraud["risk_level"] == "HIGH"
        assert fraud["requires_manual_review"] is True

    def test_high_value_override(self, base_state):
        """Claim > 25000 forces manual review regardless of score."""
        base_state["claimed_amount"] = 26000.0
        result = run_fraud_detection(base_state)
        fraud = result["fraud_evaluation"]
        assert fraud["requires_manual_review"] is True

    def test_simulated_failure_raises(self, base_state):
        """TC011: simulate_component_failure raises RuntimeError."""
        base_state["simulate_component_failure"] = True
        with pytest.raises(RuntimeError, match="Simulated component failure"):
            run_fraud_detection(base_state)

    def test_score_calculation_multiple_signals(self, base_state):
        """Multiple signals: verify raw_score / 2.5, capped at 1.0."""
        today = date.today()
        base_state["claimed_amount"] = 30000.0  # Triggers HIGH_VALUE_CLAIM
        base_state["treatment_date"] = today.isoformat()
        base_state["claim_history"] = [
            {"date": today.isoformat(), "amount": 1200, "provider": "Clinic A"},
            {"date": today.isoformat(), "amount": 1800, "provider": "Clinic B"},
            {"date": today.isoformat(), "amount": 30000, "provider": "City Clinic"},  # duplicate
        ]
        base_state["hospital_name"] = "City Clinic"
        base_state["doc_verification"] = {
            "documents": [{"quality_issues": ["ALTERED"], "detected_type": "BILL"}]
        }

        result = run_fraud_detection(base_state)
        fraud = result["fraud_evaluation"]

        # Should have multiple signals
        assert len(fraud["signals"]) >= 3
        # Score should be capped at 1.0
        assert fraud["fraud_score"] <= 1.0
        assert fraud["requires_manual_review"] is True

    def test_critical_risk_level(self, base_state):
        """Score >= 0.80 should be CRITICAL."""
        today = date.today()
        base_state["treatment_date"] = today.isoformat()
        # Create enough signals to push score above 0.80
        # SAME_DAY (0.8*1.0) + MULTIPLE_PROVIDERS (0.7*0.9) + DUPLICATE (0.9*1.0) = 2.43
        # Score = 2.43 / 2.5 = 0.972
        base_state["claim_history"] = [
            {"date": today.isoformat(), "amount": 1200, "provider": "Clinic A"},
            {"date": today.isoformat(), "amount": 1800, "provider": "Clinic B"},
            {"date": today.isoformat(), "amount": 1500, "provider": "City Clinic"},
        ]
        base_state["hospital_name"] = "City Clinic"
        base_state["claimed_amount"] = 1500.0

        result = run_fraud_detection(base_state)
        fraud = result["fraud_evaluation"]
        # With same-day(0.8), multiple providers(0.7*0.9=0.63), duplicate(0.9*1.0=0.9)
        # raw = 0.8 + 0.63 + 0.9 = 2.33, score = 2.33/2.5 = 0.932
        assert fraud["fraud_score"] >= 0.80
        assert fraud["risk_level"] == "CRITICAL"
