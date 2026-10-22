import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import Source, SourceFile, Chunk, SourceKind, SourceStatus
from .ingest.pipeline import (
    ingest_pasted_text, ingest_uploaded_file, ingest_github_repo,
    PipelineError, MAX_PASTED_TEXT_CHARS, MAX_UPLOAD_BYTES
)
from .ingest.github import build_folder_tree

def _unauthorized_response():
    return JsonResponse(
        {"error": {"code": "UNAUTHORIZED", "message": "Authentication required"}},
        status=401,
    )

def _forbidden_response():
    return JsonResponse(
        {"error": {"code": "FORBIDDEN", "message": "Access denied"}},
        status=403,
    )

def _not_found_response(msg="Resource not found"):
    return JsonResponse(
        {"error": {"code": "NOT_FOUND", "message": msg}},
        status=404,
    )

def _bad_request(code, msg, status=400):
    return JsonResponse(
        {"error": {"code": code, "message": msg}},
        status=status,
    )

@require_http_methods(["GET"])
def api_sources_list(request):
    """GET /api/sources - list the logged-in user's sources."""
    if not request.user.is_authenticated:
        return _unauthorized_response()

    sources = Source.objects.filter(owner=request.user)
    data = [
        {
            "id": s.id,
            "name": s.name,
            "kind": s.kind,
            "origin_url": s.origin_url,
            "status": s.status,
            "error_message": s.error_message,
            "file_count": s.file_count,
            "chunk_count": s.chunk_count,
            "created_at": s.created_at.isoformat(),
        }
        for s in sources
    ]
    return JsonResponse({"sources": data}, status=200)

@require_http_methods(["POST"])
def api_sources_text(request):
    """POST /api/sources/text - add pasted text and process."""
    if not request.user.is_authenticated:
        return _unauthorized_response()

    try:
        data = json.loads(request.body)
    except (ValueError, TypeError):
        return _bad_request("INVALID_JSON", "Invalid JSON body")

    name = data.get("name", "").strip()
    text = data.get("text", "").strip()

    if not name:
        return _bad_request("MISSING_NAME", "Source name is required")
    if len(name) > 100:
        return _bad_request("INVALID_NAME", "Source name must be 100 characters or fewer")
    if not text:
        return _bad_request("MISSING_TEXT", "Text content cannot be empty")
    if len(text) > MAX_PASTED_TEXT_CHARS:
        return _bad_request("TEXT_TOO_LONG", f"Pasted text exceeds {MAX_PASTED_TEXT_CHARS:,} characters limit")

    source = Source.objects.create(
        owner=request.user,
        name=name,
        kind=SourceKind.TEXT,
        status=SourceStatus.PENDING,
    )

    try:
        ingest_pasted_text(source, name, text)
        return JsonResponse({
            "source": {
                "id": source.id,
                "name": source.name,
                "kind": source.kind,
                "status": source.status,
                "file_count": source.file_count,
                "chunk_count": source.chunk_count,
            }
        }, status=201)
    except PipelineError as e:
        return JsonResponse(
            {"error": {"code": "INGEST_FAILED", "message": str(e)}},
            status=502,
        )

@require_http_methods(["POST"])
def api_sources_upload(request):
    """POST /api/sources/upload - upload PDF, DOCX, or TXT."""
    if not request.user.is_authenticated:
        return _unauthorized_response()

    if "file" not in request.FILES:
        return _bad_request("MISSING_FILE", "No file uploaded")

    uploaded_file = request.FILES["file"]
    filename = uploaded_file.name

    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if ext == "doc":
        return _bad_request("LEGACY_DOC_REJECTED", "Legacy .doc files are not supported. Please upload .docx, .pdf, or .txt")

    if ext not in ("pdf", "docx", "txt"):
        return _bad_request("UNSUPPORTED_TYPE", f"Unsupported file type (.{ext}). Supported types: .pdf, .docx, .txt")

    if uploaded_file.size > MAX_UPLOAD_BYTES:
        return _bad_request("FILE_TOO_LARGE", f"Uploaded file exceeds the 5 MB size limit ({uploaded_file.size // (1024*1024)} MB)", status=413)

    if uploaded_file.size == 0:
        return _bad_request("EMPTY_FILE", "Uploaded file is empty (0 bytes)")

    source = Source.objects.create(
        owner=request.user,
        name=filename,
        kind=SourceKind.FILE,
        status=SourceStatus.PENDING,
    )

    try:
        ingest_uploaded_file(source, uploaded_file)
        return JsonResponse({
            "source": {
                "id": source.id,
                "name": source.name,
                "kind": source.kind,
                "status": source.status,
                "file_count": source.file_count,
                "chunk_count": source.chunk_count,
            }
        }, status=201)
    except PipelineError as e:
        return JsonResponse(
            {"error": {"code": "INGEST_FAILED", "message": str(e)}},
            status=502,
        )

@require_http_methods(["POST"])
def api_sources_github(request):
    """POST /api/sources/github - add public repository."""
    if not request.user.is_authenticated:
        return _unauthorized_response()

    try:
        data = json.loads(request.body)
    except (ValueError, TypeError):
        return _bad_request("INVALID_JSON", "Invalid JSON body")

    url = data.get("url", "").strip()
    if not url:
        return _bad_request("MISSING_URL", "GitHub repository URL is required")

    source_name = url.rstrip("/").split("/")[-1] or "GitHub Repository"
    source = Source.objects.create(
        owner=request.user,
        name=source_name,
        kind=SourceKind.GITHUB,
        origin_url=url,
        status=SourceStatus.PENDING,
    )

    try:
        ingest_github_repo(source, url)
        return JsonResponse({
            "source": {
                "id": source.id,
                "name": source.name,
                "kind": source.kind,
                "origin_url": source.origin_url,
                "status": source.status,
                "file_count": source.file_count,
                "chunk_count": source.chunk_count,
            }
        }, status=201)
    except PipelineError as e:
        msg = str(e)
        if "not found or not public" in msg.lower():
            return JsonResponse({"error": {"code": "REPO_NOT_FOUND", "message": "Repository not found or not public"}}, status=404)
        if "10 mb" in msg.lower() or "limit" in msg.lower():
            return JsonResponse({"error": {"code": "REPO_LIMIT_EXCEEDED", "message": msg}}, status=413)
        return JsonResponse({"error": {"code": "INGEST_FAILED", "message": msg}}, status=502)

@require_http_methods(["GET", "DELETE"])
def api_source_detail(request, id):
    """GET /api/sources/:id or DELETE /api/sources/:id"""
    if not request.user.is_authenticated:
        return _unauthorized_response()

    try:
        source = Source.objects.get(id=id)
    except Source.DoesNotExist:
        return _not_found_response("Source not found")

    if source.owner != request.user:
        return _forbidden_response()

    if request.method == "DELETE":
        source.delete()
        return JsonResponse({}, status=204)

    # GET source details with files
    files_qs = source.files.all()
    files_data = [
        {
            "id": f.id,
            "path": f.path,
            "kind": f.kind,
            "language": f.language,
            "topic": f.topic,
            "page_count": f.page_count,
            "size_bytes": f.size_bytes,
            "status": f.status,
            "skip_reason": f.skip_reason,
            "chunk_count": f.chunk_count,
        }
        for f in files_qs
    ]

    response_data = {
        "source": {
            "id": source.id,
            "name": source.name,
            "kind": source.kind,
            "origin_url": source.origin_url,
            "status": source.status,
            "error_message": source.error_message,
            "file_count": source.file_count,
            "chunk_count": source.chunk_count,
            "created_at": source.created_at.isoformat(),
            "files": files_data,
        }
    }

    if source.kind == SourceKind.GITHUB:
        total_files = len(files_data)
        supported_files = [f for f in files_data if f["status"] == "READY"]
        skipped_files = [f for f in files_data if f["status"] == "SKIPPED"]
        folder_tree = build_folder_tree(files_data)
        response_data["source"]["counts"] = {
            "total": total_files,
            "supported": len(supported_files),
            "skipped": len(skipped_files),
        }
        response_data["source"]["folder_tree"] = folder_tree

    return JsonResponse(response_data, status=200)

@require_http_methods(["GET"])
def api_source_file_detail(request, id, file_id):
    """GET /api/sources/:id/files/:fileId"""
    if not request.user.is_authenticated:
        return _unauthorized_response()

    try:
        source = Source.objects.get(id=id)
    except Source.DoesNotExist:
        return _not_found_response("Source not found")

    if source.owner != request.user:
        return _forbidden_response()

    try:
        file_obj = SourceFile.objects.get(id=file_id, source=source)
    except SourceFile.DoesNotExist:
        return _not_found_response("File not found")

    chunks_data = [
        {
            "id": c.id,
            "position": c.position,
            "text": c.text,
            "page_number": c.page_number,
            "start_line": c.start_line,
            "end_line": c.end_line,
        }
        for c in file_obj.chunks.all()
    ]

    return JsonResponse({
        "file": {
            "id": file_obj.id,
            "source_id": source.id,
            "path": file_obj.path,
            "kind": file_obj.kind,
            "language": file_obj.language,
            "topic": file_obj.topic,
            "page_count": file_obj.page_count,
            "extracted_text": file_obj.extracted_text,
            "size_bytes": file_obj.size_bytes,
            "status": file_obj.status,
            "skip_reason": file_obj.skip_reason,
            "chunk_count": file_obj.chunk_count,
            "chunks": chunks_data,
        }
    }, status=200)
