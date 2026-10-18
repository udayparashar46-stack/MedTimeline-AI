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
