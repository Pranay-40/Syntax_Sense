document.addEventListener('DOMContentLoaded', () => {
  const codeInput = document.getElementById('code-input');
  const questionInput = document.getElementById('question-input');
  const codeCharCount = document.getElementById('code-char-count');
  const questionCharCount = document.getElementById('question-char-count');
  const askForm = document.getElementById('ask-form');
  const askBtn = document.getElementById('ask-btn');
  const errorAlert = document.getElementById('ask-error');

  // Character counter listeners
  if (codeInput && codeCharCount) {
    codeInput.addEventListener('input', () => {
      const len = codeInput.value.length;
      codeCharCount.textContent = `${len.toLocaleString()} / 20,000`;
      if (len > 20000) codeCharCount.style.color = 'var(--error)';
      else codeCharCount.style.color = 'var(--text-muted)';
    });
  }

  if (questionInput && questionCharCount) {
    questionInput.addEventListener('input', () => {
      const len = questionInput.value.length;
      questionCharCount.textContent = `${len.toLocaleString()} / 2,000`;
      if (len > 2000) questionCharCount.style.color = 'var(--error)';
      else questionCharCount.style.color = 'var(--text-muted)';
    });
  }

  // Load ready sources for checkboxes
  loadSourceCheckboxes();

  // Handle Ask Submit
  if (askForm) {
    askForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorAlert.style.display = 'none';
      errorAlert.textContent = '';

      const code = codeInput.value.trim();
      const question = questionInput.value.trim();
      const language = document.getElementById('language-select').value;

      if (!code && !question) {
        errorAlert.textContent = 'Please provide code, a question/error, or both.';
        errorAlert.style.display = 'block';
        return;
      }

      if (code.length > 20000) {
        errorAlert.textContent = 'Code exceeds the maximum limit of 20,000 characters.';
        errorAlert.style.display = 'block';
        return;
      }

      if (question.length > 2000) {
        errorAlert.textContent = 'Question exceeds the maximum limit of 2,000 characters.';
        errorAlert.style.display = 'block';
        return;
      }

      // Gather ticked source IDs
      const checkedBoxes = document.querySelectorAll('input[name="source_ids"]:checked');
      const source_ids = Array.from(checkedBoxes).map((cb) => parseInt(cb.value, 10));

      askBtn.disabled = true;
      askBtn.textContent = 'Retrieving & Generating…';

      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
          },
          body: JSON.stringify({
            code,
            question,
            language,
            source_ids,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 201 && data.question_id) {
          window.location.href = `/questions/${data.question_id}`;
        } else {
          const msg = (data.error && data.error.message) || 'Failed to generate answer.';
          errorAlert.textContent = msg;
          errorAlert.style.display = 'block';
        }
      } catch (err) {
        errorAlert.textContent = 'Network error while contacting the assistant. Please try again.';
        errorAlert.style.display = 'block';
      } finally {
        askBtn.disabled = false;
        askBtn.textContent = 'Ask Assistant';
      }
    });
  }
});

async function loadSourceCheckboxes() {
  const loading = document.getElementById('sources-checkboxes-loading');
  const list = document.getElementById('sources-checkboxes-list');
  const banner = document.getElementById('no-sources-banner');

  try {
    const res = await fetch('/api/sources');
    if (!res.ok) {
      loading.textContent = 'Failed to load sources.';
      return;
    }

    const data = await res.json();
    loading.style.display = 'none';

    const sources = (data.sources || []).filter((s) => s.status === 'READY');

    if (sources.length === 0) {
      list.innerHTML = '<span class="text-muted text-sm" style="padding: 0.25rem;">No ready sources available.</span>';
      banner.style.display = 'flex';
      return;
    }

    banner.style.display = 'none';
    list.innerHTML = '';

    sources.forEach((s) => {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '0.5rem';
      label.style.fontWeight = 'normal';
      label.style.fontSize = '0.9rem';
      label.style.cursor = 'pointer';

      label.innerHTML = `
        <input type="checkbox" name="source_ids" value="${s.id}" checked style="width: auto;">
        <span><strong>${escapeHtml(s.name)}</strong> <span class="text-muted text-sm">(${s.kind} • ${s.chunk_count} chunks)</span></span>
      `;
      list.appendChild(label);
    });
  } catch (err) {
    loading.textContent = 'Failed to load sources.';
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
