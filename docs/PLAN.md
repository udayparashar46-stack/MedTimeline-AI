# MedTimeline AI: MVP Implementation Plan

Prepared for a beginner building with an AI coding agent. No application code is included; this is the blueprint.

---

## 1. Guiding Principles

1. **Trust over cleverness.** A blank cell is always better than a wrong number. Nothing is invented, guessed or silently "fixed".
2. **Human in the loop.** Extracted data is a draft until the user reviews it. Only reviewed data feeds the timeline and exports.
3. **Show the evidence.** Every extracted value links back to its source page and text snippet so the user can verify it fast.
4. **Boring, testable tech.** Deterministic parsing first. No AI/LLM calls on patient data in the MVP.
5. **Small steps.** Each milestone ends with something you can run and test yourself.
6. **Not a medical device.** The app organizes and displays data. It does not diagnose, interpret or advise.

---

## 2. Product Requirements and MVP Scope

### 2.1 Problem
People with many lab reports (different dates, labs, formats) cannot easily see how a result such as hemoglobin or creatinine changed over time. They flip between PDFs manually.

### 2.2 Target users
* Family members managing a relative's records.
* Patients tracking their own chronic conditions.
* Small clinics or care coordinators (later; not the MVP focus).

### 2.3 MVP: In scope

| # | Capability | Notes |
|---|---|---|
| 1 | Patient workspaces | Create, rename, delete (with confirmation). |
| 2 | Multi-PDF upload | Drag-and-drop, per-file progress and status. Text-based PDFs only. |
| 3 | Extraction | Report date, test name, value, unit, reference range, printed flag (H/L) when present. |
| 4 | Normalization | Map name variants (e.g., "Hb", "Haemoglobin", "Hemoglobin") to one canonical test using a seed alias list plus user confirmation. |
| 5 | Review and correction | Side-by-side PDF page and editable extracted rows. Confirm, edit, reject, add missing row. |
| 6 | Timeline table | Tests as rows, report dates as columns, blanks for missing. |
| 7 | Data-quality warnings | Unreadable PDF, missing date, unit mismatch between reports, duplicate results. |
| 8 | Export CSV | Timeline of confirmed data. |
| 9 | Export PDF | Print-friendly timeline (second half of MVP; see milestones). |

### 2.4 MVP: Explicitly out of scope
* OCR for scanned or photographed reports (detect and warn instead; planned for v1.1).
* Charts and trend graphs (a natural v1.1 feature; the table comes first).
* AI/LLM interpretation, summaries, diagnoses or "what this means".
* User accounts, sharing, multi-user, mobile app, EHR integrations.
* Unit conversion between different units (flag only, never auto-convert in MVP).

### 2.5 Functional requirements (summary)
* **FR1**: A workspace holds one patient and many reports.
* **FR2**: Each report keeps its original PDF, extracted rows, and review status.
* **FR3**: A result is stored as the original text plus a parsed form. The original text is never overwritten; user edits are stored separately.
* **FR4**: The timeline includes only results the user has confirmed (toggle to include unreviewed, clearly marked as such).
* **FR5**: Two results for the same test on the same report date are shown in separate report columns, never merged silently.
* **FR6**: Every export carries a footer: *"Generated from user-uploaded reports. Not medical advice. Verify against original reports."*

### 2.6 Non-functional requirements
* Upload of a typical 3-page text PDF processes in under about 10 seconds locally.
* Max file size 20 MB, max 25 files per batch (configurable).
* Works on current Chrome, Edge, Firefox, Safari desktop; usable on tablet; mobile is read-only quality.
* Keyboard accessible, WCAG AA contrast.

### 2.7 Honest statement on accuracy
Lab report layouts vary widely. The parser will handle common table layouts well and others partially or not at all. The review step is not optional polish; it is the safety mechanism. The app reports per-report extraction coverage (e.g., "34 rows found, 6 need review") and never claims completeness.

---

## 3. Pages and User Flows

### 3.1 Pages

| Page | Route | Purpose |
|---|---|---|
| Workspaces | `/` | List and create patient workspaces. |
| Workspace overview | `/patients/:id` | Reports list with status, upload area, link to timeline. |
| Report review | `/patients/:id/reports/:reportId/review` | Split view: PDF page left, extracted rows right. |
| Timeline | `/patients/:id/timeline` | The date-wise table, filters, export. |
| Test mapping | `/patients/:id/mapping` | Resolve unmatched or ambiguous test names. |
| Settings and About | `/settings` | Privacy statement, data deletion, disclaimer, version. |

### 3.2 Primary flow
1. **Create workspace**: user enters patient label (a nickname is encouraged; real name optional) and optional date of birth/sex (optional, not required for any feature).
2. **Upload PDFs**: drop several files. Each shows Queued → Processing → Ready for review / Failed (reason).
3. **Review each report**: confirm the report date (editable date field with the detected source text), then walk through extracted rows. Keyboard shortcuts: Enter = confirm row, E = edit, Delete = reject.
4. **Resolve names**: unmatched test names appear in the Mapping page with suggested canonical matches; user accepts, picks another, or creates a new canonical test.
5. **View timeline**: table appears; blank cells where no result exists; hover/click a cell to see the source report and page.
6. **Export**: CSV now; PDF after.

### 3.3 Edge-case flows
* **Scanned PDF**: report marked "No readable text found. OCR is not supported yet." User can still add rows manually while viewing the PDF.
* **No date found**: report is blocked from the timeline until the user sets a date.
* **Duplicate upload** (same file hash in same workspace): warn and skip by default.
* **Unit mismatch** for one canonical test across reports: warning badge on the row; values still displayed as reported.
* **Delete workspace**: typed confirmation, permanently removes PDFs and database rows.

---

## 4. Premium UI/UX Direction

**Feel**: calm, clinical-but-warm, quietly confident. Think "well-designed financial dashboard meets editorial layout", not a cluttered hospital portal. Generous whitespace, one accent color, restrained motion.

### UX principles
* **Evidence-first**: the PDF is always one click away from any number.
* **State is visible**: every item shows its status (Needs review, Confirmed, Edited, Rejected) via consistent badges, never by color alone.
* **Progressive disclosure**: simple table by default; details in a side drawer.
* **Forgiving**: undo for edits and rejections; nothing is destructive without confirmation.
* **Dense where needed**: the timeline and review tables use compact rows with sticky headers and a sticky first column.

### Signature details
* Sticky first column (test name) and sticky header row in the timeline, with soft shadow on scroll.
* Cell states: filled, blank (truly empty), unreviewed (dashed underline), edited (small dot), outside the report's own printed range (soft tint plus an "H"/"L" label taken from the report itself).
* Test rows grouped under collapsible headings (e.g., Hematology, Biochemistry) when the report states them; otherwise "Ungrouped".
* Skeleton loaders, not spinners, for tables.
* Empty states with a short explanation and one clear action.

---

## 5. Design System

### 5.1 Colors (CSS variables mapped into the Tailwind theme)

| Token | Light | Use |
|---|---|---|
| `--bg` | `#F7F8FA` | App background |
| `--surface` | `#FFFFFF` | Cards, tables |
| `--surface-muted` | `#F0F2F5` | Table header, hover |
| `--border` | `#E3E7ED` | Dividers |
| `--text` | `#0F1B2D` | Primary text |
| `--text-muted` | `#5B6B7F` | Secondary text |
| `--primary` | `#0F766E` (deep teal) | Buttons, links, focus |
| `--primary-soft` | `#D8F0ED` | Selected states |
| `--success` | `#15803D` | Confirmed |
| `--warning` | `#B45309` | Needs review |
| `--danger` | `#B42318` | Errors, destructive |
| `--info` | `#1D4ED8` | Informational |
| `--flag-high` / `--flag-low` | `#FDE8E6` / `#E6F0FD` (tints) | Out-of-printed-range cells |

Define all colors as variables from day one so a dark theme is trivial to add later. Verify contrast meets WCAG AA.

### 5.2 Typography
* Headings: Inter (600 weight). Body/UI: Inter (400/500), self-hosted. Numbers in tables: Inter with `tabular-nums` so digits align.
* Scale: 12 / 14 (default) / 16 / 20 / 24 / 30 px. Line height 1.4 for UI, 1.6 for prose.

### 5.3 Spacing, radius, elevation
* 4 px base grid: 4, 8, 12, 16, 24, 32, 48.
* Radius: 6 px (inputs), 10 px (cards), 999 px (badges).
* Elevation: one subtle card shadow, one overlay shadow for drawers/modals. Prefer borders over heavy shadows.

### 5.4 Core components
`Button` (primary/secondary/ghost/danger), `IconButton`, `Input`, `DateInput`, `Select`/`Combobox`, `Badge`/`StatusPill`, `Card`, `Table` (sticky header/column), `Tabs`, `Drawer`, `Modal`/`ConfirmDialog`, `Toast`, `Tooltip`, `FileDropzone`, `ProgressRow`, `EmptyState`, `Skeleton`, `PdfViewer` (page navigator + highlight region), `Banner` (disclaimer/warnings).

Build these once in `components/ui/` and reuse everywhere. Consider Radix primitives or shadcn/ui for accessible behavior underneath your own styling.

### 5.5 Motion and accessibility
150-200 ms ease-out transitions only; respect `prefers-reduced-motion`. Visible focus rings; all interactive elements reachable by keyboard; status never conveyed by color alone; ARIA labels on icon buttons and table headers.

---

## 6. Architecture

### 6.1 Overview
```text
Browser (React + Vite + TS + Tailwind)
│ REST/JSON + multipart upload
▼
FastAPI backend
├─ API routers (patients, reports, results, tests, timeline, exports)
├─ Services (extraction pipeline, normalization, timeline builder, export)
├─ Repository layer (SQLAlchemy) ──► SQLite (MVP) → PostgreSQL (later)
└─ Storage interface ──► local disk (MVP) → encrypted object storage (later)
```

### 6.2 Frontend
* **Stack**: React 18, Vite, TypeScript (strict), Tailwind, React Router, TanStack Query (server state), React Hook Form + Zod (forms/validation), react-pdf or pdfjs-dist (viewer).
* **Structure by feature**: each feature folder holds its pages, components, hooks, and API calls.
* **State**: server data via TanStack Query; local UI state via React state. Avoid global state libraries in the MVP.
* **API client**: a single typed module. Types mirror backend schemas (optionally generated from FastAPI's OpenAPI document).
* **Error handling**: one global error boundary plus per-query error states with a human-readable message.

### 6.3 Backend
* **Stack**: Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic (migrations), PyMuPDF (`fitz`), pytest.
* **Layers**: routers (thin) → services (logic) → repositories (DB). Parsing code is pure functions that take text/blocks and return data, which makes it easy to unit test.
* **Processing**: the MVP runs extraction in a FastAPI background task (the UI polls status). The service boundary lets you swap in a real queue later.
* **Config**: environment variables via a settings class; no secrets in code.

### 6.4 Path to production
Design every table with a nullable `owner_id` from the start so adding auth later does not require restructuring.

| Concern | MVP | Production path |
|---|---|---|
| DB | SQLite file | PostgreSQL via the same SQLAlchemy models + Alembic |
| Files | Local folder `data/uploads` | Encrypted object storage behind the StorageService interface |
| Auth | None (localhost only) | OIDC or email+password with MFA, per-user ownership of workspaces |
| Jobs | Background tasks | Task queue with retries |
| Hosting | `npm run dev` + `uvicorn` | Containerized, HTTPS, managed DB, backups |
| Audit | Basic event log | Immutable audit trail |

---

## 7. Data Models

IDs are UUID strings. All tables have `created_at` and `updated_at`.

* **Patient**: `id`, `display_name`, `date_of_birth` (nullable), `sex` (nullable), `notes` (nullable), `owner_id` (nullable, future).
* **Report**: `id`, `patient_id`, `original_filename`, `file_path`, `file_sha256`, `page_count`, `status` (`queued` | `processing` | `needs_review` | `reviewed` | `failed`), `failure_reason` (nullable), `has_text_layer` (bool), `lab_name` (nullable), `report_date` (nullable date), `report_date_source_text` (nullable), `report_date_confirmed` (bool), `extraction_version` (string, so you know which parser produced the data).
* **ExtractedResult**: `id`, `report_id`, `page_number`, `row_order`, `section_heading` (nullable), `raw_test_name`, `raw_value_text`, `raw_unit` (nullable), `raw_reference_text` (nullable), `printed_flag` (nullable: H/L/etc.), `source_snippet` (original line text), `bbox` (nullable JSON for highlighting), `parse_confidence` (`high` | `medium` | `low`), `test_id` (nullable FK to Test), `review_status` (`unreviewed` | `confirmed` | `edited` | `rejected` | `manual`).
* **ResultEdit** (overlay for user corrections): `id`, `result_id`, `field`, `old_value`, `new_value`, `edited_at`. The raw columns stay untouched so there is always an audit trail. Effective value = latest edit, else raw.
* **Derived on read** (not stored separately): `value_numeric`, `ref_low`, `ref_high`, `comparator` (`<`, `>`, none). Non-numeric values such as "Positive" or "Nil" are kept as text.
* **Test** (canonical test): `id`, `canonical_name`, `category` (nullable), `preferred_unit` (nullable), `is_seeded` (bool).
* **TestAlias**: `id`, `test_id`, `alias_normalized` (lowercased, punctuation/whitespace stripped), `source` (`seed` | `user`), `patient_id` (nullable; null = global).
* **AuditEvent** (simple): `id`, `patient_id`, `event_type`, `entity_id`, `timestamp` (no medical values in this table).

**Relationships**: `Patient 1—N Report 1—N ExtractedResult N—1 Test 1—N TestAlias`. `ExtractedResult 1—N ResultEdit`.

---

## 8. API Endpoints (v1, prefix `/api/v1`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` / `POST` | `/patients` | List / create workspace |
| `GET` / `PATCH` / `DELETE` | `/patients/{id}` | Read / update / permanently delete (cascades to files and rows) |
| `POST` | `/patients/{id}/reports` | Multipart upload of one or more PDFs; returns report IDs with status queued |
| `GET` | `/patients/{id}/reports` | List reports with status and counts |
| `GET` / `PATCH` / `DELETE` | `/reports/{id}` | Read / edit date, lab name / delete report |
| `GET` | `/reports/{id}/file` | Stream the original PDF (for the viewer) |
| `GET` | `/reports/{id}/results` | Extracted rows with effective values and review status |
| `POST` | `/reports/{id}/results` | Add a manual row |
| `PATCH` | `/results/{id}` | Edit fields, confirm, or reject (writes a ResultEdit) |
| `POST` | `/results/bulk-confirm` | Confirm many rows (e.g., all high-confidence) |
| `POST` | `/results/{id}/undo` | Revert last edit |
| `GET` | `/patients/{id}/mapping/unmatched` | Distinct unmatched raw names with suggestions |
| `POST` | `/patients/{id}/mapping` | Link raw name(s) to a canonical test (creates alias) |
| `GET` / `POST` | `/tests` | List / create canonical tests |
| `GET` | `/patients/{id}/timeline?include_unreviewed=false` | Matrix: columns = reports by date, rows = tests, cells = effective values plus metadata |
| `GET` | `/patients/{id}/export/csv` | CSV download |
| `GET` | `/patients/{id}/export/pdf` | PDF download |

**Conventions**: consistent error body `{ "error": { "code", "message", "details" } }`; pagination only where lists can grow; uploads validated by magic bytes and size, not just extension. Once auth exists, the backend returns 404 (not 403) for other users' objects.

---

## 9. PDF Extraction and Parsing Strategy

### 9.1 Pipeline (per report)
1. **Validate**: confirm it is a real PDF, within limits, compute SHA-256, reject duplicates.
2. **Detect text layer**: use PyMuPDF to extract text per page. If total text is below a threshold, mark `has_text_layer = false`, status `needs_review`, and show "scanned report; manual entry only". No guessing.
3. **Extract structured text**: use PyMuPDF `get_text("words")` or `"blocks"` to keep coordinates. Reconstruct rows by grouping words with similar vertical position, then split into columns by horizontal gaps.
4. **Detect report date**: search for labeled dates first ("Collected", "Sample Date", "Reported", "Date"), prefer the collection/sample date over the print/report date, and parse multiple formats (DD/MM/YYYY, DD-Mon-YYYY, etc.). If several candidates exist, pick the highest-priority label and show alternatives to the user. Ambiguous numeric dates (03/04/2024) use a locale setting (default: day-first, configurable).
5. **Detect table region and header**: locate header words such as Test / Investigation / Parameter, Result / Value, Unit, Reference / Normal Range, Flag. Use their x-positions to assign columns.
6. **Parse each row**: produce `raw_test_name`, `raw_value_text`, `raw_unit`, `raw_reference_text`, `printed_flag`. Rules:
   * Keep original text exactly; parse derived fields separately.
   * Handle `<5`, `>100`, `1.2-3.4`, `Negative`, and values with trailing flags (e.g., `13.2 L`).
   * Skip obvious non-result lines (headers, footers, page numbers, addresses, comments). Uncertain lines become `low` confidence rather than being dropped silently, so the user can see them.
   * Join a wrapped test-name line to the previous one only when the next line has no value.
7. **Assign confidence**: `high` = name, numeric value, unit, and range all parsed cleanly; `medium` = name and value found but unit or range missing; `low` = anything structurally odd.
8. **Normalize names**: normalize the string (lowercase, remove punctuation, collapse spaces, strip method suffixes only via explicit rules), then exact-match against the alias table. If there is no exact match the row is "unmatched", with fuzzy-match suggestions only (e.g., RapidFuzz), never auto-applied.
9. **Persist with extraction_version**, and set report status `needs_review`.

### 9.2 Parser design for maintainability
* Layout strategies are small, separate, testable modules (`table_layout.py`, `line_layout.py`) tried in order; the one with the best row yield and confidence wins and its name is recorded.
* A `fixtures/` folder of synthetic or fully de-identified sample PDFs with hand-written expected JSON. Every parser bug becomes a new fixture plus a test. Never commit real patient reports.
* The seed alias list lives in a human-editable JSON/CSV (start with about 100-150 common tests: CBC, liver, kidney, lipid, thyroid, glucose/HbA1c, electrolytes, vitamins, urine basics), and should be reviewed by a qualified person before you rely on it.

### 9.3 Normalization safety rules
* Never merge tests that differ meaningfully (e.g., "Bilirubin Total" vs "Bilirubin Direct").
* Different units for the same canonical test across reports produce a warning, with no conversion.
* User-created mappings are scoped to the workspace unless the user explicitly promotes them.

### 9.4 Deliberately avoiding AI risk
The MVP uses no LLM on patient data. If you later add an LLM or OCR fallback, make it an optional, clearly consented feature with the same review gate, and use only a provider and agreement suitable for health data.

### 9.5 Measuring quality honestly
Track on your fixture set: report-date correct rate, row recall, row precision, and value exact-match rate. Report these as "results on our test files", never as a general accuracy claim.

---

## 10. Security and Medical-Data Privacy

*Important: this is engineering guidance, not legal advice. Depending on where users live (e.g., HIPAA in the US, GDPR in the EU, India's DPDP Act), the app may carry legal obligations once it is hosted for other people. Get proper legal review before any public launch.*

### 10.1 MVP (local, single user)
* Run on localhost; bind the backend to `127.0.0.1`.
* Keep `data/` out of version control (`.gitignore`) and never upload it anywhere.
* No third-party analytics, ad scripts, or external fonts/CDNs (self-host fonts) so no data or metadata leaks.
* No patient data in logs, error messages, or URLs. Log IDs and statuses only.
* Use random UUID filenames on disk, never the original filename.
* Strict upload validation (type, magic bytes, size, page count); process PDFs defensively and keep PyMuPDF updated.
* Parameterized queries only (SQLAlchemy does this), strict CORS allow-list, security headers, no wildcard origins.
* A clear "Delete everything" option that removes DB rows and files, and confirms what was deleted.
* Prominent disclaimer: not medical advice; verify against original reports.

### 10.2 Before any hosted or multi-user release
* Authentication with MFA, per-user data isolation, and authorization checks on every endpoint.
* HTTPS everywhere; encryption at rest (managed DB/volume encryption plus encrypted object storage); secrets in a secret manager.
* Data retention and deletion policy, encrypted backups, and a tested restore.
* Audit logging of access and exports; rate limiting; malware scanning of uploads.
* Privacy policy, consent flows, data-processing agreements with any vendor, and a breach-response plan.
* Penetration test and dependency vulnerability scanning in CI.

### 10.3 AI-agent safety habits (important for vibe coding)
* Never paste real patient reports into an AI chat. Use synthetic or fully redacted samples only.
* Never give the AI agent access to your real `data/` folder.
* Review every dependency the agent adds.

---

## 11. Milestones and Acceptance Criteria

Each milestone ends with a git commit, a short README note on how to run and test it, and passing automated tests.

### M0: Foundations (about 1 day)
**Build**: repo, folder structure, frontend and backend scaffolds, lint/format, test runners, README with run instructions.  
**Accept when**:
* `npm run dev` shows the app shell; `uvicorn` serves `/api/v1/health` returning OK.
* The frontend calls the health endpoint and displays "Backend connected".
* `npm test` and `pytest` both run (even with one trivial test each).

### M1: Design system and app shell (about 2-3 days)
**Build**: Tailwind theme tokens, fonts, core UI components, layout (sidebar/top bar), disclaimer banner, and a `/styleguide` page showing all components.  
**Accept when**:
* The styleguide renders every component in all states.
* Tab reaches every interactive item with a visible focus ring.
* Text/background pairs pass WCAG AA (checked with a tool).

### M2: Patient workspaces (about 2 days)
**Build**: Patient model, migrations, CRUD endpoints, Workspaces and Overview pages.  
**Accept when**:
* You can create, rename, and delete a workspace through the UI; data survives restart.
* Deleting requires typed confirmation and removes the workspace's files.
* Empty, loading, and error states all appear correctly (simulate the backend being down).
* Backend tests cover CRUD and 404s.

### M3: Upload and storage (about 2-3 days)
**Build**: multi-file upload, validation, SHA-256 duplicate detection, report list with statuses.  
**Accept when**:
* Uploading 5 PDFs shows 5 rows with live status.
* A renamed `.txt` file with a `.pdf` extension is rejected; oversize files are rejected with a clear message.
* Uploading the same file twice warns and does not create a duplicate.
* Files on disk use UUID names.

### M4: Text extraction and date detection (about 3-4 days)
**Build**: text-layer detection, date detection with alternatives, a raw text view for debugging.  
**Accept when**:
* On the fixture set, the date-detection rate is measured and recorded honestly.
* A scanned (image-only) fixture is flagged "no readable text" and never produces rows.
* Ambiguous dates show alternatives and require user confirmation.

### M5: Row parsing and confidence (about 4-6 days)
**Build**: layout strategies, row parser, confidence scoring, persisted ExtractedResults, fixtures with expected output.  
**Accept when**:
* Parser unit tests pass for at least 8 synthetic layouts, including `<` / `>` values, text values, wrapped names, and missing units.
* Original text is preserved exactly in the `raw_*` fields.
* Unparseable lines appear as low-confidence rows or are counted in a "lines skipped" number; nothing disappears silently.
* A summary shows "X rows found, Y need review".

### M6: Review and correction UI (about 4-5 days)
**Build**: split view (PDF + rows), edit/confirm/reject/add row, bulk-confirm high-confidence rows, undo, report date confirmation.  
**Accept when**:
* Clicking a row jumps the PDF to the correct page.
* Editing a value stores a ResultEdit and keeps the raw value visible on hover.
* Rejecting then undoing restores the row.
* A report cannot be marked "reviewed" until its date is confirmed.
* Refreshing the page loses nothing.

### M7: Normalization and mapping (about 3-4 days)
**Build**: seed test/alias data, matching, Mapping page with suggestions, user-defined aliases.  
**Accept when**:
* Known variants (e.g., "Hb" and "Haemoglobin") map to one canonical test on the fixtures.
* Unmatched names are listed; accepting a suggestion creates an alias and applies it to all matching rows.
* "Bilirubin Total" and "Bilirubin Direct" are never merged.
* A unit-mismatch warning appears for a deliberately mismatched fixture.

### M8: Timeline table (about 3-4 days)
**Build**: timeline endpoint and UI with sticky headers, grouping, source drawer, cell states, and filters (search test, show/hide unreviewed).  
**Accept when**:
* Tests are rows and report dates are columns in ascending date order.
* Missing results are truly blank; a script comparing timeline cells to confirmed data finds zero invented values.
* Two reports on the same date appear as two columns.
* Clicking a cell opens the source report and page.
* With unreviewed excluded (the default), unreviewed rows never appear.

### M9: CSV export (about 1-2 days)
**Accept when**: the CSV opens correctly in Excel/Sheets; blanks are empty; dates are ISO format; commas and special characters are escaped; a disclaimer row is included; and values starting with `=`, `+`, `-` or `@` are neutralized to prevent CSV injection.

### M10: PDF export (about 2-3 days)
**Accept when**: a landscape, print-friendly PDF shows the same table as the screen, splits across pages with repeated headers, includes the patient label, generated date and disclaimer, and is legible when printed.

### M11: Hardening and release candidate (about 3-4 days)
**Build**: error-boundary polish, accessibility pass, the security checklist from section 10.1, testing with 20+ synthetic reports, a performance check, README, and user-facing help text.  
**Accept when**: all checklist items pass; a non-technical tester can complete the full workflow without help; and known limitations are documented in the UI and README.

*Rough total: 6-9 weeks part-time for a beginner working with an AI agent. Treat estimates as guidance, not promises.*

---

## 12. Recommended Project Folder Structure

```text
medtimeline-ai/
├─ README.md
├─ AGENT_RULES.md            # standing rules for the AI agent (section 13.2)
├─ .gitignore                # includes data/, .env, *.db
├─ docs/
│  ├─ PLAN.md                # this document
│  ├─ DECISIONS.md           # short log of key choices
│  ├─ TESTING.md             # how to test each milestone by hand
│  └─ PRIVACY_CHECKLIST.md
├─ data/                     # local DB + uploads (git-ignored)
├─ fixtures/                 # synthetic / de-identified sample PDFs + expected JSON
│  ├─ pdfs/
│  └─ expected/
├─ backend/
│  ├─ pyproject.toml (or requirements.txt)
│  ├─ alembic/ and alembic.ini
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ core/               # config, logging, security helpers
│  │  ├─ db/                 # session, base, models/
│  │  ├─ schemas/            # Pydantic request/response models
│  │  ├─ api/v1/             # routers: patients, reports, results, tests, timeline, exports
│  │  ├─ services/
│  │  │  ├─ storage.py       # StorageService (local disk now, object storage later)
│  │  │  ├─ extraction/      # pipeline.py, text_layer.py, date_detect.py, layouts/, row_parser.py
│  │  │  ├─ normalization/   # matcher.py, seed/aliases.json
│  │  │  ├─ timeline.py
│  │  │  └─ exporters/       # csv_export.py, pdf_export.py
│  │  └─ repositories/
│  └─ tests/                 # unit/, integration/, parser fixture tests
├─ frontend/
│  ├─ package.json, vite.config.ts, tsconfig.json, tailwind.config.ts
│  ├─ index.html
│  └─ src/
│     ├─ main.tsx, App.tsx, router.tsx
│     ├─ styles/             # tokens.css, globals.css
│     ├─ lib/                # apiClient.ts, formatters.ts, dates.ts
│     ├─ components/ui/      # design-system components
│     ├─ components/layout/  # AppShell, Sidebar, DisclaimerBanner
│     ├─ features/
│     │  ├─ patients/
│     │  ├─ reports/         # upload, list, status
│     │  ├─ review/          # split view, row editor, pdf viewer
│     │  ├─ mapping/
│     │  ├─ timeline/
│     │  └─ exports/
│     ├─ pages/              # route-level pages
│     └─ types/
└─ scripts/                  # dev helpers (seed fixtures, reset local data)
```

---

## 13. Instructions for Building with an AI Coding Agent

### 13.1 One-time setup
1. Install Git, Node.js (current LTS), Python 3.11+, and VS Code. Use an agentic tool such as Claude Code or Cursor.
2. Create the repo and save this plan as `docs/PLAN.md`.
3. Create `AGENT_RULES.md` (or `CLAUDE.md`) containing the rules in 13.2 so the agent reads them every session.
4. Commit after every working step. If the agent breaks something, you can revert.

### 13.2 Standing rules to give the agent
You are helping a beginner build MedTimeline AI. Read `docs/PLAN.md` first. Rules:
1. Work on one milestone at a time; do not build ahead.
2. Before coding, state your plan in plain language and list the files you will create or change.
3. Use only the agreed stack (React, Vite, TypeScript strict, Tailwind, FastAPI, SQLAlchemy, SQLite, PyMuPDF). Ask before adding any dependency and explain why.
4. Never invent medical values or fill blanks. Preserve raw extracted text. Do not add AI/LLM calls on patient data.
5. Never log patient data. Never use real patient files; use only `fixtures/`.
6. Write tests with the code. Run them and show me the results.
7. Explain each new file in 2-3 plain sentences, and any concept a beginner may not know.
8. Keep functions small and well named. Add comments only where the why is not obvious.
9. When finished, give me: how to run it, a manual test checklist, and known limitations.
10. Do not add features that are not in the milestone. Suggest them in a list instead.

### 13.3 Per-milestone prompt template
> "We are starting Milestone N: [name] from docs/PLAN.md. First, summarize the goal, the acceptance criteria, and your implementation plan in plain English with the list of files. Wait for my approval. Then implement, run the tests, and finish with (a) exact commands to run the app, (b) a step-by-step manual test I can follow, and (c) anything that does not meet the acceptance criteria yet."

### 13.4 How you stay in control (and learn)
* Ask "explain it" prompts: *"Explain row_parser.py as if I'm new to Python. What happens to a line of text, step by step?"*
* Test by hand after each milestone, using the acceptance criteria as a checklist; tick items off in `docs/TESTING.md`.
* Try to break it: upload a corrupt file, an empty PDF, a huge file, the same file twice, a report with no date.
* Review diffs before committing: ask the agent to summarize what changed and why, then skim the diff.
* When stuck: give the agent the exact error message and the command you ran, and ask for the root cause before a fix. Don't let it rewrite large areas to fix a small bug.
* Keep a decision log: ask the agent to add a one-line entry to `docs/DECISIONS.md` for any choice that deviates from the plan.

### 13.5 Suggested build order of prompts
1. **M0**: "Scaffold the project exactly per section 12 with the health-check connection."
2. **M1**: "Implement the design tokens from section 5 and the component library; build the styleguide page."
3. **M2-M3**: Patients, then uploads. Verify with the manual tests before moving on.
4. **M4-M5**: Do parser work with fixtures first (tests before UI). Ask the agent to generate synthetic lab PDFs with made-up names and values to create fixtures.
5. **M6-M8**: Review UI, mapping, timeline. Polish visuals after function works.
6. **M9-M11**: Export, hardening, release candidate.

### 13.6 Quality gates before moving on
Backend tests green, frontend type-check green, lint clean, manual checklist complete, README updated, and a git tag (e.g., `m5-complete`).

---

## 14. Risks and Open Questions

| Risk / question | Mitigation or decision needed |
|---|---|
| Wide variety of lab layouts causes missed or wrong rows | Review step, confidence flags, fixtures grown from real-world layouts (de-identified), explicit coverage messaging |
| Scanned PDFs are common in some regions | Decide early whether OCR is v1.1; consider a local OCR engine to keep data private |
| Ambiguous date formats | Locale setting and mandatory date confirmation |
| Regulatory exposure if hosted for others | Legal review before public launch; keep "not a medical device / not advice" positioning |
| Alias list errors causing wrong merges | Qualified reviewer for the seed list; conservative exact match; user confirmation for everything else |
| Beginner over-reliance on AI-generated code | Small milestones, tests, explanations, diff review |
| Decisions for you | Which regions and labs are your primary targets? Do you need multi-language reports? Is hosting for others a goal or a later question? |

---

## 15. Definition of Done for the MVP

* A user can create a workspace, upload several text-based lab PDFs, review and correct extracted data, resolve test names, view a correct chronological table with blanks for missing results, and export CSV and PDF.
* No value appears in the timeline that the user did not see and confirm (or explicitly include as unreviewed).
* Known limitations (no OCR, no unit conversion, variable layout coverage) are visible in the app and README.
* The local-use privacy checklist is complete; the hosted-release checklist is documented but not yet claimed as done.
