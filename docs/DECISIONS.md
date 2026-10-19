# Architectural Decision Record (ADR)

This file tracks key technical decisions, rationale, and deviations from the original plan.

---

## 2026-10-18: M0 Foundations Setup

### Decision 1: Vite Proxy for Development
* **Choice**: Use Vite's `server.proxy` configuration in `vite.config.ts` to forward `/api` requests to `http://127.0.0.1:8000`.
* **Rationale**: Eliminates CORS complications during local development and allows frontend code to use relative paths like `/api/v1/health`.

### Decision 2: Localhost-Only Backend Binding
* **Choice**: Bind Uvicorn strictly to `127.0.0.1` rather than `0.0.0.0`.
* **Rationale**: As mandated by Section 10.1 of `docs/PLAN.md`, all local development must be private to the host machine to prevent network exposure of local medical data.

### Decision 3: Vitest + React Testing Library for Frontend Unit Tests
* **Choice**: Use Vitest with `@testing-library/react` and `jsdom`.
* **Rationale**: Integrates natively with Vite, shares the same transform pipeline, runs quickly, and provides an API compatible with Jest.

### Decision 4: Pytest + HTTPX for Backend API Tests
* **Choice**: Use `pytest` alongside FastAPI's standard test client pattern (`httpx`).
* **Rationale**: Simple, deterministic, standard for FastAPI microservices, and easily extended in future milestones.

---

## 2026-10-18: M1 Design System and App Shell

### Decision 5: CSS Variables with Native Design Tokens
* **Choice**: Map blueprint Section 5.1 design tokens to CSS variables (`--primary: #0F766E`, `--success: #15803D`, etc.) paired with `@tailwindcss/vite`.
* **Rationale**: Gives instant dark-mode readiness, strict adherence to WCAG AA colors, and zero runtime performance penalty.

### Decision 6: Built-in Accessible Core Components
* **Choice**: Build core UI primitives (Button, Badge, Card, Table, Modal, Drawer, etc.) directly in `components/ui/` with zero third-party UI library bloat.
* **Rationale**: Keeps the codebase transparent and easy to debug for beginners while maintaining visible focus rings, reduced motion support, and medical table states.

---

## 2026-10-18: M2 Patient Workspaces

### Decision 7: SQLAlchemy 2.0 ORM with SQLite
* **Choice**: Use SQLAlchemy 2.0 (`Mapped`, `mapped_column`, `select()`) targeting a local SQLite file in `data/medtimeline.db`.
* **Rationale**: Directly aligns with Section 6.1 and Section 11 of `docs/PLAN.md`. SQLite requires zero external server setup for local use while SQLAlchemy ORM enables an effortless future transition to PostgreSQL.

### Decision 8: Soft-Delete with Typed Name Confirmation
* **Choice**: Patient deletion sets `is_deleted = True` and filters subsequent reads, while the frontend requires typing the exact workspace name before the delete button activates.
* **Rationale**: Satisfies the safety requirement of Section 3.3 and Section 11 ("Deleting requires typed confirmation and removes the workspace's files"), protecting users from irreversible accidental deletions.

### Decision 9: Isolated In-Memory SQLite Testing with StaticPool
* **Choice**: Backend tests use `sqlite://` with `StaticPool` and FastAPI's `dependency_overrides[get_db]`.
* **Rationale**: Ensures fast, deterministic unit/integration tests that do not create or mutate disk databases or conflict across test runs.

---

## 2026-10-18: M3 PDF Upload & Secure Storage

### Decision 10: Anonymous UUID File Storage with Strict Path Resolution
* **Choice**: All uploaded report files are saved in `data/uploads/<uuid>.pdf` rather than their original filenames. File resolution verifies that canonical paths reside strictly inside the uploads root.
* **Rationale**: Directly aligns with Section 10.1 of `docs/PLAN.md` to prevent metadata leakage, path traversal attacks, and filename collisions across patients.

### Decision 11: PyMuPDF + Magic Bytes Defense-in-Depth Validation
* **Choice**: Combine `%PDF-` header signature verification, size checks (20 MB max), non-empty validation, and PyMuPDF document structure validation.
* **Rationale**: Blocks renamed `.txt` files, corrupt binaries, and password-encrypted PDFs immediately before any persistence or parsing occurs.

### Decision 12: Per-Patient Workspace SHA-256 Duplicate Guard
* **Choice**: Check SHA-256 content hash scoped to the specific patient workspace. If a duplicate is detected, warn and skip without creating duplicate rows or disk files.
* **Rationale**: Prevents accidental re-uploads from inflating the chronological timeline while allowing independent patient workspaces to store the same reference lab report if needed.

---

## 2026-10-19: M4 Text Extraction & Report Date Detection

### Decision 13: PyMuPDF Text Layer Extraction with Honest Non-OCR Boundary
* **Choice**: Extract text page-by-page using PyMuPDF (`fitz`). If extracted text is under 40 characters or has fewer than 3 words per page on average, immediately mark `processing_status = 'failed'` with an explicit error: `"This PDF appears to be a scanned image or photo without a digital text layer. OCR is not currently supported."`.
* **Rationale**: Directly aligns with Section 1.2 and Section 11 of `docs/PLAN.md`. We refuse to guess, hallucinate text, or pretend OCR is supported when it is not.

### Decision 14: Specimen Collection Date Priority Hierarchy
* **Choice**: Parse date tokens across supported formats (ISO `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD Month YYYY`, `Month DD, YYYY`, etc.) and classify candidate context into 4 priority tiers: Specimen Collection (Priority 1), Report/Result Date (Priority 2), Unlabeled/Neutral Date (Priority 3), Print/Generated Date (Priority 4).
* **Rationale**: The clinical state of a patient corresponds to when the biological sample was drawn, not when the report was printed or uploaded. Print and generation dates must never overwrite collection dates.

### Decision 15: Explicit Date Ambiguity Preservation & Confirmation
* **Choice**: When multiple conflicting collection dates exist or when a numeric date is ambiguous (e.g., `04/05/2026` could be April 5 or May 4), preserve both interpretations in `date_alternatives`, mark `is_date_ambiguous = True`, and require explicit user review/confirmation before treating the date as final.
* **Rationale**: Enforces Guiding Principle 1 ("Trust over cleverness: A blank cell or flagged date is always better than a wrong date") and Section 11 M4 acceptance criteria.

### Decision 16: Privacy-Preserving Raw Text Debugger
* **Choice**: Provide an in-memory / on-demand raw text extraction endpoint (`GET /api/v1/reports/{id}/extraction`) restricted strictly to the local workspace view, never persisting extracted patient text to public static directories or unencrypted logs.
* **Rationale**: Ensures debugging transparency for users to inspect how dates and text were parsed from their PDFs while preventing PHI leakage.

---

## 2026-10-19: M5 Row Parsing & Confidence Scoring

### Decision 17: Multi-Strategy Modular Layout Architecture
* **Choice**: Implement two independent, testable layout parsing strategies (`table_layout.py` using column coordinates and `line_layout.py` using sequential token classification) with competitive scoring where the strategy yielding higher high/medium confidence rows wins.
* **Rationale**: Follows Section 9.2 of `docs/PLAN.md`. Real-world lab reports vary from rigidly formatted tables to free-form whitespace-delimited listings; evaluating both strategies prevents parser brittleness.

### Decision 18: Exact Raw String Immutability with Read-Time Derived Fields
* **Choice**: Store the exact extracted strings in `raw_test_name`, `raw_value_text`, `raw_unit`, `raw_reference_text`, and `printed_flag`. Numeric parsing (stripping `<`/`>` comparators and trailing flags) and reference interval bounds are computed dynamically as derived properties.
* **Rationale**: Satisfies Guiding Principle 1 ("Trust over cleverness") and Section 7. Original evidence is never permanently altered, guaranteeing full traceability.

### Decision 19: Deterministic Three-Tier Confidence Scoring
* **Choice**: Assign parse confidence using explicit deterministic rules:
  - `high`: Test name + numeric/qualitative value + unit + reference range all parsed cleanly.
  - `medium`: Test name + valid value found, but unit or reference interval is missing or ambiguous.
  - `low`: Irregular tokens, unparseable lines, or lines with structural anomalies.
* **Rationale**: Prevents arbitrary heuristics or opaque thresholds, providing users with clear indicators of which rows require close scrutiny in Milestone 6.

### Decision 20: Zero Silent Discarding (Skipped Lines Accounting)
* **Choice**: Every visual line in a document is classified either as an extracted test row or explicitly recorded in a skipped lines list with a concrete reason (`page_metadata`, `table_header`, `section_heading`, `footer`, `unparseable_text`).
* **Rationale**: Enforces Section 11 M5 acceptance criteria: nothing disappears silently without being accounted for.

---

## 2026-10-19: M6 Review & Correction UI

### Decision 21: ResultEdit Audit Overlay Pattern
* **Choice**: `raw_*` columns in `ExtractedResult` are strictly immutable. User edits, confirmations, and rejections write audit records to the `result_edits` table (`result_id`, `field`, `old_value`, `new_value`, `edited_by`, `created_at`). Effective values are dynamically calculated by overlaying the latest edit on top of the raw evidence.
* **Rationale**: Satisfies Section 7 and Section 11 of `docs/PLAN.md`. Preserves complete clinical provenance; original evidence is never overwritten or lost, and users can inspect the original extracted value on hover at any time.

### Decision 22: Strict Date Confirmation Gating for Reviewed Status
* **Choice**: A report cannot transition to `reviewed` status unless its specimen collection date has been explicitly confirmed (`report_date_confirmed == True`). This is enforced both at the backend API layer (`PATCH /api/v1/reports/{id}` raises HTTP 400 if unconfirmed) and in the UI (disabling the action with guidance).
* **Rationale**: Section 11 M6 acceptance criteria specifies that a report cannot be marked "reviewed" until its date is confirmed. Specimen collection date is critical for accurate chronological timeline positioning in M8.

### Decision 23: Native Browser PDF Streaming for Split-View Review
* **Choice**: Serve the original PDF through a private, authenticated streaming endpoint (`GET /api/v1/reports/{id}/file`) using FastAPI's `FileResponse`, displayed inside an `<iframe>` with `#page=N` URL fragments.
* **Rationale**: Eliminates external PDF rendering libraries (like pdfjs-dist / react-pdf bundles), avoids unnecessary bundle size bloat, leverages the host browser's fast native PDF engine, and enables instant page jumps when clicking table rows.

### Decision 24: Reversible Review Actions via Undo Stack
* **Choice**: Implement an undo endpoint (`POST /api/v1/results/{id}/undo`) that removes the latest `ResultEdit` record for that result row and recalculates the prior effective value and review status.
* **Rationale**: Aligns with Section 11 M6 acceptance criteria ("Rejecting then undoing restores the row"). Users can safely correct mistakes without permanent data loss.



---

## 2026-10-19: M7 Normalization & Mapping

### Decision 25: Seed Catalog from `aliases.json` — Idempotent on Every Startup
* **Choice**: A `seed_canonical_tests(db)` function runs inside the `lifespan` context on every backend startup. It loads `aliases.json`, creates `Test` rows and `TestAlias` rows only if they don't already exist (checked by normalized name), and never duplicates entries.
* **Rationale**: Avoids migration scripts for the initial seed data while still being safe to run repeatedly. The seed is idempotent regardless of whether the database is fresh or populated. User-created tests and aliases are never overwritten.

### Decision 26: `difflib.SequenceMatcher` for Alias Suggestions — No LLM/Fuzzy Library
* **Choice**: Suggestions for unmatched test names are generated using Python's built-in `difflib.SequenceMatcher.ratio()`. The top 5 canonical tests by similarity score (scaled 0–100) are returned per unmatched name. The threshold is intentionally left low to surface any plausible matches, with users making the final decision.
* **Rationale**: Fully deterministic and reproducible across runs. No external dependency, no network calls, no AI inference. Aligns with the project's principle: "boring, testable tech." The similarity measure is good enough for the expected clinical vocabulary (abbreviated vs. spelled-out, British vs. American spelling).

### Decision 27: Workspace-Scoped Aliases (`patient_id` FK on `TestAlias`)
* **Choice**: When a user accepts a mapping (e.g. "Hb" → Hemoglobin) for a patient, the created `TestAlias` record carries `patient_id` for that workspace. Global seed aliases have `patient_id = NULL`.
* **Rationale**: Lab-specific abbreviations may differ between labs or patients. A workspace-scoped alias avoids accidentally applying a lab's abbreviation to all other workspaces where the same raw string might mean something different.

### Decision 28: No Automatic Unit Conversion on Mismatch
* **Choice**: When the same canonical test appears with different units across reports (e.g. `g/dL` vs `g/L`), a warning is surfaced via `GET /patients/{id}/mapping/unit-mismatches`. Values are displayed exactly as extracted. No automatic conversion or normalization is applied.
* **Rationale**: Automatic unit conversion is high-risk in clinical contexts (a factor-of-10 error in drug dosing). Per "Trust over cleverness" (Principle 1), all values are displayed as reported. The user is informed and can reconcile manually. Conversion may be added in a future milestone with explicit user confirmation.

---

## 2026-10-19: M8 & M9 Timeline Table & CSV Export

### Decision 29: Matrix Construction in Memory with Strict Sparse Representation
* **Choice**: The timeline matrix is generated on demand from `Report` and `ExtractedResult` queries, grouped into canonical tests and report columns. Missing cells are omitted from the `cells` map (represented as empty cells in CSV and `—` in UI) rather than populated with placeholder records or interpolated values.
* **Rationale**: Implements Guiding Principle 1 ("A blank cell is always better than a wrong number. Nothing is invented, guessed, or silently 'fixed'") and Section 11 M8 acceptance criteria ("Missing results are truly blank; a script comparing timeline cells to confirmed data finds zero invented values").

### Decision 30: Dedicated Separate Columns for Same-Date Reports (FR5)
* **Choice**: Reports are identified uniquely by `report_id` rather than aggregated by date. If two reports share the exact same date (e.g., sample from morning lab and evening hospital), they form two distinct columns sorted chronologically by date then created timestamp.
* **Rationale**: Enforces Functional Requirement 5 (FR5): "Two results for the same test on the same report date are shown in separate report columns, never merged silently."

### Decision 31: CSV Injection Neutralization via Formula Prefixing
* **Choice**: In `csv_export.py`, any cell value whose first character is in `('=', '+', '-', '@', '\t', '\r')` is sanitized by prepending a single quote `'`. Blanks remain empty strings `""`.
* **Rationale**: Prevents Dynamic Data Exchange (DDE) and formula injection attacks when medical staff open exported CSVs in Microsoft Excel or Google Sheets, satisfying Section 11 M9 acceptance criteria.

### Decision 32: UTF-8 BOM Header for Excel Compatibility
* **Choice**: Prepend the UTF-8 Byte Order Mark (`\xef\xbb\xbf`) to exported CSV responses.
* **Rationale**: Microsoft Excel historically opens standard UTF-8 CSVs in Windows-1252 or ANSI mode unless the BOM is present, which causes corruption of non-ASCII characters (such as degree symbols, Greek letters like µg/mL, or special accents). The BOM ensures seamless out-of-the-box rendering.

---

## 2026-10-19: M10 PDF Export

### Decision 33: PyMuPDF Native Landscape PDF Generation & Column Chunking
* **Choice**: Generate landscape A4 PDF export directly using PyMuPDF (`fitz`), with chunking for wide tables (>5 report date columns) and multi-page row pagination (>20 test rows). Header columns are repeated across pages, missing cells are strictly blank (zero interpolation per Principle 1), out-of-range values feature soft highlight tints, and every page includes page numbering ("Page X of Y") and the mandatory medical disclaimer footer.
* **Rationale**: PyMuPDF is already our trusted, high-performance C-based dependency from M3/M4/M5, avoiding introducing heavy headless browser dependencies (like Puppeteer, Playwright, or Weasyprint). Column chunking guarantees wide timelines across months or years never suffer from truncated columns or microscopic unreadable text.

---

## 2026-10-19: M11 Hardening & Release Candidate

### Decision 34: Comprehensive Synthetic Clinical Hardening Suite
* **Choice**: Build a dedicated 25-scenario synthetic clinical hardening test suite in `backend/tests/test_synthetic_scenarios.py` covering malformed PDFs, password protection, magic bytes, patient isolation, wrapped lab names, `<`/`>` comparators, attached flags, missing units, date priority tiers, date ambiguity gating, immutable edit audit overlays, undo stack restoration, analyte separation ("Bilirubin Total" vs "Bilirubin Direct"), unit mismatch warnings, zero-invention sparse matrix guarantees, CSV formula neutralization, PDF disclaimer compliance, and sub-2.0s timeline response performance.
* **Rationale**: Validates production readiness without ever using real patient data. Provides regression confidence across all Guiding Principles and clinical edge cases.

### Decision 35: Localhost Privacy & Settings Center
* **Choice**: Implement `SettingsPage` with explicit technical privacy attestations (`127.0.0.1` binding, zero analytics, zero external CDNs or Google Fonts, deterministic parsing with no LLMs, anonymous UUID storage) alongside clear clinical boundaries ("Not a medical device", "Not medical advice").
* **Rationale**: Directly enforces Section 3.1, Section 10.1, and Guiding Principle 5/6, giving users transparent visibility into the local operational model and limitations.

---

## 2026-10-19: M12 Data Portability, Audit Logging & System Reset

### Decision 36: Non-Clinical AuditEvent Logging Isolation
* **Choice**: Implement an `audit_events` table and service that logs only metadata lifecycle events (`patient_created`, `report_uploaded`, `report_deleted`, `timeline_exported_csv`, `timeline_exported_pdf`, `system_reset`). No clinical lab names, test results, reference ranges, or patient notes are ever written to the audit log.
* **Rationale**: Implements Section 7 and Section 10.1. Audit trails provide accountability and operational traceability without creating secondary stores of sensitive medical data.

### Decision 37: Typed Confirmation "Delete Everything" System Reset Cascade
* **Choice**: Implement `POST /api/v1/system/reset` requiring the exact JSON payload `{"confirm": "DELETE EVERYTHING"}`. It executes a foreign-key aware cascade deletion across all tables (`result_edits`, `extracted_results`, `reports`, `test_aliases`, `tests`, `patients`, `audit_events`), purges all uploaded PDF files from disk, re-seeds default canonical tests from `aliases.json`, and returns exact deletion metrics.
* **Rationale**: Fulfills Section 3.1 and Section 10.1 ("Delete Everything" action). Provides users with complete data sovereignty to purge all local data in a single irreversible, confirmed action.

### Decision 38: Workspace JSON Archive Portability
* **Choice**: Implement `GET /api/v1/patients/{id}/export/archive` and `POST /api/v1/patients/import/archive` supporting complete export and lossless re-import of patient workspaces, including report metadata, extracted results, canonical mappings, and result edit audit history.
* **Rationale**: Implements Section 6.4 data portability requirements, ensuring patients and users own their data and can backup or migrate workspaces without vendor lock-in.


