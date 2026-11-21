/**
 * TIKUM — Flow Ninja Motion Engine
 * Lightweight, GPU-accelerated micro-interactions & scroll reveals.
 * Zero external libraries, strictly prefers-reduced-motion compliant.
 */

(function initTikumMotion() {
  if (typeof window === 'undefined') return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initScrollReveals() {
    const revealElements = document.querySelectorAll('[data-reveal]');
    if (!revealElements.length) return;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      revealElements.forEach(el => el.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const staggerIndex = parseInt(el.getAttribute('data-stagger') || '0', 10);
          if (staggerIndex > 0) {
            setTimeout(() => {
              el.classList.add('is-revealed');
            }, staggerIndex * 60);
          } else {
            el.classList.add('is-revealed');
          }
          obs.unobserve(el);
        }
      });
    }, {
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.08
    });

    revealElements.forEach(el => observer.observe(el));
  }

  function initStickyHeaderShadow() {
    const header = document.getElementById('appTopbar');
    if (!header) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 20) {
            header.classList.add('is-scrolled');
          } else {
            header.classList.remove('is-scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // DOM ready trigger
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initScrollReveals();
      initStickyHeaderShadow();
    });
  } else {
    initScrollReveals();
    initStickyHeaderShadow();
  }

  // Export helper for dynamically loaded cards (e.g. after fetchEvents())
  window.refreshTikumReveals = function() {
    initScrollReveals();
  };
})();
