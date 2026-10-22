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
      else codeCharCount.style.color = '#94A3B8';
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

  // Load ready sources for interactive cards
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
        askBtn.textContent = 'Explain & Diagnose ↗';
      }
    });
  }
});

// Interactive Source Cards
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
      let icon = '📝';
      if (s.kind === 'GITHUB') icon = '🐙';
      else if (s.kind === 'FILE') icon = '📄';

      const card = document.createElement('div');
      card.className = 'source-card selected';
      card.id = `source-card-${s.id}`;
      card.onclick = () => toggleSourceCard(s.id);

      card.innerHTML = `
        <input type="checkbox" name="source_ids" value="${s.id}" checked style="display: none;" id="cb-source-${s.id}">
        <div class="source-card-header">
          <div class="source-icon-badge">${icon}</div>
          <div class="source-toggle-indicator" id="indicator-${s.id}">✓</div>
        </div>
        <div class="source-card-name">${escapeHtml(s.name)}</div>
        <div class="source-card-meta">
          <span class="badge badge-secondary" style="font-size: 0.7rem;">${s.kind}</span>
          <span class="text-muted text-sm" style="font-size: 0.8rem;">${s.chunk_count} chunks</span>
        </div>
      `;
      list.appendChild(card);
    });
  } catch (err) {
    loading.textContent = 'Failed to load sources.';
  }
}

function toggleSourceCard(id) {
  const cb = document.getElementById(`cb-source-${id}`);
  const card = document.getElementById(`source-card-${id}`);
  const indicator = document.getElementById(`indicator-${id}`);
  if (!cb || !card) return;

  cb.checked = !cb.checked;
  if (cb.checked) {
    card.classList.add('selected');
    indicator.textContent = '✓';
  } else {
    card.classList.remove('selected');
    indicator.textContent = '';
  }
}

function toggleAllSources() {
  const cbs = document.querySelectorAll('input[name="source_ids"]');
  if (!cbs.length) return;
  const anyChecked = Array.from(cbs).some((cb) => cb.checked);
  cbs.forEach((cb) => {
    const sId = cb.value;
    const card = document.getElementById(`source-card-${sId}`);
    const indicator = document.getElementById(`indicator-${sId}`);
    cb.checked = !anyChecked;
    if (cb.checked) {
      if (card) card.classList.add('selected');
      if (indicator) indicator.textContent = '✓';
    } else {
      if (card) card.classList.remove('selected');
      if (indicator) indicator.textContent = '';
    }
  });
}

// Quick Presets
const PRESETS = {
  requests: {
    language: 'python',
    code: `import requests

def fetch_user_data(user_id):
    url = f"https://api.example.com/users/{user_id}"
    response = requests.get(url, timeout=5)
    
    # Bug: trying to access json data without status check or error handling
    data = response.json()
    return data["username"]
`,
    question: `How should I handle JSON decoding errors with requests, and how do I raise an exception if the HTTP status code is 4xx or 5xx?`
  },
  security: {
    language: 'python',
    code: `import sqlite3

def find_user(username):
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    # Security risk: String concatenation in SQL query
    query = f"SELECT * FROM users WHERE username = '{username}'"
    cursor.execute(query)
    return cursor.fetchone()
`,
    question: `Why is string formatting in SQL dangerous, how can this cause connection leaks, and what is the proper parameterized query fix?`
  },
  async: {
    language: 'python',
    code: `import asyncio

async def fetch_item(item_id):
    await asyncio.sleep(1)
    return {"id": item_id}

async def process_batch(items):
    results = []
    # Bug: Awaiting sequentially instead of gathering concurrently
    for item in items:
        res = await fetch_item(item)
        results.append(res)
    return results
`,
    question: `How can I run these async tasks concurrently with error isolation and timeout protection?`
  }
};

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;

  const codeInput = document.getElementById('code-input');
  const questionInput = document.getElementById('question-input');
  const langSelect = document.getElementById('language-select');

  if (codeInput) {
    codeInput.value = preset.code;
    codeInput.dispatchEvent(new Event('input'));
  }
  if (questionInput) {
    questionInput.value = preset.question;
    questionInput.dispatchEvent(new Event('input'));
  }
  if (langSelect && preset.language) {
    langSelect.value = preset.language;
  }

  // Smooth scroll to card
  document.getElementById('ask-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Utility Bar Functions
function copyEditorCode() {
  const codeInput = document.getElementById('code-input');
  const copyBtn = document.getElementById('copy-code-btn');
  const copyText = document.getElementById('copy-text');
  if (!codeInput || !codeInput.value) return;

  navigator.clipboard.writeText(codeInput.value).then(() => {
    copyText.textContent = 'Copied! ✓';
    setTimeout(() => {
      copyText.textContent = 'Copy';
    }, 2000);
  });
}

function clearEditorCode() {
  const codeInput = document.getElementById('code-input');
  if (codeInput) {
    codeInput.value = '';
    codeInput.dispatchEvent(new Event('input'));
  }
}

// FAQ Accordion Toggle
function toggleFaq(item) {
  const isActive = item.classList.contains('active');
  document.querySelectorAll('.faq-item').forEach((el) => el.classList.remove('active'));
  if (!isActive) {
    item.classList.add('active');
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
