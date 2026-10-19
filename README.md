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

## Current Status: Combined Milestones M8 + M9 (Timeline Table & CSV Export)

* **Chronological Timeline Table**: Tests arranged as rows and report collection dates as chronological columns (ascending date order). Missing results are strictly blank (`—`); no values are ever invented or interpolated (Principle 1).
* **Same-Date Multi-Report Separation (FR5)**: Two or more reports on the exact same date are rendered in separate columns with clear lab names/filenames, never merged silently.
* **Sticky Navigation**: Sticky first column (test names) with soft elevation shadow and sticky date header row with horizontal and vertical scrolling.
* **Cell States & Clinical Highlights**: Soft color tints for out-of-range results (`--flag-high`, `--flag-low`), attached report flag labels (`H`/`L`), user-edited indicator dots, and dashed underlines for unreviewed draft entries.
* **Collapsible Clinical Categories**: Tests grouped under standardized collapsible panel headings (Complete Blood Count, Lipid Profile, Liver Function, Kidney Function, etc.).
* **Principle 3 Evidence Drawer**: Clicking any timeline cell opens an interactive slide-over source drawer revealing the exact extracted line, PDF page number, reference intervals, parse confidence, and a one-click jump to full split-view review.
* **Review-Status Gating & Toggle**: Timeline defaults to confirmed data only (`include_unreviewed=false`). Toggle switch allows displaying unreviewed draft rows with clear visual distinction. Rejected results are permanently excluded.
* **Strict Analyte Separation**: "Bilirubin Total" and "Bilirubin Direct" are strictly separate rows and never merged.
* **Spreadsheet-Friendly CSV Export**: One-click download of the timeline matrix with patient metadata, chronological column headers, blank cells for missing data, and mandatory medical disclaimer footer.
* **CSV Injection Protection**: Strict cell neutralization prefixing values starting with `=`, `+`, `-`, `@`, `\t`, `\r` with a single quote to prevent formula execution in Excel/Sheets.
* **UTF-8 BOM Encoding**: Exported files include UTF-8 Byte Order Mark for seamless rendering in Microsoft Excel without character corruption.
* **Automated Tests**: 84 Pytest backend tests (100% passing) and 46 Vitest frontend tests (100% passing) with strict TypeScript type-checking (0 errors) and clean Vite production build.


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
pytest
```

### Frontend Tests & Type Checking (Vitest & TypeScript)
```powershell
cd frontend
# Run unit tests
npm test

# Run TypeScript strict type-check
npm run type-check
```

---

## Project Structure

```text
medtimeline-ai/
├─ README.md                # This file: setup and run instructions
├─ AGENT_RULES.md           # 10 standing rules for AI coding agents
├─ .gitignore               # Excludes secrets, databases, uploads, and node/python caches
├─ docs/
│  ├─ PLAN.md               # Complete 22-page implementation blueprint
│  ├─ DECISIONS.md          # Architectural decision records
│  ├─ TESTING.md            # Manual testing checklist by milestone
│  └─ PRIVACY_CHECKLIST.md  # Data privacy & security requirements
├─ data/                    # Local SQLite DB & future uploads (git-ignored)
├─ backend/
│  ├─ requirements.txt      # FastAPI, Uvicorn, Pydantic, SQLAlchemy, Alembic, pytest, httpx
│  ├─ app/
│  │  ├─ main.py            # FastAPI entry point with CORS & DB lifecycle
│  │  ├─ core/config.py     # Localhost settings & DB file path
│  │  ├─ db/                # Session factory, declarative base, Patient model
│  │  ├─ schemas/           # Pydantic v2 patient request/response validation
│  │  ├─ repositories/      # patient_repo with queries & soft-delete
│  │  └─ api/v1/            # Health & Patient routers
│  └─ tests/
│     ├─ test_health.py     # Health check endpoint unit test
│     └─ test_patients.py   # Patient CRUD & validation integration tests
└─ frontend/
   ├─ package.json          # React 18, Vite, TypeScript, Vitest
   ├─ vite.config.ts        # Vite config with /api proxy to 127.0.0.1:8000
   ├─ tsconfig.json         # Strict TypeScript configuration
   ├─ index.html            # Main HTML document
   └─ src/
      ├─ main.tsx           # React DOM root render
      ├─ App.tsx            # App shell, routing, & health checker
      ├─ App.test.tsx       # Vitest tests for shell & dashboard
      ├─ Patients.test.tsx  # Vitest tests for patient workspace flows
      ├─ lib/apiClient.ts   # Typed API client for FastAPI endpoints
      ├─ pages/             # Dashboard, Patients, PatientWorkspace, Styleguide
      ├─ components/
      │  ├─ layout/         # AppShell, Sidebar, DisclaimerBanner
      │  ├─ ui/             # Reusable design system primitives
      │  └─ patients/       # Create, Edit, Delete modals with validation
      ├─ styles/            # tokens.css (deep teal/green tokens) & globals.css
      └─ setupTests.ts      # Jest-dom matchers for Vitest
```

---

## Disclaimer

Generated from user-uploaded reports. Not medical advice. Verify against original reports.
