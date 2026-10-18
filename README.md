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

## Current Status: Milestone 1 (M1 — Design System & App Shell)

* **Design System**: Complete tokenized design system in `src/styles/tokens.css` with deep teal (`#0F766E`) and success green (`#15803D`) WCAG AA colors.
* **Component Library**: Fully accessible UI kit in `src/components/ui/` (Button, IconButton, Badge, Card, Input, DateInput, Select, Table with medical states, Tabs, Modal, Drawer, Toast, Tooltip, FileDropzone, ProgressRow, Skeleton, EmptyState, Banner).
* **Responsive SaaS Shell**: Clean dashboard layout with collapsible sidebar, sticky top bar, medical disclaimer, and live backend connection badge.
* **Interactive Styleguide**: Dedicated `/styleguide` page displaying every component and table state.
* **Backend**: FastAPI serving health check at `GET /api/v1/health` bound strictly to `127.0.0.1:8000`.
* **Automated Tests**: Pytest for backend and 5 Vitest tests for the frontend app shell, navigation, and components.

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
├─ data/                    # Local storage (git-ignored)
├─ backend/
│  ├─ requirements.txt      # FastAPI, Uvicorn, Pydantic, pytest, httpx
│  ├─ app/
│  │  ├─ main.py            # FastAPI entry point with CORS
│  │  ├─ core/config.py     # Localhost settings
│  │  └─ api/v1/health.py   # Health check router
│  └─ tests/
│     └─ test_health.py     # Health check endpoint unit test
└─ frontend/
   ├─ package.json          # React 18, Vite, TypeScript, Vitest
   ├─ vite.config.ts        # Vite config with /api proxy to 127.0.0.1:8000
   ├─ tsconfig.json         # Strict TypeScript configuration
   ├─ index.html            # Main HTML document
   └─ src/
      ├─ main.tsx           # React DOM root render
      ├─ App.tsx            # Foundation app shell & health checker
      ├─ App.test.tsx       # Vitest tests for connection states
      ├─ index.css          # Baseline styling and CSS variables
      └─ setupTests.ts      # Jest-dom matchers for Vitest
```

---

## Disclaimer

Generated from user-uploaded reports. Not medical advice. Verify against original reports.
