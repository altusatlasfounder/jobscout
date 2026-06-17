const CACHE = "jobscout-v3";
const ASSETS = ["index.html","styles.css","app.js","manifest.webmanifest",
  "data/jobs.json","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install", e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate", e =>
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())));
// Network-first for everything, cache fallback when offline. This way code and
// data updates always show on reload; the cache only serves when the network is down.
self.addEventListener("fetch", e => {
  if(e.request.method!=="GET") return;
  e.respondWith(
    fetch(e.request).then(r=>{
      const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r;
    }).catch(()=>caches.match(e.request))
  );
});
