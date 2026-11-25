(function () {
  'use strict';

  const overlay = document.getElementById('dodge-overlay');
  if (!overlay) return;

  const playBtn = document.getElementById('play-dodge');
  const canvas = document.getElementById('dodge-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const stage = document.getElementById('dodge-stage');
  const exitBtn = document.getElementById('dodge-exit');
  const messageEl = document.getElementById('dodge-message');
  const messageAction = document.getElementById('dodge-action');
  const messageTitle = document.getElementById('dodge-title');
  const messageSubtitle = document.getElementById('dodge-subtitle');
  const scoreEl = document.getElementById('dodge-score');
  const livesEl = document.getElementById('dodge-lives');
  const bestEl = document.getElementById('dodge-best');

  const BEST_KEY = 'quicknotes.dodge.best.v1';

  const G = {
    mode: 'idle',
    W: 0,
    H: 0,
    score: 0,
    lives: 3,
    best: 0,
    shieldX: 0,
    shieldW: 0,
    shieldH: 0,
    mines: [],
    spawnTimer: 0,
    shake: 0,
    invincible: 0,
    time: 0,
    raf: 0,
    last: 0
  };

  let pointerActive = false;

  function readBest() {
    try {
      const n = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch (err) {
      return 0;
    }
  }

  function writeBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (err) {
      /* storage unavailable */
    }
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function clearMessages() {
    messageEl.classList.add('hidden');
  }

  function showMessage(title, subtitle, action) {
    messageTitle.textContent = title;
    messageSubtitle.textContent = subtitle;
    messageAction.textContent = action;
    messageEl.classList.remove('hidden');
  }

  function updateHud() {
    scoreEl.textContent = String(G.score);
    livesEl.textContent = String(G.lives);
    bestEl.textContent = String(G.best);
  }

  function mineSpeed() {
    return Math.min(150 + G.time * 8, 560);
  }

  function resize() {
    if (overlay.classList.contains('hidden')) return;
    const rect = stage.getBoundingClientRect();
    const W = Math.max(120, Math.round(rect.width));
    const H = Math.max(120, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    G.W = W;
    G.H = H;
    G.shieldW = clamp(W * 0.36, 90, 170);
    G.shieldH = clamp(H * 0.028, 10, 16);
    G.shieldX = clamp(G.shieldX, G.shieldW / 2, W - G.shieldW / 2);
    draw();
  }

  function spawnMine() {
    const r = clamp(G.H * 0.022, 12, 24);
    G.mines.push({
      x: r + Math.random() * Math.max(1, G.W - r * 2),
      y: -r * 2,
      vy: mineSpeed() * (0.85 + Math.random() * 0.35),
      r,
      rot: Math.random() * Math.PI * 2
    });
  }

  function startGame() {
    stopLoop();
    G.mode = 'playing';
    G.score = 0;
    G.lives = 3;
    G.shieldX = G.W / 2;
    G.mines = [];
    G.spawnTimer = 0.9;
    G.shake = 0;
    G.invincible = 0;
    G.time = 0;
    clearMessages();
    G.best = readBest();
    updateHud();
    startLoop();
  }

  function hideMessage() {
    messageEl.classList.add('hidden');
  }

  function endGame() {
    stopLoop();
    G.mode = 'over';
    if (G.score > G.best) {
      G.best = G.score;
      writeBest(G.best);
    }
    updateHud();
    showMessage('Game over', 'You dodged ' + G.score + ' mines. Best ' + G.best + '.', 'Play again');
  }

  function loseLife() {
    G.lives -= 1;
    G.shake = 0.35;
    G.invincible = 1.4;
    updateHud();
    if (G.lives <= 0) {
      endGame();
      return;
    }
  }

  function shieldRect() {
    return {
      x: G.shieldX - G.shieldW / 2,
      y: G.H - G.shieldH - Math.max(28, G.H * 0.06),
      w: G.shieldW,
      h: G.shieldH
    };
  }

  function frame(now) {
    G.raf = window.requestAnimationFrame(frame);
    if (!G.last) G.last = now;
    let dt = (now - G.last) / 1000;
    G.last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    if (G.mode === 'playing') {
      G.time += dt;
      G.shake = Math.max(0, G.shake - dt);
      G.invincible = Math.max(0, G.invincible - dt);

      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        spawnMine();
        G.spawnTimer = clamp(1.05 - G.time * 0.02, 0.35, 1.05) * (0.85 + Math.random() * 0.3);
      }

      const sr = shieldRect();
      for (const mine of G.mines) {
        mine.y += mine.vy * dt;
        mine.rot += dt * 2;

        if (G.invincible <= 0) {
          const dx = Math.max(sr.x - mine.x, 0, mine.x - (sr.x + sr.w));
          const dy = Math.max(sr.y - mine.y, 0, mine.y - (sr.y + sr.h));
          const d2 = dx * dx + dy * dy;
          if (d2 <= mine.r * mine.r) {
            mine.hit = true;
            loseLife();
            if (G.mode !== 'playing') return;
          }
        }
      }

      const kept = [];
      let avoided = 0;
      for (const mine of G.mines) {
        if (mine.hit) continue;
        if (mine.y - mine.r > G.H) {
          avoided += 1;
          continue;
        }
        kept.push(mine);
      }
      G.mines = kept;
      G.score += avoided;

      updateHud();
    }
    draw();
  }

  function startLoop() {
    stopLoop();
    G.last = 0;
    G.raf = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (G.raf) window.cancelAnimationFrame(G.raf);
    G.raf = 0;
    G.last = 0;
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function polygon(cx, cy, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function draw() {
    const W = G.W;
    const H = G.H;
    if (!W || !H) return;

    let dx = 0;
    let dy = 0;
    if (G.shake > 0) {
      const amp = G.shake * 14;
      dx = (Math.random() - 0.5) * amp;
      dy = (Math.random() - 0.5) * amp;
    }

    ctx.save();
    ctx.translate(dx, dy);
    ctx.clearRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(-20, -20, W + 40, H + 40);

    for (let i = 0; i < 6; i++) {
      const x = (G.W * ((i * 37) % 10)) / 10;
      ctx.fillStyle = 'rgba(129, 140, 248, 0.05)';
      ctx.beginPath();
      ctx.arc(x, (G.H * (i * 47 % 10)) / 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const sr = shieldRect();
    const flash = G.invincible > 0 && Math.floor(G.time * 14) % 2 === 0;
    if (!flash) {
      const gradient = ctx.createLinearGradient(sr.x, 0, sr.x + sr.w, 0);
      gradient.addColorStop(0, '#818cf8');
      gradient.addColorStop(1, '#c084fc');
      roundRect(sr.x, sr.y, sr.w, sr.h, sr.h / 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const mine of G.mines) {
      ctx.fillStyle = '#f43f5e';
      polygon(mine.x, mine.y, mine.r, 8, mine.rot);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, mine.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function setShieldTarget(clientX) {
    const rect = canvas.getBoundingClientRect();
    G.shieldX = clamp(clientX - rect.left, G.shieldW / 2, G.W - G.shieldW / 2);
  }

  canvas.addEventListener(
    'pointerdown',
    function (ev) {
      ev.preventDefault();
      pointerActive = true;
      setShieldTarget(ev.clientX);
    },
    { passive: false }
  );

  canvas.addEventListener(
    'pointermove',
    function (ev) {
      if (!pointerActive) return;
      ev.preventDefault();
      setShieldTarget(ev.clientX);
    },
    { passive: false }
  );

  function releasePointer() {
    pointerActive = false;
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  function openPanel() {
    overlay.classList.remove('hidden');
    document.body.classList.add('game-open');
    G.best = readBest();
    G.mode = 'ready';
    G.score = 0;
    G.lives = 3;
    G.mines = [];
    G.spawnTimer = 0.9;
    G.time = 0;
    G.shake = 0;
    G.invincible = 0;
    G.raf = 0;
    G.last = 0;
    resize();
    G.shieldX = G.W / 2;
    updateHud();
    showMessage('Dodge', 'Swipe to move the shield.', 'Start');
    draw();
  }

  function closePanel() {
    stopLoop();
    hideMessage();
    overlay.classList.add('hidden');
    document.body.classList.remove('game-open');
    G.mode = 'idle';
  }

  messageAction.addEventListener('click', function () {
    if (G.mode === 'paused') {
      clearMessages();
      G.mode = 'playing';
      startLoop();
      return;
    }
    if (G.mode === 'ready' || G.mode === 'over') startGame();
  });

  playBtn.addEventListener('click', openPanel);
  exitBtn.addEventListener('click', closePanel);

  window.addEventListener('keydown', function (ev) {
    if (overlay.classList.contains('hidden')) return;
    if (ev.key === 'Escape') {
      closePanel();
      return;
    }
    if (ev.key === 'ArrowLeft') {
      if (G.mode === 'playing') {
        G.shieldX = clamp(G.shieldX - G.shieldW * 0.4, G.shieldW / 2, G.W - G.shieldW / 2);
        ev.preventDefault();
      }
    } else if (ev.key === 'ArrowRight') {
      if (G.mode === 'playing') {
        G.shieldX = clamp(G.shieldX + G.shieldW * 0.4, G.shieldW / 2, G.W - G.shieldW / 2);
        ev.preventDefault();
      }
    } else if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      if (G.mode === 'ready' || G.mode === 'over' || G.mode === 'paused') messageAction.click();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'playing') {
      stopLoop();
      showMessage('Paused', 'The shield is waiting. Tap to resume.', 'Resume');
      G.mode = 'paused';
    }
  });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(function () {
      resize();
      if (G.mode === 'ready' || G.mode === 'paused') draw();
    }).observe(stage);
  }
  window.addEventListener('resize', resize);

  G.best = readBest();
  updateHud();
  resize();
})();
