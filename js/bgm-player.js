// Site-owned player. Keep the original preference and per-tab bookmark keys.
(() => {
  'use strict';
  if (document.querySelector('.fp-player')) return;
  const source = '/audio/storyteller.mp3';
  const volume = 0.5;
  function read(store, key) {
    try { return window[store].getItem(key); } catch { return null; }
  }
  function write(store, key, value) {
    try { window[store].setItem(key, value); } catch { /* private browsing */ }
  }
  const enabled = () => read('localStorage', 'flatpaper-bgm') !== 'off';
  const player = document.createElement('section');
  player.className = 'fp-player';
  player.setAttribute('aria-label', '背景音乐');
  player.innerHTML = `<button type="button" class="fp-play" title="播放背景音乐" aria-label="播放背景音乐">
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path class="play" d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/><g class="pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></g></svg></button>
    <div class="fp-track"><span><b>Storyteller</b><small></small></span>
    <input type="range" min="0" max="1" step="0.1" value="0" disabled aria-label="背景音乐播放进度"></div>`;
  document.body.append(player);
  const button = player.querySelector('button');
  const slider = player.querySelector('input');
  const clock = player.querySelector('small');
  const audio = new Audio();
  audio.preload = 'none';
  audio.loop = true;
  let wanted = enabled();
  let restored = false, seeking = false, waiting = false, fade = 0;
  let bookmark = Number(read('sessionStorage', 'flatpaper-bgm-pos')) || 0;
  const valid = () => Number.isFinite(audio.duration) && audio.duration > 0;
  const fmt = n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  function display(t) {
    const text = `${fmt(t)} / ${valid() ? fmt(audio.duration) : '--:--'}`;
    if (clock.textContent !== text) {
      clock.textContent = text;
      slider.setAttribute('aria-valuetext', text);
    }
  }
  function draw() {
    if (document.hidden || seeking) return;
    if (valid()) slider.value = audio.currentTime;
    display(restored ? audio.currentTime : bookmark);
  }
  function save() {
    if (!restored || !valid()) return;
    bookmark = audio.currentTime;
    write('sessionStorage', 'flatpaper-bgm-pos', String(bookmark));
  }
  function restore() {
    if (!valid()) return;
    if (!restored) {
      const position = bookmark >= 0 && bookmark < audio.duration ? bookmark : 0;
      if (audio.currentTime !== position) audio.currentTime = position;
    }
    restored = true;
    slider.max = audio.duration;
    slider.disabled = false;
    draw();
  }
  function playing(on) {
    player.classList.toggle('is-playing', on);
    button.title = on ? '暂停背景音乐' : '播放背景音乐';
    button.setAttribute('aria-label', button.title);
  }
  function start() {
    if (!wanted) return;
    waiting = false;
    if (!audio.src) audio.src = source;
    audio.volume = 0;
    audio.play().catch(err => {
      if (err.name === 'NotAllowedError' && wanted) waiting = true;
    });
  }
  // Do not let the initial unlock gesture race a click on the player's own controls.
  function unlock(e) {
    if (waiting && wanted && !player.contains(e.target)) start();
  }
  document.addEventListener('click', unlock);
  document.addEventListener('keydown', unlock);
  button.addEventListener('click', () => {
    wanted = audio.paused;
    write('localStorage', 'flatpaper-bgm', wanted ? 'on' : 'off');
    if (wanted) start();
    else { waiting = false; audio.pause(); save(); }
  });
  slider.addEventListener('input', () => { seeking = true; display(+slider.value); });
  slider.addEventListener('change', () => {
    seeking = false;
    if (valid()) { audio.currentTime = +slider.value; save(); }
    draw();
  });
  slider.addEventListener('pointercancel', () => { seeking = false; draw(); });
  audio.addEventListener('loadedmetadata', restore);
  audio.addEventListener('durationchange', restore);
  audio.addEventListener('timeupdate', draw);
  audio.addEventListener('playing', () => {
    playing(true);
    cancelAnimationFrame(fade);
    const from = audio.volume, began = performance.now();
    function ramp(now) {
      const fraction = document.hidden ? 1 : Math.min(1, Math.max(0, (now - began) / 200));
      audio.volume = from + (volume - from) * fraction;
      if (fraction < 1) fade = requestAnimationFrame(ramp);
    }
    ramp(began);
  });
  audio.addEventListener('pause', () => { cancelAnimationFrame(fade); playing(false); });
  audio.addEventListener('error', () => { player.hidden = true; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(fade); audio.volume = volume; save(); }
    else draw();
  });
  window.addEventListener('pagehide', () => { save(); audio.pause(); });
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    bookmark = Number(read('sessionStorage', 'flatpaper-bgm-pos')) || 0;
    restored = false;
    restore();
    wanted = enabled();
    if (wanted) start();
  });
  draw();
  if (wanted) start();
})();
