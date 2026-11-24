/* Life Hub shared script. Every page loads it: the hub itself and each module (travel/, workout/, ...).
   - Privacy lock: a PIN screen when the app opens or comes back after being away.
   - Home button on module pages, back to the Today screen.
   Data stays in this phone's browser storage. The PIN keeps people out of the app;
   it does not encrypt the data. */
(function () {
  var me = document.currentScript;
  var ROOT = me ? new URL('.', me.src).href : location.href;   // folder that holds hub.js = the hub root
  var LOCK_KEY = 'hub.lock', SEEN_KEY = 'hub.unlockedAt', AWAY_KEY = 'hub.hiddenAt';

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function hash(pin, salt) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)).then(hex); }

  function lockCfg() { return lsGet(LOCK_KEY, null); }
  function needsLock() {
    var c = lockCfg(); if (!c || !c.hash) return false;
    var at = +ssGet(SEEN_KEY) || 0;
    if (!at) return true;
    var away = +ssGet(AWAY_KEY) || 0;
    return away > at && Date.now() - away > (c.after == null ? 60 : c.after) * 1000;
  }

  /* hide the page right away so nothing flashes before the PIN screen */
  var style = document.createElement('style');
  style.textContent =
    'html.hub-locked body>*:not(#hub-lock){visibility:hidden!important}' +
    '#hub-lock{position:fixed;inset:0;z-index:2147483646;background:#0d0f14;color:#eef0f5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}' +
    '#hub-lock h2{margin:0;font-size:20px;font-weight:800;letter-spacing:-.01em}' +
    '#hub-lock .dots{display:flex;gap:14px;height:16px}' +
    '#hub-lock .dots i{width:14px;height:14px;border-radius:50%;border:2px solid #5b6274;display:block}' +
    '#hub-lock .dots i.on{background:#8b7cff;border-color:#8b7cff}' +
    '#hub-lock .dots.bad{animation:hubshake .35s}' +
    '@keyframes hubshake{25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}' +
    '#hub-lock .pad{display:grid;grid-template-columns:repeat(3,72px);gap:14px}' +
    '#hub-lock .pad button{height:72px;border-radius:50%;border:0;background:#1c202b;color:#eef0f5;font:600 26px/1 inherit;font-family:inherit;cursor:pointer}' +
    '#hub-lock .pad button:active{background:#2b3040}' +
    '#hub-lock .pad button.ghost{background:none;font-size:15px;color:#9aa1b2}' +
    '#hub-lock .msg{min-height:18px;font-size:13px;color:#ff8a8a}' +
    '.hub-home{display:inline-flex;align-items:center;justify-content:center;gap:4px;text-decoration:none;font:700 13px/1 Inter,system-ui,sans-serif;border-radius:999px}' +
    '.hub-home svg{width:16px;height:16px}' +
    '.hub-home.fixed{position:fixed;z-index:60;top:calc(14px + env(safe-area-inset-top));right:14px;width:38px;height:38px;background:rgba(30,34,48,.85);color:#eef0f5;border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}' +
    '.hub-home.brand{width:34px;height:34px;margin-right:2px;color:inherit;background:var(--surface-2,rgba(127,127,127,.12));border:1px solid var(--line,rgba(127,127,127,.25))}';
  document.head.appendChild(style);
  if (needsLock()) document.documentElement.classList.add('hub-locked');

  function showLock() {
    var c = lockCfg(); if (!c || !c.hash) { unlock(); return; }
    document.documentElement.classList.add('hub-locked');
    if (document.getElementById('hub-lock')) return;
    var len = c.len || 4, val = '';
    var box = document.createElement('div'); box.id = 'hub-lock'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Enter PIN');
    box.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#8b7cff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' +
      '<h2>Life Hub is locked</h2><div class="dots" aria-hidden="true"></div><div class="msg" aria-live="polite"></div>' +
      '<div class="pad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" data-k="' + n + '">' + n + '</button>'; }).join('') +
      '<button type="button" class="ghost" data-k="forgot">Forgot</button><button type="button" data-k="0">0</button><button type="button" class="ghost" data-k="del" aria-label="Delete">⌫</button></div>';
    var dots = box.querySelector('.dots'), msg = box.querySelector('.msg');
    function draw() { dots.innerHTML = ''; for (var i = 0; i < len; i++) { var d = document.createElement('i'); if (i < val.length) d.className = 'on'; dots.appendChild(d); } }
    function press(k) {
      if (k === 'del') { val = val.slice(0, -1); draw(); return; }
      if (k === 'forgot') {
        msg.textContent = 'To reset the PIN, open the hub and choose Restore from a backup file, or clear this site\'s data in Chrome (that also deletes data that isn\'t backed up).';
        msg.style.color = '#9aa1b2'; return;
      }
      if (val.length >= len) return;
      val += k; draw();
      if (val.length === len) hash(val, c.salt).then(function (h) {
        if (h === c.hash) { box.remove(); unlock(); }
        else { val = ''; msg.style.color = ''; msg.textContent = 'Wrong PIN'; dots.classList.remove('bad'); void dots.offsetWidth; dots.classList.add('bad'); setTimeout(draw, 300); }
      });
    }
    box.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) press(b.dataset.k); });
    document.addEventListener('keydown', function onKey(e) {
      if (!document.getElementById('hub-lock')) { document.removeEventListener('keydown', onKey); return; }
      if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del');
    });
    draw();
    (document.body || document.documentElement).appendChild(box);
  }
  function unlock() { ssSet(SEEN_KEY, String(Date.now())); document.documentElement.classList.remove('hub-locked'); }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') ssSet(AWAY_KEY, String(Date.now()));
    else if (needsLock()) showLock();
  });

  function addHome() {
    if (!me || !me.dataset.home) return;
    var mode = me.dataset.home;
    var a = document.createElement('a');
    a.href = ROOT; a.className = 'hub-home ' + mode; a.setAttribute('aria-label', 'Life Hub home'); a.title = 'Life Hub home';
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/></svg>';
    if (mode === 'brand') {
      var brand = document.querySelector('.brand');
      if (brand) { brand.insertBefore(a, brand.firstChild); return; }
      a.className = 'hub-home fixed';
    }
    document.body.appendChild(a);
    /* keep the workout header text clear of the round button */
    var s = document.createElement('style'); s.textContent = 'header{padding-right:48px}'; document.head.appendChild(s);
  }

  function ready() { addHome(); if (needsLock()) showLock(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();

  window.Hub = {
    root: ROOT,
    hasPin: function () { var c = lockCfg(); return !!(c && c.hash); },
    lockAfter: function () { var c = lockCfg(); return c && c.after != null ? c.after : 60; },
    setPin: function (pin, after) {
      var salt = hex(crypto.getRandomValues(new Uint8Array(12)));
      return hash(pin, salt).then(function (h) { lsSet(LOCK_KEY, { salt: salt, hash: h, len: pin.length, after: after == null ? 60 : after }); unlock(); });
    },
    setLockAfter: function (sec) { var c = lockCfg(); if (c) { c.after = sec; lsSet(LOCK_KEY, c); } },
    checkPin: function (pin) { var c = lockCfg(); if (!c) return Promise.resolve(true); return hash(pin, c.salt).then(function (h) { return h === c.hash; }); },
    clearPin: function () { lsDel(LOCK_KEY); },
    lockNow: function () { ssSet(SEEN_KEY, ''); showLock(); }
  };
})();
