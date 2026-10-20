/*!
 * motion-captcha widget
 *
 *   <form method="post" action="/login">
 *     ...
 *     <div class="motion-captcha" data-sitekey="mc_pk_..."></div>
 *     <button>Sign in</button>
 *   </form>
 *   <script src="https://YOUR-API/v1/widget.js" async defer></script>
 *
 * The widget adds two hidden fields to the surrounding form: `mc_token` and
 * `mc_answer`. Your server sends both to POST /v1/verify with your secret key.
 *
 * Optional attributes: data-callback="fnName" (called with {token, answer} when the
 * user has typed an answer), data-expired-callback="fnName", data-theme="dark".
 *
 * JS API: motionCaptcha.render(el, {siteKey}), .getResponse(el), .reset(el)
 */
(function () {
  'use strict';

  var script = document.currentScript || (function () {
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) if (/widget\.js/.test(all[i].src)) return all[i];
    return null;
  })();
  var API = script ? script.src.replace(/\/v1\/widget\.js.*$/, '') : '';

  /* ------------------------------------------------------------------
   * Behaviour collector. Units: time in milliseconds, distance in CSS
   * pixels, velocity in px/ms, acceleration in px/ms^2.
   * These definitions must match the collector used to build the
   * training data for the risk model.
   * ---------------------------------------------------------------- */
  var clicks = [];
  var keyDown = {};
  var keyPressTimes = [];
  var holds = [];
  var mouse = { last: null, lastV: null, samples: 0, distance: 0, velocities: [], accels: [], maxV: 0, dirChanges: 0, lastSx: 0, lastSy: 0 };

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function mean(a) { if (!a.length) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function variance(a) { if (a.length < 2) return 0; var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return s / a.length; }
  function intervals(times) { var out = []; for (var i = 1; i < times.length; i++) out.push(times[i] - times[i - 1]); return out; }
  function sign(n) { return n > 0 ? 1 : n < 0 ? -1 : 0; }

  function onMove(e) {
    var t = now();
    mouse.samples++;
    if (mouse.last) {
      var dx = e.clientX - mouse.last.x, dy = e.clientY - mouse.last.y, dt = t - mouse.last.t;
      var dist = Math.sqrt(dx * dx + dy * dy);
      mouse.distance += dist;
      if (dt > 0) {
        var v = dist / dt;
        mouse.velocities.push(v);
        if (v > mouse.maxV) mouse.maxV = v;
        if (mouse.lastV !== null) mouse.accels.push(Math.abs(v - mouse.lastV) / dt);
        mouse.lastV = v;
      }
      var sx = sign(dx), sy = sign(dy);
      if ((sx && mouse.lastSx && sx !== mouse.lastSx) || (sy && mouse.lastSy && sy !== mouse.lastSy)) mouse.dirChanges++;
      if (sx) mouse.lastSx = sx;
      if (sy) mouse.lastSy = sy;
    }
    mouse.last = { x: e.clientX, y: e.clientY, t: t };
  }

  document.addEventListener('pointermove', onMove, { passive: true, capture: true });
  document.addEventListener('pointerdown', function () { clicks.push(now()); }, { passive: true, capture: true });
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var t = now();
    keyDown[e.code || e.key] = t;
    keyPressTimes.push(t);
  }, { capture: true });
  document.addEventListener('keyup', function (e) {
    var k = e.code || e.key;
    if (keyDown[k] !== undefined) { holds.push(now() - keyDown[k]); delete keyDown[k]; }
  }, { capture: true });

  function collectMetrics() {
    var ci = intervals(clicks), ki = intervals(keyPressTimes);
    return {
      clicks: { averageInterval: mean(ci), intervalVariance: variance(ci), totalClicks: clicks.length },
      keyboard: {
        averageHoldDuration: mean(holds), averageInterval: mean(ki),
        holdDurationVariance: variance(holds), intervalVariance: variance(ki), totalKeyPresses: keyPressTimes.length
      },
      mouse: {
        averageAcceleration: mean(mouse.accels), averageVelocity: mean(mouse.velocities),
        directionChanges: mouse.dirChanges, maxVelocity: mouse.maxV,
        totalDistance: mouse.distance, totalSamples: mouse.samples
      }
    };
  }

  /* ------------------------------------------------------------------ UI */
  var CSS = [
    ':host{all:initial;display:inline-block;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#16181d}',
    '.box{width:280px;box-sizing:border-box;border:1px solid #d9d4c7;border-radius:12px;background:#fff;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.05)}',
    '.dark .box{background:#16191d;border-color:#323741;color:#eceef1}',
    '.start{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;padding:0;cursor:pointer;font:inherit;color:inherit;text-align:left}',
    '.tick{width:24px;height:24px;border:2px solid #b9b3a5;border-radius:6px;flex:none;display:grid;place-items:center}',
    '.start:hover .tick{border-color:#0d7a5f}',
    '.label{font-size:14px;font-weight:600}',
    '.img{display:block;width:250px;height:100px;border-radius:8px;background:#eee;margin:0 auto}',
    '.row{display:flex;gap:6px;margin-top:10px}',
    'input{flex:1;min-width:0;height:36px;border:1px solid #d9d4c7;border-radius:8px;padding:0 10px;font:inherit;font-size:15px;letter-spacing:.08em;background:transparent;color:inherit}',
    'input:focus{outline:none;border-color:#0d7a5f;box-shadow:0 0 0 3px rgba(13,122,95,.18)}',
    '.icon{width:36px;height:36px;border:1px solid #d9d4c7;border-radius:8px;background:transparent;color:inherit;cursor:pointer;display:grid;place-items:center;flex:none}',
    '.foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px;color:#8b9099}',
    '.brand{font-weight:700;letter-spacing:-.01em}',
    '.msg{font-size:13px;margin-top:8px}.err{color:#c23b22}.ok{color:#0f8a5f}',
    '.spin{width:18px;height:18px;border:2px solid #d9d4c7;border-top-color:#0d7a5f;border-radius:50%;animation:s .8s linear infinite}',
    '@keyframes s{to{transform:rotate(360deg)}}'
  ].join('');

  var REFRESH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';

  function hidden(form, name) {
    if (!form) return null;
    var el = form.querySelector('input[type=hidden][name="' + name + '"]');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.name = name; form.appendChild(el); }
    return el;
  }

  function Widget(host, opts) {
    this.host = host;
    this.siteKey = opts.siteKey;
    this.callback = opts.callback;
    this.expiredCallback = opts.expiredCallback;
    this.root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    this.form = host.closest('form');
    this.tokenField = hidden(this.form, 'mc_token');
    this.answerField = hidden(this.form, 'mc_answer');
    this.token = null;
    this.timer = null;
    this.dark = opts.theme === 'dark';
    this.renderIdle();
  }

  Widget.prototype.shell = function (inner) {
    this.root.innerHTML = '<style>' + CSS + '</style><div class="' + (this.dark ? 'dark' : '') + '"><div class="box">' + inner +
      '<div class="foot"><span>Protected by</span><span class="brand">motion-captcha</span></div></div></div>';
  };

  Widget.prototype.renderIdle = function (message, isError) {
    var self = this;
    this.setResponse(null, '');
    this.shell('<button type="button" class="start"><span class="tick"></span><span class="label">Verify you\'re human</span></button>' +
      (message ? '<div class="msg ' + (isError ? 'err' : '') + '">' + message + '</div>' : ''));
    this.root.querySelector('.start').addEventListener('click', function () { self.start(); });
  };

  Widget.prototype.start = function () {
    var self = this;
    this.shell('<div style="display:flex;align-items:center;gap:10px"><span class="spin"></span><span class="label">Checking…</span></div>');
    fetch(API + '/v1/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Site-Key': this.siteKey },
      body: JSON.stringify(collectMetrics())
    }).then(function (res) {
      return res.json().then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (r) {
      if (!r.ok) throw new Error((r.body && r.body.error && r.body.error.message) || 'Verification unavailable.');
      self.token = r.body.token;
      self.renderChallenge(r.body.challenge_url, r.body.expires_in);
    }).catch(function (err) {
      self.renderIdle(err.message || 'Verification unavailable. Please try again.', true);
    });
  };

  Widget.prototype.renderChallenge = function (url, expiresIn) {
    var self = this, refreshes = 0;
    this.shell(
      '<img class="img" alt="Type the characters you see in the moving image" src="' + url + '">' +
      '<div class="row"><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="12" aria-label="Characters in the image" placeholder="Type the characters">' +
      '<button type="button" class="icon" title="New image" aria-label="New image">' + REFRESH_SVG + '</button></div>'
    );
    var input = this.root.querySelector('input'), img = this.root.querySelector('img');
    input.addEventListener('input', function () {
      self.setResponse(self.token, input.value.trim());
      if (input.value.trim() && typeof self.callback === 'function') self.callback({ token: self.token, answer: input.value.trim() });
    });
    img.addEventListener('error', function () { self.renderIdle('This challenge can no longer be loaded. Start again.', true); });
    this.root.querySelector('.icon').addEventListener('click', function () {
      refreshes++;
      img.src = url + '?r=' + refreshes;
      input.value = '';
      self.setResponse(self.token, '');
      input.focus();
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(function () {
      self.renderIdle('The challenge expired. Please start again.', true);
      if (typeof self.expiredCallback === 'function') self.expiredCallback();
    }, expiresIn * 1000);
    setTimeout(function () { input.focus(); }, 50);
  };

  Widget.prototype.setResponse = function (token, answer) {
    if (this.tokenField) this.tokenField.value = token || '';
    if (this.answerField) this.answerField.value = answer || '';
    this.response = token ? { token: token, answer: answer } : null;
  };

  Widget.prototype.reset = function () {
    clearTimeout(this.timer);
    this.token = null;
    this.renderIdle();
  };

  /* ------------------------------------------------------------------ bootstrap */
  var widgets = [];

  function resolve(name) { return name && typeof window[name] === 'function' ? window[name] : null; }

  function render(el, opts) {
    if (el.__motionCaptcha) return el.__motionCaptcha;
    opts = opts || {};
    var w = new Widget(el, {
      siteKey: opts.siteKey || el.getAttribute('data-sitekey'),
      callback: opts.callback || resolve(el.getAttribute('data-callback')),
      expiredCallback: opts.expiredCallback || resolve(el.getAttribute('data-expired-callback')),
      theme: opts.theme || el.getAttribute('data-theme')
    });
    el.__motionCaptcha = w;
    widgets.push(w);
    return w;
  }

  function find(el) { return el ? el.__motionCaptcha : widgets[0]; }

  function autoRender() {
    var els = document.querySelectorAll('.motion-captcha[data-sitekey]');
    for (var i = 0; i < els.length; i++) render(els[i]);
  }

  window.motionCaptcha = {
    render: render,
    getResponse: function (el) { var w = find(el); return w ? w.response : null; },
    reset: function (el) { var w = find(el); if (w) w.reset(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoRender);
  else autoRender();
})();
