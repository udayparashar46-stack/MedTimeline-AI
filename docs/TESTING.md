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
*(To be completed in Milestone 2)*

## M3: Upload and Storage
*(To be completed in Milestone 3)*
