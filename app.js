const STORAGE_KEY = 'quicknotes.v1';

const noteInput = document.getElementById('note-input');
const addBtn = document.getElementById('add-btn');
const clearBtn = document.getElementById('clear-btn');
const notesList = document.getElementById('notes-list');
const emptyState = document.getElementById('empty-state');
const counter = document.getElementById('counter');
const statusEl = document.getElementById('status');
const installBtn = document.getElementById('install-btn');

let deferredPrompt = null;

function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function render() {
  const notes = loadNotes();
  notesList.innerHTML = '';
  emptyState.classList.toggle('hidden', notes.length > 0);
  clearBtn.classList.toggle('hidden', notes.length === 0);

  for (const note of notes) {
    const li = document.createElement('li');
    li.className = 'note card';

    const body = document.createElement('div');
    body.style.flex = '1';
    body.style.minWidth = '0';

    const text = document.createElement('p');
    text.className = 'note-text';
    text.textContent = note.text;

    const meta = document.createElement('p');
    meta.className = 'note-meta';
    meta.textContent = formatDate(note.created);

    body.append(text, meta);

    const del = document.createElement('button');
    del.className = 'note-delete';
    del.setAttribute('aria-label', 'Delete note');
    del.textContent = '×';
    del.addEventListener('click', () => {
      saveNotes(loadNotes().filter((n) => n.id !== note.id));
      render();
    });

    li.append(body, del);
    notesList.append(li);
  }
}

function addNote() {
  const text = noteInput.value.trim();
  if (!text) return;
  const notes = loadNotes();
  notes.unshift({ id: Date.now(), text, created: Date.now() });
  saveNotes(notes);
  noteInput.value = '';
  counter.textContent = `0/${noteInput.maxLength}`;
  render();
}

function updateStatus() {
  const online = navigator.onLine;
  statusEl.textContent = online ? 'online' : 'offline';
  statusEl.className = `status ${online ? 'online' : 'offline'}`;
}

addBtn.addEventListener('click', addNote);
noteInput.addEventListener('input', () => {
  counter.textContent = `${noteInput.value.length}/${noteInput.maxLength}`;
});
noteInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') addNote();
});
clearBtn.addEventListener('click', () => {
  if (confirm('Delete all notes?')) {
    saveNotes([]);
    render();
  }
});

window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});

window.addEventListener('appinstalled', () => {
  installBtn.classList.add('hidden');
  deferredPrompt = null;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

updateStatus();
render();

if (new URLSearchParams(location.search).get('action') === 'new') {
  noteInput.focus();
}
