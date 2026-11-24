/* Life Hub offline cache for every module (travel/, workout/, ...).
   Network first so a new version shows up right away; the saved copy is used when offline or on a weak signal.
   Live data (bus times, weather, AI, cloud sync) is never cached here: other sites go straight to the network. */
var CACHE = 'life-hub-v3';
var SHELL = ['./', 'index.html', 'hub.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'lib/kit.css', 'lib/kit.js', 'lib/agenda.js',
  'travel/', 'travel/map.js', 'travel/icons/icon.svg', 'workout/', 'workout/icon-192.png',
  'todo/', 'school/', 'calendar/', 'habits/', 'countdowns/', 'sleep/', 'shopping/', 'notes/', 'money/'];
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
/* tapping a notification opens the app it belongs to (or focuses Life Hub) */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ('focus' in c) return c.focus().then(function (w) { return w && 'navigate' in w ? w.navigate(url) : w; }).catch(function () {});
    }
    return self.clients.openWindow(url);
  }));
});
