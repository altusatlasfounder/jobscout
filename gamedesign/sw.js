const CACHE = "jobscout-v1";
const ASSETS = ["index.html","styles.css","app.js","manifest.webmanifest",
  "data/jobs.json","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install", e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate", e =>
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if(u.pathname.endsWith("jobs.json")){               // network-first for fresh jobs
    e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request)));
  } else {                                            // cache-first for app shell
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
  }
});
