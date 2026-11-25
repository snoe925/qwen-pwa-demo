(function () {
  'use strict';

  const overlay = document.getElementById('tetris-overlay');
  if (!overlay) return;

  const openBtn = document.getElementById('play-tetris');
  const canvas = document.getElementById('tetris-canvas');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('tetris-stage');
  const exitBtn = document.getElementById('tetris-exit');
  const restartBtn = document.getElementById('tetris-restart');
  const pauseBtn = document.getElementById('tetris-pause');
  const leftBtn = document.getElementById('tetris-left');
  const rightBtn = document.getElementById('tetris-right');
  const rotateBtn = document.getElementById('tetris-rotate');
  const dropBtn = document.getElementById('tetris-drop');
  const messageEl = document.getElementById('tetris-message');
  const messageAction = document.getElementById('tetris-message-action');
  const messageTitle = document.getElementById('tetris-message-title');
  const messageSubtitle = document.getElementById('tetris-message-subtitle');
  const scoreEl = document.getElementById('tetris-score');
  const linesEl = document.getElementById('tetris-lines');
  const levelEl = document.getElementById('tetris-level');
  const bestEl = document.getElementById('tetris-best');

  if (!ctx) return;

  const BEST_KEY = 'quicknotes.tetris.best.v1';
  const COLS = 10;
  const ROWS = 20;
  const LINES_PER_LEVEL = 4;
  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    O: [[1, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
  };
  const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const COLORS = { I: '#22d3ee', J: '#818cf8', L: '#fb923c', O: '#fbbf24', S: '#34d399', T: '#c084fc', Z: '#f43f5e' };
  const LINE_SCORES = [0, 100, 300, 500, 800];

  const G = {
    mode: 'idle',
    board: [],
    current: null,
    bag: [],
    score: 0,
    lines: 0,
    level: 1,
    best: 0,
    dropMs: 800,
    acc: 0,
    last: 0,
    raf: 0,
    W: 0,
    H: 0,
    cell: 0,
    boardX: 0,
    boardY: 0
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

  function blankBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function nextType() {
    if (G.bag.length === 0) G.bag = shuffleTypes();
    return G.bag.pop();
  }

  function shuffleTypes() {
    const bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    return bag;
  }

  function rotateCW(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const out = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out[c][rows - 1 - r] = matrix[r][c];
      }
    }
    return out;
  }

  function collides(matrix, ox, oy) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[0].length; c++) {
        if (!matrix[r][c]) continue;
        const x = ox + c;
        const y = oy + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && G.board[y][x]) return true;
      }
    }
    return false;
  }

  function spawn() {
    const type = nextType();
    const matrix = SHAPES[type].map((row) => row.slice());
    const x = Math.floor((COLS - matrix[0].length) / 2);
    const y = type === 'I' ? -1 : 0;
    G.current = { type, matrix, x, y };
    if (collides(matrix, x, y)) {
      endGame();
      return false;
    }
    return true;
  }

  function writeCell() {
    const { matrix, x, y, type } = G.current;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[0].length; c++) {
        if (!matrix[r][c]) continue;
        const gx = x + c;
        const gy = y + r;
        if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) {
          G.board[gy][gx] = COLORS[type];
        }
      }
    }
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      let full = true;
      for (let x = 0; x < COLS; x++) {
        if (!G.board[y][x]) {
          full = false;
          break;
        }
      }
      if (!full) continue;
      for (let row = y; row > 0; row--) {
        G.board[row] = G.board[row - 1].slice();
      }
      G.board[0] = Array(COLS).fill(null);
      cleared++;
      y++;
    }
    if (!cleared) return;
    G.lines += cleared;
    G.score += LINE_SCORES[cleared] * G.level;
    const newLevel = Math.floor(G.lines / LINES_PER_LEVEL) + 1;
    if (newLevel !== G.level) {
      G.level = newLevel;
      G.dropMs = Math.max(90, 800 - (G.level - 1) * 75);
    }
  }

  function landPiece() {
    writeCell();
    clearLines();
    if (G.score > G.best) {
      G.best = G.score;
      writeBest(G.best);
    }
    updateHud();
    spawn();
    if (!G.current) return;
    if (G.mode !== 'playing') return;
  }

  function stepGravity() {
    if (G.mode !== 'playing' || !G.current) return;
    if (!collides(G.current.matrix, G.current.x, G.current.y + 1)) {
      G.current.y += 1;
      return;
    }
    landPiece();
  }

  function hardDrop() {
    if (G.mode !== 'playing') return;
    if (!G.current) return;
    let distance = 0;
    while (!collides(G.current.matrix, G.current.x, G.current.y + 1)) {
      G.current.y += 1;
      distance++;
    }
    G.score += distance * 2;
    if (G.score > G.best) {
      G.best = G.score;
      writeBest(G.best);
    }
    landPiece();
  }

  function movePiece(dx) {
    if (G.mode !== 'playing' || !G.current) return;
    if (!collides(G.current.matrix, G.current.x + dx, G.current.y)) {
      G.current.x += dx;
    }
  }

  function rotatePiece() {
    if (G.mode !== 'playing' || !G.current) return;
    const rotated = rotateCW(G.current.matrix);
    const tries = [0, -1, 1, -2, 2];
    for (const dx of tries) {
      if (!collides(rotated, G.current.x + dx, G.current.y)) {
        G.current.matrix = rotated;
        G.current.x += dx;
        return;
      }
    }
  }

  function updateHud() {
    scoreEl.textContent = String(G.score);
    linesEl.textContent = String(G.lines);
    levelEl.textContent = String(G.level);
    bestEl.textContent = String(G.best);
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

  function startGame() {
    stopLoop();
    G.board = blankBoard();
    G.score = 0;
    G.lines = 0;
    G.level = 1;
    G.dropMs = 800;
    G.acc = 0;
    G.best = readBest();
    G.bag = shuffleTypes();
    G.mode = 'playing';
    hideMessage();
    if (!spawn()) {
      return;
    }
    updateHud();
    startLoop();
  }

  function pauseGame() {
    if (G.mode !== 'playing') return;
    G.mode = 'paused';
    stopLoop();
    pauseBtn.textContent = 'Resume';
    showMessage('Paused', 'The piece will wait. Resume when you are ready.', 'Resume');
  }

  function resumeGame() {
    if (G.mode !== 'paused') return;
    G.mode = 'playing';
    hideMessage();
    pauseBtn.textContent = 'Pause';
    startLoop();
  }

  function endGame() {
    G.mode = 'over';
    stopLoop();
    if (G.score > G.best) {
      G.best = G.score;
      writeBest(G.best);
    }
    updateHud();
    pauseBtn.textContent = 'Pause';
    showMessage('Game over', 'Score ' + G.score + '. Best so far: ' + G.best + '.', 'Play again');
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
    dt = Math.min(dt, 0.1);

    if (G.mode === 'playing' && G.current) {
      G.acc += dt * 1000;
      while (G.acc >= G.dropMs) {
        G.acc -= G.dropMs;
        if (G.mode !== 'playing' || !G.current) break;
        stepGravity();
      }
    }
    draw();
  }

  function draw() {
    const W = G.W;
    const H = G.H;
    if (!W || !H) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);

    const cell = G.cell;
    const boardW = COLS * cell;
    const boardH = ROWS * cell;

    ctx.fillStyle = '#0f1d33';
    ctx.fillRect(G.boardX, G.boardY, boardW, boardH);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(G.boardX + c * cell, G.boardY);
      ctx.lineTo(G.boardX + c * cell, G.boardY + boardH);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(G.boardX, G.boardY + r * cell);
      ctx.lineTo(G.boardX + boardW, G.boardY + r * cell);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(G.boardX, G.boardY, boardW, boardH);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const color = G.board[y][x];
        if (color) drawCell(G.boardX + x * cell, G.boardY + y * cell, cell, color);
      }
    }

    if (G.current && G.mode !== 'over') {
      const { matrix, x, y, type } = G.current;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[0].length; c++) {
          if (!matrix[r][c]) continue;
          const gy = y + r;
          if (gy < 0) continue;
          drawCell(G.boardX + (x + c) * cell, G.boardY + gy * cell, cell, COLORS[type]);
        }
      }
    }
  }

  function drawCell(px, py, cell, color) {
    const inset = Math.max(1, cell * 0.07);
    ctx.fillStyle = color;
    roundRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2, Math.min(cell * 0.18, 5));
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(px + inset, py + inset, cell - inset * 2, Math.max(2, cell * 0.12));
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

  function resize() {
    if (overlay.classList.contains('hidden')) return;
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const W = Math.max(120, Math.round(rect.width));
    const H = Math.max(120, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = Math.max(14, Math.floor(Math.min((W - 12) / COLS, (H - 12) / ROWS)));
    G.W = W;
    G.H = H;
    G.cell = cell;
    G.boardX = Math.round((W - COLS * cell) / 2);
    G.boardY = Math.round((H - ROWS * cell) / 2);
    draw();
  }

  function openPanel() {
    overlay.classList.remove('hidden');
    document.body.classList.add('game-open');
    G.best = readBest();
    G.score = 0;
    G.lines = 0;
    G.level = 1;
    G.dropMs = 800;
    G.board = blankBoard();
    G.bag = shuffleTypes();
    resize();
    updateHud();
    pauseBtn.textContent = 'Pause';
    G.mode = 'ready';
    showMessage('Tetris', 'Stack the tetrominoes and clear lines.', 'Start');
    draw();
  }

  function closePanel() {
    stopLoop();
    hideMessage();
    overlay.classList.add('hidden');
    document.body.classList.remove('game-open');
    G.mode = 'idle';
  }

  function hideMessage() {
    messageEl.classList.add('hidden');
  }

  function pauseResume() {
    if (G.mode === 'paused') resumeGame();
    else if (G.mode === 'playing') pauseGame();
  }

  messageAction.addEventListener('click', function () {
    if (G.mode === 'ready' || G.mode === 'over') startGame();
    else if (G.mode === 'paused') resumeGame();
  });

  restartBtn.addEventListener('click', function () {
    startGame();
  });

  leftBtn.addEventListener('click', function () {
    if (G.mode === 'ready') return;
    movePiece(-1);
  });
  rightBtn.addEventListener('click', function () {
    if (G.mode === 'ready') return;
    movePiece(1);
  });
  rotateBtn.addEventListener('click', function () {
    if (G.mode === 'ready') return;
    rotatePiece();
  });
  dropBtn.addEventListener('click', function () {
    if (G.mode !== 'playing') return;
    hardDrop();
  });
  pauseBtn.addEventListener('click', pauseResume);

  openBtn.addEventListener('click', openPanel);
  exitBtn.addEventListener('click', closePanel);

  window.addEventListener('keydown', function (ev) {
    if (overlay.classList.contains('hidden')) return;
    if (ev.key === 'Escape') {
      closePanel();
      return;
    }
    if (ev.key === ' ' || ev.key === 'Enter') {
      if (G.mode === 'ready' || G.mode === 'over' || G.mode === 'paused') {
        ev.preventDefault();
        messageAction.click();
        return;
      }
    }
    if (G.mode !== 'playing') return;
    const key = ev.key;
    if (key === 'ArrowLeft') { movePiece(-1); ev.preventDefault(); }
    else if (key === 'ArrowRight') { movePiece(1); ev.preventDefault(); }
    else if (key === 'ArrowDown') {
      if (!collides(G.current.matrix, G.current.x, G.current.y + 1)) {
        G.current.y += 1;
        G.acc = 0;
      } else {
        landPiece();
      }
      ev.preventDefault();
    } else if (key === 'ArrowUp' || key === 'x' || key === 'X') {
      rotatePiece();
      ev.preventDefault();
    } else if (key === ' ') {
      hardDrop();
      ev.preventDefault();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'playing') pauseGame();
  });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(resize).observe(stage);
  }
  window.addEventListener('resize', resize);

  G.best = readBest();
  updateHud();
})();
