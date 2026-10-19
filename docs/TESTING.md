# Manual Testing Checklist by Milestone

Keep track of acceptance testing by hand for each milestone. Tick items off as they are verified.

---

## M0: Foundations

- [ ] **Backend Health Endpoint**:
  1. Start backend: `uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`
  2. Open browser or curl `http://127.0.0.1:8000/api/v1/health`
  3. Verify response is `{"status": "ok"}`
- [ ] **Frontend App Shell & Connectivity**:
  1. Start frontend: `npm run dev`
  2. Open `http://localhost:5173`
  3. Verify the page displays "MedTimeline AI" header and shows a green badge with "Backend connected".
  4. Stop the backend server and refresh the frontend page. Verify it shows the red/amber badge with "Disconnected".
- [ ] **Automated Tests**:
  1. Run `pytest` in `backend/` -> 1 passed.
  2. Run `npm test` in `frontend/` -> 1 passed.
  3. Run `npm run type-check` in `frontend/` -> 0 errors.

---

## M1: Design System & App Shell

- [ ] **AppShell & Navigation**:
  1. Open `http://localhost:5173`.
  2. Verify top bar displays the current page title, live connection badge, and "Check Connection" button.
  3. Verify left sidebar contains links for Dashboard, Workspaces, Timeline View, Test Mapping, UI Styleguide, and Settings.
  4. On mobile viewport (<768px), verify sidebar collapses and opens via hamburger menu.
- [ ] **UI Component Styleguide**:
  1. Click "UI Styleguide" in the sidebar.
  2. Verify "Core Components" tab renders Buttons, Badges, Inputs, Modals, Drawers, Dropzone, and Skeletons in all operational states.
  3. Verify "Color & Typography Tokens" tab displays WCAG AA compliant color swatches.
  4. Verify "Timeline Table States" tab renders sticky columns, filled cells, blank dashes, unreviewed dashed underlines, edited dots, and High/Low flag tints.
  5. Test keyboard navigation: press `Tab` and verify clear teal focus rings appear on all interactive controls.
- [ ] **Automated Tests & Quality Gates**:
  1. `npm test` in `frontend/` -> 5 passed.
  2. `npm run type-check` in `frontend/` -> 0 errors.
  3. `pytest` in `backend/` -> 1 passed.

## M2: Patient Workspaces

- [ ] **Patient Workspace CRUD**:
  1. Start both servers (`uvicorn` on 8000, `npm run dev` on 5173).
  2. Navigate to `http://localhost:5173/` and click "New Patient" or "Patients" in sidebar.
  3. Verify Patients list shows empty state initially (or lists existing patients).
  4. Click "New Patient". Enter a label (e.g. "Sarah Jenkins" or "PT-1042"), optional DOB, sex, and notes.
  5. Click "Create Workspace". Verify modal closes and you are navigated to the patient workspace overview.
  6. Verify the workspace page displays patient name, DOB, sex badge, notes, action cards, and empty lab reports list.
  7. Click "← Patients" breadcrumb to return to the list. Verify the new patient appears.
  8. Click "Edit" on a patient row. Change the name or notes and save. Verify the table updates.
  9. Click "Delete". Verify the destructive button remains disabled until you type the exact patient name. Type the name and click "Delete Permanently". Verify the patient disappears from the list.
- [ ] **Search & Sort**:
  1. Create 2 or 3 patient workspaces with different names.
  2. In the search box, type a letter or substring. Verify list filters instantaneously. Clear the search.
  3. Click column headers "Name" and "Created" to toggle ascending/descending order.
- [ ] **Persistence across Server Restarts**:
  1. Create a patient workspace.
  2. Restart Uvicorn (`Ctrl+C` and restart).
  3. Refresh `http://localhost:5173`. Verify the created patient still exists in `data/medtimeline.db`.
- [ ] **Dashboard Integration**:
  1. Navigate to "Medical Dashboard".
  2. Click "New Patient" in the dashboard header -> opens Patients page.
  3. In "Recent Patient Timelines" table, click "Workspace" -> navigates to Patients page.
- [ ] **Automated Tests**:
  1. `pytest` in `backend/` -> 16 passed (1 health + 15 patient CRUD/search/validation tests).
  2. `npm test` in `frontend/` -> 13 passed (6 app shell + 7 patient workflow tests).
  3. `npm run type-check` in `frontend/` -> 0 errors.
  4. `npm run build` in `frontend/` -> 0 errors, successful production bundle.

---

## M3: Upload and Storage

- [ ] **Multi-PDF Upload in Patient Workspace**:
  1. Start both servers (`uvicorn` on 8000, `npm run dev` on 5173).
  2. Open a patient workspace (e.g. `http://localhost:5173/` -> Patients -> click workspace).
  3. Click "Upload Reports" button.
  4. Select or drop 2 or 3 valid PDF files.
  5. Click "Upload Files". Verify progress indicators turn into green "✓ Uploaded" badges and upload summary displays total counts.
  6. Close modal. Verify reports table updates with filename, date, pages, file size, and "Ready for review" status.
- [ ] **Validation & Security**:
  1. Rename a `.txt` file to `.pdf` and attempt upload -> verify error message: "Missing %PDF header signature".
  2. Upload a 0-byte file -> verify error message: "The uploaded file is empty".
  3. Upload the same PDF twice to the same patient -> verify amber "Duplicate (Skipped)" badge and warning message without creating duplicate database row.
  4. Inspect `data/uploads/` on disk -> verify files have random UUID names (e.g. `12345678-abcd-...pdf`), never original patient filenames.
- [ ] **Report Deletion**:
  1. Click "Delete" on an uploaded report row.
  2. Confirm deletion in modal. Verify report disappears from list.
  3. Check `data/uploads/` -> verify file is removed from disk.
- [ ] **Global Upload Route (`/upload`)**:
  1. Click "Upload Reports" in the sidebar.
  2. Verify patient dropdown displays all existing workspaces.
  3. Drop files and upload -> verify success banner includes an "Open Workspace →" button.
- [ ] **Automated Tests**:
  1. `pytest` in `backend/` -> 26 passed (1 health + 15 patient CRUD + 10 upload/storage/validation tests).
  2. `npm run type-check` in `frontend/` -> 0 errors.

---

## M4: Text Extraction and Date Detection

- [ ] **Deterministic Date Detection from Text PDFs**:
  1. Upload a text-based lab report PDF with specimen collection date (e.g. `14/10/2026`).
  2. Open the patient workspace and inspect the "Report Date" column.
  3. Verify the date displays `2026-10-14` with a subtle "Detected" sub-label.
- [ ] **Scanned/Image-Only PDF Detection**:
  1. Upload a scanned image-only PDF (no selectable text).
  2. Verify the status changes to "No text layer" / failed badge.
  3. Verify error message clearly explains: "This PDF appears to be a scanned image or photo without a digital text layer. OCR is not currently supported."
- [ ] **Specimen Collection vs Print Date Preference**:
  1. Upload a PDF containing both "Specimen Collected: 10/10/2026" and "Report Printed: 14/10/2026".
  2. Verify the detected report date selects `2026-10-10`, prioritizing collection date over print date.
- [ ] **Ambiguous Date Flagging and User Resolution**:
  1. Upload a report with an ambiguous numeric date (e.g. `04/05/2026`) or conflicting collection dates.
  2. Verify an amber "⚠️ Ambiguous" badge appears next to the date in the table.
  3. Verify an amber "Resolve Date" button appears in the action column.
  4. Click "Resolve Date" (or click the ambiguous badge).
  5. In the modal, verify all detected date candidates are listed with their context labels and line snippets.
  6. Select one of the suggested candidate dates or type a custom date, then click "Confirm Date".
  7. Verify modal closes, the badge changes to "Confirmed", and the ambiguity flag is cleared.
- [ ] **Raw Text & Candidate Inspection Modal**:
  1. Click "Raw Text" on any processed report row.
  2. Verify modal displays extracted text length, page count, raw text with copy button, and a candidate dates table showing priority score and context lines.
- [ ] **Automated Tests**:
  1. `pytest` in `backend/` -> 40 passed (1 health + 15 patient CRUD + 10 upload/storage + 14 extraction & date detection tests).
  2. `npm test` in `frontend/` -> 20 passed (6 app shell + 7 patient + 4 upload + 3 extraction tests).
  3. `npm run type-check` in `frontend/` -> 0 errors.
  4. `npm run build` in `frontend/` -> 0 errors.

---

## M5: Row Parsing and Confidence Scoring

- [ ] **Structured Row Parsing Across Layouts**:
  1. Upload a multi-row text PDF lab report (e.g. CBC or metabolic panel).
  2. In the patient workspace reports table, click the "🔬 Test Rows" button.
  3. Verify the "Extracted Test Results" modal opens.
  4. Check the top summary banner: verify it shows "X rows found, Y need review" with counts for High, Medium, and Low confidence.
  5. Inspect the table rows:
     - Verify test names match the document without truncation.
     - Verify values with `<` or `>` comparators retain their symbols (e.g. `< 0.5`).
     - Verify abnormal flags (`H`, `L`, `*`) are highlighted with colored flag pills.
     - Verify units and reference ranges match the source report.
     - Verify confidence badges reflect data completeness (High if range+unit present, Medium if missing unit/range).
- [ ] **Wrapped Test Name Handling**:
  1. Upload a report with multi-line wrapped test names (e.g. "Mean Corpuscular" on line 1, "Volume (MCV)" on line 2).
  2. Open "🔬 Test Rows" modal.
  3. Verify the test name is joined cleanly as "Mean Corpuscular Volume (MCV)" rather than splitting into two broken rows.
- [ ] **Scanned/No-Text Report Empty State**:
  1. Open a scanned or image-only PDF report in the patient workspace.
  2. Click "🔬 Test Rows".
  3. Verify the modal cleanly states "No structured test results found" with an explanation that the PDF is a scanned image without a digital text layer.
- [ ] **Automated Tests**:
  1. `pytest` in `backend/` -> 55 passed (1 health + 15 patient CRUD + 10 upload/storage + 14 date/extraction + 15 row parsing tests).
  2. `npm test` in `frontend/` -> 22 passed (6 app shell + 7 patient + 4 upload + 3 extraction + 2 row parsing tests).
  3. `npm run type-check` in `frontend/` -> 0 errors.
  4. `npm run build` in `frontend/` -> 0 errors.

---

## M6: Review and Correction UI

- [ ] **Split-View Report Review**:
  1. In the patient workspace, click "Review" on any uploaded report.
  2. Verify the modal opens in split-screen format:
     - Left pane: Original PDF rendered in an interactive viewer streaming from `/api/v1/reports/{id}/file`.
     - Right pane: Extracted clinical test rows table, summary counts, and review actions.
- [ ] **Row Selection & PDF Page Jump**:
  1. Click on a test row extracted from page 2 of a multi-page PDF.
  2. Verify the row is highlighted and the PDF viewer jumps directly to `#page=2`.
- [ ] **Row Inline Editing & Raw Preservation**:
  1. Click the edit icon (`✏️`) on a test row.
  2. Modify the test name, observed value, unit, or reference interval.
  3. Click "Save".
  4. Verify the row updates to the new effective value with an `✏️ Edited` badge.
  5. Hover over the edited value: verify a tooltip displays the original raw extracted string without loss of historical evidence.
- [ ] **Confirm & Reject Test Rows**:
  1. Click the checkmark (`✓`) button on an unreviewed row.
  2. Verify the row status transitions to `✓ Confirmed` and the unreviewed counter decreases.
  3. Click the cross (`✕`) button on a row.
  4. Verify the row status transitions to `✕ Rejected`.
- [ ] **Undo Action**:
  1. On an edited or rejected row, click `↺ Undo`.
  2. Verify the previous value and review status are restored and the audit history rolls back.
- [ ] **Bulk Confirmation**:
  1. Click the "✓ Bulk Confirm High Confidence" button.
  2. Verify all high-confidence unreviewed rows are confirmed at once and a confirmation banner displays the count.
- [ ] **Manual Test Row Addition**:
  1. Click "✚ Add Row" in the review toolbar.
  2. Fill in Test Name (e.g. "Ferritin"), Value (e.g. "120"), Unit (e.g. "ng/mL"), and Reference Range.
  3. Click "Save Row".
  4. Verify the new test row appears in the table with a `✚ Manual` badge.
- [ ] **Report Date Confirmation Gating**:
  1. For a report where `report_date_confirmed` is false, attempt to mark the report as reviewed.
  2. Verify the "Mark as Reviewed" button is disabled (or blocked with a clear message: "Cannot mark report as reviewed: report collection date must be confirmed first.").
  3. Click "Confirm Date" in the header to confirm the collection date.
  4. Verify "Mark as Reviewed" becomes enabled.
  5. Click "Mark as Reviewed" and verify the report status transitions to `Reviewed`.
- [ ] **Data Persistence**:
  1. Refresh the browser page (`F5`).
  2. Reopen the review modal for the report.
  3. Verify all confirmed statuses, edits, manual rows, and confirmed dates remain intact in the SQLite database.
- [ ] **Automated Tests**:
  1. `pytest` in `backend/` -> 68 passed (1 health + 15 patient + 10 upload/storage + 14 extraction + 15 row parsing + 13 review/correction tests).
  2. `npm test` in `frontend/` -> 30 passed (6 app shell + 7 patient + 4 upload + 3 extraction + 2 row parsing + 8 review tests).
  3. `npm run type-check` in `frontend/` -> 0 errors.
  4. `npm run build` in `frontend/` -> 0 errors.


---

## M7: Normalization & Mapping

### Backend Manual Checks

- [ ] **Seed Canonical Tests**:
  1. Start the backend fresh (`uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`).
  2. Check `GET /api/v1/tests` — verify 60+ canonical tests are returned, covering CBC, Lipid, LFT, KFT, Glucose, Electrolytes, Thyroid, Vitamins, and Urine categories.
  3. Confirm `Bilirubin Total` and `Bilirubin Direct` appear as **separate** entries.

- [ ] **Variant Alias Mapping**:
  1. Upload a PDF containing "Hb" as a test name for an existing patient.
  2. Run extraction: `POST /api/v1/reports/{id}/extract`.
  3. Check `GET /api/v1/patients/{id}/mapping/unmatched` — "Hb" appears with a suggestion pointing to "Hemoglobin" with a high similarity score.
  4. Accept the suggestion: `POST /api/v1/patients/{id}/mapping` with `{"raw_test_name": "Hb", "test_id": "<hemoglobin-id>"}`.
  5. Verify the response includes `updated_results_count >= 1` and the extracted result now has `canonical_name: "Hemoglobin"`.
  6. Re-check `GET /api/v1/patients/{id}/mapping/unmatched` — "Hb" no longer appears.

- [ ] **Bilirubin Non-Merge Verification**:
  1. Upload a report with both "Bilirubin Total" and "Bilirubin Direct".
  2. After extraction, confirm both map to separate canonical tests. Never merged.

- [ ] **Unit Mismatch Warnings**:
  1. Upload two reports where "Hemoglobin" appears with `g/dL` in one and `g/L` in another.
  2. After accepting the alias mapping for both, check `GET /api/v1/patients/{id}/mapping/unit-mismatches`.
  3. Verify a mismatch item appears with `observed_units: ["g/dL", "g/L"]` and a descriptive message.
  4. Confirm values are **not silently converted** — both raw values remain as reported.

### Frontend Manual Checks

- [ ] **Mapping Page Navigation**:
  1. Open `http://localhost:5173/mapping`.
  2. Verify the workspace dropdown lists all patients.
  3. Select a patient that has uploaded, extracted reports.
  4. Verify the "Unmatched Tests" tab shows unresolved test names with occurrence counts and suggestion chips.

- [ ] **Accept Match Flow**:
  1. On a suggestion chip (e.g. "82% match — Hemoglobin"), click "Accept Match".
  2. Verify a success banner briefly appears: `Mapped "Hb" to canonical test. Updated N result row(s).`
  3. Verify the accepted test name disappears from the unmatched list.

- [ ] **Unit Mismatch Banner**:
  1. With deliberate unit-mismatch data, verify the amber warning banner appears above the tab strip.
  2. Confirm the banner shows the canonical name, observed units, and preferred unit.

- [ ] **Canonical Catalog Tab**:
  1. Click "Canonical Test Catalog" tab.
  2. Verify all seeded tests appear in a searchable table with name, category, preferred unit, and alias count.
  3. Type "Bilirubin" in the search box — verify both "Bilirubin Total" and "Bilirubin Direct" appear separately.

- [ ] **Create Custom Canonical Test**:
  1. Click "✚ Create Canonical Test".
  2. Fill in a unique name, category, and unit.
  3. Click "Create Test". Verify it appears in the catalog table immediately.

- [ ] **Canonical Name Badge in Review Modal**:
  1. Open the review modal for a report with at least one mapped result row.
  2. Verify mapped rows display a `🏷️ <CanonicalName>` badge beside the raw test name.

- [ ] **Automated Tests**:
  1. `pytest` in `backend/` → **76 passed** (1 health + 15 patient + 10 upload/storage + 14 extraction + 15 row parsing + 13 review/correction + 8 normalization).
  2. `npm test` in `frontend/` → **38 passed** (6 app shell + 7 patient + 4 upload + 3 extraction + 2 row parsing + 8 review + 8 mapping).
  3. `npm run type-check` in `frontend/` → **0 errors**.
  4. `npm run build` in `frontend/` → **0 errors**, ~285 KB JS bundle.

---

## M8 & M9: Timeline Table & CSV Export

### Backend Manual Checks

- [ ] **Chronological Timeline API**:
  1. Make a GET request: `GET /api/v1/patients/{id}/timeline`.
  2. Verify response includes `columns` sorted in ascending order by report date.
  3. Verify multiple reports on the same date appear as separate column objects.
  4. Verify tests are grouped by clinical category, with truly blank cells where tests are not performed.
  5. Verify `include_unreviewed=false` (default) excludes unreviewed test results.
  6. Query with `include_unreviewed=true` and confirm unreviewed results are included with `review_status="unreviewed"`.
  7. Verify rejected results are never included in the timeline response.
  8. Confirm "Bilirubin Total" and "Bilirubin Direct" are separate rows.

- [ ] **CSV Export Endpoint**:
  1. Make a GET request: `GET /api/v1/patients/{id}/export/csv`.
  2. Verify response has `Content-Type: text/csv; charset=utf-8` and `attachment` filename.
  3. Verify file begins with UTF-8 BOM (`\xef\xbb\xbf`) and opens properly in Excel.
  4. Verify header metadata rows (Patient name, Filter mode).
  5. Confirm column headers show chronological dates and lab names.
  6. Verify missing test values are empty cells (never `0` or interpolated values).
  7. Verify formula injection prevention: cells starting with `=`, `+`, `-`, `@` are prepended with `'`.
  8. Verify mandatory medical disclaimer footer is present on the last row.

### Frontend Manual Checks

- [ ] **Timeline Navigation & Table View**:
  1. Open `http://localhost:5173/` and navigate to a patient workspace.
  2. Click "View Timeline" card or sidebar link.
  3. Verify patient workspace selector allows switching workspaces.
  4. Verify the sticky first column stays pinned during horizontal scroll.
  5. Verify sticky date headers remain pinned during vertical scroll.
  6. Verify category accordion rows (Complete Blood Count, Lipid Profile, etc.) collapse and expand on click.
  7. Verify abnormal flags (`H`/`L`) have distinct soft tint highlights.

- [ ] **Unreviewed Toggle**:
  1. Check the "Include Unreviewed Results" checkbox.
  2. Verify draft unreviewed results appear with dashed underline styling.
  3. Uncheck and verify only confirmed results remain displayed.

- [ ] **Source Evidence Drawer**:
  1. Click on any non-empty cell in the timeline table.
  2. Verify the slide-over Drawer opens from the right side.
  3. Verify the drawer displays the exact raw extracted snippet, PDF page number, effective value, and review status.
  4. Click "Open Full Split-View Review" in the drawer to navigate directly to the report review interface.

- [ ] **CSV Download Flow**:
  1. Click the "Export CSV" button in the timeline header.
  2. Verify browser downloads the `.csv` file.
  3. Verify success banner displays: `Exported <filename> successfully!`.
  4. Open the CSV in Excel or a text editor and verify columns, clean formatting, and disclaimer footer.

---

## M10: PDF Export

- [ ] **Landscape PDF Export Generation**:
  1. Open `http://localhost:5173/` and navigate to a patient workspace with reports.
  2. Click "View Timeline" in the sidebar or workspace card.
  3. Click "Export PDF" in the header toolbar.
  4. Verify the loading spinner activates during generation.
  5. Verify the browser triggers a download for `<patient_name>_timeline_<date>.pdf`.
  6. Open the downloaded PDF in Adobe Acrobat, Edge, or Chrome.
  7. Confirm document orientation is Landscape A4 (`842 x 595` pt).
  8. Confirm the header displays: Patient Name, DOB, Sex, Generation Timestamp, and Active Filter Mode ("Confirmed results only" or "Including unreviewed results").
  9. Confirm table columns show chronological dates and laboratory/report names.
  10. Confirm table headers repeat across pages for multi-page timelines.
  11. Confirm missing cells are completely blank (`""`), with zero invented or interpolated numbers.
  12. Confirm out-of-range flags have soft background highlighting (`#FDE8E6` for High, `#E6F0FD` for Low).
  13. Confirm each page includes footer page numbering: "Page X of Y".
  14. Confirm the mandatory disclaimer appears verbatim on every page:
      `"Generated from user-uploaded reports. Not medical advice. Verify against original reports."`

- [ ] **Wide Timeline Column Chunking**:
  1. Test with a patient with >5 report dates.
  2. Verify PDF exporter chunks columns across page sets without text truncation or clipping.

---

## M11: Hardening & Release Candidate

- [ ] **Settings, About & Privacy Verification**:
  1. Click "Settings" in the left sidebar navigation (`/settings`).
  2. Verify Application Version shows `v1.0.0-rc1`.
  3. Verify Privacy & Security Checklist displays all 6 green badges:
     - `127.0.0.1` Localhost-Only Binding
     - Zero External Network Trackers / Analytics
     - Deterministic Text Parsing (Zero LLMs on Patient Data)
     - Zero External CDN / Font Requests
     - Anonymous UUID Disk File Storage
     - Non-Clinical Audit Log Isolation
  4. Verify Operational Limitations accordion covers: Scanned Image/OCR Boundary, Complex Split Tables, Date Disambiguation Gating, and Manual Reconciliation of Unit Mismatches.
  5. Verify Medical Disclaimer banner is clearly visible with prominent styling.

- [ ] **25-Scenario Synthetic Clinical Hardening Suite**:
  1. Run `pytest backend/tests/test_synthetic_scenarios.py -v`.
  2. Verify all 25 clinical edge cases pass:
     - PDF magic bytes & corrupt file rejection
     - Scanned image non-OCR honest boundary
     - Password-protected PDF rejection
     - Duplicate SHA-256 detection
     - Cross-patient workspace isolation
     - Multi-line wrapped test name parsing
     - `<` and `>` numeric comparators
     - Qualitative values (Negative, Trace, Positive)
     - Attached abnormal flag stripping
     - Missing unit and reference interval fallbacks
     - 4-tier specimen collection date priority
     - Date ambiguity gating (`04/05/2026`)
     - Date confirmation requirement for `reviewed` status
     - `ResultEdit` immutable audit overlay
     - Reversible review actions via undo stack
     - Strict analyte non-merge ("Bilirubin Total" vs "Bilirubin Direct")
     - Unit mismatch detection across reports
     - Timeline zero-invention sparse matrix guarantee
     - Same-date multi-report separate columns (FR5)
     - Review-status timeline filtering
     - CSV formula injection sanitization
     - CSV UTF-8 BOM encoding
     - Landscape PDF disclaimer compliance
     - Sub-2.0s timeline response performance

---

## M12: Data Portability, Audit Logging & System Reset

- [ ] **Audit Event Logging**:
  1. Perform workspace actions (create patient, upload PDF, delete report, export CSV, export PDF).
  2. Query `GET /api/v1/audit-events` via API docs or curl.
  3. Verify non-clinical audit records are recorded with `event_type`, `patient_id`, and `details`.
  4. Verify zero laboratory values, test names, or patient clinical notes exist in `audit_events`.

- [ ] **Workspace JSON Archive Export & Import**:
  1. Export a patient workspace archive via `GET /api/v1/patients/{id}/export/archive`.
  2. Verify the JSON bundle includes patient metadata, reports, extracted results, canonical mappings, and edit history.
  3. Test archive restore via `POST /api/v1/patients/import/archive` into a new workspace.

- [ ] **"Delete Everything" System Reset**:
  1. Navigate to `/settings`.
  2. Scroll down to the Danger Zone.
  3. Click "Delete Everything...".
  4. Verify confirmation modal requires typing exact phrase: `DELETE EVERYTHING`.
  5. Click "Confirm & Delete Everything".
  6. Verify all patient workspaces, reports, extracted results, and audit events are purged from database.
  7. Verify all uploaded PDF files are deleted from `data/uploads/`.
  8. Verify canonical lab test definitions from `aliases.json` are automatically re-seeded.
  9. Verify app navigates to empty dashboard.

---

## Complete Quality Gates (M0–M12)

- [ ] **Backend Test Suite**:
  `pytest -v` in `backend/` → **126 passed**, 0 failed (11 modules).
- [ ] **Frontend Test Suite**:
  `npm test -- --run` in `frontend/` → **52 passed**, 0 failed (9 test suites).
- [ ] **TypeScript Type Check**:
  `npm run type-check` in `frontend/` → **0 errors**.
- [ ] **Production Frontend Build**:
  `npm run build` in `frontend/` → **0 errors**, clean Vite production bundle.


