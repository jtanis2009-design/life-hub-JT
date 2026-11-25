/* Life Hub file storage (receipts and other files) in the phone's IndexedDB.
   Normal saved data has a small limit (about 5 MB); files go here instead.
   Database "lifehub": store "files" { id, blob, name, type, at }, store "inbox" (things shared to Life Hub
   from other apps, picked up by the Money page). sw.js uses the same layout. */
(function () {
  const K = window.K;
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('lifehub', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('inbox')) d.createObjectStore('inbox', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = (store, mode, fn) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store); let out;
    const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));

  K.files = {
    async put(blob, name) {
      const id = K.uid();
      await tx('files', 'readwrite', s => s.put({ id, blob, name: name || blob.name || 'file', type: blob.type || '', size: blob.size || 0, at: Date.now() }));
      return id;
    },
    /* keep a file under a known id (a file downloaded from the cloud) */
    putWithId: (id, blob, name, type) => tx('files', 'readwrite', s => s.put({ id, blob, name: name || 'file', type: type || blob.type || '', size: blob.size || 0, at: Date.now() })),
    get: id => tx('files', 'readonly', s => s.get(id)),
    del: id => { remoteDel(id); return tx('files', 'readwrite', s => s.delete(id)); },
    all: () => tx('files', 'readonly', s => s.getAll()),
    inbox: () => tx('inbox', 'readonly', s => s.getAll()),
    clearInbox: id => tx('inbox', 'readwrite', s => s.delete(id)),
    /* open a stored file in a new tab (PDF viewer / image) */
    async open(id) {
      const f = await K.files.get(id); if (!f) { K.toast('That file is gone'); return; }
      const url = URL.createObjectURL(f.blob);
      const w = window.open(url, '_blank');
      if (!w) { const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    async download(id) {
      const f = await K.files.get(id); if (!f) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    async thumb(id) { const f = await K.files.get(id); return f && /^image\//.test(f.type) ? URL.createObjectURL(f.blob) : null; },
    /* ask Chrome to never clear these files to free space */
    async keep() { try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch {} },
    async usage() { try { const e = await navigator.storage.estimate(); return e; } catch { return null; } },
    /* for the backup file */
    async exportAll() {
      const all = await K.files.all(), out = [];
      for (const f of all) out.push({ id: f.id, name: f.name, type: f.type, at: f.at, data: await blobToDataUrl(f.blob) });
      return out;
    },
    async importAll(list) {
      for (const f of list || []) { const blob = await (await fetch(f.data)).blob(); await tx('files', 'readwrite', s => s.put({ id: f.id, blob, name: f.name, type: f.type, size: blob.size, at: f.at })); }
    },
  };
  function blobToDataUrl(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); }); }
  K.receipts = K.coll('receipts');

  /* ---------- files in the cloud (receipts, clothing photos) ----------
     Each file: users/{uid}/files/{id} (name, type, size, number of pieces) + {id}~0, {id}~1 … (the file in pieces).
     Uploaded once from the device that has it; downloaded on other devices when something needs it. */
  const FSDOC = 'projects/workout-log-jasontanis/databases/(default)/documents', API = 'https://firestore.googleapis.com/v1/';
  const PIECE = 700000, MAX = 8 * 1048576;
  const state = () => { try { return JSON.parse(localStorage.getItem('lh.filesync') || '{}'); } catch { return {}; } };   /* this device only */
  const saveState = st => { try { localStorage.setItem('lh.filesync', JSON.stringify(st)); } catch {} };
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const fromB64 = (b, type) => { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
  async function auth() { if (!K.sync || !K.sync.state().on) return null; try { return await K.sync.token(); } catch { return null; } }
  async function call(method, path, body, t) {
    const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + t.tok, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404 && method === 'GET') return null;
    if (!r.ok) throw new Error('cloud ' + r.status);
    return r.status === 204 ? {} : r.json().catch(() => ({}));
  }
  async function remoteDel(id) {
    const t = await auth(); if (!t) return; const st = state(), n = (st.up || {})[id]; if (!n) return;
    try { for (let i = -1; i < n; i++) await call('DELETE', `${FSDOC}/users/${t.uid}/files/${i < 0 ? id : id + '~' + i}`, null, t); delete st.up[id]; saveState(st); } catch {}
  }
  /* which files the apps point to */
  const wanted = () => new Set([...K.receipts.all().map(r => r.fileId), ...(K.get('clothes', []) || []).map(c => c.photo)].filter(Boolean));
  let busy = false, timer = null;
  K.fileSync = async () => {
    if (busy) return; busy = true;
    try {
      const t = await auth(); if (!t) return;
      const st = state(); st.up = st.up || {};
      const local = await K.files.all(), have = new Set(local.map(f => f.id)), want = wanted();
      /* 1. upload what only this device has */
      for (const f of local) {
        if (st.up[f.id] || !want.has(f.id) || (f.size || f.blob.size) > MAX) continue;
        const b = await toB64(f.blob), n = Math.max(1, Math.ceil(b.length / PIECE)), base = `${FSDOC}/users/${t.uid}/files/`;
        for (let i = 0; i < n; i += 2) {
          const writes = [i, i + 1].filter(x => x < n).map(x => ({ update: { name: base + f.id + '~' + x, fields: { d: { stringValue: b.slice(x * PIECE, (x + 1) * PIECE) } } } }));
          await call('POST', `${FSDOC}:commit`, { writes }, t);
        }
        await call('PATCH', `${FSDOC}/users/${t.uid}/files/${f.id}`, { fields: { j: { stringValue: JSON.stringify({ name: f.name, type: f.type, size: f.size || f.blob.size, n }) } } }, t);
        st.up[f.id] = n; saveState(st);
      }
      /* 2. download what the apps need but this device doesn't have */
      let got = 0;
      for (const id of want) {
        if (have.has(id)) continue;
        const m = await call('GET', `${FSDOC}/users/${t.uid}/files/${id}`, null, t); if (!m || !m.fields || !m.fields.j) continue;
        const meta = JSON.parse(m.fields.j.stringValue); let b64 = '';
        for (let i = 0; i < meta.n; i++) { const c = await call('GET', `${FSDOC}/users/${t.uid}/files/${id}~${i}`, null, t); if (!c) { b64 = ''; break; } b64 += c.fields.d.stringValue; }
        if (!b64) continue;
        await K.files.putWithId(id, fromB64(b64, meta.type), meta.name, meta.type); st.up[id] = meta.n; saveState(st); got++;
      }
      if (got) { document.dispatchEvent(new CustomEvent('hub:files', { detail: got })); try { (window.render || window.refreshAll || (() => {}))(); } catch {} }
    } catch {} finally { busy = false; }
  };
  /* run after opening, after cloud sync brings new receipts/clothes, and shortly after adding a file */
  setTimeout(() => K.fileSync(), 3500);
  document.addEventListener('hub:synced', () => K.fileSync());
  document.addEventListener('hub:change', e => { if (/^(receipts|clothes)$/.test(e.detail)) { clearTimeout(timer); timer = setTimeout(() => K.fileSync(), 4000); } });
  K.fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
})();
