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

    // Reduced motion or missing IntersectionObserver fallback
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
      rootMargin: '0px 0px -20px 0px',
      threshold: 0.05
    });

    revealElements.forEach(el => {
      // Immediate above-the-fold check
      const rect = el.getBoundingClientRect();
      if (rect.top < (window.innerHeight || document.documentElement.clientHeight) && rect.bottom > 0) {
        const staggerIndex = parseInt(el.getAttribute('data-stagger') || '0', 10);
        if (staggerIndex > 0) {
          setTimeout(() => el.classList.add('is-revealed'), staggerIndex * 50);
        } else {
          el.classList.add('is-revealed');
        }
      } else {
        observer.observe(el);
      }
    });

    // Failsafe timer: guarantee all elements are revealed within 600ms (zero stuck at opacity:0)
    setTimeout(() => {
      document.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach(el => {
        el.classList.add('is-revealed');
      });
    }, 600);
  }

  function initStickyHeaderShadow() {
    const header = document.getElementById('appTopbar');
    if (!header) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 15) {
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

  function initDrawerInteractions() {
    const shell = document.getElementById('appShell');
    const sidebar = document.getElementById('appSidebar');
    if (!shell || !sidebar) return;

    function closeSidebar() {
      shell.classList.remove('sidebar-open');
      document.body.style.overflow = '';
    }

    // Close on any drawer navigation link click
    sidebar.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 1024) {
          closeSidebar();
        }
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && shell.classList.contains('sidebar-open')) {
        closeSidebar();
      }
    });
  }

  // DOM ready trigger
  function initAll() {
    initScrollReveals();
    initStickyHeaderShadow();
    initDrawerInteractions();
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-rail-direction]');
      if (!button) return;
      const rail = button.closest('.ln-section').querySelector('.ln-rail');
      if (rail) rail.scrollBy({ left: Number(button.dataset.railDirection) * rail.clientWidth * 0.8, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
    const track = document.getElementById('eventMarquee');
    const toggle = document.getElementById('marqueeToggle');
    if (track && toggle) {
      toggle.addEventListener('click', () => {
        const paused = toggle.getAttribute('aria-pressed') !== 'true';
        toggle.setAttribute('aria-pressed', String(paused));
        toggle.setAttribute('aria-label', paused ? 'Play event highlights' : 'Pause event highlights');
        toggle.textContent = paused ? 'Play' : 'Pause';
        track.classList.toggle('is-paused', paused);
      });
      fetch('/api/discovery/events-qualified').then(response => {
        if (!response.ok) throw new Error('Event feed unavailable');
        return response.json();
      }).then(data => {
        const events = Array.isArray(data.events) ? data.events : [];
        if (!events.length) return;
        track.querySelectorAll('.flow-marquee-content').forEach(content => {
          content.replaceChildren();
          events.slice(0, 10).forEach(event => {
            const item = document.createElement('span');
            item.className = 'flow-marquee-item';
            item.textContent = `● ${event.event_name || event.title || ''} · ${event.event_date || event.start_date || ''} · ${event.venue || ''}`;
            content.appendChild(item);
          });
        });
      }).catch(() => { /* Keep the branded fallback on feed errors. */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Window load failsafe
  window.addEventListener('load', () => {
    setTimeout(() => {
      document.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach(el => {
        el.classList.add('is-revealed');
      });
    }, 400);
  });

  // Export helper for dynamically loaded cards (e.g. after fetchEvents())
  window.refreshTikumReveals = function() {
    initScrollReveals();
  };
})();
