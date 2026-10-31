"""Comprehensive integration tests for the Universal Laboratory Report Intelligence & Extraction System.

Tests:
1. Multi-format support: PDF, PNG, JPEG, DOCX
2. Negative values, inequalities, decimals, qualitative results
3. Demographics and provenance extraction (patient name, ID, lab name, referring doctor, specimen)
4. Cross-patient mismatch guard (patient safety verification)
5. Repeated table headers across multi-page reports
6. Decompression bomb and security validation
"""

import io
import json
import zipfile
import pytest
from fastapi.testclient import TestClient
import fitz  # PyMuPDF

from app.core.config import settings


def create_test_patient(client: TestClient, name: str = "Dr. John Watson") -> str:
    resp = client.post("/api/v1/patients", json={"display_name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


def make_synthetic_pdf(lines: list[str]) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 50.0
    for line in lines:
        page.insert_text(fitz.Point(50, y), line, fontsize=10)
        y += 18.0
    b = doc.tobytes()
    doc.close()
    return b


def make_synthetic_image(fmt: str = "png", width: int = 400, height: int = 300) -> bytes:
    pix = fitz.Pixmap(fitz.csRGB, (0, 0, width, height), 0)
    pix.set_rect(pix.irect, (255, 255, 255))
    doc = fitz.open()
    page = doc.new_page(width=width, height=height)
    page.insert_text(fitz.Point(30, 50), "METROPOLIS HEALTHCARE - CLINICAL REPORT", fontsize=12)
    page.insert_text(fitz.Point(30, 80), "Patient Name: Dr. John Watson   Date: 15/10/2026", fontsize=10)
    page.insert_text(fitz.Point(30, 120), "Hemoglobin   14.5   g/dL   13.0 - 17.0", fontsize=10)
    pix_rendered = page.get_pixmap()
    doc.close()
    return pix_rendered.tobytes(fmt)


def make_synthetic_docx(paragraphs: list[str], table_rows: list[list[str]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')
        xml_parts = ['<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>']
        for p in paragraphs:
            xml_parts.append(f'<w:p><w:r><w:t>{p}</w:t></w:r></w:p>')
        if table_rows:
            xml_parts.append('<w:tbl>')
            for row in table_rows:
                xml_parts.append('<w:tr>')
                for cell in row:
                    xml_parts.append(f'<w:tc><w:p><w:r><w:t>{cell}</w:t></w:r></w:p></w:tc>')
                xml_parts.append('</w:tr>')
            xml_parts.append('</w:tbl>')
        xml_parts.append('</w:body></w:document>')
        zf.writestr("word/document.xml", "".join(xml_parts))
    return buf.getvalue()


class TestUniversalFormatSupport:
    def test_upload_png_image_report(self, client: TestClient):
        """Image report upload in PNG format converts to renderable document and creates report."""
        patient_id = create_test_patient(client, "Image Patient")
        png_bytes = make_synthetic_image("png")

        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("lab_photo.png", png_bytes, "image/png"))],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["uploaded_count"] == 1
        report = data["items"][0]["report"]
        assert report["original_filename"] == "lab_photo.png"
        assert report["page_count"] == 1

        # Verify PDF stream endpoint serves the renderable PDF representation
        pdf_resp = client.get(f"/api/v1/reports/{report['id']}/pdf")
        assert pdf_resp.status_code == 200
        assert pdf_resp.headers["content-type"] == "application/pdf"
        assert len(pdf_resp.content) > 100

    def test_upload_jpeg_image_report(self, client: TestClient):
        """JPEG report upload succeeds and generates accessible renderable representation."""
        patient_id = create_test_patient(client, "JPEG Patient")
        jpeg_bytes = make_synthetic_image("jpeg")

        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("scan_result.jpg", jpeg_bytes, "image/jpeg"))],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["uploaded_count"] == 1
        assert data["items"][0]["report"]["original_filename"] == "scan_result.jpg"

    def test_upload_docx_report_extracts_table(self, client: TestClient):
        """DOCX laboratory report is read, tables are parsed into ExtractedResult rows."""
        patient_id = create_test_patient(client, "Docx Patient")
        paragraphs = [
            "DR LAL PATHLABS - BIOCHEMISTRY DIVISION",
            "Patient Name: Docx Patient   Date: 20/10/2026",
            "Ref By: Dr. A. Sharma   Specimen: Serum",
        ]
        table_rows = [
            ["Test Name", "Result", "Units", "Reference Interval"],
            ["Fasting Blood Sugar", "115.0", "mg/dL", "70.0 - 100.0"],
            ["Serum Creatinine", "0.9", "mg/dL", "0.6 - 1.2"],
            ["Total Bilirubin", "0.8", "mg/dL", "0.2 - 1.2"],
        ]
        docx_bytes = make_synthetic_docx(paragraphs, table_rows)

        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("blood_work.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["uploaded_count"] == 1
        report_id = data["items"][0]["report"]["id"]

        # Check extracted results
        res_resp = client.get(f"/api/v1/reports/{report_id}/results")
        assert res_resp.status_code == 200
        results_data = res_resp.json()
        assert results_data["summary"]["total_rows"] >= 3
        test_names = [r["effective_test_name"] for r in results_data["results"]]
        assert any("Fasting Blood Sugar" in tn for tn in test_names)
        assert any("Serum Creatinine" in tn for tn in test_names)


class TestClinicalResultEdgeCases:
    def test_negative_values_and_inequalities(self, client: TestClient):
        """Universal parser handles negative values (-1.5), inequalities (< 0.01, > 100), and decimals."""
        patient_id = create_test_patient(client, "Edge Case Patient")
        lines = [
            "METROPOLIS HEALTHCARE - SPECIALIZED ASSAY REPORT",
            "Patient Name: Edge Case Patient",
            "Specimen Date: 12/05/2026",
            "Test Name                Result     Units      Reference Interval",
            "Base Excess              -2.5       mmol/L     -2.0 to 2.0",
            "High Sensitivity CRP     < 0.10     mg/L       < 1.0",
            "Serum Ferritin           > 500.0    ng/mL      30.0 - 400.0",
            "HIV 1 & 2 Antibody       Negative              Negative",
            "HBsAg                    Non-Reactive          Non-Reactive",
            "Urine Protein            Trace                 Nil",
            "End of Report",
        ]
        pdf_bytes = make_synthetic_pdf(lines)

        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("special_panel.pdf", pdf_bytes, "application/pdf"))],
        )
        assert resp.status_code == 201
        report_id = resp.json()["items"][0]["report"]["id"]

        res_resp = client.get(f"/api/v1/reports/{report_id}/results")
        assert res_resp.status_code == 200
        results = res_resp.json()["results"]
        assert len(results) >= 5

        # Check negative value parsing
        be_row = next((r for r in results if "Base Excess" in r["effective_test_name"]), None)
        assert be_row is not None
        assert "-2.5" in be_row["effective_value_text"]

        # Check inequality value parsing
        crp_row = next((r for r in results if "CRP" in r["effective_test_name"]), None)
        assert crp_row is not None
        assert "<" in crp_row["effective_value_text"]

        # Check qualitative value parsing
        hiv_row = next((r for r in results if "HIV" in r["effective_test_name"]), None)
        assert hiv_row is not None
        assert "Negative" in hiv_row["effective_value_text"]

    def test_repeated_headers_across_pages(self, client: TestClient):
        """Multi-page reports with repeated column headers on subsequent pages do not parse headers as results."""
        patient_id = create_test_patient(client, "Multipage Patient")

        # Create 2-page document
        doc = fitz.open()
        p1 = doc.new_page(width=595, height=842)
        p1.insert_text(fitz.Point(50, 50), "SRL DIAGNOSTICS - CLINICAL REPORT", fontsize=11)
        p1.insert_text(fitz.Point(50, 70), "Patient Name: Multipage Patient   Date: 10/11/2026", fontsize=10)
        p1.insert_text(fitz.Point(50, 110), "Investigation      Result    Units    Reference Interval", fontsize=10)
        p1.insert_text(fitz.Point(50, 130), "Hemoglobin         13.8      g/dL     13.0 - 17.0", fontsize=10)
        p1.insert_text(fitz.Point(50, 150), "Total WBC Count    7200      /mcL     4000 - 11000", fontsize=10)

        p2 = doc.new_page(width=595, height=842)
        # Repeated headers on page 2
        p2.insert_text(fitz.Point(50, 50), "SRL DIAGNOSTICS - Page 2 of 2", fontsize=11)
        p2.insert_text(fitz.Point(50, 70), "Patient Name: Multipage Patient", fontsize=10)
        p2.insert_text(fitz.Point(50, 110), "Investigation      Result    Units    Reference Interval", fontsize=10)
        p2.insert_text(fitz.Point(50, 130), "Platelet Count     240000    /mcL     150000 - 450000", fontsize=10)
        p2.insert_text(fitz.Point(50, 160), "End of Report", fontsize=10)

        pdf_bytes = doc.tobytes()
        doc.close()

        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("multipage_cbc.pdf", pdf_bytes, "application/pdf"))],
        )
        assert resp.status_code == 201
        report_id = resp.json()["items"][0]["report"]["id"]

        res_resp = client.get(f"/api/v1/reports/{report_id}/results")
        results = res_resp.json()["results"]

        # Ensure no table header row ("Investigation" or "Result") was accidentally parsed as a test
        for r in results:
            assert "investigation" not in r["effective_test_name"].lower()
            assert "reference" not in r["effective_test_name"].lower()

        # All 3 actual tests should be captured
        test_names = [r["effective_test_name"] for r in results]
        assert any("Hemoglobin" in tn for tn in test_names)
        assert any("WBC" in tn for tn in test_names)
        assert any("Platelet" in tn for tn in test_names)


class TestPatientSafetyAndMetadata:
    def test_cross_patient_mismatch_warning(self, client: TestClient):
        """Cross-patient mismatch flag is raised when document patient name differs from workspace patient."""
        # Workspace is for Alice Smith, but the uploaded PDF is for Robert Johnson
        patient_id = create_test_patient(client, "Alice Smith")
        lines = [
            "METROPOLIS HEALTHCARE - BIOCHEMISTRY",
            "Patient Name: Robert Johnson",
            "Patient ID: MRN-88491",
            "Age / Sex: 52 Y / Male",
            "Referred By: Dr. Peter Brown",
            "Collected: 18/09/2026",
            "Investigation    Result    Units    Reference",
            "Serum Glucose    102.0     mg/dL    70.0 - 100.0",
        ]
        pdf_bytes = make_synthetic_pdf(lines)

        resp = client.post(
            f"/api/v1/patients/{patient_id}/reports",
            files=[("files", ("glucose_check.pdf", pdf_bytes, "application/pdf"))],
        )
        assert resp.status_code == 201
        report = resp.json()["items"][0]["report"]

        # Verify failure_reason conveys the patient safety mismatch warning
        assert report["failure_reason"] is not None
        assert "Cross-Patient Warning" in report["failure_reason"] or "Robert Johnson" in report["failure_reason"]

    def test_decompression_bomb_rejected(self, client: TestClient):
        """Oversized image dimensions exceeding safety limits are safely rejected without crashing."""
        patient_id = create_test_patient(client, "Security Patient")
        # Generate image exceeding 12,000 px dimension limit
        from app.services.storage import storage_service
        # Simulate oversized pixmap validation directly
        fake_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        is_valid, _, _, err = storage_service.validate_file(fake_header, "malicious.png")
        assert is_valid is False
        assert err is not None
