document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const errorAlert = document.getElementById('login-error');
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

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken'),
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 200) {
        window.location.href = '/';
      } else {
        const errorMsg = (data.error && data.error.message) || 'Wrong email or password';
        errorAlert.textContent = errorMsg;
        errorAlert.style.display = 'block';
      }
    } catch (err) {
      errorAlert.textContent = 'A network error occurred. Please try again.';
      errorAlert.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log in';
    }
  });
});
