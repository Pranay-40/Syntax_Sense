import json
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.db import transaction
from .models import Question, RetrievedChunk, Source, EvidenceStatus
from .rag.retrieval import retrieve_relevant_chunks
from .rag.gemini import call_gemini_rag, GeminiError, GeminiRateLimitError

MAX_CODE_CHARS = 20_000
MAX_QUESTION_CHARS = 2_000

@require_POST
def api_ask(request):
    """
    POST /api/ask
    Handles retrieval + Gemini generation + question saving.
    """
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": {"code": "UNAUTHORIZED", "message": "Authentication required"}},
            status=401,
        )

    # In-flight lock per user
    if request.session.get("is_asking"):
        return JsonResponse(
            {"error": {"code": "IN_FLIGHT_ASK", "message": "Another question is currently being processed. Please wait."}},
            status=429,
        )

    try:
        data = json.loads(request.body)
    except (ValueError, TypeError):
        return JsonResponse(
            {"error": {"code": "INVALID_JSON", "message": "Invalid JSON body"}},
            status=400,
        )

    code = data.get("code", "").strip()
    language = data.get("language", "").strip()
    question_text = data.get("question", "").strip()
    raw_source_ids = data.get("source_ids", [])

    # Validation: at least code or question must be present
    if not code and not question_text:
        return JsonResponse(
            {"error": {"code": "EMPTY_SUBMISSION", "message": "Please provide code, a question/error, or both."}},
            status=400,
        )

    if len(code) > MAX_CODE_CHARS:
        return JsonResponse(
            {"error": {"code": "CODE_TOO_LONG", "message": f"Code box exceeds {MAX_CODE_CHARS:,} characters limit"}},
            status=400,
        )

    if len(question_text) > MAX_QUESTION_CHARS:
        return JsonResponse(
            {"error": {"code": "QUESTION_TOO_LONG", "message": f"Question exceeds {MAX_QUESTION_CHARS:,} characters limit"}},
            status=400,
        )

    # Validate source_ids format
    source_ids = []
    if isinstance(raw_source_ids, list):
        for s_id in raw_source_ids:
            try:
                source_ids.append(int(s_id))
            except (ValueError, TypeError):
                continue

    # Verify ownership of requested sources
    if source_ids:
        owned_count = Source.objects.filter(owner=request.user, id__in=source_ids).count()
        if owned_count != len(set(source_ids)):
            return JsonResponse(
                {"error": {"code": "FORBIDDEN", "message": "Access denied to one or more selected sources"}},
                status=403,
            )

    # Acquire lock
    request.session["is_asking"] = True
    request.session.modified = True

    try:
        # Build search query: question + first 500 characters of code
        search_query_parts = []
        if question_text:
            search_query_parts.append(question_text)
        if code:
            search_query_parts.append(code[:500])
        search_query = "\n".join(search_query_parts)

        # Retrieval
        retrieved_chunks, evidence_status = retrieve_relevant_chunks(
            query_text=search_query,
            source_ids=source_ids,
            user=request.user,
            limit=8,
        )

        # Gemini generation
        answer = call_gemini_rag(
            code=code,
            language=language,
            question_text=question_text,
            chunks=retrieved_chunks,
        )

        # Identify which chunks were actually cited in the answer
        cited_chunk_indices = set()
        for item in answer.get("explanation", []):
            cited_chunk_indices.update(item.get("chunk_numbers", []))
        for item in answer.get("bugs", []):
            cited_chunk_indices.update(item.get("chunk_numbers", []))
        for item in answer.get("fixes", []):
            cited_chunk_indices.update(item.get("chunk_numbers", []))

        with transaction.atomic():
            question = Question.objects.create(
                owner=request.user,
                code=code,
                language=language or None,
                question_text=question_text,
                source_ids=source_ids,
                answer=answer,
                evidence_status=evidence_status,
            )

            retrieved_chunk_objs = []
            for idx, c in enumerate(retrieved_chunks, start=1):
                is_cited = idx in cited_chunk_indices
                retrieved_chunk_objs.append(
                    RetrievedChunk(
                        question=question,
                        chunk=c["chunk"],
                        rank=c["rank"],
                        score=c["score"],
                        saved_label=c["label"],
                        saved_text=c["text"],
                        cited=is_cited,
                    )
                )
            if retrieved_chunk_objs:
                RetrievedChunk.objects.bulk_create(retrieved_chunk_objs)

        return JsonResponse({"question_id": question.id}, status=201)

    except GeminiRateLimitError as e:
        return JsonResponse(
            {"error": {"code": "AI_RATE_LIMIT", "message": "AI rate limit reached, try again later."}},
            status=429,
        )
    except GeminiError as e:
        return JsonResponse(
            {"error": {"code": "AI_SERVICE_ERROR", "message": "The AI service did not respond. Try again."}},
            status=502,
        )
    except Exception as e:
        return JsonResponse(
            {"error": {"code": "INTERNAL_ERROR", "message": f"An error occurred: {str(e)}"}},
            status=500,
        )
    finally:
        # Release lock
        request.session["is_asking"] = False
        request.session.modified = True
