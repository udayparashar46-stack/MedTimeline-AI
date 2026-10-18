# Medical Data Privacy & Security Checklist

Based on **Section 10** of `docs/PLAN.md`.

---

## 1. Local MVP Security Checklist (Single User)

- [x] **Localhost Binding**: Backend bound strictly to `127.0.0.1`. Never expose to `0.0.0.0` or local network without auth.
- [x] **Git Isolation**: `.gitignore` explicitly excludes:
  - `data/` (patient PDF uploads, database files)
  - `*.db`, `*.sqlite`, `*.sqlite3`
  - `.env` files and certificates
- [ ] **UUID Storage**: All saved PDF files on disk use random UUID strings, never original patient filenames *(implemented in M3)*.
- [ ] **No PHI in Logs**: Logging configured to record IDs and status codes only—never test names, patient labels, dates, or values *(enforced from M2 onward)*.
- [x] **Self-Hosted Assets**: No third-party trackers, external fonts, or CDN scripts that could leak IP addresses or metadata.
- [ ] **SQL Injection Protection**: All queries run via SQLAlchemy parameterized queries; no raw string interpolation *(enforced from M2 onward)*.
- [ ] **Upload Defensive Parsing**: Validate file magic bytes and size before processing *(enforced in M3)*.
- [x] **Prominent Medical Disclaimer**: Clear notice that the app is an organizational tool, not a medical device or diagnostic aid.

---

## 2. Before Hosted / Multi-User Release
*(Reference: Section 10.2 of PLAN.md)*
- [ ] Authentication with MFA & per-user tenant isolation
- [ ] HTTPS enforced with encryption at rest
- [ ] Data retention, deletion policy & verified encrypted backups
- [ ] Audit logging for exports and record access
- [ ] Independent penetration testing & vulnerability scanning
