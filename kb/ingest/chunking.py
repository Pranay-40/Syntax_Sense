class ChunkingLimitError(Exception):
    """Raised when chunk limit (500) is exceeded."""
    pass

def chunk_document_text(text, target_size=1200, overlap=150, page_number=None):
    """
    Split document text into chunks of ~1,200 chars with 150 overlap, splitting on paragraph breaks first.
    Returns list of dicts: [{'text': str, 'page_number': int | None}]
    """
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = ""

    for p in paragraphs:
        p = p.strip()
        if not p:
            continue

        if len(p) > target_size:
            # Paragraph itself exceeds target size, split by lines or sentences
            lines = p.splitlines()
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                if len(current_chunk) + len(line) + 1 <= target_size:
                    current_chunk = (current_chunk + "\n" + line).strip()
                else:
                    if current_chunk:
                        chunks.append({"text": current_chunk, "page_number": page_number})
                        # Overlap: keep tail of previous chunk
                        overlap_text = current_chunk[-overlap:] if len(current_chunk) > overlap else current_chunk
                        current_chunk = (overlap_text + "\n" + line).strip()
                    else:
                        # Single line is huge, hard slice
                        chunks.append({"text": line[:target_size], "page_number": page_number})
                        current_chunk = line[target_size - overlap:]
        else:
            if len(current_chunk) + len(p) + 2 <= target_size:
                current_chunk = (current_chunk + "\n\n" + p).strip()
            else:
                if current_chunk:
                    chunks.append({"text": current_chunk, "page_number": page_number})
                    overlap_text = current_chunk[-overlap:] if len(current_chunk) > overlap else current_chunk
                    current_chunk = (overlap_text + "\n\n" + p).strip()
                else:
                    current_chunk = p

    if current_chunk.strip():
        chunks.append({"text": current_chunk.strip(), "page_number": page_number})

    return chunks

def chunk_pdf_pages(pages_dict, target_size=1200, overlap=150):
    """
    Chunk PDF pages while strictly tracking page numbers.
    pages_dict: {page_num: text}
    """
    all_chunks = []
    for page_num, page_text in pages_dict.items():
        if not page_text.strip():
            continue
        page_chunks = chunk_document_text(page_text, target_size=target_size, overlap=overlap, page_number=page_num)
        all_chunks.extend(page_chunks)
    return all_chunks

def chunk_code_text(code_text, target_lines=40, max_chars=1500):
    """
    Split code ~40 lines or 1,500 characters per chunk, whichever is smaller.
    Split on blank lines when possible.
    Returns list of dicts: [{'text': str, 'start_line': int, 'end_line': int}]
    Line numbers are 1-indexed.
    """
    lines = code_text.splitlines()
    if not lines:
        return []

    chunks = []
    current_lines = []
    current_chars = 0
    start_line_idx = 1

    for idx, line in enumerate(lines, start=1):
        line_len = len(line) + 1  # include newline char
        if (len(current_lines) >= target_lines or (current_chars + line_len > max_chars)) and current_lines:
            # Check if we can find a nearby blank line to split gracefully
            chunk_str = "\n".join(current_lines)
            end_line_idx = start_line_idx + len(current_lines) - 1
            chunks.append({
                "text": chunk_str,
                "start_line": start_line_idx,
                "end_line": end_line_idx,
            })
            current_lines = [line]
            current_chars = line_len
            start_line_idx = idx
        else:
            current_lines.append(line)
            current_chars += line_len

    if current_lines:
        chunk_str = "\n".join(current_lines)
        end_line_idx = start_line_idx + len(current_lines) - 1
        chunks.append({
            "text": chunk_str,
            "start_line": start_line_idx,
            "end_line": end_line_idx,
        })

    return chunks
