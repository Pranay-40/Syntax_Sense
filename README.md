# Syntax Sense: Code Explainer and Debugging Assistant (RAG)

An intelligent full-stack Retrieval-Augmented Generation (RAG) web application that helps developers understand code, diagnose bugs, and receive verified fixes with strict chunk citations to official documentation and repositories.

## ✨ Key Features
- **Knowledge Ingestion (3 Modalities):**
  - **Pasted Text:** Markdown or plain text notes with automatic topic detection.
  - **Document Upload:** In-memory PDF, DOCX, and TXT parsing with page tracking.
  - **Public GitHub Repositories:** In-memory repository ZIP download, smart language filtering, directory tree builder, and file detail previews.
- **Local Embeddings & Vector Storage:**
  - Embeddings generated locally via `sentence-transformers` (`BAAI/bge-small-en-v1.5`, 384 dimensions).
  - High-performance vector similarity search using Supabase PostgreSQL + `pgvector` HNSW cosine indexing.
- **Grounded AI Diagnosis:**
  - Powered by Gemini `gemini-3.8-flash` with structured output schemas.
  - Strict evidence citations (`[1]`, `[2]`) linked directly to retrieved documentation chunks.
  - Anti-hallucination guardrails: flags insufficient evidence when chunks fall below the 0.60 similarity threshold and marks unbacked claims as *"From the code only"*.
  - Code safety guarantee: user submitted code is strictly analyzed as text and never executed.
- **Session & History:**
  - User authentication with email and password.
  - Full question history with preserved citation snapshots that survive source deletions.
  - Responsive design adapting from mobile (360px) to desktop (1280px+).

## 🛠️ Tech Stack
- **Backend:** Python 3.13, Django 6.1
- **Database:** Supabase PostgreSQL with `pgvector`
- **Embedding Model:** `sentence-transformers` (`BAAI/bge-small-en-v1.5`)
- **LLM:** Google GenAI (`gemini-3.8-flash`)
- **Frontend:** Django Templates + Vanilla CSS + Vanilla JS

## 🚀 Getting Started Locally

### 1. Prerequisites
- Python 3.11+
- A Supabase project with `pgvector` enabled
- A Google Gemini API key

### 2. Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/Pranay-40/Syntax_Sense.git
   cd Syntax_Sense
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```env
   DEBUG=True
   SECRET_KEY=your-django-secret-key
   DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:5432/postgres
   GEMINI_API_KEY=your-gemini-api-key
   ```

4. Run migrations & seed data:
   ```bash
   python manage.py migrate
   python manage.py seed
   ```

5. Start the development server:
   ```bash
   python manage.py runserver 127.0.0.1:8000
   ```

6. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.  
   Demo credentials: `demo@example.com` / `change-me-too` (or register a new user).
