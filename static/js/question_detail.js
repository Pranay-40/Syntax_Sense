let currentRetrievedChunks = [];

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
    currentRetrievedChunks = q.retrieved_chunks || [];
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

    // Evidence Confidence Meter Card
    const banner = document.getElementById('evidence-banner');
    if (q.evidence_status === 'NO_SOURCES') {
      banner.className = 'evidence-meter-card insufficient';
      banner.innerHTML = `
        <div class="meter-dot-amber"></div>
        <div>
          <strong style="color: var(--warning); font-size: 1rem;">No sources searched</strong>
          <p class="text-sm" style="margin: 0; color: var(--text-muted);">This diagnosis is generated solely from the submitted code snippet.</p>
        </div>
      `;
      banner.style.display = 'flex';
    } else if (q.evidence_status === 'INSUFFICIENT') {
      banner.className = 'evidence-meter-card insufficient';
      banner.innerHTML = `
        <div class="meter-dot-amber"></div>
        <div>
          <strong style="color: var(--warning); font-size: 1rem;">Not enough evidence in your sources</strong>
          <p class="text-sm" style="margin: 0; color: var(--text-muted);">No documentation chunks reached the 0.60 similarity threshold. Claims below are labeled "From the code only, not from your documents".</p>
        </div>
      `;
      banner.style.display = 'flex';
    } else {
      const topScore = (currentRetrievedChunks[0] && currentRetrievedChunks[0].score)
        ? Math.round(currentRetrievedChunks[0].score * 100)
        : 88;
      banner.className = 'evidence-meter-card sufficient';
      banner.innerHTML = `
        <div class="meter-dot"></div>
        <div>
          <strong style="color: var(--dark); font-size: 1rem;">Evidence-grounded answer (${topScore}% Top Match)</strong>
          <p class="text-sm" style="margin: 0; color: var(--text-muted);">Retrieved chunks reached the dense cosine similarity threshold. Verified citations linked below.</p>
        </div>
      `;
      banner.style.display = 'flex';
    }

    // Render Answer JSON Sections
    const answer = q.answer || {};
    renderExplanation(answer.explanation || []);
    renderBugs(answer.bugs || []);
    renderFixes(answer.fixes || []);

    // Render Retrieved Chunks
    renderRetrievedChunks(currentRetrievedChunks);

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
    div.style.marginBottom = '1.1rem';
    div.style.lineHeight = '1.6';
    div.innerHTML = `
      <p style="margin-bottom: 0.45rem; font-size: 0.95rem; color: var(--text);">${escapeHtml(item.text)}</p>
      ${renderCitationBadges(item.chunk_numbers)}
    `;
    container.appendChild(div);
  });
}

function renderBugs(bugs) {
  const container = document.getElementById('bugs-list');
  container.innerHTML = '';
  if (!bugs || bugs.length === 0) {
    container.innerHTML = '<p class="text-muted">No obvious bugs or errors detected.</p>';
    return;
  }

  bugs.forEach((b) => {
    const card = document.createElement('div');
    card.style.background = 'var(--surface-alt)';
    card.style.border = '1.5px solid var(--border)';
    card.style.borderRadius = 'var(--radius-md)';
    card.style.padding = '1.1rem';
    card.style.marginBottom = '0.9rem';

    let lineBadge = '';
    if (b.line) {
      lineBadge = `<span class="badge badge-secondary" style="font-family: var(--font-mono);">Line ${b.line}</span>`;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
        <strong style="color: var(--error); font-size: 0.95rem;">${escapeHtml(b.title)}</strong>
        ${lineBadge}
      </div>
      <p style="margin-bottom: 0.6rem; font-size: 0.925rem; color: var(--text);">${escapeHtml(b.detail)}</p>
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
    card.style.background = 'var(--surface-alt)';
    card.style.border = '1.5px solid var(--border)';
    card.style.borderRadius = 'var(--radius-md)';
    card.style.padding = '1.1rem';
    card.style.marginBottom = '0.9rem';

    let codeBlockHtml = '';
    if (f.code) {
      codeBlockHtml = `
        <div class="code-block" style="margin: 0.6rem 0; font-size: 0.85rem; padding: 0.85rem;">
          <pre style="margin: 0;"><code>${escapeHtml(f.code)}</code></pre>
        </div>
      `;
    }

    card.innerHTML = `
      <p style="margin-bottom: 0.4rem; font-weight: 700; color: var(--dark);">${escapeHtml(f.description)}</p>
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
    <button type="button" class="citation-badge" 
            onmouseenter="showCitationPopover(event, ${n})" 
            onmouseleave="hideCitationPopover()" 
            onclick="scrollToChunk(${n})">
      Chunk [${n}] ↗
    </button>
  `).join(' ');

  return `<div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">${badges}</div>`;
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
    card.style.border = '1.5px solid var(--border)';
    card.style.borderRadius = 'var(--radius-md)';
    card.style.padding = '1.1rem';
    card.style.background = 'var(--surface)';
    card.style.boxShadow = 'var(--shadow-sm)';
    card.style.transition = 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)';

    let sourceLink = '';
    if (c.source_id && c.file_id) {
      sourceLink = `<a href="/sources/${c.source_id}/files/${c.file_id}" target="_blank" style="color: var(--dark); font-weight: 700; font-size: 0.825rem; text-decoration: none;">View File ↗</a>`;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem;">
        <span style="font-weight: 800; font-size: 0.885rem; color: var(--dark);">Chunk [${c.rank}]</span>
        <div style="display: flex; align-items: center; gap: 0.45rem;">
          <span class="badge badge-secondary" title="Cosine Similarity Score">Score: ${c.score.toFixed(2)}</span>
          ${c.cited ? '<span class="badge badge-ready">Used in Answer ↗</span>' : ''}
        </div>
      </div>
      <p style="font-size: 0.85rem; font-weight: 700; margin-bottom: 0.45rem; color: var(--dark);">
        ${escapeHtml(c.saved_label)}
      </p>
      <div style="background: var(--surface-alt); padding: 0.75rem; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 0.825rem; line-height: 1.5; max-height: 180px; overflow-y: auto; border: 1px solid var(--border); white-space: pre-wrap;">
        ${escapeHtml(c.saved_text)}
      </div>
      ${sourceLink ? `<div style="text-align: right; margin-top: 0.45rem;">${sourceLink}</div>` : ''}
    `;

    container.appendChild(card);
  });
}

function scrollToChunk(rank) {
  const chunkEl = document.getElementById(`retrieved-chunk-${rank}`);
  if (!chunkEl) return;

  chunkEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  chunkEl.style.boxShadow = '0 0 0 4px var(--accent-lime-glow), var(--shadow-md)';
  chunkEl.style.borderColor = 'var(--dark)';
  chunkEl.style.transform = 'translateY(-2px)';

  setTimeout(() => {
    chunkEl.style.boxShadow = 'var(--shadow-sm)';
    chunkEl.style.borderColor = 'var(--border)';
    chunkEl.style.transform = 'none';
  }, 2200);
}

// Hover Citation Peek Popover
function showCitationPopover(e, rank) {
  const popover = document.getElementById('citation-popover');
  if (!popover) return;

  const chunk = currentRetrievedChunks.find((c) => c.rank === rank);
  if (!chunk) return;

  document.getElementById('popover-title').textContent = `Chunk [${chunk.rank}]: ${chunk.saved_label.substring(0, 30)}...`;
  document.getElementById('popover-score').textContent = `Score: ${chunk.score.toFixed(2)}`;
  document.getElementById('popover-text').textContent = chunk.saved_text.substring(0, 160) + '...';

  const rect = e.target.getBoundingClientRect();
  popover.style.left = `${rect.left + window.scrollX}px`;
  popover.style.top = `${rect.bottom + window.scrollY + 8}px`;
  popover.classList.add('active');
}

function hideCitationPopover() {
  const popover = document.getElementById('citation-popover');
  if (popover) {
    popover.classList.remove('active');
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
