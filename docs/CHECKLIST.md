# CHECKLIST: Code Explainer and Debugging Assistant (RAG)

Manual verification checklist for milestones M0, M1, and M2. Each item corresponds directly to a "Done when" from PRD Section 5 or an edge case from PRD Section 7.

## M0: Foundation
- [x] **M0-1 (Project Setup & Models):** All tables defined in PRD/TECH created in Supabase through a single migration `kb/migrations/0001_initial.py` with `VectorExtension()` and HNSW index.
- [x] **M0-2 (Seed Command):** `python manage.py seed` creates demo user (`demo@example.com`, `SEED_PASSWORD`) and a demo TEXT source with real embeddings and chunks.
- [x] **M0-3 (Auth F1):** Visitor can register a new account, log in with credentials, and log out.
- [x] **M0-4 (Auth F1 - Invalid):** Wrong password on login shows "Wrong email or password".
- [x] **M0-5 (Auth F1 - Protection):** Opening `/sources` while logged out redirects to `/login`.
- [x] **M0-6 (Sources List F2):** `/sources` displays real source rows for the logged-in user from the database.
- [x] **M0-7 (Sources List Isolation F2):** Another user's sources never appear in the logged-in user's list.
- [x] **M0-8 (Check & Startup):** `python manage.py check` passes with 0 errors.

## M1: All Features (F3 - F15)
### Sources & Ingestion
- [x] **F3 (Add Pasted Text):** Paste text with a name, click Add -> creates source that transitions to READY with real chunks and embeddings, visible in `/sources`.
- [x] **F4 (Upload PDF):** Upload a small valid PDF -> creates READY source with extracted text, page numbers, chunks.
- [x] **F4 (Upload DOCX):** Upload a small valid DOCX -> creates READY source with extracted text and chunks.
- [x] **F4 (Upload TXT):** Upload a small valid TXT -> creates READY source with extracted text and chunks.
- [x] **F4 (Upload .doc rejected):** Uploading `.doc` shows clear error and creates no READY source.
- [x] **F4 (Upload >5MB rejected):** Uploading a file > 5 MB shows a clear size limit error.
- [x] **F4 (Upload empty rejected):** Uploading an empty file shows a clear error.
- [x] **F5 (Add GitHub Repo):** Paste a public github.com repo URL -> downloads in memory, filters supported files, creates READY source with folder tree and file counts.
- [x] **F5 (Add GitHub Repo - Invalid):** Non-existent or private repo shows "Repository not found or not public".
- [x] **F6 (Processing Status):** Source transitions through PROCESSING to READY (or FAILED with error message) and status persists across server restarts.
- [x] **F7 (Delete Source):** Owner can delete a source; source, source files, and chunks are removed from database.
- [x] **F7 (Delete Isolation):** Non-owner cannot delete another user's source (returns 403).

### Explorer
- [x] **F8 (Explorer Documents):** Opening `/sources/:id` for document shows topic, extracted text with page markers, chunk count, and status per file.
- [x] **F9 (Explorer Repository):** Opening `/sources/:id` for GitHub repo shows folder tree, counts (total / supported / skipped), and supported-file list.
- [x] **F9 (File Detail Code Preview):** Clicking a file in repo explorer opens `/sources/:id/files/:fileId` showing code preview with line numbers and list of chunks.

### Ask & RAG
- [x] **F10 (Ask Validation):** Submitting empty code and empty question together displays an error.
- [x] **F10 (Ask Flow):** Submitting code + question with ticked source(s) runs retrieval + Gemini and navigates to `/questions/:id`.
- [x] **F11 (Grounded Answer):** Answer page displays explanation, possible bugs, suggested fixes with chunk citations matching retrieved chunks.
- [x] **F12 (Insufficient Evidence):** Asking a question unrelated to the sources displays "Not enough evidence in your sources" and unbacked claims are labeled "From the code only, not from your documents".
- [x] **F12 (No Sources Ticked):** Unticking all sources still allows Ask; answer is labeled "No sources searched" and all items labeled "From the code only".
- [x] **F13 (Retrieved Chunks Inspector):** Answer page lists retrieved chunks (source name, page/lines, similarity score, text, used-in-answer badge); clicking a citation scrolls to the chunk.
- [x] **F14 (History List):** `/questions` lists past questions newest first, showing time, first line, and evidence status.
- [x] **F14 (History Detail & Deletion Survival):** Clicking a history row opens saved answer and preserved retrieved chunks even if original source was deleted.
- [x] **F15 (No Code Execution):** Submitting code like `import os; os.system("echo hacked > /tmp/x")` only explains code; `/tmp/x` is not created.

## M2: Edge Cases & Polish
- [x] **EC-1 (Password length):** Passwords < 8 or > 128 characters are rejected.
- [x] **EC-2 (Pasted text limit):** Pasted text > 100,000 chars is rejected with limit error.
- [x] **EC-3 (Repo limits):** Repo ZIP > 10 MB or > 100 files or file > 100 KB is enforced per limits.
- [x] **EC-4 (Max chunks):** Maximum 500 chunks per source limit enforced.
- [x] **EC-5 (Duplicate Email):** Registering an existing email returns "Email already in use" (409).
- [x] **EC-6 (401/403 Permissions):** Unauthorized API returns 401; cross-user access returns 403.
- [x] **EC-7 (Empty States):** "No sources yet" on `/sources` and "No questions yet" on `/questions`.
- [x] **EC-8 (In-Flight Ask Lock):** Submitting multiple concurrent asks for the same user is locked.
- [x] **EC-9 (Responsive Layout):** Fully usable at 360px and 1280px widths.
