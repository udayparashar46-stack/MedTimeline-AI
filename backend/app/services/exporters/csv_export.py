"""CSV Exporter service (Milestone 9).

Follows blueprint Section 2.3, Section 8, Section 11:
- Clean CSV matrix: Test Name, Category, Preferred Unit, followed by chronological report date columns.
- Missing results are empty strings (never invented numbers).
- Commas, quotes, newlines properly escaped via Python's standard csv writer.
- CSV Injection prevention: Neutralizes cells starting with '=', '+', '-', '@' with a single leading quote.
- Mandatory medical disclaimer footer row:
  'Generated from user-uploaded reports. Not medical advice. Verify against original reports.'
- UTF-8 encoding with UTF-8 BOM so Excel opens non-ASCII characters seamlessly without encoding errors.
"""

import io
import csv
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.services.timeline import build_patient_timeline


def sanitize_csv_cell(value: Optional[str]) -> str:
    """Neutralize potential CSV injection vulnerabilities while preserving blanks."""
    if value is None:
        return ""
    val_str = str(value).strip()
    if not val_str:
        return ""
    # Prevent CSV formula execution in Excel/Sheets (=, +, -, @, tab, cr)
    if val_str[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{val_str}"
    return val_str


def export_patient_timeline_csv(
    db: Session,
    patient_id: str,
    include_unreviewed: bool = False,
) -> Tuple[str, str]:
    """Generate CSV content and filename for a patient's timeline."""
    matrix = build_patient_timeline(db, patient_id=patient_id, include_unreviewed=include_unreviewed)

    output = io.StringIO()
    writer = csv.writer(output, dialect="excel")

    # Header metadata row
    writer.writerow([f"Patient: {matrix.patient_name}"])
    filter_label = "Confirmed & Unreviewed" if matrix.include_unreviewed else "Confirmed Only"
    writer.writerow([f"Filter: {filter_label}"])
    writer.writerow([])

    # Table Header
    header = ["Test Name", "Category", "Standard Unit"]
    for col in matrix.columns:
        date_label = col.report_date or "Unspecified Date"
        lab_suffix = f" ({col.lab_name})" if col.lab_name else ""
        header.append(f"{date_label}{lab_suffix}")
    writer.writerow(header)

    # Data Rows
    for row in matrix.rows:
        unit_display = row.preferred_unit or (row.observed_units[0] if row.observed_units else "")
        row_data = [
            sanitize_csv_cell(row.test_name),
            sanitize_csv_cell(row.category),
            sanitize_csv_cell(unit_display),
        ]

        for col in matrix.columns:
            cell = row.cells.get(col.report_id)
            if cell:
                # Value with flag if out of range, e.g. "14.2" or "220 (H)"
                val = cell.effective_value_text
                if cell.printed_flag:
                    val = f"{val} ({cell.printed_flag})"
                row_data.append(sanitize_csv_cell(val))
            else:
                row_data.append("")  # Truly blank

        writer.writerow(row_data)

    # Disclaimer Footer
    writer.writerow([])
    writer.writerow([
        "Generated from user-uploaded reports. Not medical advice. Verify against original reports."
    ])

    csv_text = output.getvalue()
    safe_name = "".join(c for c in matrix.patient_name if c.isalnum() or c in ("-", "_")).strip() or "patient"
    filename = f"{safe_name}_lab_timeline.csv"

    return csv_text, filename
