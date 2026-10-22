# TECH: Code Explainer and Debugging Assistant (RAG)

## 1. Stack (use exactly these versions)
Versions checked on 2026-10-22 on PyPI and python.org.

| Layer | Technology | Version |
| --- | --- | --- |
| Language | Python | 3.14.9 |
| Framework (frontend + API) | Django (templates + JSON views) | 6.1.2 |
| Frontend | HTML, CSS, vanilla JavaScript (no framework, no build step) | n/a |
| Database | Supabase PostgreSQL + pgvector extension (used from M0, also while running locally) | managed by Supabase |
| DB driver | psycopg[binary] | 3.3.6 |
| ORM / vector | Django ORM + pgvector (Python package) | 0.5.1 |
| Auth | Django built-in sessions (email used as username) | included in Django |
| AI SDK | google-genai | 2.32.0 |
| AI generation model | `gemini-3.8-flash` | model ID, stable per Google's models page |
| Embeddings (local Python) | sentence-transformers 6.2.0 with model `BAAI/bge-small-en-v1.5` (384 dimensions, 512-token limit, MIT license); torch 2.14.1 installed with it (CPU is enough) | 6.2.0 / 2.14.1 |
| PDF text | pypdf | 6.21.2 |
| DOCX text | python-docx | 1.2.0 |
| HTTP (GitHub download) | requests | 2.34.2 |
| Config | python-dotenv 1.2.4, dj-database-url 3.1.2 | as listed |
| Tests | No test framework (no pytest). Manual checklist plus `python manage.py check` | n/a |

Approved packages: only the ones above, plus nothing else. Do NOT use the `supabase` Python package (not needed: Django talks to Postgres directly), no Celery, no DRF, no LangChain, no LlamaIndex, no Node tooling.
To add another package: add it, then tell me its name and why in one line.

## 2. UI and theme
- Layout: top navbar (Ask, Sources, History, Log out), centered content, max width 1100px; two-column layout on the answer page (answer left, retrieved chunks right) that stacks on phones
- Colors: primary #2563EB, background #F8FAFC, surface #FFFFFF, text #0F172A, muted text #64748B, error #B91C1C, success #15803D, warning #B45309
- Font: system font stack (`system-ui, sans-serif`); code in `ui-monospace, monospace`
- Components (one CSS file `static/css/app.css`, reuse, do not restyle per page): button, input, textarea, card, table, tabs, badge (status colors), code block with line numbers, toast, confirm dialog
- Responsive: works at 360px wide (phone) and 1280px wide (desktop)
- States every data screen must show: loading, empty, error, success

## 3. Architecture (short)
Browser (Django templates + small JS files) calls `/api/...` routes in the same Django project. API views validate input, check the user and read or write Supabase PostgreSQL through the Django ORM. Nothing talks to the database or to Gemini from the browser.

The embedding model loads once per server process on first use (first run downloads it from Hugging Face; later runs use the cached copy).
Ingest pipeline (inside the add-source request): extract text (pypdf / python-docx / UTF-8 text / GitHub ZIP read in memory, never written to disk) → split into chunks → embed locally in Python in batches of 32 with `model.encode(..., normalize_embeddings=True)` (no query prefix for chunks; no network call) → save Chunk rows → set source status.
- Chunking: documents ~1,200 characters with 150 overlap, split on paragraph breaks first; code ~40 lines or 1,500 characters per chunk, whichever is smaller (keeps each chunk under the model's 512-token limit), split on blank lines when possible, each chunk keeps path and line range; PDFs keep the page number.
- Ask pipeline: embed question (+ first 500 characters of the code) locally with the prefix `Represent this sentence for searching relevant passages: ` → cosine search with pgvector restricted to the user's ticked sources, top 8 → drop chunks below the similarity threshold (settings value, start 0.60, UNVERIFIED for this model, tune in M2) → if none remain, mark INSUFFICIENT → send system instruction, question, code and numbered chunks to Gemini asking for JSON → validate the JSON → remove citations that do not match a retrieved chunk → save Question and RetrievedChunk rows.
- Gemini JSON answer shape: `explanation[]`, `bugs[]` (title, detail, line), `fixes[]` (description, code) – each item has `chunk_numbers[]` (empty list = "From the code only"). Constraints like length are checked in our code, not trusted from the model.
- Generation prompts contain only the retrieved chunks (max 8), the user's code and question; whole source files are never sent to the generation model. Embeddings are computed on your computer; chunk text is not sent to Google for embedding.
- User code and retrieved text are placed in the prompt as quoted data with a rule that they are never instructions. Code is never executed, imported, compiled or evaluated.

## 4. Folder structure
```
manage.py
config/            settings.py, urls.py
accounts/          register, login, logout views and templates
kb/                models.py (ALL models), migrations/0001_initial.py,
                   api_sources.py, api_ask.py, api_questions.py, views.py (page shells),
                   ingest/ (extract.py, chunking.py, github.py, pipeline.py),
                   rag/ (retrieval.py, prompt.py, gemini.py),
                   management/commands/seed.py
templates/         base.html and one folder per screen
static/            css/app.css, js/ (one file per screen)
docs/CHECKLIST.md  manual test steps, one line per "Done when" and edge case
requirements.txt   exact pins from section 1
.env.example       every environment variable, with fake values
docs/              PRD.md, TECH.md, RULES.md, DECISIONS.md
```
Naming: Python files in snake_case, classes (models, components) in PascalCase, database fields in snake_case (Python/Django convention, replaces camelCase in the generic template).

## 5. Data model
| Table | Field | Type | Rules |
| --- | --- | --- | --- |
| User (auth_user) | id, username, password | Django built-in | username = lower-cased email, unique; password hashed by Django, never returned by the API |
| Source | id | bigint | primary key |
| Source | owner_id | FK User | required, cascade delete |
| Source | name | string | required, 1-100 chars |
| Source | kind | enum (TEXT, FILE, GITHUB) | required |
| Source | origin_url | string | only for GITHUB, null otherwise |
| Source | status | enum (PENDING, PROCESSING, READY, FAILED) | default PENDING |
| Source | error_message | text | null unless FAILED |
| Source | file_count, chunk_count | integer | default 0 |
| Source | created_at | datetime | default now (UTC) |
| SourceFile | id | bigint | primary key |
| SourceFile | source_id | FK Source | required, cascade delete |
| SourceFile | path | string | file name or repo path, required |
| SourceFile | kind | enum (DOCUMENT, CODE) | required |
| SourceFile | language | string | null allowed (from file extension) |
| SourceFile | topic | string | title or first heading, null allowed |
| SourceFile | page_count | integer | null unless PDF |
| SourceFile | extracted_text | text | null when SKIPPED |
| SourceFile | size_bytes | integer | required |
| SourceFile | status | enum (READY, SKIPPED, FAILED) | required |
| SourceFile | skip_reason | string | null unless SKIPPED or FAILED |
| SourceFile | chunk_count | integer | default 0 |
| Chunk | id | bigint | primary key |
| Chunk | source_id, source_file_id | FK | required, cascade delete |
| Chunk | position | integer | order within the file |
| Chunk | text | text | required |
| Chunk | page_number | integer | null unless PDF |
| Chunk | start_line, end_line | integer | null unless CODE or TXT |
| Chunk | embedding | vector(384) | required; HNSW index with `vector_cosine_ops` |
| Question | id | bigint | primary key |
| Question | owner_id | FK User | required, cascade delete |
| Question | code | text | max 20,000 chars |
| Question | language | string | null allowed |
| Question | question_text | text | max 2,000 chars |
| Question | source_ids | JSON list of integers | ticked sources |
| Question | answer | JSON | validated answer shape (section 3) |
| Question | evidence_status | enum (SUFFICIENT, INSUFFICIENT, NO_SOURCES) | required |
| Question | created_at | datetime | default now (UTC) |
| RetrievedChunk | id | bigint | primary key |
| RetrievedChunk | question_id | FK Question | required, cascade delete |
| RetrievedChunk | chunk_id | FK Chunk | set to null if the chunk is deleted |
| RetrievedChunk | rank | integer | 1-8 |
| RetrievedChunk | score | float | cosine similarity |
| RetrievedChunk | saved_label, saved_text | text | copy kept so history survives source deletion |
| RetrievedChunk | cited | boolean | default false |

Schema rule: create ALL tables above in ONE initial migration (`kb/migrations/0001_initial.py`, including `VectorExtension()` and the HNSW index) during M0. Do not add tables or fields per feature; change the schema only if I approve a change to this data model.
Seed data: `python manage.py seed` creates one demo user (`demo@example.com`, password read from env `SEED_PASSWORD`) and one small TEXT source with real chunks and embeddings, .

## 6. API routes (list; the AI writes the details)
All routes need a logged-in user except register and login. Session cookie + CSRF token (header `X-CSRFToken`).

| Method | Path | Purpose | Who | Success | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | /api/auth/register | create account and log in | anyone | 201 | 400, 409 |
| POST | /api/auth/login | log in | anyone | 200 | 401 |
| POST | /api/auth/logout | log out | user | 204 | 401 |
| GET | /api/sources | list own sources | user | 200 | 401 |
| POST | /api/sources/text | add pasted text, process | user | 201 | 400, 401, 502 |
| POST | /api/sources/upload | add PDF / DOCX / TXT, process | user | 201 | 400, 401, 413, 502 |
| POST | /api/sources/github | add public repo, process | user | 201 | 400, 401, 404, 413, 502 |
| GET | /api/sources/:id | source summary, files, folder tree, counts | owner | 200 | 401, 403, 404 |
| DELETE | /api/sources/:id | delete source, files, chunks | owner | 204 | 401, 403, 404 |
| GET | /api/sources/:id/files/:fileId | file text or code preview and its chunks | owner | 200 | 401, 403, 404 |
| POST | /api/ask | retrieve and generate answer, save question | user | 201 | 400, 401, 403, 502 |
| GET | /api/questions | list own questions | user | 200 | 401 |
| GET | /api/questions/:id | saved answer and retrieved chunks | owner | 200 | 401, 403, 404 |

Page routes (Django views returning templates): /register, /login, /, /sources, /sources/new, /sources/:id, /sources/:id/files/:fileId, /questions, /questions/:id.
Error format for every API route: `{ "error": { "code": "STRING", "message": "Readable text" } }`

## 7. Security
- Passwords hashed by Django's default hasher. Never stored or logged in plain text.
- Check login and ownership on the server for every protected page and route; return 403 for another user's record.
- Secrets and keys only in `.env`; `.env` is in `.gitignore`. Never write a real key in any file or log.
- Never execute user code or repository code. No `eval`, `exec`, `subprocess`, `importlib`, or archive extraction to disk. Read ZIP entries in memory, skip symlinks, enforce the size, file-count and path rules in PRD section 7 (protects against ZIP bombs and path tricks).
- GitHub links: accept only `https://github.com/{owner}/{repo}` and download only from `api.github.com` (no other host, no user-supplied URL fetching).
- Supabase exposes `public` tables through its Data API. Enable row level security on every table in the migration (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, no policies) or turn the Data API off, and never put Supabase API keys in the browser. UNVERIFIED: that Django's database role still reads and writes after RLS is enabled; check in M0 before continuing.
- Output shown on pages is HTML-escaped (Django default); do not use `|safe` on model, user or document text.
- Rate-limit protection: one in-flight Ask per user at a time (simple lock in the database row or session); no extra packages.

## 8. Third-party services
| Service | Used for | Docs link | Env variable |
| --- | --- | --- | --- |
| Gemini API (generation) | Explain code, find bugs, suggest fixes as JSON | https://ai.google.dev/gemini-api/docs/text-generation | GEMINI_API_KEY |
| Hugging Face model download (no account) | One-time download of `BAAI/bge-small-en-v1.5` for local embeddings | https://huggingface.co/BAAI/bge-small-en-v1.5 and https://sbert.net/docs/installation.html | none |
| Supabase (PostgreSQL + pgvector) | Store all app data and vectors | https://supabase.com/docs/guides/database/extensions/pgvector and https://supabase.com/docs/guides/database/connecting-to-postgres | DATABASE_URL |
| GitHub REST API (zipball) | Download a public repository as ZIP | https://docs.github.com/en/rest/repos/contents#download-a-repository-archive-zip | none (no token; public repos only) |

Before using a service, read its official docs and the installed package types. Do not rely on memory. Notes from research: the google-genai SDK reads `GOOGLE_API_KEY` first if both are set, so set only `GEMINI_API_KEY`; bge-small expects the query prefix for questions only, not for chunks; Supabase direct connections use IPv6, use the session pooler (port 5432) if your network is IPv4 only; do not use the transaction pooler (port 6543).

## 9. Commands
- Install: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- Set up database: `python manage.py migrate && python manage.py seed`
- Run: `python manage.py runserver` (http://localhost:8000)
- Test: no automated test framework. Follow `docs/CHECKLIST.md` in the running app (real Supabase, real Gemini) and show what you saw. Keep checks small to stay inside the Gemini free tier.
- Build / check: `python manage.py check` (there is no frontend build step)

## 10. Environment variables (.env.example)
```
# Copy the string from the Supabase Connect dialog (direct, or session pooler on port 5432 if your network is IPv4 only)
DATABASE_URL="postgresql://postgres.your-project-ref:your-password@your-pooler-host:5432/postgres?sslmode=require"
DJANGO_SECRET_KEY="change-me"
DJANGO_DEBUG="True"
GEMINI_API_KEY="your-key-here"
GEMINI_MODEL="gemini-3.8-flash"
EMBEDDING_MODEL="BAAI/bge-small-en-v1.5"
SEED_PASSWORD="change-me-too"
```
