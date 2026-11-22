(function () {
  'use strict';

  const overlay = document.getElementById('wave-overlay');
  if (!overlay) return;

  const openBtn = document.getElementById('open-wave');
  const closeBtn = document.getElementById('wave-close');
  const toggleBtn = document.getElementById('wave-toggle');
  const rangeEl = document.getElementById('wave-range');
  const freqEl = document.getElementById('wave-freq');
  const freqBadgeEl = document.getElementById('wave-freq-badge');
  const volBadgeEl = document.getElementById('wave-vol-badge');
  const waveNameEl = document.getElementById('wave-wave-name');
  const currentEl = document.getElementById('wave-current');
  const volumeEl = document.getElementById('wave-volume');
  const downBtn = document.getElementById('wave-down');
  const upBtn = document.getElementById('wave-up');
  const waveBtns = Array.prototype.slice.call(overlay.querySelectorAll('.wave-btn'));

  const WAVE_NAMES = { sine: 'Sine', square: 'Square', sawtooth: 'Sawtooth' };
  const MIN_HZ = 40;
  const MAX_HZ = 4000;
  const SLIDER_MAX = 1000;
  const MAX_GAIN = 0.22;
  const SEMITONE = Math.pow(2, 1 / 12);

  let audioCtx = null;
  let oscillator = null;
  let gainNode = null;
  let playing = false;
  let waveType = 'sine';
  let frequency = 440;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function sliderToFrequency(value) {
    const t = clamp(Number(value) || 0, 0, SLIDER_MAX) / SLIDER_MAX;
    return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, t);
  }

  function frequencyToSlider(hz) {
    const t = Math.log(clamp(hz, MIN_HZ, MAX_HZ) / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);
    return Math.round(clamp(t, 0, 1) * SLIDER_MAX);
  }

  function volumeLevel() {
    return (clamp(Number(volumeEl.value) || 0, 0, 100) / 100) * MAX_GAIN;
  }

  function updateLabels() {
    const hz = Math.round(frequency);
    const name = WAVE_NAMES[waveType] || 'Sine';
    freqEl.textContent = String(hz);
    freqBadgeEl.textContent = hz + ' Hz';
    volBadgeEl.textContent = (Number(volumeEl.value) || 0) + '%';
    waveNameEl.textContent = name;
    currentEl.textContent = name + ' · ' + hz + ' Hz';
  }

  function paintRange(el) {
    const min = Number(el.min) || 0;
    const max = Number(el.max) || 100;
    const value = Number(el.value) || 0;
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    el.style.setProperty('--fill', pct + '%');
  }

  function setFrequency(hz, syncSlider) {
    frequency = clamp(hz, MIN_HZ, MAX_HZ);
    if (syncSlider) {
      rangeEl.value = String(frequencyToSlider(frequency));
      paintRange(rangeEl);
    }
    updateLabels();
    if (oscillator && audioCtx) {
      oscillator.frequency.setTargetAtTime(frequency, audioCtx.currentTime, 0.015);
    }
  }

  function setWaveType(type) {
    waveType = type;
    for (const btn of waveBtns) {
      const on = btn.dataset.type === type;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (oscillator) oscillator.type = type;
    updateLabels();
  }

  function setVolume() {
    if (gainNode && audioCtx) {
      gainNode.gain.setTargetAtTime(volumeLevel(), audioCtx.currentTime, 0.02);
    }
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

    oscillator = ctx.createOscillator();
    gainNode = ctx.createGain();
    oscillator.type = waveType;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    const level = Math.max(volumeLevel(), 0.0002);
    gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(level, ctx.currentTime + 0.03);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();

    playing = true;
    toggleBtn.textContent = 'Stop';
    overlay.classList.add('wave-on');
  }

  function stopSound(immediate) {
    const osc = oscillator;
    const gain = gainNode;
    const ctx = audioCtx;
    oscillator = null;
    gainNode = null;
    playing = false;
    toggleBtn.textContent = 'Play';
    overlay.classList.remove('wave-on');
    if (!osc || !gain || !ctx) return;

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

  function openPanel() {
    overlay.classList.remove('hidden');
    document.body.classList.add('wave-open');
    setWaveType(waveType);
    rangeEl.value = String(frequencyToSlider(frequency));
    updateLabels();
    paintRange(rangeEl);
    paintRange(volumeEl);
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

  if (openBtn) openBtn.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  toggleBtn.addEventListener('click', toggleSound);

  rangeEl.addEventListener('input', function () {
    setFrequency(sliderToFrequency(rangeEl.value), false);
    paintRange(rangeEl);
  });

  volumeEl.addEventListener('input', function () {
    setVolume();
    updateLabels();
    paintRange(volumeEl);
  });

  for (const btn of waveBtns) {
    btn.addEventListener('click', function () {
      setWaveType(btn.dataset.type);
    });
  }

  downBtn.addEventListener('click', function () {
    setFrequency(frequency / SEMITONE, true);
  });

  upBtn.addEventListener('click', function () {
    setFrequency(frequency * SEMITONE, true);
  });

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
  rangeEl.value = String(frequencyToSlider(frequency));
  updateLabels();
  paintRange(rangeEl);
  paintRange(volumeEl);
})();
