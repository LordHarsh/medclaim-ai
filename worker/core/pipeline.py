import time

import logfire
from langgraph.graph import END, StateGraph

from agents.doc_extraction import run_doc_extraction
from agents.doc_verification import run_doc_verification
from agents.final_decision import run_final_decision
from agents.fraud_detection import run_fraud_detection
from agents.policy_engine import run_policy_engine
from core.db import persist_early_stop, persist_final_result, update_claim_status
from core.state import ClaimState

# Step criticality mapping
CRITICAL_STEPS = {"load_context", "doc_verify"}
DEGRADABLE_STEPS = {"doc_extract", "policy_engine", "fraud_detection", "final_decision"}


def _default_result_for_step(step_name: str) -> dict:
    """Return a safe default result when a degradable step fails."""
    defaults = {
        "doc_extract": {
            "extracted_data": {
                "prescription": None,
                "hospital_bill": None,
                "lab_report": None,
                "pharmacy_bill": None,
                "extraction_confidence": 0.3,
            },
            "current_step": "DOCUMENT_EXTRACTION",
        },
        "policy_engine": {
            "policy_evaluation": {
                "eligible": True,
                "decision_suggestion": "MANUAL_REVIEW",
                "approved_amount": None,
                "rejection_reasons": [],
                "calculation_breakdown": None,
                "rule_evaluations": [],
                "line_item_decisions": None,
                "warnings": ["Policy engine failed, routing to manual review"],
            },
            "current_step": "POLICY_ENGINE",
        },
        "fraud_detection": {
            "fraud_evaluation": {
                "fraud_score": 0.0,
                "risk_level": "LOW",
                "requires_manual_review": False,
                "signals": [],
            },
            "current_step": "FRAUD_DETECTION",
        },
        "final_decision": {
            "final_decision": {
                "decision": "MANUAL_REVIEW",
                "approved_amount": None,
                "confidence_score": 0.5,
                "rejection_reasons": [],
                "user_message": "Your claim is being reviewed by our team.",
                "ops_summary": "Final decision agent failed. Routed to manual review.",
                "calculation_breakdown": None,
                "recommendations": ["Manual review required due to system error"],
            },
            "confidence_score": 0.5,
            "current_step": "FINAL_DECISION",
        },
    }
    return defaults.get(step_name, {})


def _safe_node(func, step_name: str, is_critical: bool):
    """Wrap a node function with error handling and DB status updates."""

    # Map internal step names to DB-friendly step names
    STEP_DB_NAMES = {
        "load_context": "LOAD_CONTEXT",
        "doc_verify": "DOCUMENT_VERIFICATION",
        "doc_extract": "DOCUMENT_EXTRACTION",
        "policy_engine": "POLICY_ENGINE",
        "fraud_detection": "FRAUD_DETECTION",
        "final_decision": "FINAL_DECISION",
    }

    def wrapper(state: ClaimState) -> dict:
        claim_id = state.get("claim_id")
        db_step = STEP_DB_NAMES.get(step_name, step_name.upper())

        # Update DB status before running (so SSE can show "in progress")
        if claim_id:
            try:
                update_claim_status(claim_id, "PROCESSING", db_step)
            except Exception as db_err:
                logfire.warning("pipeline.db_status_update_failed", claim_id=claim_id, step_name=step_name, error=str(db_err))

        start_time = time.time()
        try:
            result = func(state)
            duration_ms = int((time.time() - start_time) * 1000)
            logfire.info("pipeline.step.completed", claim_id=claim_id, step_name=step_name, duration_ms=duration_ms)
            return result
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logfire.error("pipeline.step.failed", claim_id=claim_id, step_name=step_name, duration_ms=duration_ms, error=str(e), _exc_info=True)

            if is_critical:
                raise  # Let Lambda fail and SQS retry

            # Degradable: add to degraded_steps, reduce confidence
            degraded = list(state.get("degraded_steps", []))
            degraded.append(step_name)
            confidence = state.get("confidence_score", 0.95) - 0.15

            default_result = _default_result_for_step(step_name)
            default_result["degraded_steps"] = degraded
            default_result["confidence_score"] = confidence
            return default_result

    return wrapper


# --- Node Functions ---


def load_context_node(state: ClaimState) -> dict:
    """
    Load all data needed for processing.
    Fetches from DB and S3.
    """
    # In the actual Lambda, this would have already been done by the handler
    # This node ensures the state is properly initialized
    return {
        "current_step": "LOAD_CONTEXT",
        "should_stop_early": False,
        "degraded_steps": state.get("degraded_steps", []),
        "confidence_score": state.get("confidence_score", 0.95),
    }


def doc_verify_node(state: ClaimState) -> dict:
    """Document verification node."""
    return run_doc_verification(state)


def doc_extract_node(state: ClaimState) -> dict:
    """Document extraction node."""
    return run_doc_extraction(state)


def policy_engine_node(state: ClaimState) -> dict:
    """Policy engine node."""
    return run_policy_engine(state)


def fraud_detection_node(state: ClaimState) -> dict:
    """Fraud detection node."""
    return run_fraud_detection(state)


def final_decision_node(state: ClaimState) -> dict:
    """Final decision node."""
    return run_final_decision(state)


def persist_result_node(state: ClaimState) -> dict:
    """Persist final results to database."""
    final = state.get("final_decision", {})
    fraud = state.get("fraud_evaluation", {})

    trace_json = _build_trace(state)

    try:
        persist_final_result(
            claim_id=state["claim_id"],
            decision=final.get("decision", "MANUAL_REVIEW"),
            approved_amount=final.get("approved_amount"),
            confidence_score=final.get("confidence_score", state.get("confidence_score", 0.5)),
            rejection_reasons=final.get("rejection_reasons", []),
            fraud_score=fraud.get("fraud_score") if fraud else None,
            fraud_signals=fraud.get("signals", []) if fraud else [],
            trace_json=trace_json,
        )
    except Exception as e:
        logfire.error("pipeline.persist_result.failed", claim_id=state["claim_id"], error=str(e), _exc_info=True)
        # Non-fatal — result is already in state

    return {"current_step": "PERSIST_RESULT"}


def persist_early_stop_node(state: ClaimState) -> dict:
    """Persist early stop result (NEEDS_REUPLOAD)."""
    trace_json = _build_trace(state)

    try:
        persist_early_stop(
            claim_id=state["claim_id"],
            reason=state.get("early_stop_reason", "UNKNOWN"),
            message=state.get("early_stop_message", "Document verification failed"),
            trace_json=trace_json,
        )
    except Exception as e:
        logfire.error("pipeline.persist_early_stop.failed", claim_id=state["claim_id"], error=str(e), _exc_info=True)

    return {"current_step": "PERSIST_EARLY_STOP"}


def _build_trace(state: ClaimState) -> dict:
    """Build the full trace JSON for explainability."""
    trace = {
        "pipeline_version": "1.0.0",
        "degraded": len(state.get("degraded_steps", [])) > 0,
        "degradation_notes": [
            f"{step} was skipped due to component failure"
            for step in state.get("degraded_steps", [])
        ],
        "steps": [],
    }

    # Add verification step
    if state.get("doc_verification"):
        trace["steps"].append({
            "step_name": "DOCUMENT_VERIFICATION",
            "step_order": 1,
            "status": "COMPLETED",
            "summary": "Document verification completed",
            "details": state["doc_verification"],
        })

    # Add extraction step
    if state.get("extracted_data"):
        trace["steps"].append({
            "step_name": "DOCUMENT_EXTRACTION",
            "step_order": 2,
            "status": "COMPLETED",
            "summary": "Data extraction completed",
        })

    # Add policy step
    if state.get("policy_evaluation"):
        trace["steps"].append({
            "step_name": "POLICY_ENGINE",
            "step_order": 3,
            "status": "COMPLETED",
            "summary": "Policy evaluation completed",
            "details": state["policy_evaluation"],
        })

    # Add fraud step
    if state.get("fraud_evaluation"):
        trace["steps"].append({
            "step_name": "FRAUD_DETECTION",
            "step_order": 4,
            "status": "COMPLETED" if "fraud_detection" not in state.get("degraded_steps", []) else "DEGRADED",
            "summary": "Fraud detection completed",
            "details": state["fraud_evaluation"],
        })
    elif "fraud_detection" in state.get("degraded_steps", []):
        trace["steps"].append({
            "step_name": "FRAUD_DETECTION",
            "step_order": 4,
            "status": "DEGRADED",
            "summary": "Fraud detection skipped due to component failure",
        })

    # Add final decision
    if state.get("final_decision"):
        trace["steps"].append({
            "step_name": "FINAL_DECISION",
            "step_order": 5,
            "status": "COMPLETED",
            "summary": "Final decision rendered",
            "details": state["final_decision"],
        })
        trace["final_decision"] = state["final_decision"]

    return trace


# --- Conditional Edge ---


def should_stop_early_check(state: ClaimState) -> str:
    """Conditional edge: if verification failed, stop early."""
    if state.get("should_stop_early", False):
        return "persist_early_stop"
    return "doc_extract"


# --- Build Graph ---


def build_pipeline() -> StateGraph:
    """
    Build the LangGraph pipeline for claims processing.

    Returns a compiled StateGraph ready to invoke.
    """
    graph = StateGraph(ClaimState)

    # Add nodes with error wrapping
    graph.add_node("load_context", _safe_node(load_context_node, "load_context", is_critical=True))
    graph.add_node("doc_verify", _safe_node(doc_verify_node, "doc_verify", is_critical=True))
    graph.add_node("doc_extract", _safe_node(doc_extract_node, "doc_extract", is_critical=False))
    graph.add_node("policy_engine", _safe_node(policy_engine_node, "policy_engine", is_critical=False))
    graph.add_node("fraud_detection", _safe_node(fraud_detection_node, "fraud_detection", is_critical=False))
    graph.add_node("final_decision", _safe_node(final_decision_node, "final_decision", is_critical=False))
    graph.add_node("persist_result", persist_result_node)
    graph.add_node("persist_early_stop", persist_early_stop_node)

    # Define edges
    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "doc_verify")

    # Conditional edge after verification
    graph.add_conditional_edges(
        "doc_verify",
        should_stop_early_check,
        {
            "persist_early_stop": "persist_early_stop",
            "doc_extract": "doc_extract",
        },
    )

    graph.add_edge("doc_extract", "policy_engine")
    graph.add_edge("policy_engine", "fraud_detection")
    graph.add_edge("fraud_detection", "final_decision")
    graph.add_edge("final_decision", "persist_result")
    graph.add_edge("persist_result", END)
    graph.add_edge("persist_early_stop", END)

    return graph.compile()


# Singleton compiled pipeline
_pipeline = None


def get_pipeline():
    """Get or create the compiled pipeline (singleton)."""
    global _pipeline
    if _pipeline is None:
        _pipeline = build_pipeline()
        graph_png = _pipeline.get_graph().draw_mermaid_png()
        with open("graph.png", "wb") as f:
            f.write(graph_png)


    return _pipeline
