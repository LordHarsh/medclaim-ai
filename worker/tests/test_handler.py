"""
Tests for the Lambda handler.

Tests SQS event parsing, idempotency, and error handling.
"""

import sys
import os
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestLambdaHandler:
    """Tests for the lambda_handler function."""

    @patch("handler.process_claim")
    @patch("handler.check_idempotency", return_value=False)
    def test_valid_sqs_event(self, mock_idempotency, mock_process):
        """Valid SQS event should trigger claim processing."""
        from handler import lambda_handler

        event = {
            "Records": [
                {
                    "messageId": "msg-001",
                    "body": json.dumps({"claim_id": "claim-uuid-123"}),
                }
            ]
        }

        result = lambda_handler(event, None)

        assert result["statusCode"] == 200
        mock_process.assert_called_once_with("claim-uuid-123")

    @patch("handler.process_claim")
    @patch("handler.check_idempotency", return_value=True)
    def test_idempotency_skip(self, mock_idempotency, mock_process):
        """Already-processed message should be skipped."""
        from handler import lambda_handler

        event = {
            "Records": [
                {
                    "messageId": "msg-001",
                    "body": json.dumps({"claim_id": "claim-uuid-123"}),
                }
            ]
        }

        result = lambda_handler(event, None)

        assert result["statusCode"] == 200
        mock_process.assert_not_called()

    @patch("handler.process_claim")
    @patch("handler.check_idempotency", return_value=False)
    def test_multiple_records(self, mock_idempotency, mock_process):
        """Multiple SQS records should all be processed."""
        from handler import lambda_handler

        event = {
            "Records": [
                {
                    "messageId": "msg-001",
                    "body": json.dumps({"claim_id": "claim-1"}),
                },
                {
                    "messageId": "msg-002",
                    "body": json.dumps({"claim_id": "claim-2"}),
                },
            ]
        }

        result = lambda_handler(event, None)

        assert result["statusCode"] == 200
        assert mock_process.call_count == 2

    def test_invalid_json_body(self):
        """Invalid JSON should be handled gracefully without raising."""
        from handler import lambda_handler

        event = {
            "Records": [
                {
                    "messageId": "msg-001",
                    "body": "not valid json {{{",
                }
            ]
        }

        # Should not raise — just logs error
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200

    def test_missing_claim_id(self):
        """Missing claim_id key should be handled gracefully."""
        from handler import lambda_handler

        event = {
            "Records": [
                {
                    "messageId": "msg-001",
                    "body": json.dumps({"wrong_key": "value"}),
                }
            ]
        }

        result = lambda_handler(event, None)
        assert result["statusCode"] == 200

    @patch("handler.process_claim")
    @patch("handler.check_idempotency", return_value=False)
    def test_process_claim_exception_re_raises(self, mock_idempotency, mock_process):
        """Exception in process_claim should re-raise for SQS retry."""
        from handler import lambda_handler

        mock_process.side_effect = RuntimeError("DB connection failed")

        event = {
            "Records": [
                {
                    "messageId": "msg-001",
                    "body": json.dumps({"claim_id": "claim-1"}),
                }
            ]
        }

        with pytest.raises(RuntimeError, match="DB connection failed"):
            lambda_handler(event, None)

    def test_empty_records(self):
        """Empty records list should return OK."""
        from handler import lambda_handler

        event = {"Records": []}
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200


class TestProcessClaim:
    """Tests for the process_claim function."""

    @patch("core.pipeline.get_pipeline")
    @patch("handler.fetch_ytd_approved_total", return_value=5000.0)
    @patch("handler.fetch_claim_history", return_value=[])
    @patch("handler.fetch_policy_config")
    @patch("handler.fetch_member")
    @patch("handler.fetch_claim_documents", return_value=[])
    @patch("handler.fetch_claim")
    @patch("handler.update_claim_status")
    @patch("boto3.client")
    def test_claim_not_found(
        self, mock_s3, mock_update, mock_fetch_claim,
        mock_fetch_docs, mock_fetch_member, mock_fetch_policy,
        mock_fetch_history, mock_fetch_ytd, mock_pipeline,
    ):
        """Missing claim should return early without processing."""
        from handler import process_claim

        mock_fetch_claim.return_value = None

        process_claim("nonexistent-claim-id")

        mock_pipeline.assert_not_called()

    @patch("core.pipeline.get_pipeline")
    @patch("handler.fetch_ytd_approved_total", return_value=5000.0)
    @patch("handler.fetch_claim_history", return_value=[])
    @patch("handler.fetch_policy_config")
    @patch("handler.fetch_member")
    @patch("handler.fetch_claim_documents", return_value=[])
    @patch("handler.fetch_claim")
    @patch("handler.update_claim_status")
    @patch("boto3.client")
    def test_member_not_found(
        self, mock_s3, mock_update, mock_fetch_claim,
        mock_fetch_docs, mock_fetch_member, mock_fetch_policy,
        mock_fetch_history, mock_fetch_ytd, mock_pipeline,
    ):
        """Missing member should set status to FAILED."""
        from handler import process_claim

        mock_fetch_claim.return_value = SimpleNamespace(
            claim_id="test-001",
            member_id="INVALID",
            policy_id="PLUM_GHI_2024",
            category="CONSULTATION",
            claimed_amount=1500,
            treatment_date="2024-11-01",
            hospital_name=None,
            status="QUEUED",
            current_step=None,
            sqs_message_id=None,
            trace_json={},
            created_at="2024-11-01",
        )
        mock_fetch_member.return_value = None

        process_claim("test-001")

        # Should set status to FAILED
        mock_update.assert_any_call("test-001", "FAILED")
        mock_pipeline.assert_not_called()


class TestIdempotency:
    """A retry of an unfinished claim must run; a finished claim must never run twice."""

    CLAIM_ID = "11111111-1111-1111-1111-111111111111"

    def _sql(self):
        from sqlalchemy.dialects import postgresql
        from core.db import idempotency_claim_statement

        stmt = idempotency_claim_statement(self.CLAIM_ID, "msg-001")
        return str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))

    def test_statement_only_claims_unfinished_work(self):
        sql = self._sql()
        assert "status NOT IN ('COMPLETED', 'NEEDS_REUPLOAD')" in sql
        # first delivery, or the same message coming back
        assert "sqs_message_id IS NULL" in sql
        assert "sqs_message_id = 'msg-001'" in sql

    @patch("core.db.Session")
    def test_row_claimed_means_process(self, mock_session_cls):
        from core.db import check_idempotency

        session = mock_session_cls.return_value.__enter__.return_value
        session.execute.return_value = SimpleNamespace(rowcount=1)
        assert check_idempotency(self.CLAIM_ID, "msg-001") is False
        session.commit.assert_called_once()

    @patch("core.db.Session")
    def test_no_row_claimed_means_skip(self, mock_session_cls):
        from core.db import check_idempotency

        session = mock_session_cls.return_value.__enter__.return_value
        session.execute.return_value = SimpleNamespace(rowcount=0)
        assert check_idempotency(self.CLAIM_ID, "msg-001") is True

    @patch("handler.process_claim")
    @patch("handler.check_idempotency", return_value=False)
    def test_redelivery_after_a_crash_is_processed_again(self, mock_idempotency, mock_process):
        """First delivery raises, SQS sends the same message again, and it runs."""
        from handler import lambda_handler

        event = {"Records": [{"messageId": "msg-001", "body": json.dumps({"claim_id": self.CLAIM_ID})}]}
        mock_process.side_effect = [RuntimeError("worker died"), None]

        with pytest.raises(RuntimeError):
            lambda_handler(event, None)
        assert lambda_handler(event, None)["statusCode"] == 200
        assert mock_process.call_count == 2


class TestEvalIsolation:
    """A test-runner claim sees its own seeded history and nothing from earlier runs."""

    def test_keeps_own_row_and_seeded_rows_only(self):
        from handler import isolate_eval_history

        history = [SimpleNamespace(claim_id=c) for c in ("this", "seed-1", "seed-2", "older-run", "other-case")]
        kept = isolate_eval_history("this", {"eval_history_claim_ids": ["seed-1", "seed-2"]}, history)
        assert [h.claim_id for h in kept] == ["this", "seed-1", "seed-2"]

    def test_no_seeded_history_keeps_only_own_row(self):
        from handler import isolate_eval_history

        history = [SimpleNamespace(claim_id=c) for c in ("this", "older-run")]
        assert [h.claim_id for h in isolate_eval_history("this", {}, history)] == ["this"]
