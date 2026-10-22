import os
import json
import time
import logging
from django.conf import settings
from google import genai
from google.genai import types
from google.genai.errors import APIError
from .prompt import SYSTEM_INSTRUCTION, build_ask_prompt

logger = logging.getLogger(__name__)

class GeminiError(Exception):
    pass

class GeminiRateLimitError(GeminiError):
    pass

def get_gemini_client():
    """Create a google-genai Client using GEMINI_API_KEY only."""
    api_key = getattr(settings, 'GEMINI_API_KEY', None) or os.environ.get('GEMINI_API_KEY')
    if not api_key or api_key == "your-key-here":
        raise GeminiError("GEMINI_API_KEY is not configured in .env.")
    return genai.Client(api_key=api_key)

def call_gemini_rag(code: str, language: str, question_text: str, chunks: list, max_retries: int = 3):
    """
    Call Gemini gemini-3.8-flash with retrieval context and return validated JSON answer.
    Handles rate-limits with retries.
    Enforces citation integrity.
    """
    client = get_gemini_client()
    model_name = getattr(settings, 'GEMINI_MODEL', 'gemini-3.8-flash')

    prompt = build_ask_prompt(code, language, question_text, chunks)
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        temperature=0.2,
    )

    last_error = None
    backoff = 2.0

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config,
            )

            response_text = response.text
            if not response_text:
                raise GeminiError("Empty response from AI service.")

            try:
                answer_json = json.loads(response_text)
            except json.JSONDecodeError:
                # If wrapped in markdown code fence
                clean = response_text.strip()
                if clean.startswith("```json"):
                    clean = clean[7:]
                if clean.startswith("```"):
                    clean = clean[3:]
                if clean.endswith("```"):
                    clean = clean[:-3]
                answer_json = json.loads(clean.strip())

            return validate_and_sanitize_answer(answer_json, max_chunk_index=len(chunks))

        except APIError as e:
            last_error = e
            status_code = getattr(e, 'code', None) or getattr(e, 'status_code', None)
            # Check 429 rate limit or 503 temporary high demand
            if status_code in (429, 503) or "rate limit" in str(e).lower() or "resource_exhausted" in str(e).lower() or "unavailable" in str(e).lower() or "high demand" in str(e).lower():
                if attempt < max_retries - 1:
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                if status_code == 429 or "rate limit" in str(e).lower():
                    raise GeminiRateLimitError("AI rate limit reached, try again later.")
                raise GeminiError("The AI service is experiencing high demand. Please try again in a moment.")
            raise GeminiError(f"Gemini API error: {str(e)}")

        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            if attempt < max_retries - 1 and ("429" in err_str or "503" in err_str or "exhausted" in err_str or "unavailable" in err_str or "high demand" in err_str):
                time.sleep(backoff)
                backoff *= 2
                continue
            raise GeminiError(f"AI generation failed: {str(e)}")

    if last_error:
        raise GeminiError(f"AI generation failed: {str(last_error)}")

def validate_and_sanitize_answer(raw_json: dict, max_chunk_index: int) -> dict:
    """
    Enforces shape:
    {
      "explanation": [{"text": str, "chunk_numbers": [int]}],
      "bugs": [{"title": str, "detail": str, "line": int | None, "chunk_numbers": [int]}],
      "fixes": [{"description": str, "code": str, "chunk_numbers": [int]}]
    }
    Strips any chunk numbers not between 1 and max_chunk_index.
    """
    if not isinstance(raw_json, dict):
        raw_json = {}

    sanitized = {
        "explanation": [],
        "bugs": [],
        "fixes": [],
    }

    # Explanation
    raw_exp = raw_json.get("explanation", [])
    if isinstance(raw_exp, list):
        for item in raw_exp:
            if isinstance(item, dict):
                text = str(item.get("text", "")).strip()
                nums = _filter_chunk_nums(item.get("chunk_numbers"), max_chunk_index)
                if text:
                    sanitized["explanation"].append({"text": text, "chunk_numbers": nums})
            elif isinstance(item, str) and item.strip():
                sanitized["explanation"].append({"text": item.strip(), "chunk_numbers": []})

    # Bugs
    raw_bugs = raw_json.get("bugs", [])
    if isinstance(raw_bugs, list):
        for b in raw_bugs:
            if isinstance(b, dict):
                title = str(b.get("title", "")).strip()
                detail = str(b.get("detail", "")).strip()
                line = b.get("line")
                try:
                    line = int(line) if line is not None else None
                except (ValueError, TypeError):
                    line = None
                nums = _filter_chunk_nums(b.get("chunk_numbers"), max_chunk_index)
                if title or detail:
                    sanitized["bugs"].append({
                        "title": title or "Potential Issue",
                        "detail": detail,
                        "line": line,
                        "chunk_numbers": nums,
                    })

    # Fixes
    raw_fixes = raw_json.get("fixes", [])
    if isinstance(raw_fixes, list):
        for f in raw_fixes:
            if isinstance(f, dict):
                desc = str(f.get("description", "")).strip()
                code_fix = str(f.get("code", "")).strip()
                nums = _filter_chunk_nums(f.get("chunk_numbers"), max_chunk_index)
                if desc or code_fix:
                    sanitized["fixes"].append({
                        "description": desc,
                        "code": code_fix,
                        "chunk_numbers": nums,
                    })

    return sanitized

def _filter_chunk_nums(nums, max_chunk_index):
    if not isinstance(nums, list):
        return []
    valid = []
    for n in nums:
        try:
            val = int(n)
            if 1 <= val <= max_chunk_index and val not in valid:
                valid.append(val)
        except (ValueError, TypeError):
            continue
    return sorted(valid)
