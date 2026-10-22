let currentSourceId = null;

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('explorer-app');
  if (!app) return;
  currentSourceId = app.dataset.sourceId;
  if (currentSourceId) {
    loadSourceDetails(currentSourceId);
  }
});

async function loadSourceDetails(id) {
  const loading = document.getElementById('explorer-loading');
  const errorAlert = document.getElementById('explorer-error');
  const docView = document.getElementById('document-view');
  const repoView = document.getElementById('repository-view');

  loading.style.display = 'block';
  errorAlert.style.display = 'none';
  docView.style.display = 'none';
  repoView.style.display = 'none';

  try {
    const res = await fetch(`/api/sources/${id}`);
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    if (res.status === 403) {
      window.location.href = '/sources';
      return;
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData.error && errData.error.message) || 'Failed to load source details');
    }

    const data = await res.json();
    const source = data.source;
    loading.style.display = 'none';

    // Header
    document.getElementById('source-name').textContent = source.name;
    const badge = document.getElementById('source-status-badge');
    badge.textContent = source.status;
    badge.className = `badge badge-${source.status.toLowerCase()}`;

    let metaText = `Type: ${source.kind} • ${source.file_count} files • ${source.chunk_count} chunks • Added on ${new Date(source.created_at).toLocaleString()}`;
    if (source.origin_url) {
      metaText += ` • <a href="${escapeHtml(source.origin_url)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary);">${escapeHtml(source.origin_url)}</a>`;
    }
    document.getElementById('source-meta').innerHTML = metaText;

    if (source.status === 'FAILED' && source.error_message) {
      errorAlert.textContent = `Processing failed: ${source.error_message}`;
      errorAlert.style.display = 'block';
    }

    if (source.kind === 'GITHUB') {
      renderRepositoryView(source);
    } else {
      renderDocumentView(source);
    }
  } catch (err) {
    loading.style.display = 'none';
    errorAlert.textContent = err.message || 'An unexpected error occurred.';
    errorAlert.style.display = 'block';
  }
}

function renderDocumentView(source) {
  const docView = document.getElementById('document-view');
  const tbody = document.getElementById('document-files-tbody');
  tbody.innerHTML = '';

  (source.files || []).forEach((f) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(f.path)}</strong></td>
      <td><span class="text-muted">${escapeHtml(f.topic || '—')}</span></td>
      <td>${f.page_count !== null ? f.page_count : '—'}</td>
      <td>${f.chunk_count}</td>
      <td><span class="badge badge-${f.status.toLowerCase()}">${f.status}</span></td>
      <td style="text-align: right;">
        <a href="/sources/${source.id}/files/${f.id}" class="btn btn-secondary btn-sm">
          Inspect & Chunks
        </a>
      </td>
    `;
    tbody.appendChild(tr);
  });

  docView.style.display = 'block';
}

function renderRepositoryView(source) {
  const repoView = document.getElementById('repository-view');
  const counts = source.counts || { total: 0, supported: 0, skipped: 0 };

  document.getElementById('repo-count-total').textContent = counts.total;
  document.getElementById('repo-count-supported').textContent = counts.supported;
  document.getElementById('repo-count-skipped').textContent = counts.skipped;

  // Folder Tree
  const treeContainer = document.getElementById('folder-tree-container');
  treeContainer.innerHTML = '';
  if (source.folder_tree && source.folder_tree.length > 0) {
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '0';
    renderTreeNodes(source.folder_tree, ul, source.id);
    treeContainer.appendChild(ul);
  } else {
    treeContainer.innerHTML = '<span class="text-muted">No folder hierarchy to display.</span>';
  }

  // Repository files table
  const tbody = document.getElementById('repo-files-tbody');
  tbody.innerHTML = '';

  (source.files || []).forEach((f) => {
    const tr = document.createElement('tr');
    let actionOrDetail = '';
    if (f.status === 'READY') {
      actionOrDetail = `<a href="/sources/${source.id}/files/${f.id}" class="btn btn-secondary btn-sm">Preview Code</a>`;
    } else {
      actionOrDetail = `<span class="text-muted text-sm">${escapeHtml(f.skip_reason || 'Skipped')}</span>`;
    }

    tr.innerHTML = `
      <td>
        ${f.status === 'READY' 
          ? `<a href="/sources/${source.id}/files/${f.id}" style="color: var(--primary); font-weight: 500; text-decoration: none;">${escapeHtml(f.path)}</a>`
          : `<span class="text-muted">${escapeHtml(f.path)}</span>`}
      </td>
      <td><span class="text-muted">${escapeHtml(f.language || '—')}</span></td>
      <td><span class="badge badge-${f.status.toLowerCase()}">${f.status}</span></td>
      <td>${f.chunk_count}</td>
      <td>${actionOrDetail}</td>
    `;
    tbody.appendChild(tr);
  });

  repoView.style.display = 'block';
}

function renderTreeNodes(nodes, parentEl, sourceId) {
  nodes.forEach((node) => {
    const li = document.createElement('li');
    li.style.marginBottom = '0.2rem';

    if (node.type === 'dir') {
      li.innerHTML = `📁 <strong>${escapeHtml(node.name)}/</strong>`;
      if (node.children && node.children.length > 0) {
        const subUl = document.createElement('ul');
        subUl.style.listStyle = 'none';
        subUl.style.paddingLeft = '1.25rem';
        renderTreeNodes(node.children, subUl, sourceId);
        li.appendChild(subUl);
      }
    } else {
      if (node.status === 'READY' && node.id) {
        li.innerHTML = `📄 <a href="/sources/${sourceId}/files/${node.id}" style="color: var(--primary); text-decoration: none;">${escapeHtml(node.name)}</a> <span class="text-muted text-sm">(${node.chunk_count} chunks)</span>`;
      } else {
        li.innerHTML = `📄 <span class="text-muted">${escapeHtml(node.name)} (skipped)</span>`;
      }
    }
    parentEl.appendChild(li);
  });
}

function openDeleteModal() {
  document.getElementById('delete-modal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('delete-modal').style.display = 'none';
}

async function confirmDelete() {
  if (!currentSourceId) return;
  const btn = document.getElementById('confirm-delete-btn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    const res = await fetch(`/api/sources/${currentSourceId}`, {
      method: 'DELETE',
      headers: {
        'X-CSRFToken': getCookie('csrftoken'),
      },
    });

    if (res.status === 204 || res.ok) {
      window.location.href = '/sources';
    } else {
      const data = await res.json().catch(() => ({}));
      showToast((data.error && data.error.message) || 'Failed to delete source');
      closeDeleteModal();
    }
  } catch (err) {
    showToast('Network error while deleting source');
    closeDeleteModal();
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
