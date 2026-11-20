(function () {
  'use strict';

  const overlay = document.getElementById('game-overlay');
  if (!overlay) return;

  const canvas = document.getElementById('game-canvas');
  const stage = document.getElementById('game-stage');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const playBtn = document.getElementById('play-breakout');
  const exitBtn = document.getElementById('game-exit');
  const pauseBtn = document.getElementById('game-pause-btn');
  const restartBtn = document.getElementById('game-restart');
  const messageEl = document.getElementById('game-message');
  const titleEl = document.getElementById('game-title');
  const subtitleEl = document.getElementById('game-subtitle');
  const actionBtn = document.getElementById('game-action');
  const scoreEl = document.getElementById('game-score');
  const livesEl = document.getElementById('game-lives');
  const levelEl = document.getElementById('game-level');
  const bestEl = document.getElementById('game-best');

  const BEST_KEY = 'quicknotes.breakout.best.v1';
  const COLS = 7;
  const MAX_LIVES = 3;
  const COLORS = ['#f43f5e', '#fb923c', '#fbbf24', '#34d399', '#22d3ee', '#818cf8', '#c084fc', '#f472b6'];

  const G = {
    mode: 'idle',
    prevMode: 'ready',
    score: 0,
    lives: MAX_LIVES,
    level: 1,
    rows: 4,
    best: 0,
    W: 0,
    H: 0,
    raf: 0,
    last: 0,
    bricks: []
  };

  const paddle = { x: 0, y: 0, w: 80, h: 12, target: 0 };
  const ball = { x: 0, y: 0, ux: 0, uy: -1, r: 6 };

  let pointerId = null;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

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
      /* storage unavailable (private mode) — best score just will not persist */
    }
  }

  function updateHud() {
    scoreEl.textContent = String(G.score);
    livesEl.textContent = String(G.lives);
    levelEl.textContent = String(G.level);
    bestEl.textContent = String(G.best);
  }

  function showMessage(title, subtitle, action) {
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    actionBtn.textContent = action;
    messageEl.classList.remove('hidden');
  }

  function hideMessage() {
    messageEl.classList.add('hidden');
  }

  function resize() {
    if (overlay.classList.contains('hidden')) return;

    const rect = stage.getBoundingClientRect();
    const W = Math.max(160, Math.round(rect.width));
    const H = Math.max(160, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const prevW = G.W;
    const prevH = G.H;
    G.W = W;
    G.H = H;

    paddle.w = clamp(W * 0.24, 62, 132);
    paddle.h = clamp(H * 0.024, 10, 16);
    paddle.y = H - Math.max(28, H * 0.08);
    ball.r = clamp(Math.min(W, H) * 0.017, 4.5, 8);

    if (prevW && prevH) {
      paddle.x = (paddle.x / prevW) * W;
      paddle.target = paddle.x;
      ball.x = (ball.x / prevW) * W;
      ball.y = (ball.y / prevH) * H;
    } else {
      paddle.x = (W - paddle.w) / 2;
      paddle.target = paddle.x;
    }

    clampPaddle();
    if (G.bricks.length) layoutBricks();
    if (G.mode === 'ready' || G.mode === 'idle') {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 1;
    }

    draw();
  }

  function clampPaddle() {
    const maxX = Math.max(0, G.W - paddle.w);
    paddle.x = clamp(paddle.x, 0, maxX);
    paddle.target = clamp(paddle.target, 0, maxX);
  }

  function layoutBricks() {
    if (!G.W || !G.H) return;
    const padX = Math.max(8, G.W * 0.03);
    const top = Math.max(10, G.H * 0.06);
    const gap = clamp(G.W * 0.012, 3, 6);
    const brickW = (G.W - padX * 2 - gap * (COLS - 1)) / COLS;
    const brickH = clamp(G.H * 0.032, 12, 22);

    for (const brick of G.bricks) {
      brick.w = brickW;
      brick.h = brickH;
      brick.x = padX + brick.col * (brickW + gap);
      brick.y = top + brick.row * (brickH + gap);
    }
  }

  function buildLevel() {
    G.rows = Math.min(4 + (G.level - 1), 8);
    G.bricks = [];
    for (let row = 0; row < G.rows; row++) {
      for (let col = 0; col < COLS; col++) {
        G.bricks.push({
          row,
          col,
          alive: true,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          color: COLORS[(row + G.level - 1) % COLORS.length]
        });
      }
    }
    layoutBricks();
  }

  function readyBall() {
    ball.ux = 0;
    ball.uy = -1;
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 1;
  }

  function ballSpeed() {
    const base = clamp(G.H * 0.62, 230, 620);
    return base * (1 + (G.level - 1) * 0.07);
  }

  function startGame() {
    G.score = 0;
    G.lives = MAX_LIVES;
    G.level = 1;
    G.mode = 'ready';
    buildLevel();
    readyBall();
    updateHud();
    hideMessage();
    pauseBtn.textContent = 'Pause';
  }

  function openGame() {
    overlay.classList.remove('hidden');
    document.body.classList.add('game-open');
    G.best = readBest();
    G.score = 0;
    G.lives = MAX_LIVES;
    G.level = 1;
    G.rows = 4;
    G.bricks = [];
    G.W = 0;
    G.H = 0;
    resize();
    buildLevel();
    readyBall();
    updateHud();
    G.mode = 'ready';
    pauseBtn.textContent = 'Pause';
    showMessage('Breakout', 'Drag to move the paddle. Clear every brick and keep the ball alive.', 'Start');
    startLoop();
  }

  function closeGame() {
    stopLoop();
    if (G.score > G.best) G.best = G.score;
    if (G.best > 0) writeBest(G.best);
    G.mode = 'idle';
    hideMessage();
    overlay.classList.add('hidden');
    document.body.classList.remove('game-open');
  }

  function launchBall() {
    if (G.mode !== 'ready') return;
    const angle = (Math.random() * 0.5 - 0.25) * 1.2;
    ball.ux = Math.sin(angle);
    ball.uy = -Math.cos(angle);
    G.mode = 'playing';
    hideMessage();
    G.last = 0;
  }

  function pauseGame() {
    if (G.mode !== 'playing' && G.mode !== 'ready') return;
    G.prevMode = G.mode;
    G.mode = 'paused';
    stopLoop();
    pauseBtn.textContent = 'Resume';
    showMessage('Paused', 'The ball will wait. Resume when you are ready.', 'Resume');
    draw();
  }

  function resumeGame() {
    if (G.mode !== 'paused') return;
    G.mode = G.prevMode === 'playing' ? 'playing' : 'ready';
    hideMessage();
    pauseBtn.textContent = 'Pause';
    startLoop();
  }

  function endGame() {
    G.mode = 'over';
    if (G.score > G.best) G.best = G.score;
    writeBest(G.best);
    updateHud();
    stopLoop();
    showMessage('Game over', `You scored ${G.score} points. Best so far: ${G.best}.`, 'Play again');
    draw();
  }

  function loseLife() {
    G.lives -= 1;
    updateHud();
    if (G.lives <= 0) {
      endGame();
      return;
    }
    readyBall();
    G.mode = 'ready';
    showMessage('Life lost', `${G.lives} ${G.lives === 1 ? 'life' : 'lives'} left. Keep the ball on the paddle.`, 'Continue');
    stopLoop();
    draw();
  }

  function clearLevel() {
    G.score += 50 * G.level;
    if (G.score > G.best) G.best = G.score;
    G.level += 1;
    buildLevel();
    readyBall();
    G.mode = 'ready';
    updateHud();
    showMessage(`Level ${G.level}`, 'Every brick is gone. New wall, a little faster.', 'Continue');
    stopLoop();
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

  function frame(now) {
    G.raf = window.requestAnimationFrame(frame);
    if (!G.last) G.last = now;
    let dt = (now - G.last) / 1000;
    G.last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    update(dt);
    draw();
  }

  function update(dt) {
    paddle.x += (paddle.target - paddle.x) * Math.min(1, dt * 30);
    clampPaddle();

    if (G.mode === 'ready') {
      ball.ux = 0;
      ball.uy = -1;
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 1;
    } else if (G.mode === 'playing') {
      simulate(dt);
    }
  }

  function simulate(dt) {
    const speed = ballSpeed();
    const distance = speed * dt;
    const maxStep = Math.max(ball.r * 0.7, 1.5);
    const steps = clamp(Math.ceil(distance / maxStep), 1, 12);
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      if (G.mode !== 'playing') return;
      stepBall(stepDt, speed);
    }
  }

  function stepBall(dt, speed) {
    ball.x += ball.ux * speed * dt;
    ball.y += ball.uy * speed * dt;

    if (ball.x - ball.r < 0) {
      ball.x = ball.r;
      ball.ux = Math.abs(ball.ux);
    } else if (ball.x + ball.r > G.W) {
      ball.x = G.W - ball.r;
      ball.ux = -Math.abs(ball.ux);
    }

    if (ball.y - ball.r < 0) {
      ball.y = ball.r;
      ball.uy = Math.abs(ball.uy);
    }

    if (
      ball.uy > 0 &&
      ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.h &&
      ball.x + ball.r >= paddle.x &&
      ball.x - ball.r <= paddle.x + paddle.w
    ) {
      const offset = clamp((ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
      const angle = offset * (Math.PI / 3);
      ball.ux = Math.sin(angle);
      ball.uy = -Math.cos(angle);
      ball.y = paddle.y - ball.r - 0.5;
    }

    for (const brick of G.bricks) {
      if (!brick.alive) continue;
      const nearestX = clamp(ball.x, brick.x, brick.x + brick.w);
      const nearestY = clamp(ball.y, brick.y, brick.y + brick.h);
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      if (dx * dx + dy * dy > ball.r * ball.r) continue;

      brick.alive = false;
      G.score += 10 * (G.rows - brick.row);
      if (G.score > G.best) G.best = G.score;
      updateHud();

      const overlapX = brick.w / 2 + ball.r - Math.abs(ball.x - (brick.x + brick.w / 2));
      const overlapY = brick.h / 2 + ball.r - Math.abs(ball.y - (brick.y + brick.h / 2));
      if (overlapX < overlapY) {
        if (ball.x < brick.x + brick.w / 2) {
          ball.ux = -Math.abs(ball.ux);
          ball.x -= overlapX;
        } else {
          ball.ux = Math.abs(ball.ux);
          ball.x += overlapX;
        }
      } else if (ball.y < brick.y + brick.h / 2) {
        ball.uy = -Math.abs(ball.uy);
        ball.y -= overlapY;
      } else {
        ball.uy = Math.abs(ball.uy);
        ball.y += overlapY;
      }
      break;
    }

    if (ball.y - ball.r > G.H) {
      loseLife();
      return;
    }

    let remaining = false;
    for (const brick of G.bricks) {
      if (brick.alive) {
        remaining = true;
        break;
      }
    }
    if (!remaining) clearLevel();
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

    for (const brick of G.bricks) {
      if (!brick.alive) continue;
      roundRect(brick.x, brick.y, brick.w, brick.h, Math.min(5, brick.h / 2.5));
      ctx.fillStyle = brick.color;
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(brick.x + 2, brick.y + 2, Math.max(0, brick.w - 4), 1.5);
    }

    const paddleGradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0);
    paddleGradient.addColorStop(0, '#818cf8');
    paddleGradient.addColorStop(1, '#c084fc');
    roundRect(paddle.x, paddle.y, paddle.w, paddle.h, paddle.h / 2);
    ctx.fillStyle = paddleGradient;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#e2e8f0';
    ctx.shadowColor = 'rgba(165, 180, 252, 0.85)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (G.mode === 'ready') {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
      ctx.font = `600 ${Math.round(clamp(W * 0.04, 12, 17))}px system-ui, -apple-system, sans-serif`;
      ctx.fillText('Tap to launch', W / 2, Math.max(H * 0.55, paddle.y - 56));
    }
  }

  function paddleFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    paddle.target = clamp(x - paddle.w / 2, 0, Math.max(0, G.W - paddle.w));
    paddle.x = paddle.target;
  }

  canvas.addEventListener(
    'pointerdown',
    (ev) => {
      if (G.mode === 'paused' || G.mode === 'over') return;
      ev.preventDefault();
      pointerId = ev.pointerId;
      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(ev.pointerId);
        } catch (err) {
          /* capture is a nicety; dragging still works without it */
        }
      }
      paddleFromClientX(ev.clientX);
      if (G.mode === 'ready') launchBall();
    },
    { passive: false }
  );

  canvas.addEventListener(
    'pointermove',
    (ev) => {
      if (pointerId !== null && ev.pointerId !== pointerId) return;
      if (G.mode !== 'playing' && G.mode !== 'ready') return;
      ev.preventDefault();
      paddleFromClientX(ev.clientX);
    },
    { passive: false }
  );

  function releasePointer(ev) {
    if (pointerId === ev.pointerId) pointerId = null;
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  if (playBtn) playBtn.addEventListener('click', openGame);
  exitBtn.addEventListener('click', closeGame);
  restartBtn.addEventListener('click', () => {
    startGame();
    startLoop();
    draw();
  });

  pauseBtn.addEventListener('click', () => {
    if (G.mode === 'paused') resumeGame();
    else pauseGame();
  });

  actionBtn.addEventListener('click', () => {
    if (G.mode === 'paused') {
      resumeGame();
      return;
    }
    if (G.mode === 'over') {
      startGame();
      startLoop();
      draw();
      return;
    }
    if (G.mode === 'ready') {
      hideMessage();
      startLoop();
    }
  });

  window.addEventListener('keydown', (ev) => {
    if (overlay.classList.contains('hidden')) return;
    if (ev.key === 'Escape') {
      closeGame();
      return;
    }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const step = paddle.w * 0.5;
      paddle.target = clamp(
        paddle.target + (ev.key === 'ArrowLeft' ? -step : step),
        0,
        Math.max(0, G.W - paddle.w)
      );
      ev.preventDefault();
      return;
    }
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      if (G.mode === 'ready') {
        launchBall();
        startLoop();
      } else if (G.mode === 'playing' || G.mode === 'paused') {
        pauseBtn.click();
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !overlay.classList.contains('hidden')) pauseGame();
  });

  function handleResize() {
    resize();
  }

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(handleResize).observe(stage);
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => window.setTimeout(handleResize, 250));

  G.best = readBest();
  updateHud();
})();
