function switchFileTab(tab) {
  ['preview', 'chunks'].forEach((t) => {
    const tabEl = document.getElementById(`tab-${t}`);
    const paneEl = document.getElementById(`pane-${t}`);
    if (tabEl) tabEl.classList.toggle('active', t === tab);
    if (paneEl) paneEl.style.display = t === tab ? 'block' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('file-detail-app');
  if (!app) return;
  const sourceId = app.dataset.sourceId;
  const fileId = app.dataset.fileId;
  if (sourceId && fileId) {
    loadFileDetail(sourceId, fileId);
  }
});

async function loadFileDetail(sourceId, fileId) {
  const loading = document.getElementById('file-loading');
  const errorAlert = document.getElementById('file-error');
  const container = document.getElementById('file-content-container');

  loading.style.display = 'block';
  errorAlert.style.display = 'none';
  container.style.display = 'none';

  try {
    const res = await fetch(`/api/sources/${sourceId}/files/${fileId}`);
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (res.status === 403) {
      window.location.href = `/sources/${sourceId}`;
      return;
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData.error && errData.error.message) || 'Failed to load file details');
    }

    const data = await res.json();
    const file = data.file;
    loading.style.display = 'none';

    // Header
    document.getElementById('file-name').textContent = file.path;
    let metaText = `Type: ${file.kind} • Size: ${(file.size_bytes / 1024).toFixed(1)} KB`;
    if (file.language) metaText += ` • Language: ${file.language}`;
    if (file.topic) metaText += ` • Topic: ${file.topic}`;
    if (file.page_count) metaText += ` • Pages: ${file.page_count}`;
    document.getElementById('file-meta').textContent = metaText;

    document.getElementById('chunk-count-badge').textContent = file.chunks ? file.chunks.length : 0;

    // Render Preview
    const codeBlock = document.getElementById('code-preview-block');
    const textBlock = document.getElementById('text-preview-block');

    const content = file.extracted_text || '(No content extracted)';
    if (file.kind === 'CODE') {
      document.getElementById('preview-heading').textContent = 'Source Code Preview';
      codeBlock.innerHTML = '';
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const lineDiv = document.createElement('div');
        lineDiv.className = 'code-line';
        lineDiv.innerHTML = `<span class="line-num">${idx + 1}</span><span class="line-text">${escapeHtml(line)}</span>`;
        codeBlock.appendChild(lineDiv);
      });
      codeBlock.style.display = 'block';
      textBlock.style.display = 'none';
    } else {
      document.getElementById('preview-heading').textContent = 'Extracted Document Text';
      textBlock.textContent = content;
      textBlock.style.display = 'block';
      codeBlock.style.display = 'none';
    }

    // Render Chunks
    const chunksList = document.getElementById('chunks-list');
    chunksList.innerHTML = '';
    if (!file.chunks || file.chunks.length === 0) {
      chunksList.innerHTML = '<div class="state-box"><p class="text-muted">No chunks generated for this file.</p></div>';
    } else {
      file.chunks.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '1rem';

        let rangeLabel = '';
        if (c.page_number) rangeLabel = `Page ${c.page_number}`;
        else if (c.start_line && c.end_line) rangeLabel = `Lines ${c.start_line} - ${c.end_line}`;

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <strong>Chunk #${c.position + 1}</strong>
            ${rangeLabel ? `<span class="badge badge-secondary">${rangeLabel}</span>` : ''}
          </div>
          <div style="background: var(--bg); padding: 0.75rem; border-radius: var(--radius); font-family: var(--font-mono); font-size: 0.85rem; white-space: pre-wrap; line-height: 1.5; border: 1px solid var(--border);">
            ${escapeHtml(c.text)}
          </div>
        `;
        chunksList.appendChild(card);
      });
    }

    container.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    errorAlert.textContent = err.message || 'An unexpected error occurred.';
    errorAlert.style.display = 'block';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
