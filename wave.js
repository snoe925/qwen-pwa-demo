(function () {
  'use strict';

  const overlay = document.getElementById('wave-overlay');
  if (!overlay) return;

  const openBtn = document.getElementById('open-wave');
  const closeBtn = document.getElementById('wave-close');
  const toggleBtn = document.getElementById('wave-toggle');
  const readoutEl = document.getElementById('wave-freq');
  const waveNameEl = document.getElementById('wave-wave-name');
  const currentEl = document.getElementById('wave-current');
  const activeBadgeEl = document.getElementById('wave-active-badge');
  const volumeEl = document.getElementById('wave-volume');
  const volBadgeEl = document.getElementById('wave-vol-badge');
  const waveBtns = Array.prototype.slice.call(overlay.querySelectorAll('.wave-btn'));

  const WAVE_NAMES = { sine: 'Sine', square: 'Square', sawtooth: 'Sawtooth' };
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const MIN_HZ = 40;
  const MAX_HZ = 4000;
  const SEMITONE = Math.pow(2, 1 / 12);
  const MAX_MASTER = 0.9;
  const MAX_VOICE = 0.12;

  const VOICE_SPEC = [
    { semitones: 0, volume: 100 },
    { semitones: 7, volume: 60 },
    { semitones: 12, volume: 45 },
    { semitones: 19, volume: 32 }
  ];

  const voices = [];

  let audioCtx = null;
  let masterGain = null;
  let playing = false;
  let waveType = 'sine';

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function noteName(freq) {
    const midi = Math.round(69 + 12 * Math.log2(clamp(freq, MIN_HZ, MAX_HZ) / 440));
    return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }

  function getVoiceEl(id) {
    return document.getElementById(id);
  }

  function paintRange(el) {
    const min = Number(el.min) || 0;
    const max = Number(el.max) || 100;
    const value = Number(el.value) || 0;
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    el.style.setProperty('--fill', pct + '%');
  }

  function masterLevel() {
    return (clamp(Number(volumeEl.value) || 0, 0, 100) / 100) * MAX_MASTER;
  }

  function voiceLevel(voice) {
    return (clamp(voice.volume, 0, 100) / 100) * MAX_VOICE;
  }

  function ensureContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        audioCtx = new Ctx();
      } catch (err) {
        return null;
      }
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      masterGain.gain.value = 0;
      audioCtx.addEventListener('statechange', function () {
        if (!playing) return;
        const state = audioCtx ? audioCtx.state : '';
        if (state === 'suspended' || state === 'interrupted' || state === 'closed') {
          stopSound(true);
        }
      });
    }
    if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  function updateLabels() {
    const root = voices[0];
    readoutEl.textContent = String(Math.round(root.freq));
    volBadgeEl.textContent = (Number(volumeEl.value) || 0) + '%';
    waveNameEl.textContent = WAVE_NAMES[waveType] || 'Sine';
    const active = voices.filter((v) => v.volume > 0).length;
    activeBadgeEl.textContent = active + ' / ' + voices.length;
    currentEl.textContent =
      (WAVE_NAMES[waveType] || 'Sine') + ' · ' + active + (active === 1 ? ' voice' : ' voices');
    for (const v of voices) {
      if (v.noteEl) v.noteEl.textContent = noteName(v.freq);
      if (v.hzEl) v.hzEl.textContent = Math.round(v.freq) + ' Hz';
    }
  }

  function updateVoiceGain(i) {
    const voice = voices[i];
    if (voice.gain && audioCtx) {
      voice.gain.gain.setTargetAtTime(voiceLevel(voice), audioCtx.currentTime, 0.02);
    }
  }

  function setVoiceFrequency(i, hz) {
    const voice = voices[i];
    voice.freq = clamp(hz, MIN_HZ, MAX_HZ);
    if (voice.osc && audioCtx) {
      voice.osc.frequency.setTargetAtTime(voice.freq, audioCtx.currentTime, 0.015);
    }
    updateLabels();
  }

  function setWaveType(type) {
    waveType = type;
    for (const btn of waveBtns) {
      const on = btn.dataset.type === type;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    for (const voice of voices) {
      if (voice.osc) voice.osc.type = type;
    }
    updateLabels();
  }

  function startSound() {
    const ctx = ensureContext();
    if (!ctx) {
      toggleBtn.textContent = 'No audio';
      window.setTimeout(function () {
        toggleBtn.textContent = 'Play';
      }, 1600);
      return;
    }
    stopSound(true);

    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(Math.max(masterLevel(), 0.0002), now + 0.05);

    for (let i = 0; i < voices.length; i++) {
      const voice = voices[i];
      const osc = ctx.createOscillator();
      osc.type = waveType;
      osc.frequency.setValueAtTime(voice.freq, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(voiceLevel(voice), 0.0002), now + 0.03);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();
      voice.osc = osc;
      voice.gain = gain;
    }

    playing = true;
    toggleBtn.textContent = 'Stop';
    overlay.classList.add('wave-on');
  }

  function stopSound(immediate) {
    const ctx = audioCtx;
    if (!ctx) {
      for (const voice of voices) {
        voice.osc = null;
        voice.gain = null;
      }
      playing = false;
      toggleBtn.textContent = 'Play';
      overlay.classList.remove('wave-on');
      return;
    }

    for (const voice of voices) {
      const osc = voice.osc;
      const gain = voice.gain;
      voice.osc = null;
      voice.gain = null;
      if (!osc || !gain) continue;

      try {
        if (immediate) {
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.setValueAtTime(0, ctx.currentTime);
          osc.stop(ctx.currentTime);
        } else {
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
          osc.stop(now + 0.06);
        }
      } catch (err) {
        /* the oscillator was already stopped */
      }

      osc.onended = function () {
        try {
          gain.disconnect();
        } catch (err) {
          /* already disconnected */
        }
      };
    }

    try {
      if (immediate) {
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.setValueAtTime(0, ctx.currentTime);
      } else {
        const now = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.0001), now);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      }
    } catch (err) {
      /* master gain already torn down */
    }

    playing = false;
    toggleBtn.textContent = 'Play';
    overlay.classList.remove('wave-on');
  }

  function openPanel() {
    overlay.classList.remove('hidden');
    document.body.classList.add('wave-open');
    for (const voice of voices) {
      paintRange(voice.volEl);
    }
    paintRange(volumeEl);
    updateLabels();
    toggleBtn.textContent = playing ? 'Stop' : 'Play';
  }

  function closePanel() {
    stopSound(true);
    overlay.classList.add('hidden');
    document.body.classList.remove('wave-open');
    if (audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend().catch(function () {});
    }
  }

  function toggleSound() {
    if (playing) stopSound(false);
    else startSound();
  }

  function buildVoices() {
    for (let i = 0; i < VOICE_SPEC.length; i++) {
      const spec = VOICE_SPEC[i];
      const volEl = getVoiceEl('wave-voice-vol-' + i);
      const noteEl = getVoiceEl('wave-voice-note-' + i);
      const hzEl = getVoiceEl('wave-voice-hz-' + i);
      const downBtn = getVoiceEl('wave-voice-down-' + i);
      const upBtn = getVoiceEl('wave-voice-up-' + i);

      const voice = {
        freq: 440 * Math.pow(2, spec.semitones / 12),
        volume: spec.volume,
        noteEl,
        hzEl,
        volEl,
        osc: null,
        gain: null
      };

      if (volEl) volEl.value = String(spec.volume);
      if (downBtn) downBtn.addEventListener('click', function () {
        setVoiceFrequency(i, voice.freq / SEMITONE);
      });
      if (upBtn) upBtn.addEventListener('click', function () {
        setVoiceFrequency(i, voice.freq * SEMITONE);
      });
      if (volEl) volEl.addEventListener('input', function () {
        voice.volume = Number(volEl.value) || 0;
        paintRange(volEl);
        updateVoiceGain(i);
        updateLabels();
      });

      voices.push(voice);
    }
  }

  buildVoices();

  if (openBtn) openBtn.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  toggleBtn.addEventListener('click', toggleSound);

  volumeEl.addEventListener('input', function () {
    updateLabels();
    paintRange(volumeEl);
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(masterLevel(), audioCtx.currentTime, 0.02);
    }
  });

  for (const btn of waveBtns) {
    btn.addEventListener('click', function () {
      setWaveType(btn.dataset.type);
    });
  }

  window.addEventListener('keydown', function (ev) {
    if (overlay.classList.contains('hidden')) return;
    if (ev.key === 'Escape') {
      closePanel();
      return;
    }
    if (ev.key === ' ') {
      const tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'BUTTON' || tag === 'INPUT') return;
      ev.preventDefault();
      toggleSound();
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && playing) stopSound(true);
  });

  setWaveType(waveType);
  for (const voice of voices) {
    if (voice.volEl) paintRange(voice.volEl);
  }
  paintRange(volumeEl);
  updateLabels();
})();
