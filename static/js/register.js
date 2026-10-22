document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const errorAlert = document.getElementById('register-error');
  const submitBtn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAlert.style.display = 'none';
    errorAlert.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      errorAlert.textContent = 'Email and password are required.';
      errorAlert.style.display = 'block';
      return;
    }

    if (password.length < 8 || password.length > 128) {
      errorAlert.textContent = 'Password must be between 8 and 128 characters.';
      errorAlert.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken'),
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 201) {
        window.location.href = '/';
      } else {
        const errorMsg = (data.error && data.error.message) || 'Failed to create account.';
        errorAlert.textContent = errorMsg;
        errorAlert.style.display = 'block';
      }
    } catch (err) {
      errorAlert.textContent = 'A network error occurred. Please try again.';
      errorAlert.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create account';
    }
  });
});
