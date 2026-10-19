# MedTimeline AI

> **A timeline viewer for medical lab reports.**  
> *Track lab values across reports over time with deterministic parsing, full user review, and zero guessed numbers.*

---

## Guiding Principles

1. **Trust over cleverness**: A blank cell is always better than a wrong number. Nothing is invented, guessed, or silently "fixed".
2. **Human in the loop**: Extracted data is a draft until the user reviews it.
3. **Show the evidence**: Every extracted value links directly back to its source page in the PDF.
4. **Boring, testable tech**: Deterministic text parsing first. No AI/LLM calls on patient data.
5. **Localhost & privacy**: Runs locally on `127.0.0.1`. No patient data in git, no analytics, no external trackers.
6. **Not a medical device**: The app organizes and displays data. It does not diagnose, interpret, or advise.

---

## Current Status: Release Candidate v1.0.0-rc1 (M10 PDF Export, M11 Hardening, M12 Portability & Reset)

* **Chronological Timeline Table (M8)**: Tests arranged as rows and report collection dates as chronological columns (ascending date order). Missing results are strictly blank (`—`); no values are ever invented or interpolated (Principle 1).
* **Same-Date Multi-Report Separation (FR5)**: Two or more reports on the exact same date are rendered in separate columns with clear lab names/filenames, never merged silently.
* **Sticky Navigation**: Sticky first column (test names) with soft elevation shadow and sticky date header row with horizontal and vertical scrolling.
* **Cell States & Clinical Highlights**: Soft color tints for out-of-range results (`--flag-high`, `--flag-low`), attached report flag labels (`H`/`L`), user-edited indicator dots, and dashed underlines for unreviewed draft entries.
* **Collapsible Clinical Categories**: Tests grouped under standardized collapsible panel headings (Complete Blood Count, Lipid Profile, Liver Function, Kidney Function, etc.).
* **Principle 3 Evidence Drawer**: Clicking any timeline cell opens an interactive slide-over source drawer revealing the exact extracted line, PDF page number, reference intervals, parse confidence, and a one-click jump to full split-view review.
* **Review-Status Gating & Toggle**: Timeline defaults to confirmed data only (`include_unreviewed=false`). Toggle switch allows displaying unreviewed draft rows with clear visual distinction. Rejected results are permanently excluded.
* **Strict Analyte Separation**: "Bilirubin Total" and "Bilirubin Direct" are strictly separate rows and never merged.
* **Spreadsheet-Friendly CSV Export (M9)**: One-click download of the timeline matrix with patient metadata, chronological column headers, blank cells for missing data, CSV formula injection neutralization (`'`, `+`, `-`, `@`), and UTF-8 BOM encoding for seamless Microsoft Excel compatibility.
* **Landscape PDF Export (M10)**: Print-ready landscape A4 PDF export using PyMuPDF (`fitz`). Includes repeated table headers, out-of-range tinting, blank cells for missing values, automatic column chunking for wide timelines (>5 columns), multi-page row pagination (>20 rows), and mandatory medical disclaimer on every page footer.
* **Clinical Hardening Suite & RC (M11)**: 25-scenario synthetic clinical hardening test suite (`test_synthetic_scenarios.py`) validating corrupt/password-protected PDFs, non-OCR boundary detection, `<`/`>` comparators, attached flags, 4-tier date priority, date ambiguity gating, undo stack restoration, analyte separation, unit mismatch detection, and sub-2.0s timeline response.
* **Settings & Privacy Center (M11)**: Dedicated Settings & About page verifying local-only `127.0.0.1` binding, zero external trackers/analytics, zero external CDNs/fonts, deterministic local parsing, and documented clinical boundaries.
* **Audit Logging & Portability (M12)**: Isolated non-clinical lifecycle audit event logging (`audit_events` table), full patient workspace JSON archive export/import (`/api/v1/patients/{id}/export/archive`), and typed-confirmation `"DELETE EVERYTHING"` system reset cascade purging all database rows and uploaded files with automatic canonical test re-seeding.
* **Automated Tests**: **126 Pytest backend tests** (100% passing across 11 test modules) and **52 Vitest frontend tests** (100% passing across 9 test files) with strict TypeScript type-checking (0 errors) and clean Vite production build.

---

## Prerequisites (Windows)

Ensure you have the following installed:
* **Python 3.12+**
* **Node.js LTS** (v24+) & **npm** (11+)
* **Git** (2.55+)

---

## Setup & Run Instructions (Windows PowerShell)

Open two Windows PowerShell terminals in the project root `medtimeline-ai/`:

### Terminal 1: Backend Setup & Run

```powershell
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a Python virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 3. Install backend dependencies
pip install -r requirements.txt

# 4. Start the FastAPI development server (bound to localhost)
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
*The backend will be available at `http://127.0.0.1:8000/api/v1/health`.*  
*Interactive API documentation is at `http://127.0.0.1:8000/api/v1/docs`.*

### Terminal 2: Frontend Setup & Run

```powershell
# 1. Navigate to the frontend directory
cd frontend

# 2. Install Node dependencies
npm install

# 3. Start the Vite development server
npm run dev
```
*The frontend will open at `http://localhost:5173`.*

---

## Running Automated Tests

### Backend Tests (pytest)
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest -v
```
*(Runs 126 tests in ~16s across all 11 test modules)*

### Frontend Tests & Type Checking (Vitest & TypeScript)
```powershell
cd frontend
# Run unit tests
npm test

# Run TypeScript strict type-check
npm run type-check

# Run production build
npm run build
```
*(Runs 52 tests in ~16s across 9 test files)*

---

## Project Structure

```text
medtimeline-ai/
├─ README.md                # This file: setup and run instructions
├─ AGENT_RULES.md           # 10 standing rules for AI coding agents
├─ .gitignore               # Excludes secrets, databases, uploads, and node/python caches
├─ docs/
│  ├─ PLAN.md               # Complete implementation blueprint
│  ├─ DECISIONS.md          # Architectural decision records (ADRs 1–38)
│  ├─ TESTING.md            # Manual testing checklist by milestone (M0–M12)
│  └─ PRIVACY_CHECKLIST.md  # Data privacy & security requirements
├─ data/                    # Local SQLite DB & uploaded PDFs (git-ignored)
├─ backend/
│  ├─ requirements.txt      # FastAPI, Uvicorn, Pydantic, SQLAlchemy, PyMuPDF, pytest, httpx
│  ├─ app/
│  │  ├─ main.py            # FastAPI entry point with CORS, DB lifecycle & canonical seeding
│  │  ├─ core/config.py     # Localhost 127.0.0.1 settings & file paths
│  │  ├─ db/                # Session factory, declarative base, ORM models
│  │  ├─ schemas/           # Pydantic v2 validation schemas
│  │  ├─ repositories/      # Patient, Report, Result, Mapping, and Audit repositories
│  │  ├─ services/          # Ingestion, Date detection, Layout parsing, Exporters (CSV, PDF)
│  │  └─ api/v1/            # Health, Patients, Reports, Results, Mapping, Timeline, Audit, System
│  └─ tests/                # 126 comprehensive pytest integration & unit tests
└─ frontend/
   ├─ package.json          # React 18, Vite, TypeScript, Vitest
   ├─ vite.config.ts        # Vite config with /api proxy to 127.0.0.1:8000
   ├─ tsconfig.json         # Strict TypeScript configuration
   ├─ index.html            # Main HTML document
   └─ src/
      ├─ main.tsx           # React DOM root render
      ├─ App.tsx            # App shell, routing, navigation & connection status
      ├─ lib/apiClient.ts   # Typed API client for FastAPI endpoints
      ├─ pages/             # Dashboard, Patients, Workspace, Review, Mapping, Timeline, Settings
      ├─ components/
      │  ├─ layout/         # AppShell, Sidebar, DisclaimerBanner
      │  ├─ ui/             # Reusable design system primitives (Table, Modal, Drawer, etc.)
      │  ├─ timeline/       # TimelineTable, CellDrawer
      │  └─ patients/       # Workspace CRUD modals
      ├─ styles/            # tokens.css & globals.css
      └─ setupTests.ts      # Jest-dom matchers for Vitest
```

---

## Disclaimer

Generated from user-uploaded reports. Not medical advice. Verify against original reports.

