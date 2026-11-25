(function () {
  'use strict';

  const overlay = document.getElementById('2048-overlay');
  if (!overlay) return;

  const openBtn = document.getElementById('open-2048');
  const exitBtn = document.getElementById('2048-exit');
  const newBtn = document.getElementById('2048-new');
  const boardEl = document.getElementById('2048-board');
  const messageEl = document.getElementById('2048-message');
  const messageAction = document.getElementById('2048-action');
  const messageTitle = document.getElementById('2048-title');
  const messageSubtitle = document.getElementById('2048-subtitle');
  const scoreEl = document.getElementById('2048-score');
  const bestEl = document.getElementById('2048-best');

  const BEST_KEY = 'quicknotes.2048.best.v1';
  const GRID = 4;
  const WIN_VALUE = 2048;

  const G = {
    mode: 'idle',
    board: Array.from({ length: 4 }, () => Array(4).fill(0)),
    score: 0,
    best: 0,
    won: false,
    anim: { merged: [], spawned: null }
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

  function emptyBoard() {
    return Array.from({ length: GRID }, () => Array(GRID).fill(0));
  }

  function emptyCells(board) {
    const cells = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!board[y][x]) cells.push([y, x]);
      }
    }
    return cells;
  }

  function spawnTile(board) {
    const cells = emptyCells(board);
    if (!cells.length) return null;
    const [y, x] = cells[Math.floor(Math.random() * cells.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    board[y][x] = value;
    return { y, x, value };
  }

  function getLine(i, dx, dy) {
    const line = [];
    for (let k = 0; k < GRID; k++) {
      if (dx !== 0) line.push([i, dx > 0 ? GRID - 1 - k : k]);
      else line.push([dy > 0 ? GRID - 1 - k : k, i]);
    }
    return line;
  }

  function moveBoard(board, dx, dy) {
    const next = emptyBoard();
    const mergeCells = [];
    let gained = 0;
    let moved = false;

    const lines = [];
    for (let i = 0; i < GRID; i++) lines.push(getLine(i, dx, dy));

    for (const line of lines) {
      const values = line.map(([y, x]) => board[y][x]).filter((v) => v);
      const merged = [];
      for (let i = 0; i < values.length; i++) {
        if (values[i] === values[i + 1]) {
          const nv = values[i] * 2;
          mergeCells.push(line[merged.length]);
          merged.push(nv);
          gained += nv;
          i++;
        } else {
          merged.push(values[i]);
        }
      }
      while (merged.length < GRID) merged.push(0);
      line.forEach(([y, x], idx) => {
        next[y][x] = merged[idx];
        if (merged[idx] !== board[y][x]) moved = true;
      });
    }

    if (!moved) return { board: next, gained: 0, moved: false, mergeCells: [] };
    return { board: next, gained, moved: true, mergeCells };
  }

  function boardHasMerge(board) {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const v = board[y][x];
        if (x + 1 < GRID && board[y][x + 1] === v) return true;
        if (y + 1 < GRID && board[y + 1][x] === v) return true;
      }
    }
    return false;
  }

  function updateHud() {
    scoreEl.textContent = String(G.score);
    bestEl.textContent = String(G.best);
  }

  function render() {
    const mergedSet = new Set(G.anim.merged.map(([y, x]) => y + ',' + x));
    const spawned = G.anim.spawned;
    boardEl.innerHTML = '';
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const value = G.board[y][x];
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (value) {
          cell.classList.add('tile');
          cell.classList.add('tile--' + value);
          cell.textContent = String(value);
          if (mergedSet.has(y + ',' + x)) cell.classList.add('tile--merged');
          else if (spawned && spawned.y === y && spawned.x === x) cell.classList.add('tile--fresh');
        }
        boardEl.append(cell);
      }
    }
    G.anim.merged = [];
    G.anim.spawned = null;
    updateHud();
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
    boardEl.classList.remove('has-motion');
    G.board = emptyBoard();
    G.score = 0;
    G.won = false;
    G.mode = 'playing';
    spawnTile(G.board);
    spawnTile(G.board);
    clearMessages();
    render();
  }

  function isGameOver() {
    const cells = emptyCells(G.board);
    if (cells.length) return false;
    return !boardHasMerge(G.board);
  }

  function handleMove(dx, dy) {
    if (G.mode !== 'playing') return;

    const result = moveBoard(G.board, dx, dy);
    if (!result.moved) return;

    G.board = result.board;
    G.score += result.gained;
    if (G.score > G.best) {
      G.best = G.score;
      writeBest(G.best);
    }

    const spawned = spawnTile(G.board);
    G.anim = { merged: result.mergeCells || [], spawned };
    render();
    boardEl.classList.remove('has-motion');
    void boardEl.offsetWidth;
    boardEl.classList.add('has-motion');

    const hasWinTile = G.board.some((row) => row.some((v) => v >= WIN_VALUE));
    if (hasWinTile && !G.won) {
      G.won = true;
      showMessage('You win!', 'You reached 2048 in ' + G.score + ' points. Keep going or start over.', 'Keep going');
      G.mode = 'won';
      return;
    }

    if (isGameOver()) {
      G.mode = 'over';
      showMessage('Game over', 'Score ' + G.score + ' points. Best ' + G.best + '.', 'Play again');
    }
  }

  function openPanel() {
    boardEl.classList.remove('has-motion');
    overlay.classList.remove('hidden');
    document.body.classList.add('game-open');
    G.mode = 'ready';
    G.score = 0;
    G.best = readBest();
    G.board = emptyBoard();
    spawnTile(G.board);
    spawnTile(G.board);
    render();
    showMessage('2048', 'Swipe or use arrow keys to slide the tiles.', 'Start');
  }

  function closePanel() {
    hideMessage();
    overlay.classList.add('hidden');
    document.body.classList.remove('game-open');
    G.mode = 'idle';
  }

  function hideMessage() {
    messageEl.classList.add('hidden');
  }

  messageAction.addEventListener('click', function () {
    if (G.mode === 'ready') {
      startGame();
      return;
    }
    if (G.mode === 'won') {
      clearMessages();
      G.mode = 'playing';
      return;
    }
    if (G.mode === 'over') {
      startGame();
      return;
    }
  });

  openBtn.addEventListener('click', openPanel);
  exitBtn.addEventListener('click', closePanel);
  newBtn.addEventListener('click', function () {
    startGame();
  });

  window.addEventListener('keydown', function (ev) {
    if (overlay.classList.contains('hidden')) return;
    if (ev.key === 'Escape') {
      closePanel();
      return;
    }
    const key = ev.key;
    let dir = null;
    if (key === 'ArrowLeft') dir = [-1, 0];
    else if (key === 'ArrowRight') dir = [1, 0];
    else if (key === 'ArrowUp') dir = [0, -1];
    else if (key === 'ArrowDown') dir = [0, 1];
    if (dir) {
      ev.preventDefault();
      handleMove(dir[0], dir[1]);
    }
  });

  let swipeStart = null;
  boardEl.addEventListener('pointerdown', function (ev) {
    swipeStart = { x: ev.clientX, y: ev.clientY };
  });
  boardEl.addEventListener('pointerup', function (ev) {
    if (!swipeStart) return;
    const dx = ev.clientX - swipeStart.x;
    const dy = ev.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? 1 : -1, 0);
    else handleMove(0, dy > 0 ? 1 : -1);
  });

  G.best = readBest();
  render();
})();
