(function () {
  'use strict';

  const overlay = document.getElementById('memory-overlay');
  if (!overlay) return;

  const openBtn = document.getElementById('open-memory');
  const exitBtn = document.getElementById('memory-exit');
  const newBtn = document.getElementById('memory-new');
  const gridEl = document.getElementById('memory-grid');
  const messageEl = document.getElementById('memory-message');
  const messageAction = document.getElementById('memory-action');
  const messageTitle = document.getElementById('memory-title');
  const messageSubtitle = document.getElementById('memory-subtitle');
  const movesEl = document.getElementById('memory-moves');
  const matchedEl = document.getElementById('memory-matched');
  const bestEl = document.getElementById('memory-best');

  const BEST_KEY = 'quicknotes.memory.best.v1';
  const PAIRS = 8;
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const G = {
    mode: 'idle',
    cards: [],
    moves: 0,
    matched: 0,
    best: 0,
    reveal: [],
    lock: false,
    timeout: 0
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

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  function clearTimeoutHandle() {
    if (G.timeout) {
      window.clearTimeout(G.timeout);
      G.timeout = 0;
    }
  }

  function updateHud() {
    movesEl.textContent = String(G.moves);
    matchedEl.textContent = G.matched + ' / ' + PAIRS;
    bestEl.textContent = String(G.best);
  }

  function buildDeck() {
    const deck = [];
    for (let i = 0; i < PAIRS; i++) {
      deck.push({ id: i, letter: LETTERS[i], matched: false });
      deck.push({ id: i, letter: LETTERS[i], matched: false });
    }
    return shuffle(deck);
  }

  function render() {
    gridEl.innerHTML = '';
    for (const card of G.cards) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'memory-card';
      el.dataset.index = String(card.index);
      el.setAttribute('aria-label', card.matched ? 'Matched card' : 'Memory card');
      if (card.matched) {
        el.classList.add('is-matched');
        el.textContent = card.letter;
      } else if (G.reveal.indexOf(card.index) !== -1) {
        el.classList.add('is-flipped');
        el.textContent = card.letter;
      } else {
        el.textContent = '?';
      }
      el.addEventListener('click', function () {
        onCardClick(card.index);
      });
      gridEl.append(el);
    }
    updateHud();
  }

  function onCardClick(index) {
    if (G.mode !== 'playing') return;
    if (G.lock) return;
    const card = G.cards[index];
    if (!card || card.matched) return;
    if (G.reveal.indexOf(index) !== -1) return;

    G.reveal.push(index);
    render();

    if (G.reveal.length < 2) return;

    G.lock = true;
    const first = G.cards[G.reveal[0]];
    const second = G.cards[G.reveal[1]];

    if (first.id === second.id) {
      for (const c of G.cards) {
        if (c.id === first.id) c.matched = true;
      }
      G.matched += 1;
      G.moves += 1;
      G.reveal = [];
      G.lock = false;
      render();
      if (G.matched === PAIRS) {
        G.mode = 'won';
        if (!G.best || G.moves < G.best) {
          G.best = G.moves;
          writeBest(G.best);
        }
        updateHud();
        showMessage('All pairs matched!', 'Solved in ' + G.moves + ' moves. Best so far: ' + G.best + '.', 'Play again');
      }
      return;
    }

    G.moves += 1;
    updateHud();
    G.timeout = window.setTimeout(function () {
      G.reveal = [];
      G.lock = false;
      if (!overlay.classList.contains('hidden')) render();
    }, 800);
  }

  function startGame() {
    clearTimeoutHandle();
    G.cards = buildDeck().map((c, i) => {
      return Object.assign({}, c, { index: i, matched: false });
    });
    G.moves = 0;
    G.matched = 0;
    G.reveal = [];
    G.lock = false;
    G.mode = 'playing';
    clearMessages();
    render();
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

  function openPanel() {
    clearTimeoutHandle();
    overlay.classList.remove('hidden');
    document.body.classList.add('game-open');
    G.best = readBest();
    G.mode = 'ready';
    G.cards = [];
    G.moves = 0;
    G.matched = 0;
    G.reveal = [];
    G.lock = false;
    updateHud();
    showMessage('Memory', 'Flip two cards to find a matching pair.', 'Start');
  }

  function closePanel() {
    clearTimeoutHandle();
    overlay.classList.add('hidden');
    document.body.classList.remove('game-open');
    hideOverlayCards();
    G.mode = 'idle';
  }

  function hideOverlayCards() {
    gridEl.innerHTML = '';
  }

  messageAction.addEventListener('click', function () {
    if (G.mode === 'ready' || G.mode === 'won' || G.mode === 'over') {
      startGame();
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
    }
  });

  G.best = readBest();
  updateHud();
})();
