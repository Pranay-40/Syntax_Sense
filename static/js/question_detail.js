document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('question-detail-app');
  if (!app) return;
  const questionId = app.dataset.questionId;
  if (questionId) {
    loadQuestionDetail(questionId);
  }
});

async function loadQuestionDetail(id) {
  const loading = document.getElementById('answer-loading');
  const errorAlert = document.getElementById('answer-error');
  const container = document.getElementById('answer-container');

  loading.style.display = 'block';
  errorAlert.style.display = 'none';
  container.style.display = 'none';

  try {
    const res = await fetch(`/api/questions/${id}`);
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (res.status === 403) {
      window.location.href = '/questions';
      return;
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData.error && errData.error.message) || 'Failed to load question');
    }

    const data = await res.json();
    const q = data.question;
    loading.style.display = 'none';

    // Meta
    document.getElementById('question-created-meta').textContent = 
      `Asked on ${new Date(q.created_at).toLocaleString()}`;

    // Render Submission
    if (q.question_text) {
      document.getElementById('sub-question-text').textContent = q.question_text;
      document.getElementById('sub-question-container').style.display = 'block';
    }
    if (q.code) {
      const subCodeBlock = document.getElementById('sub-code-block');
      subCodeBlock.innerHTML = '';
      q.code.split('\n').forEach((line, idx) => {
        const div = document.createElement('div');
        div.className = 'code-line';
        div.innerHTML = `<span class="line-num">${idx + 1}</span><span class="line-text">${escapeHtml(line)}</span>`;
        subCodeBlock.appendChild(div);
      });
      document.getElementById('sub-code-container').style.display = 'block';
    }

    // Evidence Notice Banner
    const banner = document.getElementById('evidence-banner');
    if (q.evidence_status === 'NO_SOURCES') {
      banner.className = 'alert alert-warning';
      banner.innerHTML = '<strong>No sources searched.</strong> This answer is based on general analysis of your submitted code alone.';
      banner.style.display = 'flex';
    } else if (q.evidence_status === 'INSUFFICIENT') {
      banner.className = 'alert alert-warning';
      banner.innerHTML = '<strong>Not enough evidence in your sources.</strong> The retrieved chunks lacked sufficient similarity. Any statement below without citations is labeled "From the code only, not from your documents".';
      banner.style.display = 'flex';
    } else {
      banner.className = 'alert alert-success';
      banner.innerHTML = '<strong>Evidence-grounded answer.</strong> Relevant chunks were retrieved from your documentation and cited below.';
      banner.style.display = 'flex';
    }

    // Render Answer JSON Sections
    const answer = q.answer || {};
    renderExplanation(answer.explanation || []);
    renderBugs(answer.bugs || []);
    renderFixes(answer.fixes || []);

    // Render Retrieved Chunks
    renderRetrievedChunks(q.retrieved_chunks || []);

    container.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    errorAlert.textContent = err.message || 'An unexpected error occurred.';
    errorAlert.style.display = 'block';
  }
}

function renderExplanation(items) {
  const container = document.getElementById('explanation-list');
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="text-muted">No explanation provided.</p>';
    return;
  }

  items.forEach((item) => {
    const div = document.createElement('div');
    div.style.marginBottom = '0.85rem';
    div.style.lineHeight = '1.6';
    div.innerHTML = `
      <p style="margin-bottom: 0.35rem;">${escapeHtml(item.text)}</p>
      ${renderCitationBadges(item.chunk_numbers)}
    `;
    container.appendChild(div);
  });
}

function renderBugs(bugs) {
  const container = document.getElementById('bugs-list');
  container.innerHTML = '';
  if (!bugs || bugs.length === 0) {
    container.innerHTML = '<p class="text-muted">No obvious bugs identified in the submitted code.</p>';
    return;
  }

  bugs.forEach((b) => {
    const card = document.createElement('div');
    card.style.background = 'var(--bg)';
    card.style.border = '1px solid var(--border)';
    card.style.borderRadius = 'var(--radius)';
    card.style.padding = '0.85rem 1rem';
    card.style.marginBottom = '0.75rem';

    let lineBadge = '';
    if (b.line) {
      lineBadge = `<span class="badge badge-secondary" style="font-family: var(--font-mono);">Line ${b.line}</span>`;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
        <strong style="color: var(--error);">${escapeHtml(b.title)}</strong>
        ${lineBadge}
      </div>
      <p style="margin-bottom: 0.5rem; font-size: 0.925rem; color: var(--text);">${escapeHtml(b.detail)}</p>
      ${renderCitationBadges(b.chunk_numbers)}
    `;
    container.appendChild(card);
  });
}

function renderFixes(fixes) {
  const container = document.getElementById('fixes-list');
  container.innerHTML = '';
  if (!fixes || fixes.length === 0) {
    container.innerHTML = '<p class="text-muted">No specific code fixes proposed.</p>';
    return;
  }

  fixes.forEach((f) => {
    const card = document.createElement('div');
    card.style.background = 'var(--bg)';
    card.style.border = '1px solid var(--border)';
    card.style.borderRadius = 'var(--radius)';
    card.style.padding = '0.85rem 1rem';
    card.style.marginBottom = '0.75rem';

    let codeBlockHtml = '';
    if (f.code) {
      codeBlockHtml = `
        <div class="code-block" style="margin: 0.5rem 0; font-size: 0.85rem; padding: 0.75rem;">
          <pre style="margin: 0;"><code>${escapeHtml(f.code)}</code></pre>
        </div>
      `;
    }

    card.innerHTML = `
      <p style="margin-bottom: 0.35rem; font-weight: 500;">${escapeHtml(f.description)}</p>
      ${codeBlockHtml}
      ${renderCitationBadges(f.chunk_numbers)}
    `;
    container.appendChild(card);
  });
}

function renderCitationBadges(nums) {
  if (!nums || nums.length === 0) {
    return `<span class="badge badge-secondary" style="font-size: 0.75rem; text-transform: none; letter-spacing: normal;">From the code only, not from your documents</span>`;
  }
  const badges = nums.map((n) => `
    <button type="button" class="badge badge-ready" style="border: 1px solid var(--success); cursor: pointer;" onclick="scrollToChunk(${n})">
      Source Chunk [${n}]
    </button>
  `).join(' ');

  return `<div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">${badges}</div>`;
}

function renderRetrievedChunks(chunks) {
  const countEl = document.getElementById('chunks-count');
  countEl.textContent = chunks.length;

  const container = document.getElementById('retrieved-chunks-container');
  container.innerHTML = '';

  if (chunks.length === 0) {
    container.innerHTML = '<p class="text-muted text-sm">No chunks retrieved for this question.</p>';
    return;
  }

  chunks.forEach((c) => {
    const card = document.createElement('div');
    card.id = `retrieved-chunk-${c.rank}`;
    card.style.border = '1px solid var(--border)';
    card.style.borderRadius = 'var(--radius)';
    card.style.padding = '0.85rem';
    card.style.background = 'var(--surface)';
    card.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';

    let sourceLink = '';
    if (c.source_id && c.file_id) {
      sourceLink = `<a href="/sources/${c.source_id}/files/${c.file_id}" target="_blank" style="color: var(--primary); font-size: 0.8rem; text-decoration: none;">View File &rarr;</a>`;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
        <span style="font-weight: 700; font-size: 0.85rem; color: var(--primary);">Chunk [${c.rank}]</span>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span class="badge badge-secondary" title="Cosine Similarity Score">Score: ${c.score.toFixed(2)}</span>
          ${c.cited ? '<span class="badge badge-ready">Used in Answer</span>' : ''}
        </div>
      </div>
      <p style="font-size: 0.825rem; font-weight: 600; margin-bottom: 0.35rem; color: var(--text);">
        ${escapeHtml(c.saved_label)}
      </p>
      <div style="background: var(--bg); padding: 0.6rem; border-radius: 4px; font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.45; max-height: 180px; overflow-y: auto; border: 1px solid var(--border); white-space: pre-wrap;">
        ${escapeHtml(c.saved_text)}
      </div>
      ${sourceLink ? `<div style="text-align: right; margin-top: 0.35rem;">${sourceLink}</div>` : ''}
    `;

    container.appendChild(card);
  });
}

function scrollToChunk(rank) {
  const chunkEl = document.getElementById(`retrieved-chunk-${rank}`);
  if (!chunkEl) return;

  chunkEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  chunkEl.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.4)';
  chunkEl.style.borderColor = 'var(--primary)';

  setTimeout(() => {
    chunkEl.style.boxShadow = 'none';
    chunkEl.style.borderColor = 'var(--border)';
  }, 2000);
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
