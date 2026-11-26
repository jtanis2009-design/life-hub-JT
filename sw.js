/* Life Hub offline cache for every module (travel/, workout/, ...).
   Network first so a new version shows up right away; the saved copy is used when offline or on a weak signal.
   Live data (bus times, weather, AI, cloud sync) is never cached here: other sites go straight to the network. */
var CACHE = 'life-hub-v40';
var SHELL = ['./', 'index.html', 'hub.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'lib/kit.css', 'lib/kit.js', 'lib/agenda.js', 'lib/files.js', 'lib/bankimport.js', 'lib/ai.js', 'lib/sync.js', 'lib/ics.js', 'lib/ow.js',
  'travel/', 'travel/map.js', 'travel/icons/icon.svg', 'workout/', 'workout/icon-192.png',
  'todo/', 'school/', 'calendar/', 'habits/', 'countdowns/', 'sleep/', 'shopping/', 'notes/', 'money/', 'adviser/', 'alarm/', 'music/', 'anime/', 'overwatch/', 'review/', 'clothes/', 'shaving/', 'assistant/'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  /* something shared to Life Hub from another app (Android Share menu): keep it for the Money page */
  if (req.method === 'POST' && url.origin === self.location.origin && url.searchParams.has('share-target')) {
    e.respondWith(saveShared(req).catch(function () { return ''; }).then(function (to) {
      return Response.redirect(new URL(to || 'money/#receipts', self.registration.scope).href, 303);
    }));
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(new Promise(function (resolve) {
    var done = false;
    function fromCache() {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit || req.mode !== 'navigate') return hit;
        return caches.match(new URL('./', url).href);   /* folder page, e.g. workout/ */
      });
    }
    var slow = setTimeout(function () {             /* weak signal (gym, bus): don't hang on the network */
      fromCache().then(function (hit) { if (hit && !done) { done = true; resolve(hit); } });
    }, 3000);
    fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      clearTimeout(slow);
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      if (!done) { done = true; resolve(res); }
    }).catch(function () {
      clearTimeout(slow);
      fromCache().then(function (hit) { if (!done) { done = true; resolve(hit || new Response('Offline', { status: 503 })); } });
    });
  }));
});
/* reminders sent by the life-hub-bank job while Life Hub is closed */
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Life Hub', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Life Hub', { body: d.body || '', tag: d.tag || undefined, data: { url: d.url || self.registration.scope },
    icon: new URL('icons/icon-192.png', self.registration.scope).href, badge: new URL('icons/icon-192.png', self.registration.scope).href, vibrate: [200, 100, 200] }));
});

/* tapping a notification opens the app it belongs to (or focuses Life Hub) */
/* ✨ the assistant asks Google from here, so the question keeps going when you leave Life Hub.
   The answer is kept (cache "lh-ai"), sent to the open page, and shown as a notification when you're away. */
self.addEventListener('message', function (e) {
  var d = e.data; if (!d || d.type !== 'ai') return;
  e.waitUntil((async function () {
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, d.ms || 35000), out;
    try { var r = await fetch(d.url, Object.assign({}, d.init, { signal: ctl.signal })); out = { status: r.status, body: await r.text() }; }
    catch (err) { out = err.name === 'AbortError' ? { error: 'The AI took too long to answer.', slow: true } : { error: 'Couldn’t reach the AI. Are you online?' }; }
    clearTimeout(tm);
    out.type = 'ai-done'; out.id = d.id; out.at = Date.now();
    try { var c = await caches.open('lh-ai'); await c.put(new Request(self.location.origin + '/__lhai/' + d.id), new Response(JSON.stringify(out))); } catch (x) {}
    var wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach(function (w) { w.postMessage(out); });
    if (!d.notify || wins.some(function (w) { return w.visibilityState === 'visible'; })) return;
    var text = '', calls = false;
    try { var parts = (((JSON.parse(out.body || '{}').candidates || [])[0] || {}).content || {}).parts || []; text = parts.filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('').trim(); calls = parts.some(function (p) { return p.functionCall; }); } catch (x) {}
    if (out.status !== 200 && !out.error) return;
    await self.registration.showNotification(out.error ? '✨ Assistant couldn’t answer' : calls && !text ? '✨ Assistant: tap to finish' : '✨ Assistant',
      { body: out.error || (text ? text.replace(/\*\*/g, '').slice(0, 220) : 'It needs you to confirm or look something up.'), tag: 'ai', data: { url: d.notify }, icon: self.registration.scope + 'icons/icon-192.png' });
  })());
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ('focus' in c) return c.focus().then(function (w) { return w && 'navigate' in w && w.url.split('#')[0] !== url.split('#')[0] ? w.navigate(url) : w; }).catch(function () {});
    }
    return self.clients.openWindow(url);
  }));
});

/* same database layout as lib/files.js */
function idb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('lifehub', 1);
    r.onupgradeneeded = function () {
      var d = r.result;
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('inbox')) d.createObjectStore('inbox', { keyPath: 'id' });
    };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function saveShared(req) {
  return req.formData().then(function (form) {
    var files = form.getAll('files').filter(function (f) { return f && f.size; });
    var title = form.get('title') || '', text = form.get('text') || '', link = form.get('url') || '';
    /* a YouTube song (YouTube app → Share → Life Hub) becomes an alarm sound */
    var yt = String(link + ' ' + text).match(/https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/\S+/);
    if (!files.length && yt) return 'alarm/#addsong=' + encodeURIComponent(yt[0]);
    var spl = String(link + ' ' + text).match(/https?:\/\/open\.spotify\.com\/\S+/);
    if (!files.length && spl) return 'alarm/#addsong=' + encodeURIComponent(spl[0]);
    var audio = files.length === 1 && (/^audio\//.test(files[0].type) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i.test(files[0].name || ''));
    return idb().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(['files', 'inbox'], 'readwrite');
        var fs = t.objectStore('files'), inbox = t.objectStore('inbox');
        if (audio) { var aid = uid(); fs.put({ id: aid, blob: files[0], name: files[0].name || 'sound', type: files[0].type || 'audio/mpeg', size: files[0].size, at: Date.now() });
          t.oncomplete = function () { res('alarm/#audio=' + aid); }; t.onerror = function () { rej(t.error); }; return; }
        if (files.length) files.forEach(function (f) {
          var id = uid();
          fs.put({ id: id, blob: f, name: f.name || 'shared', type: f.type || '', size: f.size, at: Date.now() });
          inbox.put({ id: uid(), fileId: id, title: title, text: text, url: link, at: Date.now() });
        });
        else if (link || text) inbox.put({ id: uid(), title: title, text: text, url: link, at: Date.now() });
        t.oncomplete = res; t.onerror = function () { rej(t.error); };
      });
    });
  });
}
