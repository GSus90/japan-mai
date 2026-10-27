// Offline-Cache: lädt die ganze App beim ersten Öffnen, danach läuft sie ohne Netz.
const VERSION = 'japan-mai-v12';
const FILES = ["./", "index.html", "data.js", "recognize.js", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "photos/artcenter.jpg", "photos/benesse.jpg", "photos/chichu.jpg", "photos/chinatown.jpg", "photos/dotonbori.jpg", "photos/fushimi.jpg", "photos/ginza.jpg", "photos/gion.jpg", "photos/harajuku.jpg", "photos/hiroshima.jpg", "photos/hiroshimamuseum.jpg", "photos/ikebukuro.jpg", "photos/kamo.jpg", "photos/kinkakuji.jpg", "photos/kitano.jpg", "photos/kobe.jpg", "photos/kobeport.jpg", "photos/korakuen.jpg", "photos/kyoto.jpg", "photos/kyotopalace.jpg", "photos/mitsukoshi.jpg", "photos/nanzenji.jpg", "photos/naoshima.jpg", "photos/nara.jpg", "photos/nihonbashi.jpg", "photos/nishiki.jpg", "photos/osaka.jpg", "photos/osakamuseum.jpg", "photos/palace.jpg", "photos/peacepark.jpg", "photos/philosopher.jpg", "photos/roppongi.jpg", "photos/sanjusangendo.jpg", "photos/shimokitazawa.jpg", "photos/shinjuku.jpg", "photos/shinsekai.jpg", "photos/shitennoji.jpg", "photos/station.jpg", "photos/todaiji.jpg", "photos/toji.jpg", "photos/toyosu.jpg", "photos/umeda.jpg"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
