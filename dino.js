(function () {
  'use strict';

  const overlay = document.getElementById('dino-overlay');
  if (!overlay) return;

  const playBtn = document.getElementById('play-dino');
  const canvas = document.getElementById('dino-canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const stage = document.getElementById('dino-stage');
  const exitBtn = document.getElementById('dino-exit');
  const messageEl = document.getElementById('dino-message');
  const messageAction = document.getElementById('dino-action');
  const messageTitle = document.getElementById('dino-title');
  const messageSubtitle = document.getElementById('dino-subtitle');
  const scoreEl = document.getElementById('dino-score');
  const speedEl = document.getElementById('dino-speed');
  const bestEl = document.getElementById('dino-best');

  const BEST_KEY = 'quicknotes.dino.best.v1';

  const G = {
    mode: 'idle',
    W: 0,
    H: 0,
    groundY: 0,
    playerW: 0,
    playerH: 0,
    playerX: 0,
    playerY: 0,
    vy: 0,
    onGround: true,
    distance: 0,
    speed: 140,
    obstacles: [],
    spawnTimer: 0,
    best: 0,
    raf: 0,
    last: 0,
    time: 0
  };

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
    scoreEl.textContent = G.distance + ' m';
    speedEl.textContent = (G.speed / 140).toFixed(1) + 'x';
    bestEl.textContent = G.best + ' m';
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
    G.groundY = H - Math.max(44, H * 0.12);
    G.playerH = clamp(H * 0.11, 26, 60);
    G.playerW = G.playerH * 1.25;
    G.playerX = Math.min(84, W * 0.18);
    if (G.onGround) G.playerY = G.groundY - G.playerH;
    draw();
  }

  function reset() {
    G.mode = 'ready';
    G.distance = 0;
    G.speed = 140;
    G.time = 0;
    G.vy = 0;
    G.onGround = true;
    G.playerY = G.groundY - G.playerH;
    G.obstacles = [];
    G.spawnTimer = 1.2;
    G.raf = 0;
    G.last = 0;
  }

  function startGame() {
    reset();
    G.mode = 'playing';
    clearMessages();
    G.best = readBest();
    updateHud();
    startLoop();
  }

  function jump() {
    if (G.mode !== 'playing') return;
    if (!G.onGround) return;
    const g = 2400;
    G.vy = -Math.sqrt(2 * g * Math.max(96, G.H * 0.32));
    G.onGround = false;
  }

  function spawnObstacle() {
    const h = clamp(G.H * 0.06, 16, 64) * (0.7 + Math.random() * 0.9);
    const w = clamp(G.H * 0.045, 14, 36);
    G.obstacles.push({
      x: G.W + 10,
      w,
      h,
      y: G.groundY - h
    });
  }

  function hitTest() {
    const p = { x: G.playerX, y: G.playerY, w: G.playerW, h: G.playerH };
    for (const ob of G.obstacles) {
      if (ob.x + ob.w > p.x && ob.x < p.x + p.w && ob.y < p.y + p.h && ob.y + ob.h > p.y) {
        return true;
      }
    }
    return false;
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
      G.distance = Math.floor(G.distance + (G.speed * dt) / 50);
      G.speed = Math.min(140 + G.time * 7, 460);

      const g = 2400;
      if (!G.onGround) {
        G.vy += g * dt;
        G.playerY += G.vy * dt;
        if (G.playerY >= G.groundY - G.playerH) {
          G.playerY = G.groundY - G.playerH;
          G.vy = 0;
          G.onGround = true;
        }
      }

      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        spawnObstacle();
        G.spawnTimer = clamp(1.5 - G.time * 0.028, 0.55, 1.5) * (0.8 + Math.random() * 0.4);
      }

      for (const ob of G.obstacles) {
        ob.x -= G.speed * dt;
      }
      G.obstacles = G.obstacles.filter((ob) => ob.x + ob.w > -10);

      updateHud();

      if (hitTest()) {
        loseLife();
        return;
      }
    }
    draw();
  }

  function loseLife() {
    stopLoop();
    G.mode = 'over';
    if (G.distance > G.best) {
      G.best = G.distance;
      writeBest(G.best);
    }
    updateHud();
    showMessage('Game over', 'You ran ' + G.distance + ' m. Best ' + G.best + ' m.', 'Play again');
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

  function draw() {
    const W = G.W;
    const H = G.H;
    if (!W || !H) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#131f36';
    ctx.fillRect(0, G.groundY, W, H - G.groundY);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.fillRect(0, G.groundY, W, 1.5);

    const legPhase = (G.time * (G.speed / 140) * 12) % (Math.PI * 2);
    const ph = Math.sin(legPhase);

    ctx.fillStyle = '#818cf8';
    roundRect(G.playerX, G.playerY + G.playerH * 0.32, G.playerW, G.playerH * 0.68, Math.min(6, G.playerH * 0.2));
    ctx.fill();
    ctx.fillStyle = '#c7d2fe';
    roundRect(G.playerX + G.playerW * 0.62, G.playerY, G.playerW * 0.38, G.playerH * 0.52, Math.min(6, G.playerH * 0.18));
    ctx.fill();
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(G.playerX + G.playerW * 0.8, G.playerY + G.playerH * 0.12, Math.max(2, G.playerW * 0.07), Math.max(2, G.playerH * 0.1));

    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = Math.max(2, G.playerW * 0.09);
    ctx.lineCap = 'round';
    const hipX = G.playerX + G.playerW * 0.38;
    const hipY = G.playerY + G.playerH * 0.78;
    const legLen = G.playerH * 0.34;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(hipX + ph * G.playerW * 0.32, hipY + legLen * 0.85 + Math.abs(ph) * legLen * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hipX + G.playerW * 0.24, hipY);
    ctx.lineTo(hipX + G.playerW * 0.24 - ph * G.playerW * 0.32, hipY + legLen * 0.85 + Math.abs(ph) * legLen * 0.1);
    ctx.stroke();

    for (const ob of G.obstacles) {
      ctx.fillStyle = '#f43f5e';
      roundRect(ob.x, ob.y, ob.w, ob.h, Math.min(3, ob.w * 0.2));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ob.x + ob.w * 0.2, ob.y + ob.h * 0.3);
      ctx.lineTo(ob.x + ob.w * 0.8, ob.y + ob.h * 0.3);
      ctx.moveTo(ob.x + ob.w * 0.2, ob.y + ob.h * 0.65);
      ctx.lineTo(ob.x + ob.w * 0.8, ob.y + ob.h * 0.65);
      ctx.stroke();
    }
  }

  function openPanel() {
    overlay.classList.remove('hidden');
    document.body.classList.add('game-open');
    G.best = readBest();
    reset();
    resize();
    updateHud();
    showMessage('Dino Runner', 'Tap or press Space to jump.', 'Start');
    startLoop();
  }

  function closePanel() {
    stopLoop();
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
    if (G.mode === 'ready' || G.mode === 'over') {
      startGame();
    }
  });

  playBtn.addEventListener('click', openPanel);
  exitBtn.addEventListener('click', closePanel);

  canvas.addEventListener(
    'pointerdown',
    function (ev) {
      ev.preventDefault();
      if (G.mode === 'playing') jump();
    },
    { passive: false }
  );

  window.addEventListener('keydown', function (ev) {
    if (overlay.classList.contains('hidden')) return;
    if (ev.key === 'Escape') {
      closePanel();
      return;
    }
    if (ev.key === ' ' || ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') {
      ev.preventDefault();
      if (G.mode === 'ready' || G.mode === 'over' || G.mode === 'paused') messageAction.click();
      else jump();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'playing') {
      stopLoop();
      showMessage('Paused', 'The dino is waiting. Tap to resume.', 'Resume');
      G.mode = 'paused';
    }
  });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(resize).observe(stage);
  }
  window.addEventListener('resize', resize);

  G.best = readBest();
  updateHud();
})();
