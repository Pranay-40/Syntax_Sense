import io
from django.db import transaction
from kb.models import (
    Source, SourceFile, Chunk,
    SourceKind, SourceStatus, SourceFileKind, SourceFileStatus
)
from kb.rag.retrieval import embed_chunks
from .extract import extract_txt, extract_pdf, extract_docx, ExtractionError
from .chunking import chunk_document_text, chunk_pdf_pages, chunk_code_text
from .github import parse_github_url, download_github_zip, process_github_zip, GitHubError

MAX_CHUNKS_PER_SOURCE = 500
MAX_PASTED_TEXT_CHARS = 100_000
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB

class PipelineError(Exception):
    pass

def ingest_pasted_text(source: Source, name: str, text: str):
    """
    Ingest pasted text:
    Validates limits, chunks text, generates embeddings, saves DB rows.
    """
    if len(text) > MAX_PASTED_TEXT_CHARS:
        source.status = SourceStatus.FAILED
        source.error_message = f"Pasted text exceeds the limit of {MAX_PASTED_TEXT_CHARS:,} characters."
        source.save()
        raise PipelineError(source.error_message)

    source.status = SourceStatus.PROCESSING
    source.save()

    try:
        # Determine topic from first line
        topic = "Pasted Text"
        for line in text.splitlines():
            clean = line.strip().lstrip('#').strip()
            if clean:
                topic = clean[:100]
                break

        chunks_data = chunk_document_text(text)
        if len(chunks_data) > MAX_CHUNKS_PER_SOURCE:
            raise PipelineError(f"Source exceeds maximum limit of {MAX_CHUNKS_PER_SOURCE} chunks.")

        if not chunks_data:
            raise PipelineError("Pasted text is empty or contains no readable content.")

        # Batch embed chunks locally
        chunk_texts = [c["text"] for c in chunks_data]
        embeddings = embed_chunks(chunk_texts)

        with transaction.atomic():
            source_file = SourceFile.objects.create(
                source=source,
                path="pasted_text.txt",
                kind=SourceFileKind.DOCUMENT,
                language="text",
                topic=topic,
                extracted_text=text,
                size_bytes=len(text.encode("utf-8")),
                status=SourceFileStatus.READY,
                chunk_count=len(chunks_data),
            )

            chunk_objs = [
                Chunk(
                    source=source,
                    source_file=source_file,
                    position=pos,
                    text=c["text"],
                    page_number=c.get("page_number"),
                    embedding=emb,
                )
                for pos, (c, emb) in enumerate(zip(chunks_data, embeddings))
            ]
            Chunk.objects.bulk_create(chunk_objs)

            source.file_count = 1
            source.chunk_count = len(chunks_data)
            source.status = SourceStatus.READY
            source.error_message = None
            source.save()

    except Exception as e:
        source.status = SourceStatus.FAILED
        source.error_message = str(e)
        source.save()
        raise PipelineError(str(e))

def ingest_uploaded_file(source: Source, file_obj):
    """
    Ingest uploaded PDF, DOCX, or TXT file.
    """
    filename = file_obj.name
    ext = filename.split(".")[-1].lower() if "." in filename else ""

    if ext == "doc":
        source.status = SourceStatus.FAILED
        source.error_message = "Legacy .doc files are not supported. Please upload .docx, .pdf, or .txt"
        source.save()
        raise PipelineError(source.error_message)

    if ext not in ("pdf", "docx", "txt"):
        source.status = SourceStatus.FAILED
        source.error_message = f"Unsupported file type (.{ext}). Supported types: .pdf, .docx, .txt"
        source.save()
        raise PipelineError(source.error_message)

    if file_obj.size > MAX_UPLOAD_BYTES:
        source.status = SourceStatus.FAILED
        source.error_message = f"Uploaded file exceeds the 5 MB size limit ({file_obj.size // (1024*1024)} MB)."
        source.save()
        raise PipelineError(source.error_message)

    if file_obj.size == 0:
        source.status = SourceStatus.FAILED
        source.error_message = "Uploaded file is empty (0 bytes)."
        source.save()
        raise PipelineError(source.error_message)

    source.status = SourceStatus.PROCESSING
    source.save()

    try:
        content_bytes = file_obj.read()
        page_count = None

        if ext == "pdf":
            extracted_text, topic, page_count, pages_dict = extract_pdf(content_bytes)
            chunks_data = chunk_pdf_pages(pages_dict)
        elif ext == "docx":
            extracted_text, topic = extract_docx(content_bytes)
            chunks_data = chunk_document_text(extracted_text)
        else: # txt
            extracted_text, topic = extract_txt(content_bytes)
            chunks_data = chunk_document_text(extracted_text)

        if not chunks_data:
            raise PipelineError("Extracted text produced no chunks.")

        if len(chunks_data) > MAX_CHUNKS_PER_SOURCE:
            raise PipelineError(f"Document exceeds maximum limit of {MAX_CHUNKS_PER_SOURCE} chunks.")

        # Batch embed locally
        chunk_texts = [c["text"] for c in chunks_data]
        embeddings = embed_chunks(chunk_texts)

        with transaction.atomic():
            source_file = SourceFile.objects.create(
                source=source,
                path=filename,
                kind=SourceFileKind.DOCUMENT,
                language=ext,
                topic=topic,
                page_count=page_count,
                extracted_text=extracted_text,
                size_bytes=len(content_bytes),
                status=SourceFileStatus.READY,
                chunk_count=len(chunks_data),
            )

            chunk_objs = [
                Chunk(
                    source=source,
                    source_file=source_file,
                    position=pos,
                    text=c["text"],
                    page_number=c.get("page_number"),
                    embedding=emb,
                )
                for pos, (c, emb) in enumerate(zip(chunks_data, embeddings))
            ]
            Chunk.objects.bulk_create(chunk_objs)

            source.file_count = 1
            source.chunk_count = len(chunks_data)
            source.status = SourceStatus.READY
            source.error_message = None
            source.save()

    except Exception as e:
        source.status = SourceStatus.FAILED
        source.error_message = str(e)
        source.save()
        raise PipelineError(str(e))

def ingest_github_repo(source: Source, url: str):
    """
    Ingest public GitHub repository:
    Downloads in memory, filters supported files, creates SourceFiles and Chunks.
    """
    owner, repo = parse_github_url(url)
    source.origin_url = url
    source.status = SourceStatus.PROCESSING
    source.save()

    try:
        zip_bytes = download_github_zip(owner, repo)
        supported_files, skipped_files = process_github_zip(zip_bytes)

        if not supported_files:
            raise PipelineError("Repository contains no supported source or documentation files.")

        # Prepare code chunks across all supported files
        file_chunks_map = []
        total_chunks = 0
        for f in supported_files:
            chunks = chunk_code_text(f["text"])
            file_chunks_map.append((f, chunks))
            total_chunks += len(chunks)

        if total_chunks > MAX_CHUNKS_PER_SOURCE:
            raise PipelineError(f"Repository exceeds maximum limit of {MAX_CHUNKS_PER_SOURCE} chunks ({total_chunks} generated).")

        # Gather all chunk texts to embed in batch
        all_chunk_texts = []
        for _, chunks in file_chunks_map:
            for c in chunks:
                all_chunk_texts.append(c["text"])

        embeddings = embed_chunks(all_chunk_texts)
        emb_idx = 0

        with transaction.atomic():
            # Create skipped file entries
            for sf in skipped_files:
                SourceFile.objects.create(
                    source=source,
                    path=sf["path"],
                    kind=SourceFileKind.CODE,
                    size_bytes=sf["size_bytes"],
                    status=SourceFileStatus.SKIPPED,
                    skip_reason=sf["reason"],
                    chunk_count=0,
                )

            # Create supported files and chunks
            created_chunk_objs = []
            for f, chunks in file_chunks_map:
                source_file = SourceFile.objects.create(
                    source=source,
                    path=f["path"],
                    kind=SourceFileKind.CODE,
                    language=f["language"],
                    topic=f["path"],
                    extracted_text=f["text"],
                    size_bytes=f["size_bytes"],
                    status=SourceFileStatus.READY,
                    chunk_count=len(chunks),
                )

                for pos, c in enumerate(chunks):
                    emb = embeddings[emb_idx]
                    emb_idx += 1
                    created_chunk_objs.append(
                        Chunk(
                            source=source,
                            source_file=source_file,
                            position=pos,
                            text=c["text"],
                            start_line=c["start_line"],
                            end_line=c["end_line"],
                            embedding=emb,
                        )
                    )

            Chunk.objects.bulk_create(created_chunk_objs)

            source.file_count = len(supported_files) + len(skipped_files)
            source.chunk_count = total_chunks
            source.status = SourceStatus.READY
            source.error_message = None
            source.save()

    except Exception as e:
        source.status = SourceStatus.FAILED
        source.error_message = str(e)
        source.save()
        raise PipelineError(str(e))
