function switchTab(tab) {
  ['text', 'file', 'github'].forEach((t) => {
    const tabEl = document.getElementById(`tab-${t}`);
    const paneEl = document.getElementById(`pane-${t}`);
    if (tabEl) tabEl.classList.toggle('active', t === tab);
    if (paneEl) paneEl.style.display = t === tab ? 'block' : 'none';
  });
  hideError();
}

function showError(msg) {
  const errBox = document.getElementById('add-error');
  if (errBox) {
    errBox.textContent = msg;
    errBox.style.display = 'block';
  }
}

function hideError() {
  const errBox = document.getElementById('add-error');
  if (errBox) {
    errBox.textContent = '';
    errBox.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Form Text
  const formText = document.getElementById('form-text');
  const submitTextBtn = document.getElementById('submit-text-btn');
  if (formText) {
    formText.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const name = document.getElementById('text-name').value.trim();
      const text = document.getElementById('text-content').value.trim();

      if (!name) {
        showError('Please enter a source name.');
        return;
      }
      if (!text) {
        showError('Please paste some text content.');
        return;
      }

      submitTextBtn.disabled = true;
      submitTextBtn.textContent = 'Processing…';

      try {
        const res = await fetch('/api/sources/text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
          },
          body: JSON.stringify({ name, text }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 201 && data.source) {
          window.location.href = `/sources/${data.source.id}`;
        } else {
          showError((data.error && data.error.message) || 'Failed to process pasted text.');
        }
      } catch (err) {
        showError('A network error occurred while processing the source.');
      } finally {
        submitTextBtn.disabled = false;
        submitTextBtn.textContent = 'Add source';
      }
    });
  }

  // Form File
  const formFile = document.getElementById('form-file');
  const submitFileBtn = document.getElementById('submit-file-btn');
  if (formFile) {
    formFile.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const fileInput = document.getElementById('file-input');
      if (!fileInput.files || fileInput.files.length === 0) {
        showError('Please select a file to upload.');
        return;
      }

      const file = fileInput.files[0];
      const filename = file.name.toLowerCase();

      if (filename.endsWith('.doc') && !filename.endsWith('.docx')) {
        showError('Legacy .doc files are not supported. Please upload .docx, .pdf, or .txt');
        return;
      }

      if (file.size === 0) {
        showError('Uploaded file is empty (0 bytes).');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showError(`File size exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      submitFileBtn.disabled = true;
      submitFileBtn.textContent = 'Processing…';

      try {
        const res = await fetch('/api/sources/upload', {
          method: 'POST',
          headers: {
            'X-CSRFToken': getCookie('csrftoken'),
          },
          body: formData,
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 201 && data.source) {
          window.location.href = `/sources/${data.source.id}`;
        } else {
          showError((data.error && data.error.message) || 'Failed to process uploaded file.');
        }
      } catch (err) {
        showError('A network error occurred while uploading.');
      } finally {
        submitFileBtn.disabled = false;
        submitFileBtn.textContent = 'Upload and Process';
      }
    });
  }

  // Form GitHub
  const formGithub = document.getElementById('form-github');
  const submitGithubBtn = document.getElementById('submit-github-btn');
  if (formGithub) {
    formGithub.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const url = document.getElementById('github-url').value.trim();
      if (!url) {
        showError('Please enter a GitHub repository URL.');
        return;
      }

      submitGithubBtn.disabled = true;
      submitGithubBtn.textContent = 'Processing…';

      try {
        const res = await fetch('/api/sources/github', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
          },
          body: JSON.stringify({ url }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 201 && data.source) {
          window.location.href = `/sources/${data.source.id}`;
        } else {
          showError((data.error && data.error.message) || 'Failed to import GitHub repository.');
        }
      } catch (err) {
        showError('A network error occurred while importing repository.');
      } finally {
        submitGithubBtn.disabled = false;
        submitGithubBtn.textContent = 'Import Repository';
      }
    });
  }
});
