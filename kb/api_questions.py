from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .models import Question

@require_GET
def api_questions_list(request):
    """GET /api/questions (M1)"""
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": {"code": "UNAUTHORIZED", "message": "Authentication required"}},
            status=401,
        )
    questions = Question.objects.filter(owner=request.user)
    data = [
        {
            "id": q.id,
            "question_text": q.question_text,
            "code_preview": (q.code[:100] + '...') if len(q.code) > 100 else q.code,
            "evidence_status": q.evidence_status,
            "created_at": q.created_at.isoformat(),
        }
        for q in questions
    ]
    return JsonResponse({"questions": data}, status=200)

@require_GET
def api_question_detail(request, id):
    """GET /api/questions/:id (M1)"""
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": {"code": "UNAUTHORIZED", "message": "Authentication required"}},
            status=401,
        )
    try:
        q = Question.objects.get(id=id)
    except Question.DoesNotExist:
        return JsonResponse(
            {"error": {"code": "NOT_FOUND", "message": "Question not found"}},
            status=404,
        )
    if q.owner != request.user:
        return JsonResponse(
            {"error": {"code": "FORBIDDEN", "message": "Access denied"}},
            status=403,
        )

    retrieved = [
        {
            "id": rc.id,
            "rank": rc.rank,
            "score": rc.score,
            "saved_label": rc.saved_label,
            "saved_text": rc.saved_text,
            "cited": rc.cited,
            "source_id": rc.chunk.source_id if rc.chunk else None,
            "file_id": rc.chunk.source_file_id if rc.chunk else None,
        }
        for rc in q.retrieved_chunks.all()
    ]

    return JsonResponse({
        "question": {
            "id": q.id,
            "code": q.code,
            "language": q.language,
            "question_text": q.question_text,
            "source_ids": q.source_ids,
            "answer": q.answer,
            "evidence_status": q.evidence_status,
            "created_at": q.created_at.isoformat(),
            "retrieved_chunks": retrieved,
        }
    }, status=200)
