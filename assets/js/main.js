/* ===========================
   LIBERTY COUNTY RP — MAIN JS
   =========================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ── PARTICLES ── */
  const canvas = document.getElementById('particles-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    const particles = [];
    const COUNT = 45;

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2.5 + 1,
        a: Math.random() * 0.5 + 0.15,
        c: i % 3 === 0 ? '96,165,250' : i % 3 === 1 ? '59,130,246' : '37,99,235',
      });
    }

    function drawParticles() {
      ctx.clearRect(0, 0, w, h);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.c}, ${p.a})`;
        ctx.fill();
      });

      // (No connection lines)
    }

    let animId = null;
    function animateParticles() {
      drawParticles();
      animId = requestAnimationFrame(animateParticles);
    }
    function pauseParticles() { if (animId) { cancelAnimationFrame(animId); animId = null; } }
    function resumeParticles() { if (!animId) animateParticles(); }
    document.addEventListener('visibilitychange', () => {
      document.hidden ? pauseParticles() : resumeParticles();
    });
    animateParticles();

    window.addEventListener('resize', () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    });
  }

  /* ── SCROLL REVEAL ── */
  const revealEls = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealEls.forEach(el => observer.observe(el));

  /* ── HEADER SCROLL STATE ── */
  const header = document.querySelector('.header');
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const sy = window.scrollY;
    if (header) header.classList.toggle('scrolled', sy > 40);
    lastScroll = sy;
  });

  /* ── HAMBURGER ── */
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');
  hamburger?.addEventListener('click', () => {
    mobileNav?.classList.toggle('open');
  });

  /* ── CLOSE MOBILE NAV ON LINK CLICK ── */
  mobileNav?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => mobileNav.classList.remove('open'));
  });

  /* ── ERLC PLAYER COUNT ── */
  const countEl = document.getElementById('player-count');
  const liveDot = document.getElementById('live-dot');

  async function fetchPlayerCount() {
    try {
      const res = await fetch('/.netlify/functions/proxy?path=/v1/server');
      const data = await res.json();
      const playing = data.CurrentPlayers ?? data.playerCount ?? 0;
      if (playing !== undefined && countEl) {
        countEl.textContent = String(Math.min(playing, 50)).padStart(2, '0');
      }
    } catch (_) {
      if (countEl && countEl.textContent === '--') countEl.textContent = '--';
    }
  }

  if (countEl) {
    countEl.textContent = '--';
    fetchPlayerCount();
    setInterval(fetchPlayerCount, 30000);
  }
  if (liveDot) {
    setInterval(() => {
      liveDot.style.animation = 'none';
      void liveDot.offsetWidth;
      liveDot.style.animation = 'pulse-dot 2s ease-out infinite';
    }, 30000);
  }

  /* ── ROBLOX HEaDSHOTS ── */
  const avatarEls = document.querySelectorAll('[data-roblox-id]');
  avatarEls.forEach(el => {
    const userId = el.getAttribute('data-roblox-id');
    if (!userId) return;
    const img = el.querySelector('img');
    if (!img) return;
    img.loading = 'lazy';
    fetch(`/.netlify/functions/roblox-avatar/${userId}`)
      .then(r => r.json())
      .then(d => {
        if (d.url) {
          img.onload = () => { img.style.display = 'block'; };
          img.src = d.url;
        }
      })
      .catch(() => {});
  });
});
