(function () {
  'use strict';

  const overlay = document.getElementById('dino-overlay');
  if (!overlay) return;

  const playBtn = document.getElementById('play-dino');
  const stage = document.getElementById('dino-stage');
  const canvas = document.getElementById('dino-canvas');
  if (!stage || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const shell = overlay.querySelector('.game-shell');
  const hud = overlay.querySelector('.game-hud');
  const exitBtn = document.getElementById('dino-exit');
  const messageEl = document.getElementById('dino-message');
  const messageAction = document.getElementById('dino-action');
  const messageTitle = document.getElementById('dino-title');
  const messageSubtitle = document.getElementById('dino-subtitle');
  const scoreEl = document.getElementById('dino-score');
  const speedEl = document.getElementById('dino-speed');
  const bestEl = document.getElementById('dino-best');

  const BEST_KEY = 'quicknotes.dino.best.v1';

  // The playfield is drawn in a fixed 16:9 design space and scaled to the
  // room the stage has, so the game always keeps landscape proportions.
  const VW = 480;
  const VH = 270;
  const GROUND_Y = 226;
  const GRAVITY = 2200;
  const JUMP_HEIGHT = 86;
  const PLAYER_X = 62;
  const PLAYER_W = 42;
  const PLAYER_H = 38;
  const START_SPEED = 130;
  const MAX_SPEED = 400;

  const G = {
    mode: 'idle',
    w: 0,
    h: 0,
    scale: 1,
    distance: 0,
    speed: START_SPEED,
    time: 0,
    vy: 0,
    y: GROUND_Y - PLAYER_H,
    onGround: true,
    obstacles: [],
    clouds: [],
    groundOffset: 0,
    spawnTimer: 0.8,
    best: 0,
    raf: 0,
    last: 0
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

  function clearMessages() {
    messageEl.classList.add('hidden');
  }

  function showMessage(title, subtitle, action) {
    messageTitle.textContent = title;
    messageSubtitle.textContent = subtitle;
    messageAction.textContent = action;
    messageEl.classList.remove('hidden');
  }

  function startHint() {
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 620;
    return portrait && small
      ? 'Tap or press Space to jump. Rotate sideways for a bigger view.'
      : 'Tap or press Space to jump.';
  }

  function updateHud() {
    scoreEl.textContent = Math.floor(G.distance) + ' m';
    speedEl.textContent = (G.speed / START_SPEED).toFixed(1) + 'x';
    bestEl.textContent = Math.floor(G.best) + ' m';
  }

  function fitStage() {
    if (overlay.classList.contains('hidden') || !shell) return;
    const shellW = shell.clientWidth;
    const shellH = shell.clientHeight;
    const hudH = hud ? hud.getBoundingClientRect().height : 0;
    const availH = Math.max(120, shellH - hudH - 10);
    let w = Math.max(200, shellW);
    let h = (w * 9) / 16;
    if (h > availH) {
      h = availH;
      w = (h * 16) / 9;
    }
    stage.style.width = Math.round(w) + 'px';
    stage.style.height = Math.round(h) + 'px';
  }

  function resize() {
    if (overlay.classList.contains('hidden')) return;
    fitStage();
    const rect = stage.getBoundingClientRect();
    const W = Math.max(160, Math.round(rect.width));
    const H = Math.max(90, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const scale = Math.max(W / VW, H / VH);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    G.w = W;
    G.h = H;
    G.scale = scale;
    draw();
  }

  function reset() {
    G.mode = 'ready';
    G.distance = 0;
    G.speed = START_SPEED;
    G.time = 0;
    G.vy = 0;
    G.onGround = true;
    G.y = GROUND_Y - PLAYER_H;
    G.obstacles = [];
    G.clouds = [];
    G.groundOffset = 0;
    G.spawnTimer = 0.8;
    for (let i = 0; i < 4; i += 1) {
      G.clouds.push({
        x: Math.random() * VW,
        y: 26 + Math.random() * 74,
        s: 0.7 + Math.random() * 0.8
      });
    }
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
    if (G.mode !== 'playing' || !G.onGround) return;
    G.vy = -Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
    G.onGround = false;
  }

  function spawnObstacle() {
    const clusters = Math.random() > 0.78 ? 2 : 1;
    const baseH = 30 + Math.random() * 20;
    const w = 13;
    for (let i = 0; i < clusters; i += 1) {
      const h = baseH * (0.85 + Math.random() * 0.35);
      G.obstacles.push({
        x: VW + 14 + i * (w + 7),
        w: w,
        h: h,
        y: GROUND_Y - h
      });
    }
  }

  function hitTest() {
    const px = PLAYER_X + 7;
    const py = G.y + 5;
    const pw = PLAYER_W - 13;
    const ph = PLAYER_H - 7;
    for (const ob of G.obstacles) {
      if (px < ob.x + ob.w - 2 && px + pw > ob.x + 3 && py < ob.y + ob.h - 3 && py + ph > ob.y) {
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
      G.speed = Math.min(START_SPEED + G.time * 9, MAX_SPEED);
      G.distance += (G.speed * dt) / 9;
      G.groundOffset += G.speed * dt;

      for (const cloud of G.clouds) {
        cloud.x -= G.speed * 0.08 * dt;
        if (cloud.x < -60) {
          cloud.x = VW + 40;
          cloud.y = 26 + Math.random() * 74;
          cloud.s = 0.7 + Math.random() * 0.8;
        }
      }

      if (!G.onGround) {
        G.vy += GRAVITY * dt;
        G.y += G.vy * dt;
        if (G.y >= GROUND_Y - PLAYER_H) {
          G.y = GROUND_Y - PLAYER_H;
          G.vy = 0;
          G.onGround = true;
        }
      }

      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        spawnObstacle();
        G.spawnTimer = (260 + Math.random() * 240) / G.speed;
      }

      for (const ob of G.obstacles) {
        ob.x -= G.speed * dt;
      }
      G.obstacles = G.obstacles.filter((ob) => ob.x + ob.w + 10 > 0);

      updateHud();

      if (hitTest()) {
        crash();
        return;
      }
    }

    draw();
  }

  function crash() {
    stopLoop();
    G.mode = 'over';
    const meters = Math.floor(G.distance);
    if (meters > G.best) {
      G.best = meters;
      writeBest(G.best);
    }
    updateHud();
    draw();
    showMessage('Game over', 'You ran ' + meters + ' m. Best ' + Math.floor(G.best) + ' m.', 'Play again');
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

  function drawCloud(cloud) {
    const s = cloud.s;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.13)';
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, 9 * s, 0, Math.PI * 2);
    ctx.arc(cloud.x + 13 * s, cloud.y - 5 * s, 11 * s, 0, Math.PI * 2);
    ctx.arc(cloud.x + 27 * s, cloud.y, 8 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHills(color, offset, radius) {
    const span = radius * 1.6;
    const shift = -(offset % span);
    ctx.fillStyle = color;
    for (let x = shift - span; x < VW + span; x += span) {
      ctx.beginPath();
      ctx.arc(x, GROUND_Y + radius * 0.5, radius, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawShadow(cx, rx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y - 1, Math.max(6, rx), 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCactus(ob) {
    ctx.fillStyle = '#f43f5e';
    roundRect(ob.x, ob.y, ob.w, ob.h, Math.min(4, ob.w * 0.35));
    ctx.fill();

    if (ob.h > 34) {
      const armH = ob.h * 0.22;
      ctx.fillRect(ob.x - 4.5, ob.y + ob.h * 0.28, 4.5, armH);
      ctx.fillRect(ob.x + ob.w, ob.y + ob.h * 0.44, 4.5, armH * 0.85);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ob.x + ob.w * 0.5, ob.y + 6);
    ctx.lineTo(ob.x + ob.w * 0.5, ob.y + ob.h - 6);
    ctx.stroke();
  }

  function drawDino(bounce) {
    const x = PLAYER_X;
    const y = G.y;
    const lean = G.onGround ? bounce * 1.2 : 0;

    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 16);
    ctx.lineTo(x - 8, y + 9);
    ctx.lineTo(x - 8, y + 24);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#818cf8';
    roundRect(x + 4, y + 9 + lean * 0.2, 24, 21, 8);
    ctx.fill();

    ctx.fillStyle = '#c7d2fe';
    roundRect(x + 20, y - lean * 0.2, 21, 18, 6);
    ctx.fill();

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(x + 33, y + 5, 4, 4);

    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (G.onGround) {
      const phase = Math.sin(G.time * (G.speed / START_SPEED) * 15);
      ctx.moveTo(x + 14, y + 29);
      ctx.lineTo(x + 14 + phase * 7, y + 37);
      ctx.moveTo(x + 24, y + 29);
      ctx.lineTo(x + 24 - phase * 7, y + 37);
    } else {
      ctx.moveTo(x + 14, y + 29);
      ctx.lineTo(x + 9, y + 35);
      ctx.moveTo(x + 24, y + 29);
      ctx.lineTo(x + 29, y + 35);
    }
    ctx.stroke();

    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 24, y + 19);
    ctx.lineTo(x + 31, y + 23);
    ctx.stroke();
  }

  function draw() {
    if (!G.w) return;

    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#0a1120');
    sky.addColorStop(1, '#152340');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VW, VH);

    for (const cloud of G.clouds) drawCloud(cloud);

    drawHills('rgba(30, 41, 59, 0.85)', G.groundOffset * 0.12, 58);
    drawHills('rgba(51, 65, 85, 0.55)', G.groundOffset * 0.26, 34);

    ctx.fillStyle = '#111c2f';
    ctx.fillRect(0, GROUND_Y, VW, VH - GROUND_Y);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.fillRect(0, GROUND_Y - 1, VW, 1.5);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
    const step = 34;
    const offset = G.groundOffset % step;
    for (let x = -step; x < VW + step; x += step) {
      ctx.fillRect(x - offset, GROUND_Y + 13, 15, 2);
      ctx.fillRect(x - offset + 7, GROUND_Y + 24, 8, 2);
    }

    const bounce = G.onGround ? Math.sin(G.time * (G.speed / START_SPEED) * 15) : 0;

    for (const ob of G.obstacles) {
      drawShadow(ob.x + ob.w / 2, ob.w * 0.6);
      drawCactus(ob);
    }

    drawShadow(PLAYER_X + PLAYER_W / 2, PLAYER_W * 0.45);
    drawDino(bounce);
  }

  function requestLandscape() {
    if (typeof overlay.requestFullscreen !== 'function') return;
    try {
      const pending = overlay.requestFullscreen();
      if (pending && typeof pending.then === 'function') {
        pending
          .then(function () {
            const orientation = window.screen && window.screen.orientation;
            if (orientation && typeof orientation.lock === 'function') {
              const locked = orientation.lock('landscape');
              if (locked && typeof locked.catch === 'function') locked.catch(function () {});
            }
          })
          .catch(function () {});
      }
    } catch (err) {
      /* fullscreen unavailable */
    }
  }

  function exitLandscape() {
    if (document.fullscreenElement === overlay && typeof document.exitFullscreen === 'function') {
      try {
        const pending = document.exitFullscreen();
        if (pending && typeof pending.catch === 'function') pending.catch(function () {});
      } catch (err) {
        /* ignore */
      }
    }
  }

  function openPanel() {
    overlay.classList.remove('hidden');
    document.body.classList.add('game-open');
    G.best = readBest();
    reset();
    requestLandscape();
    resize();
    updateHud();
    showMessage('Dino Runner', startHint(), 'Start');
    startLoop();
  }

  function closePanel() {
    stopLoop();
    overlay.classList.add('hidden');
    document.body.classList.remove('game-open');
    G.mode = 'idle';
    exitLandscape();
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
      if (document.fullscreenElement === overlay) exitLandscape();
      else closePanel();
      return;
    }
    if (ev.key === ' ' || ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W' || ev.key === 'Enter') {
      ev.preventDefault();
      if (G.mode === 'playing') jump();
      else messageAction.click();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'playing') {
      stopLoop();
      showMessage('Paused', 'The dino is waiting. Tap to resume.', 'Resume');
      G.mode = 'paused';
    }
  });

  document.addEventListener('fullscreenchange', function () {
    resize();
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  if (typeof ResizeObserver === 'function' && shell) {
    new ResizeObserver(resize).observe(shell);
  }

  G.best = readBest();
  updateHud();
})();
