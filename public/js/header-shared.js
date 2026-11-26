/**
 * TIKUM Shared Header Runtime (Dark-Mode Locked, 6 Variants, 5 Languages, Mobile Drawer)
 * Works seamlessly across static HTML and SSR Express routes without a frontend framework.
 */
(function () {
  'use strict';

  var FIVE_LANGS = [
    { code: 'id', short: 'ID', native: 'Bahasa Indonesia' },
    { code: 'en', short: 'EN', native: 'English' },
    { code: 'ms', short: 'MS', native: 'Bahasa Melayu' },
    { code: 'tl', short: 'TL', native: 'Filipino' },
    { code: 'th', short: 'TH', native: 'ไทย' }
  ];

  function getActiveLang() {
    if (window.TikumI18n && typeof window.TikumI18n.getLang === 'function') {
      return window.TikumI18n.getLang() || 'id';
    }
    return document.documentElement.lang || 'id';
  }

  function getLangMeta(code) {
    var norm = String(code || 'id').trim().toLowerCase().replace(/_/g, '-');
    if (norm === 'fil' || norm.indexOf('fil-') === 0) norm = 'tl';
    if (norm === 'in' || norm.indexOf('in-') === 0) norm = 'id';
    for (var i = 0; i < FIVE_LANGS.length; i++) {
      if (FIVE_LANGS[i].code === norm || norm.indexOf(FIVE_LANGS[i].code + '-') === 0) {
        return FIVE_LANGS[i];
      }
    }
    return FIVE_LANGS[0];
  }

  function closeAllLangMenus(exceptMenu) {
    document.querySelectorAll('.tikum-lang-menu.is-open').forEach(function (menu) {
      if (menu !== exceptMenu) {
        menu.classList.remove('is-open');
        var trigger = menu.parentElement && menu.parentElement.querySelector('[aria-expanded]');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function renderTriggerLabel(btn, langCode) {
    var meta = getLangMeta(langCode);
    btn.setAttribute('data-active-lang', meta.code);
    btn.setAttribute('aria-label', 'Pilih bahasa / Select language (' + meta.native + ')');
    btn.setAttribute('title', meta.native);
    btn.innerHTML = '<i class="fa-solid fa-globe" aria-hidden="true"></i> <span class="tikum-lang-current">' + meta.short + '</span> <i class="fa-solid fa-chevron-down" style="font-size:10px;opacity:0.75;" aria-hidden="true"></i>';
  }

  function updateAllMenus(langCode) {
    var meta = getLangMeta(langCode);
    document.querySelectorAll('.tikum-lang-wrap').forEach(function (wrap) {
      var trigger = wrap.querySelector('[data-tikum-lang-trigger]');
      if (trigger) renderTriggerLabel(trigger, meta.code);
      wrap.querySelectorAll('.tikum-lang-option').forEach(function (opt) {
        var active = opt.getAttribute('data-lang-code') === meta.code;
        opt.classList.toggle('is-active', active);
        opt.setAttribute('aria-checked', String(active));
      });
    });
  }

  function enhanceLanguageSwitchers() {
    var selectors = '#langToggle, #btnLangToggle, #footerLangToggle, .lang-toggle-btn, .lang-switcher-pill, .btn-lang-toggle';
    document.querySelectorAll(selectors).forEach(function (btn) {
      if (btn.getAttribute('data-tikum-lang-enhanced') === '1') return;
      btn.setAttribute('data-tikum-lang-enhanced', '1');
      btn.setAttribute('data-tikum-lang-trigger', '1');
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');

      // Remove legacy inline onclick so clicking opens the 5-language picker reliably
      if (btn.hasAttribute('onclick')) {
        btn.removeAttribute('onclick');
      }

      var wrap = btn.closest('.tikum-lang-wrap');
      if (!wrap) {
        wrap = document.createElement('span');
        wrap.className = 'tikum-lang-wrap';
        btn.parentNode.insertBefore(wrap, btn);
        wrap.appendChild(btn);
      }

      var menu = wrap.querySelector('.tikum-lang-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'tikum-lang-menu';
        if (btn.id === 'footerLangToggle' || btn.closest('footer')) {
          menu.classList.add('tikum-lang-menu--up');
        }
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Language selector');

        FIVE_LANGS.forEach(function (lang) {
          var item = document.createElement('button');
          item.type = 'button';
          item.className = 'tikum-lang-option';
          item.setAttribute('role', 'menuitemradio');
          item.setAttribute('data-lang-code', lang.code);
          item.setAttribute('aria-checked', 'false');
          item.innerHTML = '<span>' + lang.native + '</span><span class="tikum-lang-code">' + lang.short + '</span>';
          item.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (window.TikumI18n && typeof window.TikumI18n.setLang === 'function') {
              window.TikumI18n.setLang(lang.code);
            }
            updateAllMenus(lang.code);
            closeAllLangMenus(null);
            btn.focus();
          });
          menu.appendChild(item);
        });
        wrap.appendChild(menu);
      }

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var willOpen = !menu.classList.contains('is-open');
        closeAllLangMenus(willOpen ? menu : null);
        menu.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
      });
    });

    updateAllMenus(getActiveLang());
  }

  function initSharedDrawers() {
    // 1. Generic non-AppShell mobile drawer (.tikum-mobile-toggle -> .tikum-mobile-drawer or .ops-sidebar)
    document.querySelectorAll('.tikum-mobile-toggle').forEach(function (toggle) {
      if (toggle.getAttribute('data-bound-drawer') === '1') return;
      toggle.setAttribute('data-bound-drawer', '1');
      toggle.addEventListener('click', function () {
        var targetId = toggle.getAttribute('aria-controls');
        var drawer = targetId ? document.getElementById(targetId) : document.querySelector('.tikum-mobile-drawer');
        if (drawer) {
          var open = !drawer.classList.contains('is-open');
          drawer.classList.toggle('is-open', open);
          toggle.setAttribute('aria-expanded', String(open));
          document.body.style.overflow = open ? 'hidden' : '';
          return;
        }
        var opsSidebar = document.querySelector('.ops-sidebar');
        if (opsSidebar) {
          var opsOpen = !opsSidebar.classList.contains('is-mobile-open');
          opsSidebar.classList.toggle('is-mobile-open', opsOpen);
          toggle.setAttribute('aria-expanded', String(opsOpen));
        }
      });
    });

    document.querySelectorAll('.tikum-mobile-drawer').forEach(function (drawer) {
      if (drawer.getAttribute('data-bound-close') === '1') return;
      drawer.setAttribute('data-bound-close', '1');
      function closeDrawer() {
        drawer.classList.remove('is-open');
        document.body.style.overflow = '';
        document.querySelectorAll('.tikum-mobile-toggle[aria-controls="' + drawer.id + '"]').forEach(function (btn) {
          btn.setAttribute('aria-expanded', 'false');
        });
      }
      var backdrop = drawer.querySelector('.tikum-mobile-drawer__backdrop');
      if (backdrop) backdrop.addEventListener('click', closeDrawer);
      drawer.querySelectorAll('[data-drawer-close], a').forEach(function (el) {
        el.addEventListener('click', closeDrawer);
      });
    });

    // 2. AppShell mobile sidebar support (only bind if not already wired by inline initAppShell)
    var shell = document.getElementById('appShell');
    var mobToggle = document.getElementById('sidebarToggleMobile');
    var closeMob = document.getElementById('sidebarCloseMobile');
    var backdrop = document.getElementById('sidebarBackdrop');
    if (shell && mobToggle && !mobToggle.getAttribute('data-shared-bound') && typeof window.initAppShell !== 'function') {
      mobToggle.setAttribute('data-shared-bound', '1');
      mobToggle.addEventListener('click', function () {
        shell.classList.add('sidebar-open');
        document.body.style.overflow = 'hidden';
      });
      if (closeMob) {
        closeMob.addEventListener('click', function () {
          shell.classList.remove('sidebar-open');
          document.body.style.overflow = '';
        });
      }
      if (backdrop) {
        backdrop.addEventListener('click', function () {
          shell.classList.remove('sidebar-open');
          document.body.style.overflow = '';
        });
      }
    }
  }

  function initGlobalEvents() {
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.tikum-lang-wrap')) {
        closeAllLangMenus(null);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAllLangMenus(null);
        document.querySelectorAll('.tikum-mobile-drawer.is-open').forEach(function (d) {
          d.classList.remove('is-open');
          document.body.style.overflow = '';
        });
        var opsSidebar = document.querySelector('.ops-sidebar.is-mobile-open');
        if (opsSidebar) opsSidebar.classList.remove('is-mobile-open');
      }
    });
    window.addEventListener('tikum:locale-change', function (e) {
      var lang = e && e.detail && e.detail.locale ? e.detail.locale : getActiveLang();
      updateAllMenus(lang);
    });
  }

  function boot() {
    if (window.TikumTheme && typeof window.TikumTheme.set === 'function') {
      window.TikumTheme.set('dark');
    }
    enhanceLanguageSwitchers();
    initSharedDrawers();
    initGlobalEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.TikumHeaderShared = {
    enhanceLanguageSwitchers: enhanceLanguageSwitchers,
    updateAllMenus: updateAllMenus,
    languages: FIVE_LANGS
  };
})();
