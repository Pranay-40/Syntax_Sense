let sourceToDeleteId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadSources();

  const confirmBtn = document.getElementById('confirm-delete-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', deleteSource);
  }
});

async function loadSources() {
  const loading = document.getElementById('sources-loading');
  const empty = document.getElementById('sources-empty');
  const errorAlert = document.getElementById('sources-error');
  const tableCard = document.getElementById('sources-table-card');
  const tbody = document.getElementById('sources-tbody');

  loading.style.display = 'block';
  empty.style.display = 'none';
  errorAlert.style.display = 'none';
  tableCard.style.display = 'none';
  tbody.innerHTML = '';

  try {
    const res = await fetch('/api/sources');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData.error && errData.error.message) || 'Failed to fetch sources');
    }

    const data = await res.json();
    loading.style.display = 'none';

    if (!data.sources || data.sources.length === 0) {
      empty.style.display = 'block';
      return;
    }

    data.sources.forEach((s) => {
      const tr = document.createElement('tr');

      // Status badge class
      let badgeClass = 'badge-pending';
      if (s.status === 'READY') badgeClass = 'badge-ready';
      else if (s.status === 'FAILED') badgeClass = 'badge-failed';
      else if (s.status === 'PROCESSING') badgeClass = 'badge-processing';

      // Type label
      let typeLabel = s.kind;
      if (s.kind === 'TEXT') typeLabel = 'Pasted Text';
      else if (s.kind === 'FILE') typeLabel = 'File';
      else if (s.kind === 'GITHUB') typeLabel = 'GitHub';

      // Format date in user's local time
      const localDate = new Date(s.created_at).toLocaleString();

      tr.innerHTML = `
        <td>
          <a href="/sources/${s.id}" style="color: var(--primary); font-weight: 600; text-decoration: none;">
            ${escapeHtml(s.name)}
          </a>
        </td>
        <td><span class="text-muted">${typeLabel}</span></td>
        <td><span class="badge ${badgeClass}">${s.status}</span></td>
        <td>${s.file_count}</td>
        <td>${s.chunk_count}</td>
        <td><span class="text-muted text-sm">${localDate}</span></td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="openDeleteModal(${s.id}, '${escapeHtml(s.name)}')">
            Delete
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tableCard.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    errorAlert.textContent = err.message || 'An unexpected error occurred while loading sources.';
    errorAlert.style.display = 'block';
  }
}

function openDeleteModal(id, name) {
  sourceToDeleteId = id;
  const msgEl = document.getElementById('delete-modal-msg');
  if (msgEl) {
    msgEl.textContent = `Are you sure you want to delete "${name}"? All associated files and chunks will be permanently removed.`;
  }
  document.getElementById('delete-modal').style.display = 'flex';
}

function closeDeleteModal() {
  sourceToDeleteId = null;
  document.getElementById('delete-modal').style.display = 'none';
}

async function deleteSource() {
  if (!sourceToDeleteId) return;
  const btn = document.getElementById('confirm-delete-btn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    const res = await fetch(`/api/sources/${sourceToDeleteId}`, {
      method: 'DELETE',
      headers: {
        'X-CSRFToken': getCookie('csrftoken'),
      },
    });

    if (res.status === 204 || res.ok) {
      closeDeleteModal();
      showToast('Source deleted successfully', 'success');
      loadSources();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast((data.error && data.error.message) || 'Failed to delete source');
    }
  } catch (err) {
    showToast('Network error while deleting source');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete';
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
