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
    get: id => tx('files', 'readonly', s => s.get(id)),
    del: id => tx('files', 'readwrite', s => s.delete(id)),
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
  K.fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
})();
