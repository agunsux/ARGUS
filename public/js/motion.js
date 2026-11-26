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
        const content = track.querySelector('.flow-marquee-content');
        const seen = new Set();
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
        const eligible = events.filter(event => {
          const id = event.slug || event.event_id || event.id;
          const date = String(event.event_date || event.start_date || '').slice(0, 10);
          const status = String(event.lifecycle_status || event.status || '').toUpperCase();
          const category = String(event.category || '').toUpperCase();
          const image = event.poster_url || event.image_url;
          if (!id || seen.has(id)) return false;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || !Number.isFinite(Date.parse(date))) return false;
          if (['CANCELLED', 'CANCELED', 'POSTPONED', 'ARCHIVED', 'PAST', 'COMPLETED', 'DELETED'].includes(status)) return false;
          if (!image || event.is_fallback_image) return false;
          const imageStatus = String(event.poster_verification_status || event.image_status || '').toUpperCase();
          if (imageStatus && !['VERIFIED_OFFICIAL', 'OFFICIAL_VERIFIED', 'VERIFIED'].includes(imageStatus)) return false;
          try {
            const url = new URL(image, location.origin);
            if (!['http:', 'https:'].includes(url.protocol)) return false;
          } catch (_) { return false; }
          seen.add(id);
          return true;
        }).slice(0, 12);
        if (!content || !eligible.length) return;
        content.replaceChildren();
        eligible.forEach(event => {
          const item = document.createElement('a');
          item.className = 'marquee-poster-card';
          item.href = '/events/' + encodeURIComponent(event.slug || event.event_id || event.id);
          item.setAttribute('aria-label', `${event.event_name || event.title || 'Event'} di ${event.venue || 'Venue'}, ${event.event_date || ''}`);

          const imgWrap = document.createElement('div');
          imgWrap.className = 'marquee-poster-img-wrap';

          const image = document.createElement('img');
          image.src = event.poster_url || event.image_url;
          image.alt = 'Poster ' + (event.event_name || event.title || 'event');
          image.width = 180;
          image.height = 240;
          image.loading = 'lazy';
          image.decoding = 'async';

          const badge = document.createElement('span');
          badge.className = 'marquee-poster-badge';
          badge.textContent = event.category || 'CONCERT';

          imgWrap.append(image, badge);

          const meta = document.createElement('div');
          meta.className = 'marquee-poster-meta';

          const title = document.createElement('div');
          title.className = 'marquee-poster-title';
          title.textContent = event.event_name || event.title || 'Event';

          const sub = document.createElement('div');
          sub.className = 'marquee-poster-sub';
          sub.textContent = `${event.event_date || ''} • ${event.venue || event.city || ''}`;

          meta.append(title, sub);
          item.append(imgWrap, meta);

          image.addEventListener('error', () => {
            const index = Array.from(content.children).indexOf(item);
            const copy = track.querySelector('.flow-marquee-content[aria-hidden="true"]');
            if (copy && index >= 0 && copy.children[index]) copy.children[index].remove();
            item.remove();
            if (!content.children.length) {
              if (copy) copy.remove();
              track.classList.remove('has-posters');
              content.textContent = 'Poster event mendatang belum tersedia.';
            }
          }, { once: true });

          content.appendChild(item);
        });
        const clone = content.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('a').forEach(link => {
          link.removeAttribute('href');
          link.tabIndex = -1;
          link.setAttribute('aria-hidden', 'true');
        });
        track.appendChild(clone);
        track.classList.add('has-posters');
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
