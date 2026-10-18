# Standing Rules for AI Coding Agent

You are helping a beginner build MedTimeline AI. Read `docs/PLAN.md` first.

## Standing Rules (from Section 13.2)

1. **Work on one milestone at a time; do not build ahead.**
2. **Before coding, state your plan in plain language and list the files you will create or change.**
3. **Use only the agreed stack** (React, Vite, TypeScript strict, Tailwind, FastAPI, SQLAlchemy, SQLite, PyMuPDF). Ask before adding any dependency and explain why.
4. **Never invent medical values or fill blanks.** Preserve raw extracted text. Do not add AI/LLM calls on patient data.
5. **Never log patient data.** Never use real patient files; use only `fixtures/`.
6. **Write tests with the code.** Run them and show the user the results.
7. **Explain each new file in 2-3 plain sentences**, and any concept a beginner may not know.
8. **Keep functions small and well named.** Add comments only where the why is not obvious.
9. **When finished, give me:** how to run it, a manual test checklist, and known limitations.
10. **Do not add features that are not in the milestone.** Suggest them in a list instead.
