/* ============================================================
   flatpaper 背景音乐（BGM）—— 单曲、一个图标、播放/关闭
   ------------------------------------------------------------
   要改的只有下面 CFG 这几项：
     audio  音频地址。把文件放到 source/audio/bgm.mp3（对应 /audio/bgm.mp3），
            也可以直接写一个完整的 http(s) 直链
     volume 音量 0~1
     loop   是否循环播放
   ------------------------------------------------------------
   行为约定：
   1. 默认「开启」：进入页面就尝试播放。
   2. 浏览器拦截有声自动播放时（Chrome/Safari 的常规策略），不会报错给用户，
      而是在页面上的**第一次点击/按键/touch** 后自动接上——不需要再去点图标。
   3. 点图标 = 开/关。选择记在 localStorage，翻页后保持；关了就不会再自动播。
   4. 记住播放进度（sessionStorage），站内跳转后接着上次的位置继续。
   5. 图标状态反映**真实播放状态**：没播起来就显示"音符"、正在播显示"声波"并带一圈呼吸光。
   ============================================================ */
(function () {
  'use strict';

  var CFG = {
    audio: '/audio/TYW.mp3',
    volume: 0.5,
    loop: true,
    keyOn: 'flatpaper-bgm',
    keyPos: 'flatpaper-bgm-pos'
  };

  if (window.__fpBgmBooted) return;
  window.__fpBgmBooted = true;

  // lucide: audio-lines（正在播放）
  var ICON_PLAYING = '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/>' +
    '<path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>';
  // lucide: music（未播放）
  var ICON_IDLE = '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fp-bgm';
  btn.setAttribute('aria-label', '播放背景音乐');
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('title', '背景音乐');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_IDLE + '</svg>';
  document.body.appendChild(btn);

  var audio = new Audio();
  audio.preload = 'none';          // 先不下文件，等真要播再取
  audio.loop = CFG.loop;
  audio.volume = CFG.volume;

  var posRestored = false;
  var gestureBound = false;
  var lastSave = 0;

  function readOn() {
    try { return localStorage.getItem(CFG.keyOn) !== 'off'; } catch (e) { return true; }
  }
  function writeOn(on) {
    try { localStorage.setItem(CFG.keyOn, on ? 'on' : 'off'); } catch (e) { /* 隐私模式 */ }
  }
  function paint(playing) {
    btn.classList.toggle('is-playing', !!playing);
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    btn.setAttribute('aria-label', playing ? '关闭背景音乐' : '播放背景音乐');
    btn.querySelector('svg').innerHTML = playing ? ICON_PLAYING : ICON_IDLE;
  }
  function savePos() {
    try { sessionStorage.setItem(CFG.keyPos, String(Math.floor(audio.currentTime || 0))); } catch (e) {}
  }
  function restorePos() {
    if (posRestored || !(audio.readyState > 0)) return;
    posRestored = true;
    try {
      var v = parseFloat(sessionStorage.getItem(CFG.keyPos) || '0');
      if (v > 0 && isFinite(v) && v < audio.duration) audio.currentTime = v;
    } catch (e) {}
  }
  // 自动播放被拦时，等用户第一次交互再播（不会再把错误抛给用户）
  function waitFirstGesture() {
    if (gestureBound) return;
    gestureBound = true;
    var types = ['pointerdown', 'keydown', 'touchstart'];
    var once = function () {
      types.forEach(function (t) { window.removeEventListener(t, once, true); });
      gestureBound = false;
      if (readOn()) start();
    };
    types.forEach(function (t) {
      window.addEventListener(t, once, { capture: true, passive: true });
    });
  }
  function start() {
    if (!audio.src) audio.src = CFG.audio;
    var p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function (err) {
        // NotAllowedError = 自动播放被浏览器拦了，等一次交互即可
        if (err && err.name === 'NotAllowedError') waitFirstGesture();
        paint(false);
      });
    }
  }

  audio.addEventListener('loadedmetadata', restorePos);
  audio.addEventListener('playing', function () { paint(true); });
  audio.addEventListener('pause', function () { paint(false); });
  audio.addEventListener('error', function () {
    paint(false);
    // 音频还没上传/路径不对时，直接收起按钮，不给你留一个点不动的死图标
    btn.hidden = true;
    if (window.console && console.warn) {
      console.warn('[flatpaper-bgm] 音频加载失败：' + CFG.audio +
        ' —— 把文件放到 source/audio/bgm.mp3，或改 source/js/bgm-player.js 顶部的 CFG.audio');
    }
  });
  audio.addEventListener('timeupdate', function () {
    var now = Date.now();
    if (now - lastSave > 4000) { lastSave = now; savePos(); }
  });
  window.addEventListener('pagehide', savePos);

  btn.addEventListener('click', function () {
    if (!audio.paused) {
      audio.pause();
      writeOn(false);
      savePos();
      return;
    }
    writeOn(true);
    start();
  });

  function init() {
    var on = readOn();
    if (!on) paint(false);
    // 音频文件还没上传（404）时先把按钮收起来，不留一个点不动的死图标。
    // 用 HEAD 探测：只有明确 404 才隐藏，其它失败（CORS/网络）不动它。
    try {
      fetch(CFG.audio, { method: 'HEAD', cache: 'no-store' })
        .then(function (res) { if (res && res.status === 404) btn.hidden = true; })
        .catch(function () {});
    } catch (e) { /* 老浏览器没有 fetch 时忽略 */ }
    if (on) start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
