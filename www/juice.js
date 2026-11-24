/* ============================================================
   JuiceKit v2 — 合集统一「手感与质感内核」
   提供：Web Audio 合成音效 / 震动 / 屏震 / 粒子 / 飘字 /
        连击倍率 / 本地存档 / 静音与返回大厅按钮 / 防误触兜底
   用法：Juice.init({game:'blockblast'})  然后再调用 API
   ============================================================ */
(function () {
  'use strict';
  if (window.Juice) return;

  var LS_MUTE = 'gb:mute:v2';
  var LS_HAPTIC = 'gb:haptic:v2';
  var GAMES = {
    blockblast: { name: '方块消除', color: '#8b7bff' },
    watermelon: { name: '合成大西瓜', color: '#38d39f' },
    dots:       { name: '点点相连', color: '#2fb8ff' },
    snake:      { name: '贪食蛇大作战', color: '#7ee36a' },
    fruit:      { name: '水果忍者', color: '#ff6b81' },
    brick:      { name: '物理弹球', color: '#ffb03a' }
  };

  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    json: function (k, d) {
      try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; }
    }
  };

  /* ---------------- 音效引擎 ---------------- */
  var AC = window.AudioContext || window.webkitAudioContext;
  var actx = null, master = null;

  function audio() {
    if (!AC) return null;
    if (!actx) {
      try {
        actx = new AC();
        master = actx.createGain();
        master.gain.value = 0.5;
        master.connect(actx.destination);
      } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
    return actx;
  }

  // 单个乐音：type 波形，f0→f1 滑音，dur 秒，vol 音量
  function tone(f0, f1, dur, type, vol, delay, filt) {
    var ac = audio(); if (!ac || J.muted) return;
    var t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol == null ? 0.22 : vol), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    var node = o;
    if (filt) {
      var bp = ac.createBiquadFilter();
      bp.type = filt.type || 'lowpass';
      bp.frequency.value = filt.freq || 2400;
      bp.Q.value = filt.q || 1;
      o.connect(bp); node = bp;
    }
    node.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  // 噪声（破风/爆炸）
  function noise(dur, vol, type, freq, delay) {
    var ac = audio(); if (!ac || J.muted) return;
    var t0 = ac.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(ac.sampleRate * dur));
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    var src = ac.createBufferSource(); src.buffer = buf;
    var bq = ac.createBiquadFilter();
    bq.type = type || 'bandpass';
    bq.frequency.setValueAtTime(freq || 1200, t0);
    bq.frequency.exponentialRampToValueAtTime(Math.max(120, (freq || 1200) * 0.35), t0 + dur);
    bq.Q.value = 1.1;
    var g = ac.createGain();
    g.gain.setValueAtTime(vol == null ? 0.22 : vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bq); bq.connect(g); g.connect(master);
    src.start(t0);
  }

  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

  var sfx = {
    click: function () { tone(880, 1180, 0.07, 'triangle', 0.16); tone(1760, 2100, 0.05, 'sine', 0.06, 0.02); },
    tap: function () { tone(520, 380, 0.09, 'sine', 0.16); },
    pop: function () { tone(rnd(500, 620), rnd(760, 900), 0.09, 'sine', 0.19); },
    place: function () { tone(240, 150, 0.11, 'triangle', 0.2); noise(0.05, 0.1, 'lowpass', 600); },
    swipe: function () { noise(0.18, 0.2, 'bandpass', 2600); tone(1200, 300, 0.16, 'sawtooth', 0.06); },
    slice: function () { noise(0.14, 0.24, 'highpass', 3200); tone(1600, 700, 0.1, 'triangle', 0.1); },
    hit: function () { tone(180, 90, 0.1, 'square', 0.12); noise(0.06, 0.14, 'lowpass', 900); },
    clear: function (step) {
      var i = Math.min(PENTA.length - 1, step | 0);
      tone(PENTA[i], PENTA[i] * 1.01, 0.22, 'sine', 0.2);
      tone(PENTA[i] * 2, PENTA[i] * 2, 0.12, 'triangle', 0.07, 0.01);
    },
    combo: function (n) {
      var base = PENTA[Math.min(PENTA.length - 1, 2 + (n | 0))];
      tone(base, base * 1.5, 0.16, 'triangle', 0.18);
      tone(base * 2, base * 2.5, 0.12, 'sine', 0.09, 0.05);
    },
    up: function () { // 合成/升级
      [0, 0.06, 0.12, 0.2].forEach(function (d, i) {
        tone(PENTA[3 + i] * (1 + i * 0.01), PENTA[4 + i], 0.16, i === 3 ? 'triangle' : 'sine', 0.17, d);
      });
    },
    coin: function () { tone(1320, 1320, 0.07, 'square', 0.09); tone(1980, 1980, 0.09, 'square', 0.07, 0.06); },
    prop: function () { tone(300, 900, 0.18, 'sawtooth', 0.14); tone(1200, 1800, 0.12, 'sine', 0.09, 0.1); },
    over: function () {
      [523.25, 440, 349.23, 261.63].forEach(function (f, i) {
        tone(f, f * 0.98, 0.34, 'triangle', 0.2, i * 0.14);
        tone(f / 2, f / 2, 0.3, 'sine', 0.1, i * 0.14);
      });
    },
    win: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, f, 0.22, 'triangle', 0.18, i * 0.09); });
      tone(1568, 2093, 0.4, 'sine', 0.14, 0.36);
    },
    tick: function () { tone(1400, 1400, 0.03, 'square', 0.06); }
  };

  /* ---------------- 震动 ---------------- */
  function vibrate(p) {
    if (!J.haptic) return;
    try {
      if (window.AndroidBox && AndroidBox.vibrate) {
        AndroidBox.vibrate(Array.isArray(p) ? (p[0] || 16) : p);
        return;
      }
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}
  }

  /* ---------------- 屏幕震动 ---------------- */
  function shake(target, power, dur) {
    power = power == null ? 7 : power;
    dur = dur == null ? 260 : dur;
    var el = target;
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) el = document.querySelector('canvas') || document.querySelector('#app') ||
                  document.querySelector('.wrap') || document.body.firstElementChild || document.body;
    if (!el) return;
    if (el.__shakeT) cancelAnimationFrame(el.__shakeT);
    if (!el.__shakeBase) el.__shakeBase = el.style.transform || '';
    var t0 = performance.now();
    (function step() {
      var p = (performance.now() - t0) / dur;
      if (p >= 1) {
        el.style.transform = el.__shakeBase;
        el.__shakeT = null;
        return;
      }
      var k = power * (1 - p) * (1 - p);
      el.style.transform = el.__shakeBase + ' translate3d(' +
        (Math.random() * 2 - 1) * k + 'px,' + (Math.random() * 2 - 1) * k + 'px,0)';
      el.__shakeT = requestAnimationFrame(step);
    })();
  }

  /* ---------------- 飘字 ---------------- */
  var floatLayer = null;
  function ensureFloatLayer() {
    if (floatLayer && floatLayer.isConnected) return floatLayer;
    floatLayer = document.createElement('div');
    floatLayer.id = 'juiceFloatLayer';
    floatLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482000;overflow:hidden;';
    document.body.appendChild(floatLayer);
    return floatLayer;
  }

  function float(text, x, y, opt) {
    opt = opt || {};
    var layer = ensureFloatLayer();
    var el = document.createElement('div');
    var color = opt.color || '#fff';
    var size = opt.size || 22;
    el.textContent = text;
    el.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;transform:translate(-50%,-50%);' +
      'font:800 ' + size + 'px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'color:' + color + ';letter-spacing:-.5px;white-space:nowrap;' +
      'text-shadow:0 2px 0 rgba(0,0,0,.28),0 0 18px ' + (opt.glow || 'rgba(255,255,255,.45)') + ';' +
      'will-change:transform,opacity;';
    layer.appendChild(el);
    var life = opt.life || 850;
    var dy = opt.dy == null ? -64 : opt.dy;
    var scale = opt.scale || 1.18;
    var anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0, offset: 0 },
      { transform: 'translate(-50%,-50%) scale(' + scale + ')', opacity: 1, offset: 0.28 },
      { transform: 'translate(-50%,calc(-50% + ' + (dy * 0.55) + 'px)) scale(1)', opacity: 1, offset: 0.62 },
      { transform: 'translate(-50%,calc(-50% + ' + dy + 'px)) scale(.92)', opacity: 0, offset: 1 }
    ], { duration: life, easing: 'cubic-bezier(.22,.9,.25,1)' });
    anim.onfinish = anim.oncancel = function () { el.remove(); };
    return el;
  }

  /* ---------------- 粒子 ---------------- */
  var pcv = null, pctx = null, parts = [], praf = null, dpr = 1;

  function ensureParticles() {
    if (pcv && pcv.isConnected) return;
    pcv = document.createElement('canvas');
    pcv.id = 'juiceParticles';
    pcv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147481900;';
    document.body.appendChild(pcv);
    pctx = pcv.getContext('2d');
    resizeParticles();
    window.addEventListener('resize', resizeParticles, { passive: true });
  }

  function resizeParticles() {
    if (!pcv) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    pcv.width = Math.floor(window.innerWidth * dpr);
    pcv.height = Math.floor(window.innerHeight * dpr);
  }

  function burst(x, y, opt) {
    opt = opt || {};
    ensureParticles();
    var n = opt.count || 14;
    var colors = opt.colors || ['#ffd76e', '#ff7b7b', '#7bdcff', '#b48bff', '#7bffb2'];
    var speed = opt.speed || 260;
    var life = opt.life || 640;
    var size = opt.size || 4;
    var grav = opt.gravity == null ? 900 : opt.gravity;
    for (var i = 0; i < n; i++) {
      var a = opt.angle != null ? opt.angle + rnd(-0.6, 0.6) : rnd(0, Math.PI * 2);
      var v = speed * rnd(0.35, 1);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opt.lift || 0),
        r: size * rnd(0.6, 1.5),
        c: pick(colors),
        life: life * rnd(0.65, 1.15), t: 0, grav: grav,
        shape: opt.shape || 'auto',
        spin: rnd(-8, 8), rot: rnd(0, 6.28)
      });
    }
    if (parts.length > 700) parts.splice(0, parts.length - 700);
    startParticles();
  }

  function startParticles() {
    if (praf) return;
    var last = performance.now();
    (function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.clearRect(0, 0, pcv.width / dpr, pcv.height / dpr);
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.t += dt * 1000;
        if (p.t >= p.life) { parts.splice(i, 1); continue; }
        p.vy += p.grav * dt;
        p.vx *= 0.992;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        var k = 1 - p.t / p.life;
        pctx.globalAlpha = Math.max(0, k);
        pctx.fillStyle = p.c;
        if (p.shape === 'square') {
          pctx.save(); pctx.translate(p.x, p.y); pctx.rotate(p.rot);
          pctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2); pctx.restore();
        } else {
          pctx.beginPath(); pctx.arc(p.x, p.y, p.r * (0.4 + k * 0.8), 0, 6.2832); pctx.fill();
        }
      }
      pctx.globalAlpha = 1;
      if (parts.length) praf = requestAnimationFrame(loop);
      else { praf = null; pctx.clearRect(0, 0, pcv.width, pcv.height); }
    })(last);
  }

  /* ---------------- 连击 ---------------- */
  var comboState = { n: 0, last: 0 };
  var comboEl = null, comboHideT = null;

  function ensureComboEl() {
    if (comboEl && comboEl.isConnected) return comboEl;
    comboEl = document.createElement('div');
    comboEl.id = 'juiceCombo';
    comboEl.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 84px);' +
      'transform:translate(-50%,-14px) scale(.7);opacity:0;pointer-events:none;z-index:2147482100;' +
      'font:900 26px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'letter-spacing:-1px;color:#fff;padding:9px 20px;border-radius:999px;white-space:nowrap;' +
      'background:linear-gradient(135deg,rgba(255,196,84,.95),rgba(255,94,120,.95));' +
      'box-shadow:0 10px 28px -8px rgba(255,92,120,.8),inset 0 1px 0 rgba(255,255,255,.6);' +
      'transition:opacity .2s,transform .26s cubic-bezier(.2,1.4,.35,1);text-shadow:0 1px 0 rgba(0,0,0,.2);';
    document.body.appendChild(comboEl);
    return comboEl;
  }

  function comboHit() {
    var now = performance.now();
    if (now - comboState.last > 2400) comboState.n = 0;
    comboState.n++;
    comboState.last = now;
    var n = comboState.n;
    if (n >= 2) {
      var el = ensureComboEl();
      el.textContent = 'COMBO ×' + Math.min(9, n);
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%,0px) scale(1)';
      el.animate([{ transform: 'translate(-50%,0px) scale(.7)' }, { transform: 'translate(-50%,0px) scale(1.12)' },
                  { transform: 'translate(-50%,0px) scale(1)' }], { duration: 260, easing: 'ease-out' });
      clearTimeout(comboHideT);
      comboHideT = setTimeout(function () {
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%,-14px) scale(.85)';
      }, 1100);
      sfx.combo(n);
      vibrate(n >= 5 ? [16, 30, 22] : 14);
    }
    return multiplier();
  }

  function multiplier() {
    if (performance.now() - comboState.last > 2400) return 1;
    var n = comboState.n;
    if (n < 2) return 1;
    return Math.min(5, 1 + Math.floor((n - 1) / 2));
  }

  function resetCombo() {
    comboState.n = 0;
    comboState.last = 0;
    if (comboEl) { comboEl.style.opacity = '0'; }
  }

  /* ---------------- 存档 ---------------- */
  function statKey(g) { return 'gb:stat:' + g; }

  function getStat(game) {
    var s = store.json(statKey(game), null) || {};
    return {
      best: +s.best || 0,
      plays: +s.plays || 0,
      last: +s.last || 0,
      totalScore: +s.totalScore || 0
    };
  }

  function setStat(game, patch) {
    var s = getStat(game);
    for (var k in patch) if (patch.hasOwnProperty(k)) s[k] = patch[k];
    s.last = Date.now();
    store.set(statKey(game), JSON.stringify(s));
    updateHallCache(game, s);
    return s;
  }

  function updateHallCache(game, s) {
    var map = store.json('gb:best:v2', {}) || {};
    map[game] = { best: s.best, plays: s.plays, last: s.last };
    store.set('gb:best:v2', JSON.stringify(map));
  }

  function setBest(game, score) {
    var s = getStat(game);
    var isNew = score > s.best;
    if (isNew) setStat(game, { best: score });
    else setStat(game, {});
    return isNew;
  }

  function addPlay(game) {
    var s = getStat(game);
    s.plays = s.plays + 1;
    return setStat(game, { plays: s.plays });
  }

  /* ---------------- 按钮 UI ---------------- */
  function el(html, css) {
    var d = document.createElement('div');
    d.innerHTML = html;
    var n = d.firstElementChild;
    n.style.cssText = css;
    return n;
  }

  var ICON_BACK = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var ICON_SOUND_ON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M18.5 5.5a9 9 0 010 13"/></svg>';
  var ICON_SOUND_OFF = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';

  var btnCss = 'position:fixed;z-index:2147483000;top:calc(env(safe-area-inset-top,0px) + 10px);' +
    'width:38px;height:38px;border-radius:13px;display:flex;align-items:center;justify-content:center;' +
    'border:1px solid rgba(255,255,255,.16);background:rgba(20,20,30,.45);color:#fff;' +
    '-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);' +
    'box-shadow:0 6px 18px -6px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.16);' +
    '-webkit-tap-highlight-color:transparent;cursor:pointer;user-select:none;' +
    'transition:transform .16s cubic-bezier(.2,1.4,.4,1),background .2s;';

  function initButtons(opts) {
    var oldMute = document.querySelectorAll('#juiceMute,[data-juice-mute]');
    for (var i = 0; i < oldMute.length; i++) oldMute[i].remove();

    var back = el('<a id="juiceBack" href="index.html" aria-label="返回大厅">' + ICON_BACK +
      '<span style="font-size:11px;font-weight:700;margin-left:1px">返回</span></a>',
      btnCss + 'left:calc(env(safe-area-inset-left,0px) + 10px);width:auto;padding:0 11px 0 8px;gap:2px;' +
      'text-decoration:none;font:700 11.5px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;');
    back.style.width = 'auto';
    document.body.appendChild(back);

    var mute = el('<button id="juiceMute" aria-label="静音切换">' + (J.muted ? ICON_SOUND_OFF : ICON_SOUND_ON) + '</button>',
      btnCss + 'right:calc(env(safe-area-inset-right,0px) + 10px);padding:0;');
    document.body.appendChild(mute);

    function press(node) {
      node.addEventListener('pointerdown', function () { node.style.transform = 'scale(.9)'; }, { passive: true });
      node.addEventListener('pointerup', function () { node.style.transform = ''; }, { passive: true });
      node.addEventListener('pointercancel', function () { node.style.transform = ''; }, { passive: true });
      node.addEventListener('pointerleave', function () { node.style.transform = ''; }, { passive: true });
    }
    press(back); press(mute);

    mute.addEventListener('click', function (e) {
      e.preventDefault();
      J.toggleMute();
      mute.innerHTML = J.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
      if (!J.muted) { sfx.click(); vibrate(8); }
      mute.animate([{ transform: 'scale(.82)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
        { duration: 240, easing: 'ease-out' });
    });

    back.addEventListener('click', function () {
      try { sfx.click(); } catch (e) {}
      if (window.Juice && Juice.saveOnExit) Juice.saveOnExit();
    });
  }

  /* ---------------- 防误触 + 基础样式 ---------------- */
  function injectCss() {
    var css = ''
      + 'html,body{overscroll-behavior:none;-webkit-overflow-scrolling:touch;}'
      + 'body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;'
      + '-webkit-tap-highlight-color:transparent;}'
      + 'button,a,.btn,[role="button"]{touch-action:manipulation;}'
      + '::selection{background:transparent;}'
      + '#juiceMute svg,#juiceBack svg{display:block;}'
      + '@media (prefers-reduced-motion:reduce){#juiceCombo{transition:none!important;}}';
    var s = document.createElement('style');
    s.id = 'juice-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---------------- 全局点击音 ---------------- */
  function globalTapSound() {
    document.addEventListener('pointerdown', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var hit = t.closest('button,a,[role="button"],.btn,.card,.tag,[data-juice-tap]');
      if (hit) { try { sfx.tap(); } catch (err) {} }
    }, { passive: true, capture: true });
  }

  /* ---------------- 主体 ---------------- */
  var J = {
    game: 'generic',
    version: '2.0',
    get muted() { return store.get(LS_MUTE, '0') === '1'; },
    get haptic() { return store.get(LS_HAPTIC, '1') === '1'; },
    toggleMute: function () {
      store.set(LS_MUTE, this.muted ? '0' : '1');
      return this.muted;
    },
    toggleHaptic: function () { store.set(LS_HAPTIC, this.haptic ? '0' : '1'); return this.haptic; },
    sfx: sfx,
    tone: tone,
    noise: noise,
    vibrate: vibrate,
    shake: shake,
    float: float,
    burst: burst,
    removeParticles: function () { parts.length = 0; },
    combo: comboHit,
    resetCombo: resetCombo,
    multiplier: multiplier,
    get comboCount() { return performance.now() - comboState.last > 2400 ? 0 : comboState.n; },
    getStat: getStat,
    setStat: setStat,
    setBest: setBest,
    addPlay: addPlay,
    store: store,
    games: GAMES,
    init: function (opts) {
      opts = opts || {};
      this.game = opts.game || 'generic';
      this.saveOnExit = opts.saveOnExit || null;
      injectCss();
      if (!document.body) {
        document.addEventListener('DOMContentLoaded', function () { J.init(opts); });
        return this;
      }
      if (opts.buttons !== false) initButtons(opts);
      if (opts.tapSound !== false) globalTapSound();
      // 首屏播放次数 +1（每次启动一次，避免刷新重复计太多）
      try {
        var k = 'gb:session:' + this.game;
        if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); addPlay(this.game); }
      } catch (e) {}
      return this;
    }
  };

  window.Juice = J;
})();
