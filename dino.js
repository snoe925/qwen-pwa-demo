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

  const menuBtn = document.getElementById('dino-menu');
  const controlsEl = document.getElementById('dino-controls');
  const pauseBtn = document.getElementById('dino-pause');
  const restartBtn = document.getElementById('dino-restart');
  const exitBtn = document.getElementById('dino-exit');
  const messageEl = document.getElementById('dino-message');
  const messageAction = document.getElementById('dino-action');
  const messageTitle = document.getElementById('dino-title');
  const messageSubtitle = document.getElementById('dino-subtitle');
  const scoreEl = document.getElementById('dino-score');
  const speedEl = document.getElementById('dino-speed');
  const bestEl = document.getElementById('dino-best');

  const BEST_KEY = 'quicknotes.dino.best.v1';

  // The run happens in a world that is always 480 units wide and as tall as
  // the screen needs, so the playfield fills the whole display.
  const UWW = 480;
  const GRAVITY = 1600;
  const JUMP_HEIGHT = 96;
  const JUMP_V = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
  const PLAYER_X = 62;
  const PLAYER_W = 44;
  const PLAYER_H = 40;
  const START_SPEED = 110;
  const MAX_SPEED = 330;
  const BUFFER = 0.14;

  const G = {
    mode: 'idle',
    w: 0,
    h: 0,
    unit: 1,
    worldH: 0,
    groundY: 0,
    distance: 0,
    speed: START_SPEED,
    time: 0,
    vy: 0,
    y: 0,
    onGround: true,
    buffer: 0,
    obstacles: [],
    clouds: [],
    groundOffset: 0,
    spawnTimer: 0.9,
    best: 0,
    raf: 0,
    last: 0
  };

  let controlsOpen = false;

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

  function updateHud() {
    scoreEl.textContent = Math.floor(G.distance) + ' m';
    speedEl.textContent = (G.speed / START_SPEED).toFixed(1) + 'x';
    bestEl.textContent = Math.floor(G.best) + ' m';
  }

  function updateControls() {
    if (G.mode === 'paused') {
      pauseBtn.textContent = 'Resume';
      pauseBtn.disabled = false;
    } else if (G.mode === 'playing') {
      pauseBtn.textContent = 'Pause';
      pauseBtn.disabled = false;
    } else {
      pauseBtn.textContent = 'Pause';
      pauseBtn.disabled = true;
    }
  }

  function setControls(open) {
    controlsOpen = open;
    controlsEl.classList.toggle('hidden', !open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) updateControls();
  }

  function cloudY() {
    return Math.max(20, G.groundY * (0.1 + Math.random() * 0.55));
  }

  function resize() {
    if (overlay.classList.contains('hidden')) return;
    const W = Math.max(160, Math.round(stage.clientWidth));
    const H = Math.max(160, Math.round(stage.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    G.w = W;
    G.h = H;
    G.unit = W / UWW;
    G.worldH = H / G.unit;
    G.groundY = G.worldH - Math.max(32, Math.min(G.worldH * 0.14, 90));
    ctx.setTransform(dpr * G.unit, 0, 0, dpr * G.unit, 0, 0);
    if (G.onGround) G.y = G.groundY - PLAYER_H;
    for (const ob of G.obstacles) ob.y = G.groundY - ob.h;
    for (const cloud of G.clouds) {
      if (cloud.y > G.groundY - 16) cloud.y = cloudY();
    }
    draw();
  }

  function reset() {
    G.mode = 'ready';
    G.distance = 0;
    G.speed = START_SPEED;
    G.time = 0;
    G.vy = 0;
    G.buffer = 0;
    G.onGround = true;
    G.y = G.groundY - PLAYER_H;
    G.obstacles = [];
    G.clouds = [];
    G.groundOffset = 0;
    G.spawnTimer = 0.9;
    for (let i = 0; i < 5; i += 1) {
      G.clouds.push({
        x: Math.random() * UWW,
        y: cloudY(),
        s: 0.7 + Math.random() * 0.9
      });
    }
  }

  function startGame() {
    resize();
    reset();
    G.mode = 'playing';
    clearMessages();
    setControls(false);
    G.best = readBest();
    updateHud();
    updateControls();
    startLoop();
  }

  function doJump() {
    G.vy = -JUMP_V;
    G.onGround = false;
    G.buffer = 0;
  }

  function jump() {
    if (G.mode !== 'playing') return;
    if (G.onGround) {
      doJump();
      return;
    }
    G.buffer = BUFFER;
  }

  function spawnObstacle() {
    const clusters = Math.random() > 0.8 ? 2 : 1;
    const w = 14;
    const baseH = 26 + Math.random() * 16;
    for (let i = 0; i < clusters; i += 1) {
      const h = baseH * (0.9 + Math.random() * 0.25);
      G.obstacles.push({
        x: UWW + 16 + i * (w + 8),
        w: w,
        h: h,
        y: G.groundY - h
      });
    }
  }

  function hitTest() {
    const px = PLAYER_X + 8;
    const py = G.y + 6;
    const pw = PLAYER_W - 17;
    const ph = PLAYER_H - 8;
    for (const ob of G.obstacles) {
      if (px < ob.x + ob.w - 3 && px + pw > ob.x + 3 && py < ob.y + ob.h - 3 && py + ph > ob.y) {
        return true;
      }
    }
    return false;
  }

  function step(dt) {
    G.time += dt;
    G.speed = Math.min(START_SPEED + G.time * 6, MAX_SPEED);
    G.distance += (G.speed * dt) / 9;
    G.groundOffset += G.speed * dt;

    for (const cloud of G.clouds) {
      cloud.x -= G.speed * 0.1 * dt;
      if (cloud.x < -70) {
        cloud.x = UWW + 50;
        cloud.y = cloudY();
        cloud.s = 0.7 + Math.random() * 0.9;
      }
    }

    if (!G.onGround) {
      G.vy += GRAVITY * dt;
      G.y += G.vy * dt;
      if (G.y >= G.groundY - PLAYER_H) {
        G.y = G.groundY - PLAYER_H;
        G.vy = 0;
        G.onGround = true;
      }
    }

    if (G.buffer > 0) {
      G.buffer -= dt;
      if (G.onGround) doJump();
    }

    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      spawnObstacle();
      G.spawnTimer = (300 + Math.random() * 220) / G.speed;
    }

    for (const ob of G.obstacles) {
      ob.x -= G.speed * dt;
    }
    G.obstacles = G.obstacles.filter((ob) => ob.x + ob.w + 12 > -10);

    updateHud();

    if (hitTest()) crash();
  }

  function frame(now) {
    G.raf = window.requestAnimationFrame(frame);
    if (!G.last) G.last = now;
    let dt = (now - G.last) / 1000;
    G.last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    if (G.mode === 'playing') step(dt);
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
    updateControls();
    draw();
    showMessage('Game over', 'You ran ' + meters + ' m. Best ' + Math.floor(G.best) + ' m.', 'Play again');
  }

  function pauseGame() {
    if (G.mode !== 'playing') return;
    stopLoop();
    G.mode = 'paused';
    setControls(false);
    updateControls();
    showMessage('Paused', 'Tap anywhere to resume.', 'Resume');
  }

  function resumeGame() {
    if (G.mode !== 'paused') return;
    clearMessages();
    setControls(false);
    G.mode = 'playing';
    updateControls();
    startLoop();
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
    ctx.fillStyle = 'rgba(148, 163, 184, 0.1)';
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
    for (let x = shift - span; x < UWW + span; x += span) {
      ctx.beginPath();
      ctx.arc(x, G.groundY + radius * 0.5, radius, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawShadow(cx, rx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(cx, G.groundY - 1, Math.max(6, rx), 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCactus(ob) {
    ctx.fillStyle = '#f43f5e';
    roundRect(ob.x, ob.y, ob.w, ob.h, Math.min(4, ob.w * 0.35));
    ctx.fill();

    if (ob.h > 32) {
      const armH = ob.h * 0.22;
      ctx.fillRect(ob.x - 5, ob.y + ob.h * 0.28, 5, armH);
      ctx.fillRect(ob.x + ob.w, ob.y + ob.h * 0.44, 5, armH * 0.85);
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
    ctx.moveTo(x + 4, y + 17);
    ctx.lineTo(x - 8, y + 9);
    ctx.lineTo(x - 8, y + 25);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#818cf8';
    roundRect(x + 4, y + 9 + lean * 0.2, 26, 22, 8);
    ctx.fill();

    ctx.fillStyle = '#c7d2fe';
    roundRect(x + 20, y - lean * 0.2, 22, 19, 6);
    ctx.fill();

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(x + 34, y + 5, 4, 4);

    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (G.onGround) {
      const phase = Math.sin(G.time * (G.speed / START_SPEED) * 15);
      ctx.moveTo(x + 15, y + 30);
      ctx.lineTo(x + 15 + phase * 7, y + 39);
      ctx.moveTo(x + 25, y + 30);
      ctx.lineTo(x + 25 - phase * 7, y + 39);
    } else {
      ctx.moveTo(x + 15, y + 30);
      ctx.lineTo(x + 9, y + 37);
      ctx.moveTo(x + 25, y + 30);
      ctx.lineTo(x + 31, y + 37);
    }
    ctx.stroke();

    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 25, y + 20);
    ctx.lineTo(x + 32, y + 24);
    ctx.stroke();
  }

  function draw() {
    if (!G.w || !G.worldH) return;

    const groundY = G.groundY;
    const worldH = G.worldH;

    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#070d18');
    sky.addColorStop(0.65, '#0e1a2f');
    sky.addColorStop(1, '#17253f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, UWW, worldH);

    const moonX = UWW * 0.8;
    const moonY = Math.max(36, groundY * 0.22);
    const glowR = Math.max(30, groundY * 0.12);
    const glow = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, glowR);
    glow.addColorStop(0, 'rgba(199, 210, 254, 0.22)');
    glow.addColorStop(1, 'rgba(199, 210, 254, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(moonX - glowR, moonY - glowR, glowR * 2, glowR * 2);

    ctx.fillStyle = '#c7d2fe';
    ctx.beginPath();
    ctx.arc(moonX, moonY, Math.max(7, groundY * 0.028), 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of G.clouds) drawCloud(cloud);

    const backR = Math.max(36, Math.min(130, groundY * 0.24));
    const frontR = Math.max(24, Math.min(80, groundY * 0.13));
    drawHills('rgba(24, 34, 52, 0.95)', G.groundOffset * 0.12, backR);
    drawHills('rgba(43, 56, 78, 0.75)', G.groundOffset * 0.26, frontR);

    ctx.fillStyle = '#111c2f';
    ctx.fillRect(0, groundY, UWW, worldH - groundY);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.fillRect(0, groundY - 1.5, UWW, 2);

    const strip = Math.max(24, worldH - groundY);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
    const step = 36;
    const offset = G.groundOffset % step;
    for (let x = -step; x < UWW + step; x += step) {
      ctx.fillRect(x - offset, groundY + strip * 0.3, 16, 2);
      ctx.fillRect(x - offset + 8, groundY + strip * 0.58, 9, 2);
    }

    const bounce = G.onGround ? Math.sin(G.time * (G.speed / START_SPEED) * 15) : 0;

    for (const ob of G.obstacles) {
      drawShadow(ob.x + ob.w / 2, ob.w * 0.7);
      drawCactus(ob);
    }

    drawShadow(PLAYER_X + PLAYER_W / 2, PLAYER_W * 0.5);
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
    resize();
    reset();
    G.best = readBest();
    setControls(false);
    updateHud();
    showMessage('Dino Runner', 'Tap anywhere to jump. The pause button opens the controls.', 'Start');
    requestLandscape();
    startLoop();
  }

  function closePanel() {
    stopLoop();
    setControls(false);
    overlay.classList.add('hidden');
    document.body.classList.remove('game-open');
    G.mode = 'idle';
    exitLandscape();
  }

  messageAction.addEventListener('click', function () {
    if (G.mode === 'paused') resumeGame();
    else if (G.mode === 'ready' || G.mode === 'over') startGame();
  });

  playBtn.addEventListener('click', openPanel);
  exitBtn.addEventListener('click', closePanel);
  restartBtn.addEventListener('click', startGame);

  pauseBtn.addEventListener('click', function () {
    if (G.mode === 'playing') pauseGame();
    else if (G.mode === 'paused') resumeGame();
  });

  menuBtn.addEventListener('click', function (ev) {
    ev.stopPropagation();
    if (controlsOpen) {
      setControls(false);
      return;
    }
    if (G.mode === 'playing') pauseGame();
    setControls(true);
  });

  stage.addEventListener(
    'pointerdown',
    function (ev) {
      if (ev.target.closest('button')) return;
      if (controlsOpen) {
        setControls(false);
        return;
      }
      if (G.mode === 'playing') {
        ev.preventDefault();
        jump();
        return;
      }
      if (G.mode === 'paused') resumeGame();
      else if (G.mode === 'ready' || G.mode === 'over') startGame();
    },
    { passive: false }
  );

  window.addEventListener('keydown', function (ev) {
    if (overlay.classList.contains('hidden')) return;

    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (controlsOpen) {
        setControls(false);
        return;
      }
      if (G.mode === 'paused') {
        resumeGame();
        return;
      }
      if (document.fullscreenElement === overlay) exitLandscape();
      else closePanel();
      return;
    }

    if (ev.key === 'p' || ev.key === 'P') {
      ev.preventDefault();
      if (G.mode === 'playing') pauseGame();
      else if (G.mode === 'paused') resumeGame();
      return;
    }

    if (ev.key === 'r' || ev.key === 'R') {
      ev.preventDefault();
      startGame();
      return;
    }

    if (ev.key === ' ' || ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W' || ev.key === 'Enter') {
      ev.preventDefault();
      if (G.mode === 'playing') jump();
      else if (G.mode === 'paused') resumeGame();
      else messageAction.click();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'playing') pauseGame();
  });

  document.addEventListener('fullscreenchange', function () {
    resize();
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(resize).observe(stage);
  }

  G.best = readBest();
  updateHud();
})();
