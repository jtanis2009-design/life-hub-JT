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
    /* Notes and Money: ask again if the last unlock was more than 30 seconds ago */
    if (me && me.dataset.private && lsGet('hub.lockPrivate', true) && Date.now() - at > 30000) return true;
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

  /* ---------- the Life Hub bar at the bottom of every page ----------
     Today · three apps you pick · Apps (all apps in one tap). */
  var APPS = [
    ['home', 'Today', '', '#8b7cff', '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/>'],
    ['travel', 'Travel', 'travel/', '#5db3e4', '<path d="M6 17V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v10M6 13h12M8.5 20.5l1-3M15.5 20.5l-1-3"/>'],
    ['workout', 'Workout', 'workout/', '#ff5a5a', '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'],
    ['ai', 'Assistant', 'assistant/', '#b48cff', '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>'],
    ['todo', 'To-do', 'todo/', '#8b7cff', '<path d="M9 11l2.5 2.5L16 9"/><rect x="4" y="4" width="16" height="16" rx="4"/>'],
    ['school', 'School', 'school/', '#f2994a', '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-5"/>'],
    ['calendar', 'Calendar', 'calendar/', '#56ccf2', '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
    ['money', 'Money', 'money/', '#3ecf9a', '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10.5h18M7 15h3"/>'],
    ['habits', 'Habits', 'habits/', '#f25f8a', '<path d="M12 3c2.5 3 5 5.4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 3 0-2.5.2-5 1-7.5z"/>'],
    ['sleep', 'Sleep', 'sleep/', '#9b8cff', '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'],
    ['alarm', 'Alarms', 'alarm/', '#9b8cff', '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M4 4.5l3-2.5M20 4.5l-3-2.5"/>'],
    ['shopping', 'Shopping', 'shopping/', '#6fdc8c', '<path d="M5 7h14l-1.3 10.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>'],
    ['notes', 'Notes', 'notes/', '#c9b37e', '<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z"/><path d="M14.5 3.5V8h4.5M9 12h6M9 16h6"/>'],
    ['countdown', 'Countdowns', 'countdowns/', '#ffcf5c', '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>'],
    ['music', 'Music', 'music/', '#1ed760', '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'],
    ['anime', 'Anime', 'anime/', '#ff7eb6', '<rect x="3" y="5" width="18" height="13" rx="3"/><path d="M8 21h8M10.5 9.5v5l4-2.5z"/>'],
    ['coach', 'Money Coach', 'adviser/', '#3ecf9a', '<path d="M4 19V9M9.5 19V5M15 19v-7M20.5 19V8"/><path d="M3 21h19"/>'],
    ['clothes', 'Clothes', 'clothes/', '#b48cff', '<path d="M8 3l4 2.5L16 3l5 3.5-2.5 4L16 9v12H8V9l-2.5 1.5L3 6.5z"/>'],
    ['shave', 'Shaving', 'shaving/', '#56ccf2', '<path d="M7 3h10v5H7z"/><path d="M12 8v13M9 21h6"/><path d="M7 5.5h10"/>'],
  ];
  var GRID = '<path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z"/>';
  function app(id) { for (var i = 0; i < APPS.length; i++) if (APPS[i][0] === id) return APPS[i]; return null; }
  function pins() { var p = lsGet('hub.navpins', null); p = Array.isArray(p) ? p.filter(function (x) { return app(x) && x !== 'home'; }).slice(0, 3) : []; ['travel', 'workout', 'ai', 'todo'].forEach(function (d) { if (p.length < 3 && p.indexOf(d) < 0) p.push(d); }); return p; }
  function currentApp() {
    var rest = location.href.indexOf(ROOT) === 0 ? location.href.slice(ROOT.length).split(/[?#]/)[0] : '';
    var folder = rest.split('/')[0];
    if (!folder || folder === 'index.html') return 'home';
    for (var i = 0; i < APPS.length; i++) if (APPS[i][2] === folder + '/') return APPS[i][0];
    return '';
  }
  function icon(paths) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'; }
  function escH(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var NAV_CSS =
    ':root{--hubnav-h:calc(58px + env(safe-area-inset-bottom));--hn-bg:#0d0f14;--hn-line:#272c3a;--hn-ink:#eef0f5;--hn-mut:#8a90a0;--hn-card:#161922;--hn-acc:#8b7cff}' +
    '@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--hn-bg:#f3f4f8;--hn-line:#dfe2ea;--hn-ink:#121520;--hn-mut:#5d6475;--hn-card:#fff;--hn-acc:#5b47e0}}' +
    ':root[data-theme="light"]{--hn-bg:#f3f4f8;--hn-line:#dfe2ea;--hn-ink:#121520;--hn-mut:#5d6475;--hn-card:#fff;--hn-acc:#5b47e0}' +
    'nav.hub-nav{position:fixed!important;left:0;right:0;bottom:0!important;top:auto!important;z-index:45;background:color-mix(in srgb,var(--hn-bg) 93%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--hn-line);padding:0 0 env(safe-area-inset-bottom)!important;margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '.hub-nav .in{max-width:640px;margin:0 auto;display:grid;grid-template-columns:repeat(5,1fr);padding:5px 6px}' +
    'nav.hub-nav a,nav.hub-nav button{padding:0;margin:0;letter-spacing:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:48px;border-radius:12px;text-decoration:none;font-size:10.5px!important;font-weight:700;line-height:1.1;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-transform:none;color:var(--hn-mut);background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent;min-width:0}' +
    '.hub-nav a span,.hub-nav button span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 2px}' +
    '.hub-nav svg{width:22px;height:22px}' +
    '.hub-nav [aria-current="page"]{color:var(--c-app,var(--hn-acc));background:color-mix(in srgb,var(--c-app,var(--hn-acc)) 12%,transparent)}' +
    '.hub-apps{position:fixed;inset:0;z-index:79;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center}' +
    '.hub-apps .sh{background:var(--hn-card);color:var(--hn-ink);width:100%;max-width:640px;border-radius:22px 22px 0 0;padding:10px 14px calc(var(--hubnav-h) + 10px);max-height:80vh;overflow-y:auto;font-family:Inter,system-ui,sans-serif;animation:hubup .18s ease-out}' +
    '@keyframes hubup{from{transform:translateY(30px);opacity:.5}}' +
    '.hub-apps .grab{width:40px;height:5px;border-radius:9px;background:var(--hn-line);margin:2px auto 12px}' +
    '.hub-apps .g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}' +
    '.hub-apps a{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 2px;border-radius:14px;text-decoration:none;color:var(--hn-ink);font-size:12px;font-weight:600;line-height:1.2;font-family:inherit;text-align:center}' +
    '.hub-apps a:active{background:var(--hn-line)}' +
    '.hub-apps a i{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:color-mix(in srgb,var(--ac) 18%,transparent);color:var(--ac)}' +
    '.hub-apps a i svg{width:24px;height:24px}' +
    '.hub-apps .ed{display:block;text-align:center;margin-top:10px;font-size:13px;font-weight:700;font-family:inherit;color:var(--hn-acc);text-decoration:none}';
  /* page-specific room for the bar */
  var PAGE_CSS = {
    workout: 'body{padding-bottom:calc(78px + var(--hubnav-h))!important}nav:not(.hub-nav){bottom:var(--hubnav-h)!important;padding-bottom:0!important}.rest{bottom:calc(72px + var(--hubnav-h))!important}.toast{bottom:calc(94px + var(--hubnav-h))!important}',
    travel: 'body{padding-bottom:calc(16px + var(--hubnav-h))!important}body.map-mode{padding-bottom:var(--hubnav-h)!important}',
  };

  function addNav() {
    if (document.querySelector('.hub-nav')) return;
    var cur = currentApp(), here = app(cur);
    var st = document.createElement('style'); st.textContent = NAV_CSS + (PAGE_CSS[me && me.dataset.nav] || ''); document.head.appendChild(st);
    var items = ['home'].concat(pins());
    var nav = document.createElement('nav'); nav.className = 'hub-nav'; nav.setAttribute('aria-label', 'Life Hub');
    nav.innerHTML = '<div class="in">' + items.map(function (id) { var a = app(id);
      return '<a href="' + ROOT + a[2] + '"' + (id === cur ? ' aria-current="page"' : '') + ' style="--c-app:' + a[3] + '">' + icon(a[4]) + '<span>' + escH(a[1]) + '</span></a>'; }).join('') +
      '<button type="button" data-hub-apps' + (cur && items.indexOf(cur) < 0 ? ' aria-current="page" style="--c-app:' + here[3] + '"' : '') + '>' + icon(cur && items.indexOf(cur) < 0 ? here[4] : GRID) + '<span>' + (cur && items.indexOf(cur) < 0 ? escH(here[1]) : 'Apps') + '</span></button></div>';
    document.body.appendChild(nav);
    nav.querySelector('[data-hub-apps]').addEventListener('click', openApps);
  }
  function openApps() {
    var bg = document.createElement('div'); bg.className = 'hub-apps';
    bg.innerHTML = '<div class="sh" role="dialog" aria-label="All apps"><div class="grab"></div><div class="g">' + APPS.map(function (a) {
      return '<a href="' + ROOT + a[2] + '" style="--ac:' + a[3] + '"><i>' + icon(a[4]) + '</i>' + escH(a[1]) + '</a>'; }).join('') +
      '</div><a class="ed" href="' + ROOT + '#settings">Change the bottom bar</a></div>';
    bg.addEventListener('click', function (e) { if (e.target === bg) bg.remove(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { bg.remove(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(bg);
  }

  function ready() { addNav(); if (needsLock()) showLock(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();

  window.Hub = {
    root: ROOT,
    apps: APPS.map(function (a) { return { id: a[0], name: a[1], path: a[2] }; }),
    pins: pins,
    setPins: function (p) { lsSet('hub.navpins', p); try { localStorage.setItem('hub.changedAt', String(Date.now())); } catch (e) {} document.dispatchEvent(new CustomEvent('hub:change', { detail: 'navpins' })); },
    hasPin: function () { var c = lockCfg(); return !!(c && c.hash); },
    lockPrivate: function (v) { if (v != null) lsSet('hub.lockPrivate', !!v); return lsGet('hub.lockPrivate', true); },
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

/* Spotify stats, kept up to date from any page: Spotify only shares your last 50 songs,
   so Life Hub quietly fetches new plays (at most every 15 min) whenever a page is open. */
(function () {
  var J = function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  var S = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  var busy = false;
  async function token() {
    var c = J('hub.music', {}) || {}, t = J('hub.music.sp', null);
    if (c.source !== 'spotify' || !c.clientId || !t || !t.refresh) return null;
    if (Date.now() < (t.exp || 0)) return t.access;
    var r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, grant_type: 'refresh_token', refresh_token: t.refresh }) });
    if (!r.ok) return null;
    var j = await r.json();
    S('hub.music.sp', { access: j.access_token, refresh: j.refresh_token || t.refresh, exp: Date.now() + (j.expires_in - 60) * 1000, scope: j.scope || t.scope });
    return j.access_token;
  }
  async function musicSync(force) {
    if (busy || !navigator.onLine || document.visibilityState !== 'visible') return;
    if (/\/music\/?(index\.html)?$/.test(location.pathname)) return;   /* the Music page syncs itself */
    if (!force && Date.now() - (J('hub.music.synced', 0) || 0) < 15 * 60000) return;
    busy = true;
    try {
      var tok = await token(); if (!tok) return;
      var plays = J('hub.music.plays', []) || [], last = plays.length ? plays[plays.length - 1].t : 0;
      var r = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50' + (last ? '&after=' + last : ''), { headers: { Authorization: 'Bearer ' + tok } });
      if (!r.ok) { if (r.status === 401) { var t = J('hub.music.sp', {}); t.exp = 0; S('hub.music.sp', t); } return; }
      var items = ((await r.json()) || {}).items || [];
      var add = items.map(function (x) { return { t: Date.parse(x.played_at), id: x.track.id, n: x.track.name, a: x.track.artists.map(function (a) { return a.name; }).join(', '), ms: x.track.duration_ms, img: ((x.track.album.images || []).slice(-2)[0] || {}).url || '' }; })
        .filter(function (p) { return p.t > last; }).sort(function (a, b) { return a.t - b.t; });
      if (add.length) { var keep = plays.concat(add).filter(function (p) { return p.t > Date.now() - 120 * 864e5; }).slice(-8000); if (!S('hub.music.plays', keep)) S('hub.music.plays', keep.slice(-3000)); }
      S('hub.music.synced', Date.now());
    } catch (e) {} finally { busy = false; }
  }
  setTimeout(musicSync, 4000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(musicSync, 1500); });
  setInterval(musicSync, 15 * 60000);
})();

/* 🚌 Bus watcher: while Life Hub is open (any page, also night mode), checks your bus every 2 minutes.
   Watches today's school bus (from the school alarm plan) and any bus you follow in Travel (🔔).
   Tells you when it's late, back on time, or cancelled, and finds the next bus that still works. */
(function () {
  var J = function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  var S = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var hm = function (d) { d = new Date(d); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
  var ymd = function (d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var busy = false;
  function notify(title, body) {
    try { if (window.K && K.toast) K.toast(title + (body ? ' · ' + body : '')); } catch (e) {}
    try { if (Notification.permission === 'granted' && navigator.serviceWorker) navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, { body: body || '', tag: 'bus', renotify: true, icon: (window.Hub ? Hub.root : '/') + 'icons/icon-192.png', data: { url: (window.Hub ? Hub.root : '/') + 'travel/' } }); }); } catch (e) {}
  }
  /* the buses to watch right now */
  function watches() {
    var out = [], now = Date.now();
    var mp = (J('hub.mornings', {}) || {})[ymd()];
    if (mp && mp.bus && mp.bus.trip) out.push(Object.assign({ key: 'school', school: true }, mp.bus));
    var f = J('hub.buswatch', null);
    if (f && f.trip) { if (now - Date.parse(f.time || f.sched) > 15 * 60000) localStorage.removeItem('hub.buswatch'); else out.push(Object.assign({ key: 'follow' }, f)); }
    /* from 2½ hours before it leaves until it has left */
    return out.filter(function (w) { var dep = Date.parse(w.time || w.sched); return dep - now < 150 * 60000 && now - dep < 3 * 60000; });
  }
  async function find(w) {
    var q = new URLSearchParams({ fromPlace: w.fromPlace, toPlace: w.toPlace, time: new Date(Date.parse(w.qtime || w.sched) - 60000).toISOString(), numItineraries: '6' });
    var r = await fetch('https://api.transitous.org/api/v5/plan?' + q); if (!r.ok) throw new Error(r.status);
    var its = (await r.json()).itineraries || [];
    for (var i = 0; i < its.length; i++) for (var j = 0; j < its[i].legs.length; j++) { var l = its[i].legs[j]; if (l.tripId === w.trip) return l; }
    return null;
  }
  async function check() {
    if (busy || !navigator.onLine || document.visibilityState !== 'visible') return;
    var list = watches(); if (!list.length) return;
    busy = true;
    try {
      var st = J('hub.busstate', {}) || {};
      for (var i = 0; i < list.length; i++) {
        var w = list[i], id = w.trip + '@' + w.sched, s = st[id] || { delay: 0, told: 0 };
        var l = await find(w).catch(function () { return undefined; });
        if (l === undefined) continue;   /* no internet / API trouble: try again in 2 min */
        s.at = Date.now(); s.miss = l ? 0 : (s.miss || 0) + 1;
        var name = (w.line || 'Your bus') + ' (' + hm(w.sched) + (w.stop ? ', ' + w.stop : '') + ')';
        if (l && (l.cancelled || (l.from && l.from.cancelled))) {
          s.cancelled = true;
          if (!s.toldCancel) { s.toldCancel = 1; await nextBus(w, name, 'is cancelled ❌'); }
        } else if (l) {
          var d = Math.round((Date.parse(l.startTime) - Date.parse(l.scheduledStartTime)) / 60000);
          s.delay = d; s.live = !!l.realTime; s.time = l.startTime; s.cancelled = false;
          if (d >= 2 && Math.abs(d - (s.told || 0)) >= 2) { s.told = d; notify('⏱ ' + name + ' is ' + d + ' min late', 'Leaves at ' + hm(l.startTime) + ' instead.' + (w.school && w.spare != null && d > w.spare ? ' That eats your whole safety margin. Check Travel for another bus.' : '')); }
          else if (d < 2 && (s.told || 0) >= 2) { s.told = 0; notify('✅ ' + name + ' is on time again', 'Leaves at ' + hm(l.startTime) + '.'); }
        } else if (s.miss === 3) notify('⚠️ ' + name + ' is missing from the live times', 'It may not run. Check Travel for the next bus.');
        st[id] = s;
      }
      for (var k in st) if (Date.now() - (st[k].at || 0) > 864e5) delete st[k];
      S('hub.busstate', st);
    } catch (e) {} finally { busy = false; }
  }
  /* the bus is cancelled: plan again (school: picks a new bus and may move the alarm) */
  async function nextBus(w, name, what) {
    if (w.school && window.K && K.planMorning) {
      var p = await K.planMorning(ymd(), true).catch(function () { return null; });
      if (p && p.bus && p.bus.trip !== w.trip) return notify('❌ ' + name + ' ' + what.replace(' ❌', ''), 'Take ' + p.line + ' at ' + p.bus.stopTime + ' instead (at school ' + p.arrive + ').');
    }
    notify('❌ ' + name + ' ' + what.replace(' ❌', ''), 'Open Travel to see the next bus.');
  }
  window.LHBus = { check: check, watches: watches, state: function () { return J('hub.busstate', {}) || {}; } };
  setTimeout(check, 5000);
  setInterval(check, 2 * 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(check, 2000); });
})();
