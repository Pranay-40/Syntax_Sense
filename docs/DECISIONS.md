# DECISIONS: Architecture & Implementation Log

Log of technical choices, small naming decisions, and implementation details made during development according to RULES.md section 3.

| Date | Scope / Area | Decision | Rationale |
| --- | --- | --- | --- |
| 2026-10-22 | Documentation | Initialized docs/ directory with RULES.md, PRD.md, TECH.md, CHECKLIST.md, and DECISIONS.md | Comply with instructions and maintain docs as single source of truth |
| 2026-10-22 | Project Structure | Standard Django project `config/` with apps `accounts` and `kb` | Follows folder structure specified in PRD/TECH |
| 2026-10-22 | Database Auth | Lower-cased email stored in Django User.username | Satisfies email login requirement without custom user model |
| 2026-10-22 | Similarity Metric | Cosine similarity with pgvector (`vector_cosine_ops` HNSW index, threshold 0.60) | Per TECH.md specification |
| 2026-10-22 | In-Flight Lock | Storing an `is_asking` flag in user session or DB lock during Ask processing | Enforces one in-flight Ask per user without extra queueing libraries |
| 2026-10-22 | Supabase Connection | Used session pooler port 5432 (`aws-0-ap-northeast-2.pooler.supabase.com`) with percent-encoded credentials | Resolves Windows IPv4-only network DNS resolution of Supabase IPv6 direct hostname |
| 2026-10-22 | RLS Verification | Enabled RLS on all 5 kb tables in migration 0001; verified Django role reads and writes successfully | Resolves UNVERIFIED note in TECH.md Section 7 |
| 2026-10-22 | Local Embeddings | Reusable thread-safe singleton loader `get_embedding_model` in `kb/rag/retrieval.py` | Avoids redundant reloads of bge-small model across requests |
| 2026-10-22 | In-Memory Extraction | Text, PDF, DOCX, and GitHub ZIP archives read strictly in-memory via io.BytesIO | Prevents disk writes and protects against zip-slip and symlink vulnerabilities |
| 2026-10-22 | Citation Sanitization | Server strips any citation indices outside retrieved range 1..N before DB persistence | Guarantees grounding integrity against hallucinated chunk numbers |
| 2026-10-22 | Deletion Survival | RetrievedChunk stores `saved_label` and `saved_text` with nullable `chunk_id` FK | Ensures past questions remain readable and cited even if parent Source is deleted |
