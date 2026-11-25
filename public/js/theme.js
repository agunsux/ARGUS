/* Canonical Dark Mode enforcer; Light Mode is not a user-selectable theme. */
(function () {
  'use strict';
  var key = 'tikum_theme';
  var LOCKED_THEME = 'dark';

  function render() {
    document.documentElement.dataset.theme = LOCKED_THEME;
    document.documentElement.style.colorScheme = LOCKED_THEME;
    if (document.body) {
      document.body.classList.add('dark-mode');
    }
    try {
      localStorage.setItem(key, LOCKED_THEME);
    } catch (error) { /* storage may be disabled */ }

    document.querySelectorAll('[data-theme-toggle], #btnThemeToggle, #themeToggle').forEach(function (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      el.style.display = 'none';
    });
  }

  var api = {
    get: function () { return LOCKED_THEME; },
    set: function () { render(); return LOCKED_THEME; },
    toggle: function () { render(); return LOCKED_THEME; },
    isLockedDark: function () { return true; }
  };

  window.TikumTheme = api;
  render();
  document.addEventListener('DOMContentLoaded', render);
})();
