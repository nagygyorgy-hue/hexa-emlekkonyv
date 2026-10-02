// HEXA service worker — teljesen önálló, szerver nélküli app-shell gyorsítótár.
// Minden adat (bejegyzések, csatolmányok) a böngésző IndexedDB-jében él, ezt a
// szolgáltatásszál sosem érinti. Csak a statikus "héjat" (HTML/CSS/JS/ikonok)
// tárolja, hogy egyszeri betöltés után internet és bármilyen szerver nélkül,
// örökre, egy érintéssel induljon.

var CACHE_NAME = "hexa-standalone-shell-v4";
var SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  // Csak a saját eredetű (same-origin) kéréseket gyorsítótárazzuk — az app
  // "héját". Minden más (pl. a hitelesítő szerver API-hívásai, más eredetű
  // kérések) egyenesen a hálózatra megy, sosem a gyorsítótárból, különben a
  // dinamikus válaszok (pl. email-megerősítés állapota) örökre "beragadnának".
  var reqUrl;
  try { reqUrl = new URL(event.request.url); } catch (e) { return; }
  if (reqUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var network = fetch(event.request).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return resp;
      }).catch(function () { return cached; });
      // Cache-first: a telepített app azonnal, hálózat nélkül is megnyílik.
      return cached || network;
    })
  );
});
