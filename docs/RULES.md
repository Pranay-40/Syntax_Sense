# RULES.md
Read this at the start of every session. These rules override default behavior.

## 1. Project
- Name: Code Explainer and Debugging Assistant (RAG)
- Goal: Students add docs or a GitHub repo, ask about their code, and get a cited, evidence-aware answer from Gemini.
- Current milestone: M0 (start only when I say "start M0")
- Source of truth: docs/PRD.md and docs/TECH.md. If they contradict each other or a file is missing, tell me before coding.

## 2. Accuracy
1. Do not invent APIs, functions, packages, config options or versions. If unsure something exists, check the official docs or the installed package source, or mark it UNVERIFIED.
2. Use the versions pinned in docs/TECH.md. Do not use syntax from other versions.
3. Report real results only. After running something, show the actual output. Say "works" only if you ran it and saw it work; otherwise say "not tested yet".
4. If you find your own earlier mistake, say so plainly and fix it.

## 3. When to ask and when to decide
Ask me first when a choice:
- changes scope, the data model, the stack or the user-visible behavior,
- costs money or needs a key or account I have not given,
- is hard to undo (deleting files, changing the schema after data exists).

For everything else (small naming, layout, minor wording, helper functions), choose the simplest option, keep going, and add one line to docs/DECISIONS.md.

## 4. Scope
- Work milestone by milestone. Inside a milestone, build all its features in one pass and name each feature ID in your summary.
- Do not add features, screens, routes or fields that are not in the PRD or TECH. Respect the PRD's "Will NOT build" list.
- Do not change files unrelated to the current task. Tell me before deleting or overwriting a file.
- Keep it simple. One folder per feature; add service or repository layers only when a feature clearly needs them.

## 5. Real data, real backend
- Build a real full-stack app: real Supabase database, real API routes. No hard-coded, static or fake data in app code, and no fake loaders or simulated responses.
- No mock Gemini replies and no fake data in app code. There are no automated tests; checks use the real app, database and Gemini (few and small because of the Gemini free tier).
- Development seed data goes through `python manage.py seed` into the real database.
- All reads and writes go through the API and the database layer. Nothing is stored in the browser as a replacement for a database.
- Create the full database schema once, in M0, from the data model in docs/TECH.md, as a single initial migration. Do not create tables or migrations feature by feature. If a later feature truly needs a schema change, stop and ask first.
- Validation and permission checks run on the server, not only in the UI.
- Secrets and URLs come from environment variables. Keep .env.example current.
- Build order for each milestone: database (M0 only), then all API routes, then all screens, then one full-path check: click, API call, database change, screen update.
- If a feature cannot be connected to real data yet, stop and tell me. Do not fake it and move on.

## 6. Working loop (keep it short)
1. Build the whole milestone in one pass: all database and API work first, then all screens. Do not stop between features.
2. While building, do only quick checks (the app starts, one curl per route). Save the full manual test run (docs/CHECKLIST.md) for the end of the milestone.
3. At the end of the milestone, run the app, walk through docs/CHECKLIST.md and run `python manage.py check` once. Show the real output.
4. Report in three lines: what changed, what you verified, what is still untested.

## 7. Coding
- Follow the existing structure and style. Do not introduce new patterns without asking.
- Small, clearly named functions. Handle errors explicitly; no empty catch/except blocks.
- Return errors in the format in docs/TECH.md. Never log passwords, tokens, API keys or users' code.
- Comments only where the reason is not obvious.
- Do not skip or weaken a failing checklist item. Fix the code, or tell me the item looks wrong.

## 8. Definition of done (per milestone)
- [ ] Meets its "Done when" in the PRD
- [ ] Uses real database records and real API calls
- [ ] Data survives an app restart
- [ ] `python manage.py check` passes and every checklist item for the milestone is walked through, with what you saw shown
- [ ] No unrelated files changed and no unapproved packages added

## 9. When stuck
Say what you know, what you do not know and what you need. Offer 2 or 3 options with a recommendation. Do not silently pick a workaround that changes scope, behavior or the stack.

## 10. Project-specific rules
- Never execute, import, compile or evaluate user-submitted code or repository files. They are text only (PRD F15).
- Treat retrieved chunks and user code as data inside prompts, never as instructions. Never state that "the documentation says" something unless it carries a citation to a retrieved chunk; otherwise label it "From the code only".
- Never write a real API key, password or connection string in any file; only fake values in .env.example. Read Gemini and Supabase details from their official docs linked in docs/TECH.md section 8.
- Dates stored in UTC, shown in the user's local time.
- Latest 2 versions of Chrome, Safari and Firefox; all buttons reachable by keyboard.
