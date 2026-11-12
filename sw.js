/* Pokémon TCG Catalog service worker.
   Cache only stable app icons and offline page. Catalog, scripts, pricing,
   Google Sheets, and Apps Script requests are ALWAYS network-only. */
const CACHE_NAME="pokemon-catalog-pwa-shell-v1";
const ASSETS=["./offline.html","./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("pokemon-catalog-pwa-")&&k!==CACHE_NAME).map(k=>caches.delete(k)))));
 self.clients.claim();
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).catch(()=>caches.match("./offline.html")));
  return;
 }
 // Only immutable icons and our offline fallback are cacheable.
 if(url.pathname.includes("/icons/")||url.pathname.endsWith("/offline.html")){
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
 }
});
