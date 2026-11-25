/* Life Hub cloud sync: everything saved as "hub.*" goes to your own cloud (the Firebase account you
   log in with in the Workout app), so it's backed up and the same on every device you log in on.
   Lists of items (to-dos, payments, notes, ...) sync per item, so changes on two devices both survive.
   Stored at users/{uid}/hub/{doc}. Receipt files and clothing photos stay on the device (backup file). */
(function () {
  const K = window.K; if (!K || K.sync) return;
  const FB = { key: 'AIzaSyDYVE8Uk3s277R3fYXH3adm6w_HMnS3EPE', docs: 'projects/workout-log-jasontanis/databases/(default)/documents' };
  const API = 'https://firestore.googleapis.com/v1/';
  /* device-only things: login tokens, lock state, view choices, caches, big play history */
  const SKIP = /^hub\.(lock|unlockedAt|hiddenAt|fired|changedAt|bank\.(cursor|code|meta)|music\.(sp|verifier|plays|durs)|sync\..*|.*\.(view|tab|mode))$/;
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const hash = s => { let h = 5381, i = s.length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(36) + '.' + s.length; };
  const docId = k => k.replace(/[^A-Za-z0-9_-]/g, c => '~' + c.charCodeAt(0).toString(16));
  const isItems = v => Array.isArray(v) && v.length > 0 && v.every(x => x && typeof x === 'object' && (typeof x.id === 'string' || typeof x.id === 'number'));

  /* everything on this device as { docKey: json } — "hub.tasks|abc" for one item, "hub.school" for a whole value */
  function snapshot() {
    const m = {}, kinds = ls.get('hub.sync.kinds', {});
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (!/^hub\./.test(k) || SKIP.test(k)) continue;
      let v; try { v = JSON.parse(localStorage.getItem(k)); } catch { continue; }
      if (isItems(v) || (Array.isArray(v) && kinds[k] === 'items')) { kinds[k] = 'items'; for (const x of v) m[k + '|' + x.id] = JSON.stringify(x); }
      else m[k] = JSON.stringify(v);
    }
    ls.set('hub.sync.kinds', kinds);
    return m;
  }
  /* which docs changed since the cloud last confirmed them; da[key] = { h, t: when first seen changed } */
  function dirty(snap) {
    const sh = ls.get('hub.sync.sh', {}), da = ls.get('hub.sync.da', {}), now = Date.now();
    for (const k in snap) { const h = hash(snap[k]); if (sh[k] === h) delete da[k]; else if (!da[k] || da[k].h !== h) da[k] = { h, t: now }; }
    for (const k in sh) if (snap[k] == null && (!da[k] || da[k].h !== 'x')) da[k] = { h: 'x', t: now };
    for (const k in da) if (snap[k] == null && sh[k] == null) delete da[k];
    ls.set('hub.sync.da', da);
    return { sh, da };
  }
  async function token() {
    const a = ls.get('wl_auth', null); if (!a || !a.rt) return null;
    if (a.it && Date.now() < a.exp - 60000) return { uid: a.uid, tok: a.it, email: a.email };
    const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + FB.key, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(a.rt) });
    if (!r.ok) { if (r.status === 400) throw Object.assign(new Error('Your login expired. Log in again in Workout → You.'), { auth: true }); throw new Error('Couldn’t reach the cloud.'); }
    const d = await r.json(); a.it = d.id_token; a.rt = d.refresh_token || a.rt; a.exp = Date.now() + (+d.expires_in || 3600) * 1000; ls.set('wl_auth', a);
    return { uid: a.uid, tok: a.it, email: a.email };
  }
  async function req(url, body, tok) {
    const r = await fetch(API + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body), keepalive: JSON.stringify(body).length < 60000 });
    if (r.status === 403) throw Object.assign(new Error('The cloud’s database rules block Life Hub data. See Settings → Cloud sync.'), { rules: true });
    if (!r.ok) throw new Error('Cloud error ' + r.status);
    return r.json();
  }

  /* put one remote doc into this device's storage */
  function applyDoc(k, json, deleted) {
    const bar = k.indexOf('|');
    if (bar < 0) { if (deleted) localStorage.removeItem(k); else localStorage.setItem(k, json); return; }
    const key = k.slice(0, bar), id = k.slice(bar + 1);
    let list = ls.get(key, []); if (!Array.isArray(list)) list = [];
    const i = list.findIndex(x => String(x.id) === id);
    if (deleted) { if (i >= 0) list.splice(i, 1); }
    else { const obj = JSON.parse(json); if (i >= 0) list[i] = obj; else list.push(obj); }
    localStorage.setItem(key, JSON.stringify(list));
    const kinds = ls.get('hub.sync.kinds', {}); kinds[key] = 'items'; ls.set('hub.sync.kinds', kinds);
  }

  let busy = false, again = false, timer = null;
  async function run(reason) {
    if (busy) { again = true; return; }
    busy = true;
    const st = ls.get('hub.sync.state', {});
    try {
      const t = await token(); if (!t) { busy = false; return; }
      const base = `${FB.docs}/users/${t.uid}/hub/`;
      /* 1. pull what changed in the cloud */
      let cur = st.cur || '', changed = 0; const first = !cur;
      const snap = snapshot(), d0 = dirty(snap), sh = d0.sh, da = d0.da;
      for (let page = 0; page < 30; page++) {
        const q = { from: [{ collectionId: 'hub' }], orderBy: [{ field: { fieldPath: 's' }, direction: 'ASCENDING' }], limit: 300 };
        if (cur) q.where = { fieldFilter: { field: { fieldPath: 's' }, op: 'GREATER_THAN', value: { timestampValue: cur } } };
        const rows = (await req(`${FB.docs}/users/${t.uid}:runQuery`, { structuredQuery: q }, t.tok)).filter(x => x.document);
        for (const row of rows) {
          const f = row.document.fields || {}; if (f.s) cur = f.s.timestampValue; if (!f.k) continue;
          const k = f.k.stringValue, j = f.j ? f.j.stringValue : null, del = !!(f.d && f.d.booleanValue), rt = +(f.t && f.t.integerValue) || 0;
          if (!del && j == null) continue;
          const mine = da[k];
          if (!del && snap[k] === j) { sh[k] = hash(j); delete da[k]; continue; }
          if (del && snap[k] == null) { delete sh[k]; delete da[k]; continue; }
          const wholeFirst = first && k.indexOf('|') < 0;          /* a new device takes the cloud's settings */
          if (mine && !wholeFirst && mine.t >= rt) continue;          /* changed here more recently: ours goes up */
          applyDoc(k, j, del); changed++;
          if (del) { delete sh[k]; snap[k] = undefined; } else { sh[k] = hash(j); snap[k] = j; }
          delete da[k];
        }
        if (rows.length < 300) break;
      }
      ls.set('hub.sync.sh', sh); ls.set('hub.sync.da', da);
      /* 2. push what changed here */
      const s2 = snapshot(), d2 = dirty(s2), keys = Object.keys(d2.da);
      let sent = 0;
      for (let i = 0; i < keys.length; i += 200) {
        const part = keys.slice(i, i + 200), stamp = {};
        const writes = part.map(k => {
          const gone = s2[k] == null, f = { k: { stringValue: k }, t: { integerValue: String(d2.da[k].t) }, d: { booleanValue: gone } };
          if (!gone) f.j = { stringValue: s2[k] };
          stamp[k] = d2.da[k].h;
          return { update: { name: base + docId(k), fields: f }, updateTransforms: [{ fieldPath: 's', setToServerValue: 'REQUEST_TIME' }] };
        });
        await req(`${FB.docs}:commit`, { writes }, t.tok);
        const sh3 = ls.get('hub.sync.sh', {}), da3 = ls.get('hub.sync.da', {});
        for (const k of part) { if (stamp[k] === 'x') delete sh3[k]; else sh3[k] = stamp[k]; if (da3[k] && da3[k].h === stamp[k]) delete da3[k]; }
        ls.set('hub.sync.sh', sh3); ls.set('hub.sync.da', da3); sent += part.length;
      }
      Object.assign(st, { cur, last: Date.now(), err: '', email: t.email || st.email || '', sent: (st.sent || 0) + sent, got: (st.got || 0) + changed });
      ls.set('hub.sync.state', st);
      if (changed) { document.dispatchEvent(new CustomEvent('hub:synced', { detail: changed })); try { (window.refreshAll || window.render || (() => {}))(); } catch {} }
    } catch (e) { st.err = e.message; st.errAt = Date.now(); ls.set('hub.sync.state', st); }
    busy = false;
    if (again) { again = false; setTimeout(() => run('again'), 500); }
  }
  K.sync = {
    now: () => run('manual'),
    state: () => Object.assign({ on: !!(ls.get('wl_auth', null) || {}).rt }, ls.get('hub.sync.state', {})),
    pending: () => { try { return Object.keys(dirty(snapshot()).da).length; } catch { return 0; } },
  };
  /* when: after opening, a few seconds after a change, when coming back, when leaving, and every 2 minutes */
  document.addEventListener('hub:change', () => { clearTimeout(timer); timer = setTimeout(() => run('change'), 3000); });
  document.addEventListener('visibilitychange', () => run(document.visibilityState));
  setTimeout(() => run('open'), 1200);
  setInterval(() => { if (document.visibilityState === 'visible') run('interval'); }, 120000);
})();
