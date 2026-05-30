"""
Agent 2: Document Extraction

Extracts structured data from verified documents using Claude Vision.
For test cases with 'content' field, uses the structured content directly.
"""

import base64
from typing import Optional

import logfire
from langchain_core.messages import HumanMessage, SystemMessage

from core.config import get_llm
from core.utils import detect_mime_type
from models.schemas import (
    ExtractionOutput,
    HospitalBillExtraction,
    LabReportExtraction,
    LineItem,
    MedicineItem,
    PharmacyBillExtraction,
    PrescriptionExtraction,
)
from prompts.extraction import (
    EXTRACTION_SYSTEM_PROMPT,
    HOSPITAL_BILL_EXTRACTION_PROMPT,
    LAB_REPORT_EXTRACTION_PROMPT,
    PHARMACY_BILL_EXTRACTION_PROMPT,
    PRESCRIPTION_EXTRACTION_PROMPT,
)
from core.state import ClaimState


def _extract_from_content(doc: dict) -> dict:
    """
    For test cases that provide structured content directly,
    convert to our extraction format without calling Vision.
    """
    content = doc.get("content", {})
    doc_type = doc.get("actual_type", doc.get("detected_type", "UNKNOWN"))

    if doc_type == "PRESCRIPTION":
        medicines = []
        for m in content.get("medicines", []):
            if isinstance(m, str):
                medicines.append(MedicineItem(name=m))
            elif isinstance(m, dict):
                medicines.append(MedicineItem(**m))

        diagnosis = content.get("diagnosis", [])
        if isinstance(diagnosis, str):
            diagnosis = [diagnosis]

        return {
            "type": "prescription",
            "data": PrescriptionExtraction(
                doctor_name=content.get("doctor_name"),
                doctor_registration=content.get("doctor_registration"),
                doctor_specialization=content.get("doctor_specialization"),
                patient_name=content.get("patient_name"),
                patient_age=content.get("patient_age"),
                patient_gender=content.get("patient_gender"),
                date=content.get("date"),
                diagnosis=diagnosis,
                medicines=medicines,
                tests_ordered=content.get("tests_ordered", []),
                hospital_name=content.get("hospital_name"),
                treatment=content.get("treatment"),
                field_confidences={"doctor_name": 0.95, "patient_name": 0.95, "diagnosis": 0.95},
            ),
        }

    elif doc_type == "HOSPITAL_BILL":
        line_items = [
            LineItem(description=li["description"], amount=li["amount"])
            for li in content.get("line_items", [])
        ]
        return {
            "type": "hospital_bill",
            "data": HospitalBillExtraction(
                hospital_name=content.get("hospital_name"),
                patient_name=content.get("patient_name"),
                date=content.get("date"),
                bill_number=content.get("bill_number"),
                line_items=line_items,
                total=content.get("total"),
                field_confidences={"hospital_name": 0.95, "total": 0.95, "line_items": 0.95},
            ),
        }

    elif doc_type == "LAB_REPORT":
        return {
            "type": "lab_report",
            "data": LabReportExtraction(
                lab_name=content.get("lab_name"),
                patient_name=content.get("patient_name"),
                tests=[],
                referring_doctor=content.get("referring_doctor"),
                date=content.get("date"),
            ),
        }

    elif doc_type == "PHARMACY_BILL":
        return {
            "type": "pharmacy_bill",
            "data": PharmacyBillExtraction(
                pharmacy_name=content.get("pharmacy_name"),
                patient_name=content.get("patient_name"),
                medicines=content.get("medicines", []),
                total=content.get("total"),
                prescribing_doctor=content.get("prescribing_doctor"),
            ),
        }

    return {"type": "unknown", "data": None}


def _extract_with_vision(doc: dict, doc_type: str) -> dict:
    """Use Claude Vision to extract data from a document image."""
    llm = get_llm("vision")
    image_bytes = doc.get("image_bytes")

    if not image_bytes:
        return {"type": doc_type.lower(), "data": None}

    content_type = detect_mime_type(image_bytes)
    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    # Select prompt based on type
    prompt_map = {
        "PRESCRIPTION": (PRESCRIPTION_EXTRACTION_PROMPT, PrescriptionExtraction),
        "HOSPITAL_BILL": (HOSPITAL_BILL_EXTRACTION_PROMPT, HospitalBillExtraction),
        "LAB_REPORT": (LAB_REPORT_EXTRACTION_PROMPT, LabReportExtraction),
        "PHARMACY_BILL": (PHARMACY_BILL_EXTRACTION_PROMPT, PharmacyBillExtraction),
    }

    if doc_type not in prompt_map:
        return {"type": doc_type.lower(), "data": None}

    prompt, schema_class = prompt_map[doc_type]
    structured_llm = llm.with_structured_output(schema_class)

    message = HumanMessage(
        content=[
            {"type": "text", "text": prompt},
            {
                "type": "image_url",
                "image_url": {"url": f"data:{content_type};base64,{b64_image}"},
            },
        ]
    )

    try:
        result = structured_llm.invoke([SystemMessage(content=EXTRACTION_SYSTEM_PROMPT), message])
        return {"type": doc_type.lower(), "data": result}
    except Exception as e:
        logfire.error("doc_extraction.vision_failed", doc_type=doc_type, error=str(e), _exc_info=True)
        return {"type": doc_type.lower(), "data": None}


def run_doc_extraction(state: ClaimState) -> dict:
    """
    Run document extraction agent.

    For documents with 'content' field (test cases), uses content directly.
    For documents with image_bytes, uses Claude Vision.
    """
    documents = state["documents"]
    doc_verification = state.get("doc_verification", {})
    verified_docs = doc_verification.get("documents", [])

    # Build a map of s3_key -> detected_type from verification
    type_map = {}
    for vd in verified_docs:
        key = vd.get("s3_key", "")
        type_map[key] = vd.get("detected_type", "UNKNOWN")

    extraction = ExtractionOutput()
    confidences = []

    for doc in documents:
        doc_key = doc.get("s3_key", doc.get("file_id", ""))
        doc_type = type_map.get(doc_key, doc.get("actual_type", "UNKNOWN"))

        # If document has content field (test case), use it directly
        if "content" in doc and doc["content"]:
            result = _extract_from_content(doc)
        else:
            result = _extract_with_vision(doc, doc_type)

        # Assign to the appropriate slot
        data = result.get("data")
        if data is None:
            continue

        result_type = result["type"]
        if result_type == "prescription":
            extraction.prescription = data
            confidences.append(0.95)
        elif result_type == "hospital_bill":
            extraction.hospital_bill = data
            confidences.append(0.95)
        elif result_type == "lab_report":
            extraction.lab_report = data
            confidences.append(0.90)
        elif result_type == "pharmacy_bill":
            extraction.pharmacy_bill = data
            confidences.append(0.90)

    # Calculate overall extraction confidence
    if confidences:
        extraction.extraction_confidence = sum(confidences) / len(confidences)
    else:
        extraction.extraction_confidence = 0.3

    return {
        "extracted_data": extraction.model_dump(),
        "current_step": "DOCUMENT_EXTRACTION",
    }
