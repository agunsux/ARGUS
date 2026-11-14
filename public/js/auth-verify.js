'use strict';
(() => {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const token = params.get('token');
  history.replaceState(null, '', location.pathname);
  const button = document.getElementById('verify');
  const status = document.getElementById('status');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token })
      });
      const result = await response.json();
      if (!response.ok) throw new Error('Verification rejected');
      const destination = new URL(result.redirect || '/', location.origin);
      location.assign(destination.origin === location.origin ? destination.pathname + destination.search : '/');
    } catch (_) {
      status.textContent = 'Tautan tidak dapat digunakan. Minta tautan baru atau coba lagi.';
      button.disabled = false;
    }
  });
})();