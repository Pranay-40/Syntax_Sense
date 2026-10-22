import threading
from django.conf import settings
from sentence_transformers import SentenceTransformer
from pgvector.django import CosineDistance
from kb.models import Chunk, EvidenceStatus

_model = None
_model_lock = threading.Lock()

def get_embedding_model():
    """Load the sentence-transformers model once per server process."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                model_name = getattr(settings, 'EMBEDDING_MODEL_NAME', 'BAAI/bge-small-en-v1.5')
                _model = SentenceTransformer(model_name)
    return _model

def embed_chunks(texts):
    """
    Generate normalized embeddings for source chunks (no query prefix).
    Returns a list of 384-dimensional float lists.
    """
    model = get_embedding_model()
    embeddings = model.encode(texts, batch_size=32, normalize_embeddings=True, show_progress_bar=False)
    return embeddings.tolist()

def embed_query(query_text):
    """
    Generate normalized embedding for user query/question.
    bge-small-en-v1.5 requires query prefix: 'Represent this sentence for searching relevant passages: '
    """
    model = get_embedding_model()
    prompted_query = f"Represent this sentence for searching relevant passages: {query_text}"
    embedding = model.encode(prompted_query, normalize_embeddings=True, show_progress_bar=False)
    return embedding.tolist()

def retrieve_relevant_chunks(query_text: str, source_ids: list, user, limit: int = 8):
    """
    Retrieve top relevant chunks from Supabase using pgvector CosineDistance.
    Filters by similarity threshold (settings.SIMILARITY_THRESHOLD, default 0.60).
    Returns: (kept_chunks_list, evidence_status)
    Each item in kept_chunks_list is a dict:
    {
      'chunk': Chunk model instance,
      'rank': 1-8,
      'score': float, # Cosine similarity (1.0 - distance)
      'source_name': str,
      'file_path': str,
      'page_number': int | None,
      'start_line': int | None,
      'end_line': int | None,
      'text': str,
      'label': str,
    }
    """
    threshold = getattr(settings, 'SIMILARITY_THRESHOLD', 0.60)

    if not source_ids:
        return [], EvidenceStatus.NO_SOURCES

    query_embedding = embed_query(query_text)

    # Query candidate chunks ordered by CosineDistance
    candidate_chunks = (
        Chunk.objects.filter(
            source__owner=user,
            source_id__in=source_ids,
            source__status='READY'
        )
        .select_related('source', 'source_file')
        .annotate(distance=CosineDistance('embedding', query_embedding))
        .order_by('distance')[:limit]
    )

    kept_chunks = []
    for rank, chunk in enumerate(candidate_chunks, start=1):
        # In pgvector with normalized vectors:
        # distance = 1 - cosine_similarity  =>  cosine_similarity = 1 - distance
        score = 1.0 - float(chunk.distance)
        if score < threshold:
            continue

        label_parts = [chunk.source.name, chunk.source_file.path]
        if chunk.page_number:
            label_parts.append(f"Page {chunk.page_number}")
        elif chunk.start_line and chunk.end_line:
            label_parts.append(f"Lines {chunk.start_line}-{chunk.end_line}")
        saved_label = " - ".join(label_parts)

        kept_chunks.append({
            'chunk': chunk,
            'rank': rank,
            'score': round(score, 4),
            'source_name': chunk.source.name,
            'source_id': chunk.source_id,
            'file_id': chunk.source_file_id,
            'file_path': chunk.source_file.path,
            'page_number': chunk.page_number,
            'start_line': chunk.start_line,
            'end_line': chunk.end_line,
            'text': chunk.text,
            'label': saved_label,
        })

    if not kept_chunks:
        return [], EvidenceStatus.INSUFFICIENT

    return kept_chunks, EvidenceStatus.SUFFICIENT
