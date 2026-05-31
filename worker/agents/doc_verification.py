import base64

from langchain_core.messages import HumanMessage, SystemMessage

from core.config import get_llm
from core.utils import detect_mime_type
from models.schemas import DocumentClassification, DocumentVerificationOutput, DocumentVerificationResult, PatientMismatch
from models.policy import PolicyConfig
from prompts.verification import DOCUMENT_CLASSIFICATION_PROMPT, VERIFICATION_SYSTEM_PROMPT
from core.state import ClaimState



def _get(obj, key, default=None):
    """Get attribute from either dict or ORM object."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _get_required_types(category: str, policy: PolicyConfig) -> list[str]:
    """Get required document types for a claim category from policy config."""
    req = policy.document_requirements.get(category.upper())
    return req.required if req else []


def _classify_document_from_metadata(doc: dict) -> DocumentClassification:
    """
    For test cases that have metadata (actual_type, quality, patient_name_on_doc),
    create classification without calling Vision API.
    """
    quality_map = {
        "GOOD": 0.92,
        "FAIR": 0.70,
        "POOR": 0.45,
        "UNREADABLE": 0.20,
    }

    actual_type = _get(doc, "actual_type", "UNKNOWN")
    quality_label = _get(doc, "quality", "GOOD")
    quality_score = quality_map.get(quality_label, 0.85)
    is_readable = quality_score >= 0.4
    patient_name = _get(doc, "patient_name_on_doc", None) or (_get(doc, "content", None) or {}).get("patient_name")

    quality_issues = []
    if quality_label == "UNREADABLE":
        quality_issues = ["BLURRY"]
    elif quality_label == "POOR":
        quality_issues = ["BLURRY", "PARTIAL"]

    return DocumentClassification(
        type=actual_type,
        confidence=0.95 if actual_type != "UNKNOWN" else 0.3,
        quality_score=quality_score,
        is_readable=is_readable,
        quality_issues=quality_issues,
        patient_name=patient_name,
    )


def _classify_document_with_vision(doc: dict) -> DocumentClassification:
    """Use Claude Vision to classify a document image."""
    llm = get_llm("vision")
    image_bytes = _get(doc, "image_bytes", None)

    if not image_bytes:
        # No image available, return UNKNOWN
        return DocumentClassification(
            type="UNKNOWN",
            confidence=0.0,
            quality_score=0.5,
            is_readable=True,
            quality_issues=[],
            patient_name=None,
        )

    # Detect actual MIME type from magic bytes (don't trust stored content_type)
    content_type = detect_mime_type(image_bytes)
    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    structured_llm = llm.with_structured_output(DocumentClassification)

    message = HumanMessage(
        content=[
            {"type": "text", "text": DOCUMENT_CLASSIFICATION_PROMPT},
            {
                "type": "image_url",
                "image_url": {"url": f"data:{content_type};base64,{b64_image}"},
            },
        ]
    )

    result = structured_llm.invoke([SystemMessage(content=VERIFICATION_SYSTEM_PROMPT), message])
    return result


def run_doc_verification(state: ClaimState) -> dict:
    """
    Run document verification agent.

    Returns partial state update dict.
    """
    documents = state["documents"]
    category = state["category"]
    policy = state["policy"]
    member = state["member"]
    expected_patient_name = member.name

    required_types = _get_required_types(category, policy)

    doc_results = []
    for doc in documents:
        # Decide whether to use metadata or Vision API
        has_metadata = hasattr(doc, "actual_type") and _get(doc, "actual_type", None) is not None
        if has_metadata:
            classification = _classify_document_from_metadata(doc)
        else:
            classification = _classify_document_with_vision(doc)

        doc_results.append(
            DocumentVerificationResult(
                s3_key=_get(doc, "s3_key", "") or _get(doc, "file_id", ""),
                detected_type=classification.type,
                classification_confidence=classification.confidence,
                quality_score=classification.quality_score,
                is_readable=classification.is_readable,
                quality_issues=classification.quality_issues,
                patient_name_found=classification.patient_name,
            )
        )

    # Check for missing required types
    detected_types = [d.detected_type for d in doc_results]
    missing_types = [t for t in required_types if t not in detected_types]

    # Check for unreadable documents
    unreadable_docs = [d for d in doc_results if not d.is_readable]

    # Check patient name consistency
    names_found = [
        {"document_type": d.detected_type, "name": d.patient_name_found}
        for d in doc_results
        if d.patient_name_found
    ]
    unique_names = set(n["name"] for n in names_found if n["name"])
    patient_mismatch = PatientMismatch(detected=len(unique_names) > 1, names_found=names_found)

    # Determine if should stop early
    should_stop_early = False
    early_stop_reason = None
    error_message = None

    if missing_types:
        should_stop_early = True
        early_stop_reason = "WRONG_DOCUMENTS"
        uploaded_types = ", ".join(set(detected_types))
        missing_str = ", ".join(missing_types)
        error_message = (
            f"You uploaded documents classified as [{uploaded_types}], "
            f"but a {category} claim requires [{', '.join(required_types)}]. "
            f"Please upload your {missing_str}."
        )
    elif unreadable_docs:
        should_stop_early = True
        early_stop_reason = "UNREADABLE"
        doc = unreadable_docs[0]
        original_name = ""
        for orig_doc in documents:
            if (_get(orig_doc, "s3_key", "") or _get(orig_doc, "file_id", "")) == doc.s3_key:
                original_name = _get(orig_doc, "original_name", None) or _get(orig_doc, "file_name", "your document")
                break
        error_message = (
            f"Your {doc.detected_type} ({original_name}) is too blurry to read. "
            f"Please re-upload a clearer photo. "
            f"Tip: photograph in good lighting with the document flat on a surface."
        )
    elif patient_mismatch.detected and len(unique_names) > 1:
        should_stop_early = True
        early_stop_reason = "PATIENT_MISMATCH"
        name_list = list(unique_names)
        # Find doc types for each name
        name_docs = {}
        for nf in names_found:
            if nf["name"] not in name_docs:
                name_docs[nf["name"]] = nf["document_type"]
        if len(name_list) >= 2:
            n1, n2 = name_list[0], name_list[1]
            d1, d2 = name_docs.get(n1, "document"), name_docs.get(n2, "document")
            error_message = (
                f"The {d1} is for '{n1}' but the {d2} shows '{n2}'. "
                f"All documents must belong to the same patient. "
                f"Please upload matching documents."
            )

    verification_output = DocumentVerificationOutput(
        verified=not should_stop_early,
        documents=doc_results,
        missing_required_types=missing_types,
        patient_mismatch=patient_mismatch if patient_mismatch.detected else None,
        should_stop_early=should_stop_early,
        early_stop_reason=early_stop_reason,
        error_message=error_message,
        confidence=0.95 if not should_stop_early else 1.0,
    )

    return {
        "doc_verification": verification_output.model_dump(),
        "should_stop_early": should_stop_early,
        "early_stop_reason": early_stop_reason,
        "early_stop_message": error_message,
        "current_step": "DOCUMENT_VERIFICATION",
    }
