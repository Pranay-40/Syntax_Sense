document.addEventListener('DOMContentLoaded', () => {
  loadQuestionsHistory();
});

async function loadQuestionsHistory() {
  const loading = document.getElementById('history-loading');
  const empty = document.getElementById('history-empty');
  const errorAlert = document.getElementById('history-error');
  const tableCard = document.getElementById('history-table-card');
  const tbody = document.getElementById('history-tbody');

  loading.style.display = 'block';
  empty.style.display = 'none';
  errorAlert.style.display = 'none';
  tableCard.style.display = 'none';
  tbody.innerHTML = '';

  try {
    const res = await fetch('/api/questions');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData.error && errData.error.message) || 'Failed to fetch questions');
    }

    const data = await res.json();
    loading.style.display = 'none';

    if (!data.questions || data.questions.length === 0) {
      empty.style.display = 'block';
      return;
    }

    data.questions.forEach((q) => {
      const tr = document.createElement('tr');

      // First line of question or code snippet
      let previewText = q.question_text || q.code_preview || 'Untitled Question';
      const firstLine = previewText.split('\n')[0].trim();

      // Evidence badge
      let badgeClass = 'badge-secondary';
      let badgeLabel = q.evidence_status;
      if (q.evidence_status === 'SUFFICIENT') {
        badgeClass = 'badge-ready';
        badgeLabel = 'Sufficient Evidence';
      } else if (q.evidence_status === 'INSUFFICIENT') {
        badgeClass = 'badge-warning';
        badgeLabel = 'Not Enough Evidence';
      } else if (q.evidence_status === 'NO_SOURCES') {
        badgeClass = 'badge-secondary';
        badgeLabel = 'No Sources Searched';
      }

      const localTime = new Date(q.created_at).toLocaleString();

      tr.innerHTML = `
        <td><span class="text-muted text-sm">${localTime}</span></td>
        <td>
          <a href="/questions/${q.id}" style="color: var(--primary); font-weight: 600; text-decoration: none;">
            ${escapeHtml(firstLine)}
          </a>
        </td>
        <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
        <td style="text-align: right;">
          <a href="/questions/${q.id}" class="btn btn-secondary btn-sm">
            View Answer
          </a>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tableCard.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    errorAlert.textContent = err.message || 'An error occurred while loading questions.';
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
