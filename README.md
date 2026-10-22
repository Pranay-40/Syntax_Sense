# SyntaxSense: Code Explainer and Debugging Assistant (RAG)

An intelligent, full-stack Retrieval-Augmented Generation (RAG) web application that empowers developers to understand code, detect bugs, and implement verified fixes grounded strictly in official documentation and GitHub repositories.

Built with **Django 6.1**, **Supabase `pgvector`**, local **`sentence-transformers`** dense embeddings, and **Google Gemini 3.8 Flash**.

---

## 📸 Application Preview

### 1. Interactive Ask & Code Diagnosis Interface
Submit code snippets with 1-click test presets, real-time character meters, code utility controls, and interactive knowledge source selector cards.

![SyntaxSense Ask Interface](docs/images/app_ask_screen.png)

---

### 2. Evidence-Grounded Answer & Citation Inspector
View explanations, potential bug diagnoses, and suggested code fixes with clickable `Chunk [n] ↗` citation badges and side-by-side retrieved chunk inspector.

![SyntaxSense Diagnosis & Retrieved Chunks](docs/images/app_answer_screen.png)

---

### 3. Multi-Modal Knowledge Source Management
Manage documentation from pasted markdown notes, uploaded PDF / DOCX / TXT files, or live public GitHub repositories.

![SyntaxSense Knowledge Sources](docs/images/app_sources_screen.png)

---

## 🏛️ System Architecture

The following diagram illustrates the complete architectural pipeline of SyntaxSense, showing data ingestion, vector indexing, dense semantic search, structured LLM generation, and citation verification:

```mermaid
flowchart TD
    subgraph Client ["Client Browser (Vanilla JS + Neo-Grotesque UI)"]
        UI_Ask["Ask & Code Editor Screen"]
        UI_Answer["Answer & Citation Inspector"]
        UI_Sources["Knowledge Source Manager"]
    end

    subgraph Django ["Django Application Server"]
        AuthView["Authentication & Security Guard"]
        IngestService["Ingestion Pipeline (PDF/DOCX/TXT/GitHub)"]
        Chunker["AST & Document Chunking Engine"]
        Retriever["Vector Retrieval Engine (Cosine Distance)"]
        PromptBuilder["Strict Prompt Synthesizer"]
        CitationValidator["Citation Validator & Sanitizer"]
    end

    subgraph EmbeddingEngine ["Local Machine Learning Engine"]
        BGE["sentence-transformers\n(BAAI/bge-small-en-v1.5)\n384 Dimensions (Local PyTorch)"]
    end

    subgraph Supabase ["Supabase PostgreSQL + pgvector"]
        SourceTable[("Source & SourceFile Tables")]
        ChunkTable[("Chunk Table\n(HNSW Cosine Vector Index)")]
        QuestionTable[("Question & RetrievedChunk Tables\n(Immutable Snapshot Storage)")]
    end

    subgraph GoogleAI ["Google GenAI Platform"]
        Gemini["gemini-3.8-flash\n(Structured Output Schema)"]
    end

    %% Ingestion Flow
    UI_Sources -->|"1. Upload file, text, or GitHub URL"| IngestService
    IngestService -->|"2. Split into ~1,200 chars / ~40 lines"| Chunker
    Chunker -->|"3. Batch dense embeddings"| BGE
    BGE -->|"4. Return 384-dim vectors"| IngestService
    IngestService -->|"5. Store chunks & embeddings"| ChunkTable
    IngestService -->|"5. Store metadata"| SourceTable

    %% Retrieval & Generation Flow
    UI_Ask -->|"6. Submit code + question + source IDs"| Retriever
    Retriever -->|"7. Embed query text"| BGE
    BGE -->|"8. Return query vector"| Retriever
    Retriever -->|"9. HNSW Cosine Similarity Query (<0.60 threshold)"| ChunkTable
    ChunkTable -->|"10. Return Top 8 relevant chunks"| Retriever
    Retriever -->|"11. Build strict DATA ONLY prompt"| PromptBuilder
    PromptBuilder -->|"12. Send prompt + context chunks"| Gemini
    Gemini -->|"13. Return JSON (Explanation, Bugs, Fixes, Citations)"| CitationValidator
    CitationValidator -->|"14. Verify citations match retrieved chunks"| QuestionTable
    QuestionTable -->|"15. Persist question & chunk snapshots"| UI_Answer
```

---

## 🔄 End-to-End Working Flow

### Phase 1: Multi-Modal Knowledge Ingestion
1. **Pasted Text:** Users paste text or Markdown documentation. The pipeline determines topics from headers, splits content on paragraph boundaries (~1,200 chars, 150-char overlap), and enforces a 100,000-character cap.
2. **File Uploads:** In-memory extraction of `.pdf` (page-by-page via `pypdf`), `.docx` (via `python-docx`), and `.txt` files up to 5 MB. Legacy `.doc` files are rejected with clear error guidance.
3. **Public GitHub Repositories:** Downloads repository zipballs in memory from GitHub REST API (up to 10 MB, 100 supported files, 100 KB/file). It parses supported programming and markup files (`.py`, `.js`, `.ts`, `.go`, `.rs`, `.html`, etc.), generating directory tree structures while filtering build artifacts and dependencies (`.git`, `node_modules`, `dist`).

### Phase 2: Local Vector Indexing (Zero External Data Leakage)
1. **Local Embeddings:** Text and code chunks are transformed into 384-dimensional dense vector embeddings entirely locally using `sentence-transformers` (`BAAI/bge-small-en-v1.5`). Raw documentation is never sent to third-party embedding APIs.
2. **Supabase `pgvector` HNSW Index:** Chunks and embeddings are persisted to Supabase PostgreSQL using an `HnswIndex` with cosine vector operations (`vector_cosine_ops`), enabling sub-millisecond similarity lookups.

### Phase 3: Ask & Code Diagnosis Query
1. Users submit a code snippet (up to 20,000 characters) and a specific question or error description (up to 2,000 characters).
2. The user selects which knowledge sources to query via interactive source selection cards, or unticks all sources to analyze code in isolation.

### Phase 4: Cosine Retrieval & Evidence Threshold Guard
1. The search query combines the user's question with the first 500 characters of the code snippet.
2. Local dense embeddings are generated for the search query.
3. A cosine distance query retrieves the **Top 8 chunks** across the selected sources.
4. **Similarity Threshold Check (0.60):**
   - If chunks meet or exceed the `0.60` cosine threshold, evidence status is marked **`SUFFICIENT`**.
   - If all retrieved chunks score below `0.60`, evidence status is marked **`INSUFFICIENT`**.
   - If no sources were selected, evidence status is marked **`NO_SOURCES`**.

### Phase 5: Grounded LLM Generation & Citation Enforcement
1. The server constructs a strict prompt where retrieved chunks are provided as static numbered reference data (`--- CHUNK [1] ---`).
2. Gemini (`gemini-3.8-flash`) executes structured generation producing structured explanations, bug diagnoses, code fixes, and list of citation integers `[1, 2]`.
3. **Anti-Hallucination & Sanitization:**
   - The server inspects returned citation numbers and removes any citations that do not match an actually retrieved chunk.
   - For `INSUFFICIENT` evidence, the app explicitly displays **"Not enough evidence in your sources"** and labels ungrounded claims as **"From the code only, not from your documents"**.
   - The system strictly adheres to the rule: *Never state "the documentation says" without a verified citation*.

### Phase 6: Snapshot Persistence & Interactive Inspection
1. The entire diagnosis, along with frozen snapshots of retrieved chunk texts, similarity scores, and labels, is persisted atomically in the database (`Question` and `RetrievedChunk` models).
2. **Deletion Survival:** If a user deletes a source later on, foreign keys are nullified (`on_delete=models.SET_NULL`), while frozen chunk texts and citation records in history remain intact.
3. Users can hover over citation badges for instant peek popovers or click to smoothly scroll to the exact chunk in the inspector.

---

## ✨ Key Features & Interactive Polish

- **⚡ 1-Click Quick Presets:** Instant test snippets for requests JSON decoding, SQL injection vulnerability checks, and async deadlock resolution.
- **📋 Code Utility Bar:** Floating bar with language selector, dynamic character progress counter, 1-click clipboard copy with feedback animation, and clear action.
- **🗂️ Interactive Source Cards Grid:** Modern cards with file kind badges, chunk counts, and live selection toggles.
- **🔍 Hover-to-Peek Citation Popovers:** Real-time floating popover displaying chunk title, cosine match score, and excerpt on badge hover.
- **📊 Visual Evidence Confidence Meter:** Active status card displaying match confidence percentage and threshold verification.
- **➕ FAQ Accordion:** Clean numbered accordion drawer explaining vector retrieval mechanics, evidence rules, and code safety.
- **🛡️ 100% Code Safety:** User-submitted code and repository files are strictly processed and stored as text—never compiled, evaluated, or executed.

---

## 🛠️ Tech Stack

| Component | Technology | Version / Model |
| :--- | :--- | :--- |
| **Backend Framework** | Django | `6.1.2` |
| **Database** | Supabase PostgreSQL + `pgvector` | `0.5.1` / `psycopg 3.3.6` |
| **Vector Index** | HNSW Index (Cosine Ops) | 384 Dimensions |
| **Embeddings** | `sentence-transformers` | `BAAI/bge-small-en-v1.5` |
| **Large Language Model** | Google GenAI SDK | `gemini-3.8-flash` |
| **Document Extractors** | `pypdf`, `python-docx` | `pypdf 6.21.2`, `python-docx 1.2.0` |
| **Frontend** | Django Templates + Vanilla CSS + JS | Neo-Grotesque Design System |
| **Typography** | Google Fonts | *Plus Jakarta Sans* & *JetBrains Mono* |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.11+ (tested on Python 3.13)
- Supabase account with `pgvector` extension enabled
- Google Gemini API key

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Pranay-40/Syntax_Sense.git
cd Syntax_Sense

# Install pinned dependencies
pip install -r requirements.txt
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and provide your database connection and Gemini API key:
```env
DEBUG=True
SECRET_KEY=your-django-secret-key
DATABASE_URL=postgresql://postgres.your-project-ref:your-password@aws-0-region.pooler.supabase.com:5432/postgres
GEMINI_API_KEY=your-gemini-api-key
```

### 4. Database Setup & Seeding
```bash
# Apply single initial migration with pgvector extension
python manage.py migrate

# Seed demo user and Python Requests documentation source
python manage.py seed
```

### 5. Run Development Server
```bash
python manage.py runserver 127.0.0.1:8000
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.
- **Demo Login:** `demo@example.com` / `change-me-too` (or register a new user).

---

## 📜 License
MIT License. Built for developers who want verifiable, grounded code assistance without hallucinations.
