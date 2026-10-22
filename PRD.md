# PRD: Code Explainer and Debugging Assistant (RAG)

## 1. Goal
Programming students get answers from general AI tools that may not match the documentation or code they are actually working with. This web app lets a student add knowledge sources (pasted text, PDF/DOCX/TXT files, or a public GitHub repository), then submit code and a question or error. The app retrieves the most relevant chunks from those sources and asks Gemini to explain the code, point out likely bugs and suggest fixes, citing the chunks it used. Success: every answer shows which chunks backed it, and when the sources do not contain enough evidence the app says so instead of claiming the documentation says something.

## 2. Scope
**Will build:**
- Sign up, login, logout
- Knowledge sources: paste text, upload PDF / DOCX / TXT, add a public GitHub repository by link
- Processing pipeline: extract text, split into chunks, create embeddings, store in Supabase (PostgreSQL + pgvector), show status
- Knowledge Base Explorer: document view (topic, extracted text, page references, chunk count, status) and repository view (folder tree, file counts, supported files, code preview)
- Ask page: code + question, choose which sources to search
- Answer page: explanation, possible bugs, suggested fixes, citations, "not enough evidence" notice, and the list of retrieved chunks
- History of past questions
- Code is analyzed as text only and never executed

**Will NOT build (do not add these):**
- Running, compiling or sandboxing user code
- Private GitHub repositories, GitHub login, cloning with git, pull requests or commits to GitHub
- Legacy `.doc` files (only `.docx`), images, scanned-PDF OCR, audio, video
- Chat threads or follow-up conversations (each question is one independent request)
- Streaming answers, voice input, code editor with syntax highlighting, autocomplete
- Social login, email verification, password reset emails, notifications
- Admin dashboard or analytics (Django admin is NOT installed), payments, teams, sharing sources between users
- Background job queues, scheduled re-sync of repositories, re-indexing UI
- Multi-language UI (English only), mobile app, dark mode
- Fine-tuning, multiple AI providers, model picker

## 3. Roles
| Role | Can do | Cannot do |
| --- | --- | --- |
| Visitor | See /login and /register, sign up, log in | See any other page or API data |
| User | Add, view and delete own sources; ask questions; view own history | See or use another user's sources, files, questions or chunks (gets 403) |

No Admin role.

## 4. Screens and user flow
| Screen | URL | Main elements | Action and result |
| --- | --- | --- | --- |
| Register | /register | Email, password, Create account button, link "Log in" | Valid input creates the account, logs in, goes to /; duplicate email shows "Email already in use"; link goes to /login |
| Login | /login | Email, password, Log in button, link "Create account" | Valid login goes to /; invalid shows "Wrong email or password"; link goes to /register |
| Ask (home) | / | Navbar (Ask, Sources, History, Log out); code box; language dropdown (optional); question box; source checkboxes (all ready sources ticked by default); Ask button | Ask saves the question, runs retrieval + Gemini, then opens /questions/{id}; no ready source shows "Add a source first" with a button to /sources/new; unticking every source still allows Ask, and the answer is labeled "No sources searched" |
| Sources | /sources | Table: name, type, status, files, chunks, created; Add source button; row link; Delete button per row | Add source opens /sources/new; row link opens /sources/{id}; Delete asks to confirm, then removes the source and its chunks and refreshes the list |
| Add source | /sources/new | Three tabs: Paste text (name, text box), Upload file (file picker), GitHub link (URL box); Add button | Add shows "Processing…", then goes to /sources/{id}; on failure stays on the page with the error message |
| Source explorer | /sources/{id} | Header: name, type, status, file count, chunk count; for documents: list of files with topic, pages, chunk count, status; for GitHub: folder tree, counts (total / supported / skipped), supported-file list; Back link; Delete button | A file row opens /sources/{id}/files/{fileId}; Back goes to /sources; Delete confirms, then goes to /sources |
| File detail | /sources/{id}/files/{fileId} | Topic, extracted text (documents, with page markers) or source-code preview (repo files, with line numbers), list of its chunks (number, page or line range, text) | Back link returns to /sources/{id} |
| Answer | /questions/{id} | Submitted code and question; Explanation; Possible bugs; Suggested fixes; Evidence notice; Citations (click scrolls to the chunk); Retrieved chunks panel (source, page/lines, similarity score, text, "used in answer" mark); Ask another button | Ask another opens /; a citation click shows that chunk in the panel; a chunk's source link opens its file at /sources/{id}/files/{fileId} |
| History | /questions | List: time, first line of question, evidence status; row link | Row link opens /questions/{id}; empty list shows "No questions yet" and an Ask button to / |

Main flow:
1. User registers or logs in.
2. User adds a source and waits until its status is Ready; optionally opens the explorer to check what was extracted.
3. User pastes code, writes the question, picks sources, clicks Ask.
4. User reads the answer, checks citations and retrieved chunks.

## 5. Features (one ID each)
| ID | Feature | Done when |
| --- | --- | --- |
| F1 | Sign up, login, logout | A new user can register, log in and log out; a wrong password shows an error; opening /sources while logged out redirects to /login |
| F2 | Sources list | /sources shows the logged-in user's real source rows from the database (name, type, status, counts); another user's rows never appear |
| F3 | Add pasted text | Pasting text and clicking Add creates a source that reaches status Ready and appears in /sources after a page refresh |
| F4 | Upload PDF / DOCX / TXT | Uploading a small PDF, DOCX and TXT each creates a Ready source; a `.doc`, a file over the size limit or an empty file shows a clear error and no source stays in the list as Ready |
| F5 | Add GitHub repository | Pasting a public github.com repo link creates a Ready source whose explorer shows the folder tree and file counts; a non-existent or private repo shows "Repository not found or not public" |
| F6 | Processing status | A source shows Processing, then Ready or Failed; Failed shows the reason; the status survives an app restart |
| F7 | Delete source | Delete removes the source, its files and chunks; it no longer appears after refresh; only the owner can delete (others get 403) |
| F8 | Explorer: documents | Opening a document source shows topic, extracted text with page markers (PDF), chunk count and status for each file |
| F9 | Explorer: repository | Opening a GitHub source shows the folder tree, total / supported / skipped file counts, and a code preview with line numbers when a file is clicked |
| F10 | Ask with code | Submitting code, a question and at least one ticked source saves a question row and opens its answer page; empty code and empty question together shows an error |
| F11 | Grounded answer | The answer page shows explanation, possible bugs and suggested fixes; every statement that relies on the sources carries a citation that matches a retrieved chunk |
| F12 | Insufficient-evidence notice | Asking about something absent from the sources shows "Not enough evidence in your sources" and any content not backed by a chunk is labeled "From the code only, not from your documents" |
| F13 | Retrieved chunks inspector | The answer page lists the chunks sent to Gemini with source, page or lines, similarity score and text |
| F14 | History | /questions lists the user's past questions, newest first; each opens its saved answer with the same chunks, even after the source was deleted |
| F15 | No code execution | Submitting code such as `import os; os.system("echo hacked > /tmp/x")` returns an explanation and the file `/tmp/x` is not created |

## 6. Data (main entities)
- **User** (Django built-in): id, email (used as username, unique), password hash, created at
- **Source**: id, owner (User), name, kind (TEXT / FILE / GITHUB), origin URL (GitHub only), status (PENDING / PROCESSING / READY / FAILED), error message, file count, chunk count, created at
- **SourceFile**: id, source, path (file name or repo path), kind (DOCUMENT / CODE), language, topic, page count, extracted text, size, status (READY / SKIPPED / FAILED), skip reason, chunk count
- **Chunk**: id, source, source file, position, text, page number, start line, end line, embedding (384 numbers)
- **Question**: id, owner (User), code, language, question text, source ids, answer (JSON), evidence status (SUFFICIENT / INSUFFICIENT), created at
- **RetrievedChunk**: id, question, chunk (kept empty if the chunk is later deleted), rank, similarity score, saved label, saved text, cited (yes/no)
- Relationships: a User has many Sources and Questions; a Source has many SourceFiles; a SourceFile has many Chunks; a Question has many RetrievedChunks.

## 7. Rules and edge cases
- Required fields: email + password on sign up; source name + text for pasted text; code or question (at least one) to ask; at least one source ticked, or the code is analyzed alone and the answer is labeled "No sources searched".
- Limits (sized for the Gemini free tier): password 8-128 chars; pasted text up to 100,000 characters; uploaded file up to 5 MB; repository ZIP up to 10 MB, up to 100 supported files, each file up to 100 KB; at most 500 chunks per source; code box up to 20,000 characters; question up to 2,000 characters; retrieve the top 8 chunks. A source over a limit is rejected with a message naming the limit. If Gemini answers "rate limit reached" (HTTP 429) when asking, the app waits and retries a few times, then shows "AI rate limit reached, try again later". (ASSUMPTION: values may change after testing.)
- Duplicate: an email already registered shows "Email already in use".
- Supported repo files: common source and text files (py, js, ts, java, c, cpp, h, cs, go, rs, rb, php, html, css, sql, md, txt, json, yaml, toml). Everything else, plus `.git`, `node_modules`, build folders and binaries, is listed as Skipped with a reason.
- Evidence rule: if no retrieved chunk reaches the similarity threshold (starts at 0.60 cosine similarity, tunable in settings), the answer page says "Not enough evidence in your sources". The app never writes "the documentation says..." without a citation to a retrieved chunk. The server removes any citation that does not match a chunk it retrieved.
- Retrieved text is treated as data, never as instructions to the model.
- Empty state: no sources shows "No sources yet" and an Add source button; no history shows "No questions yet".
- Errors: Gemini or network failure shows "The AI service did not respond. Try again." with a Retry button and saves nothing as an answer; a failed source shows its reason.
- Permissions: opening another user's source, file, question or chunk returns 403; logged-out requests redirect to /login (pages) or return 401 (API).
- Code safety: submitted code and repository files are stored and sent as text only; nothing from them is executed, imported or compiled.

## 8. Milestones
| Milestone | Includes | Done when |
| --- | --- | --- |
| M0 Foundation | Project setup, connection to Supabase, the COMPLETE database schema (all tables, one migration, pgvector enabled), seed command (one demo user, one demo source), F1 login/logout/register, F2 sources list: one real table (Source), one API route (GET /api/sources), one page (/sources) showing real rows | App runs; all tables exist in Supabase; the seed user can log in; /sources shows the seeded source from the database |
| M1 Build all features | F3 to F15: all API routes first, then all screens | Every feature's "Done when" works in the browser |
| M2 Test and polish | One full manual test pass using docs/CHECKLIST.md (no automated test framework), empty and error states, responsive layout | Every edge case in section 7 behaves as written |
| M3 Extras (optional) | Hosting the Django app online (only when I ask; the database is already Supabase) and any items I mark "later" in section 2 (none yet) | Only if I ask for it |

## 9. Open questions and assumptions
- ASSUMPTION: Users have accounts (email + password) so each person's sources and history are private.
- ASSUMPTION: "Document topics" means the file title or first heading, not an AI-written summary.
- ASSUMPTION: Processing runs inside the upload request (no background queue), so limits in section 7 are small.
- ASSUMPTION: Only `.docx` is supported; `.doc` is rejected with a clear message.
- ASSUMPTION: M0 follows your "one table, one route, one page" rule while still creating all tables in one migration, as the template requires.
- ASSUMPTION: You have a Supabase project and use it from M0, also while running locally (no Docker, no local PostgreSQL). DATABASE_URL goes in `.env`; if the direct connection fails on your network, use the session-pooler string from Supabase's Connect dialog.
- ASSUMPTION: Embeddings are generated locally in Python (sentence-transformers, `BAAI/bge-small-en-v1.5`), at your request; the first run downloads the model and the install is large (PyTorch).
- ASSUMPTION: You use the Gemini free tier, so limits in section 7 are small and rate-limit errors are expected when asking.
- ASSUMPTION: Ask works with no source ticked and the answer is labeled "No sources searched" (your answer).
- ASSUMPTION: The app runs only on your computer until M3; hosting is not part of M0 to M2.
- ASSUMPTION: Only the top 8 relevant chunks, plus the code and question the user typed, are ever sent to Gemini; never whole files. Source text is not sent to Google for embedding.
- ASSUMPTION: No pytest and no automated tests; testing is a manual checklist run in the app (decided from your instruction).
