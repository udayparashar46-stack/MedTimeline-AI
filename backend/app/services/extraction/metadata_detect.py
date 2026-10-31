"""Metadata and clinical context detection engine.

Extracts patient demographics, laboratory identification, referring clinicians,
and specimen details from document header/footer text.
Includes patient safety verification to flag potential cross-patient mismatches.
"""

import re
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from app.services.extraction.date_detect import detect_report_date


@dataclass
class ExtractedDocumentMetadata:
    """Demographics and provenance metadata extracted from a laboratory report."""
    patient_name: Optional[str] = None
    patient_id_or_mrn: Optional[str] = None
    age: Optional[str] = None
    sex: Optional[str] = None  # "male" | "female" | "other" | None (only when explicitly stated)
    lab_name: Optional[str] = None
    referring_doctor: Optional[str] = None
    report_date: Optional[str] = None
    collection_date: Optional[str] = None
    specimen_type: Optional[str] = None
    report_id: Optional[str] = None

    # Patient safety checks
    patient_mismatch_warning: Optional[str] = None
    is_patient_mismatch: bool = False

    raw_header_snippets: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "patient_name": self.patient_name,
            "patient_id_or_mrn": self.patient_id_or_mrn,
            "age": self.age,
            "sex": self.sex,
            "lab_name": self.lab_name,
            "referring_doctor": self.referring_doctor,
            "report_date": self.report_date,
            "collection_date": self.collection_date,
            "specimen_type": self.specimen_type,
            "report_id": self.report_id,
            "is_patient_mismatch": self.is_patient_mismatch,
            "patient_mismatch_warning": self.patient_mismatch_warning,
        }


# Known diagnostic laboratory networks
KNOWN_LABORATORIES = [
    "Dr Lal PathLabs",
    "SRL Diagnostics",
    "Metropolis Healthcare",
    "Quest Diagnostics",
    "LabCorp",
    "Thyrocare",
    "Max Lab",
    "Apollo Diagnostics",
    "Pathkind Labs",
    "Suburban Diagnostics",
    "Vijaya Diagnostic",
    "Medall Healthcare",
    "Unipath Specialty Laboratory",
    "Neuberg Diagnostics",
    "Core Diagnostics",
    "Tata 1mg Labs",
    "Redcliffe Labs",
]

# Specimen types
SPECIMEN_PATTERNS = [
    (r"\b(?:edta\s+whole\s+blood|whole\s+blood)\b", "Whole Blood"),
    (r"\b(?:serum)\b", "Serum"),
    (r"\b(?:plasma|citrated\s+plasma)\b", "Plasma"),
    (r"\b(?:random\s+urine|urine|clean\s+catch\s+urine|24\s*h(?:ou)?r\s+urine)\b", "Urine"),
    (r"\b(?:synovial\s+fluid)\b", "Synovial Fluid"),
    (r"\b(?:cerebrospinal\s+fluid|csf)\b", "CSF"),
    (r"\b(?:pleural\s+fluid)\b", "Pleural Fluid"),
    (r"\b(?:stool|feces)\b", "Stool"),
    (r"\b(?:sputum)\b", "Sputum"),
]


def _clean_token(t: str) -> str:
    return re.sub(r"^[^\w]+|[^\w]+$", "", t.strip())


def detect_document_metadata(
    full_text: str,
    target_patient_name: Optional[str] = None,
) -> ExtractedDocumentMetadata:
    """Extract metadata from full document text and verify patient identity."""
    meta = ExtractedDocumentMetadata()
    if not full_text:
        return meta

    lines = [ln.strip() for ln in full_text.splitlines() if ln.strip()]
    header_lines = lines[:40]  # Examine first 40 non-empty lines for demographic header
    joined_header = "\n".join(header_lines)

    # 1. Laboratory Name Detection
    for lab in KNOWN_LABORATORIES:
        if re.search(rf"\b{re.escape(lab)}\b", joined_header, re.IGNORECASE):
            meta.lab_name = lab
            break

    if not meta.lab_name:
        # Detect hospital or diagnostic center banner from top 5 lines
        for ln in header_lines[:5]:
            if any(k in ln.lower() for k in ["diagnostic", "laboratory", "laboratories", "hospital", "pathology", "clinic", "pathlabs"]):
                if len(ln) < 80 and not any(p in ln.lower() for p in ["patient", "mrn", "doctor", "dr.", "age"]):
                    meta.lab_name = ln
                    break

    # 2. Patient Name Detection
    # Match patterns like: "Patient Name : John Doe", "Name: Mr. Jane Smith", "Pt. Name : ..."
    p_name_match = re.search(
        r"(?:patient\s+name|pt\.?\s*name|name\s*of\s*patient|patient)\s*[:\-]\s*(?:mr\.|ms\.|mrs\.|dr\.|master\.|shri|smt\.)?\s*([A-Za-z\s]{3,40})(?:\s+(?:age|sex|gender|mrn|id|reg|dob|years|y|f|m)\b|$)",
        joined_header,
        re.IGNORECASE,
    )
    if p_name_match:
        cand_name = p_name_match.group(1).strip()
        # Clean trailing labels
        cand_name = re.sub(r"\s+(?:age|sex|gender|mrn|id|reg|dob|y|m|f)$", "", cand_name, flags=re.IGNORECASE).strip()
        if len(cand_name) >= 3 and not any(w in cand_name.lower() for w in ["hospital", "diagnostic", "sample", "report", "examination"]):
            meta.patient_name = cand_name

    # 3. Patient ID / MRN / UHID / Reg No
    mrn_match = re.search(
        r"(?:mrn|uhid|patient\s*id|pt\.?\s*id|reg(?:istration)?\.?\s*(?:no|number)?|barcode|pid)\s*[:\-#]\s*([A-Za-z0-9\-_/]{4,25})",
        joined_header,
        re.IGNORECASE,
    )
    if mrn_match:
        meta.patient_id_or_mrn = mrn_match.group(1).strip()

    # 4. Age & Sex (Only explicitly stated)
    age_match = re.search(
        r"(?:age\s*[/:]?\s*)(\d{1,3})\s*(?:years?|yrs?|y|m(?:onths?)?)",
        joined_header,
        re.IGNORECASE,
    )
    if age_match:
        meta.age = f"{age_match.group(1)} Y"

    sex_match = re.search(
        r"(?:sex|gender)\s*[:\-]\s*(male|female|other|m\b|f\b)",
        joined_header,
        re.IGNORECASE,
    )
    if sex_match:
        raw_sex = sex_match.group(1).lower().strip()
        if raw_sex in ("male", "m"):
            meta.sex = "male"
        elif raw_sex in ("female", "f"):
            meta.sex = "female"
        elif raw_sex == "other":
            meta.sex = "other"

    # Combined Age/Sex line e.g. "45 Y / Male" or "32 Years / Female"
    if not meta.sex or not meta.age:
        comb_match = re.search(
            r"(\d{1,3})\s*(?:years?|yrs?|y)\s*[/|\-]\s*(male|female|m\b|f\b)",
            joined_header,
            re.IGNORECASE,
        )
        if comb_match:
            if not meta.age:
                meta.age = f"{comb_match.group(1)} Y"
            if not meta.sex:
                s_token = comb_match.group(2).lower()
                meta.sex = "female" if s_token in ("female", "f") else "male"

    # 5. Referring Doctor
    doc_match = re.search(
        r"(?:referred\s+by|ref\.?\s*by|doctor|consultant|prescribing\s+physician)\s*[:\-]\s*(?:dr\.?)?\s*([A-Za-z\s.]{3,35})",
        joined_header,
        re.IGNORECASE,
    )
    if doc_match:
        raw_doc = doc_match.group(1).strip()
        if len(raw_doc) >= 3 and not any(w in raw_doc.lower() for w in ["self", "patient", "specimen", "hospital"]):
            meta.referring_doctor = f"Dr. {raw_doc.lstrip('Dr. ').strip()}"

    # 6. Specimen Type
    for pattern, s_name in SPECIMEN_PATTERNS:
        if re.search(pattern, joined_header, re.IGNORECASE):
            meta.specimen_type = s_name
            break

    # 7. Collection Date & Report Date
    date_det = detect_report_date(full_text)
    if date_det.detected_date:
        meta.report_date = date_det.detected_date

    coll_match = re.search(
        r"(?:collected|collection\s*date|sample\s*collected|specimen\s*date)\s*[:\-]\s*([0-9]{1,4}[/\-][0-9]{1,2}[/\-][0-9]{1,4}(?:\s+[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)?)",
        joined_header,
        re.IGNORECASE,
    )
    if coll_match:
        from app.services.extraction.date_detect import _parse_date_string
        parsed = _parse_date_string(coll_match.group(1).split()[0])
        if parsed:
            meta.collection_date = parsed[0][0].isoformat()

    # 8. Patient Safety Verification (Cross-Patient Mismatch Guard)
    if target_patient_name and meta.patient_name:
        t_tokens = set(re.findall(r"\w+", target_patient_name.lower()))
        e_tokens = set(re.findall(r"\w+", meta.patient_name.lower()))
        # Remove common honorifics
        honorifics = {"mr", "mrs", "ms", "dr", "master", "shri", "smt", "patient"}
        t_clean = t_tokens - honorifics
        e_clean = e_tokens - honorifics

        if t_clean and e_clean:
            overlap = t_clean.intersection(e_clean)
            if not overlap and len(t_clean) > 0 and len(e_clean) > 0:
                meta.is_patient_mismatch = True
                meta.patient_mismatch_warning = (
                    f"Cross-Patient Warning: Report text identifies patient as '{meta.patient_name}', "
                    f"which differs from this workspace ('{target_patient_name}'). "
                    "Please verify that this report belongs to this patient."
                )

    return meta
