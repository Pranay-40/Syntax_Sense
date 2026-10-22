import io
import re
import zipfile
import requests

GITHUB_URL_REGEX = re.compile(r"^https://github\.com/([a-zA-Z0-9_\-\.]+)/([a-zA-Z0-9_\-\.]+)/?$")

SUPPORTED_EXTENSIONS = {
    'py': 'python',
    'js': 'javascript',
    'ts': 'typescript',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c_header',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'php': 'php',
    'html': 'html',
    'css': 'css',
    'sql': 'sql',
    'md': 'markdown',
    'txt': 'text',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
}

IGNORED_DIRS = {
    '.git', 'node_modules', 'build', 'dist', 'target', 'vendor',
    '.next', '__pycache__', '.venv', 'env', '.idea', '.vscode'
}

MAX_ZIP_BYTES = 10 * 1024 * 1024     # 10 MB
MAX_SUPPORTED_FILES = 100
MAX_FILE_BYTES = 100 * 1024          # 100 KB

class GitHubError(Exception):
    pass

def parse_github_url(url):
    """
    Validate that the URL strictly matches https://github.com/{owner}/{repo}.
    Returns (owner, repo).
    """
    match = GITHUB_URL_REGEX.match(url.strip())
    if not match:
        raise GitHubError("Invalid GitHub URL. Must be in the format: https://github.com/owner/repo")
    return match.group(1), match.group(2)

def download_github_zip(owner, repo):
    """
    Download public repository zipball in memory.
    Tries GitHub API first. If GitHub API returns 403/429 (e.g. on shared cloud IPs like Render),
    automatically falls back to direct GitHub web archive download (HEAD.zip).
    Returns: bytes
    """
    import os
    token = os.environ.get("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "SyntaxSense-RAG-App"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    api_url = f"https://api.github.com/repos/{owner}/{repo}/zipball"
    response = None

    try:
        response = requests.get(api_url, headers=headers, stream=True, timeout=20)
    except requests.RequestException:
        pass

    # If API hit rate limit (403/429) or failed, fall back to direct web archive download
    if response is None or response.status_code in (403, 429):
        web_url = f"https://github.com/{owner}/{repo}/archive/HEAD.zip"
        try:
            response = requests.get(web_url, headers={"User-Agent": "Mozilla/5.0"}, stream=True, timeout=25)
        except requests.RequestException as e:
            raise GitHubError(f"Network error contacting GitHub: {str(e)}")

    if response.status_code == 404:
        raise GitHubError("Repository not found or not public")
    elif not response.ok:
        raise GitHubError(f"GitHub returned error code {response.status_code}")

    # Read up to MAX_ZIP_BYTES safely
    buffer = io.BytesIO()
    total_downloaded = 0
    for chunk in response.iter_content(chunk_size=65536):
        total_downloaded += len(chunk)
        if total_downloaded > MAX_ZIP_BYTES:
            raise GitHubError(f"Repository ZIP exceeds the 10 MB limit.")
        buffer.write(chunk)

    return buffer.getvalue()

def process_github_zip(zip_bytes):
    """
    Read zip in-memory, sanitize paths, filter supported/skipped files.
    Returns:
      supported_files: list of dicts:
        [{'path': rel_path, 'language': lang, 'text': decoded_content, 'size_bytes': int}]
      skipped_files: list of dicts:
        [{'path': rel_path, 'reason': reason, 'size_bytes': int}]
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise GitHubError("Corrupted or invalid zip archive received from GitHub.")

    supported_files = []
    skipped_files = []

    # GitHub zipball has a root directory e.g. "owner-repo-commit_sha/"
    # We find the prefix and strip it
    names = zf.namelist()
    prefix = ""
    if names and "/" in names[0]:
        prefix = names[0].split("/")[0] + "/"

    for member in zf.infolist():
        # Skip directories
        if member.is_dir():
            continue

        raw_name = member.filename
        # Path safety check
        if ".." in raw_name or raw_name.startswith("/") or raw_name.startswith("\\"):
            continue

        rel_path = raw_name[len(prefix):] if raw_name.startswith(prefix) else raw_name
        if not rel_path:
            continue

        parts = rel_path.split("/")
        # Check ignored directories
        if any(part in IGNORED_DIRS or part.startswith(".") for part in parts[:-1]):
            skipped_files.append({
                "path": rel_path,
                "reason": "Ignored directory (e.g. git, build, dependencies)",
                "size_bytes": member.file_size,
            })
            continue

        filename = parts[-1]
        lower_name = filename.lower()
        ext = filename.split(".")[-1].lower() if "." in filename else ""

        lang = None
        if ext in SUPPORTED_EXTENSIONS:
            lang = SUPPORTED_EXTENSIONS[ext]
        elif lower_name in ("readme", "license", "licence"):
            lang = "markdown"

        if not lang:
            skipped_files.append({
                "path": rel_path,
                "reason": f"Unsupported file extension: .{ext}" if ext else "No supported file extension",
                "size_bytes": member.file_size,
            })
            continue

        if member.file_size > MAX_FILE_BYTES:
            skipped_files.append({
                "path": rel_path,
                "reason": f"File size ({member.file_size // 1024} KB) exceeds 100 KB limit",
                "size_bytes": member.file_size,
            })
            continue

        # Check total supported file count
        if len(supported_files) >= MAX_SUPPORTED_FILES:
            raise GitHubError(f"Repository exceeds the limit of {MAX_SUPPORTED_FILES} supported files.")

        # Read and decode in-memory
        try:
            content_bytes = zf.read(member)
            try:
                decoded_text = content_bytes.decode('utf-8')
            except UnicodeDecodeError:
                decoded_text = content_bytes.decode('latin-1', errors='replace')

            supported_files.append({
                "path": rel_path,
                "language": lang,
                "text": decoded_text,
                "size_bytes": member.file_size,
            })
        except Exception as e:
            skipped_files.append({
                "path": rel_path,
                "reason": f"Error reading file content: {str(e)}",
                "size_bytes": member.file_size,
            })

    return supported_files, skipped_files

def build_folder_tree(all_file_dicts):
    """
    Build nested folder tree dictionary for Explorer UI.
    Input: list of file dicts with 'path', 'status', 'id', 'chunk_count'
    Output: nested dict structure
    """
    root = {"name": "root", "type": "dir", "children": {}}

    for file_info in all_file_dicts:
        parts = file_info["path"].split("/")
        current = root
        for i, part in enumerate(parts):
            if i == len(parts) - 1:
                # File
                current["children"][part] = {
                    "name": part,
                    "type": "file",
                    "path": file_info["path"],
                    "status": file_info.get("status"),
                    "id": file_info.get("id"),
                    "chunk_count": file_info.get("chunk_count", 0),
                    "size_bytes": file_info.get("size_bytes", 0),
                }
            else:
                # Dir
                if part not in current["children"]:
                    current["children"][part] = {
                        "name": part,
                        "type": "dir",
                        "children": {}
                    }
                current = current["children"][part]

    def _convert_to_list(node):
        if node["type"] == "dir":
            children_list = []
            for name, child in sorted(node["children"].items(), key=lambda x: (x[1]["type"] != "dir", x[0])):
                children_list.append(_convert_to_list(child))
            return {
                "name": node["name"],
                "type": "dir",
                "children": children_list
            }
        return node

    return _convert_to_list(root)["children"]
