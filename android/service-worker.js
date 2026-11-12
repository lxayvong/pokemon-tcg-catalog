/* Offline catalog shell only. Google Sheets and Apps Script are NEVER cached.
   The app requires online access before displaying or editing shared wish lists. */
const CACHE_NAME="tcg-android-shell-v6";
const SHELL=[
 "./","./index.html","./app.css?v=2","./app.js?v=2",
 "../shared/catalog-core.js?v=shared-price2","../shared/pricing-refresh.js?v=pricing4","./manifest.webmanifest",
 "./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png",
 "../catalog-schema.js","../catalog-additions.js","../market-and-packs.js",
 "../product-matcher.js","../deal-advisor.js","../catalog-research-20261112.js",
 "../pokemon-center-products.js","../google-sheets-config.js","../shared/google-sheets-client.js?v=shared-price2"
];
const shellUrls=new Set(SHELL.map(path=>new URL(path,self.location.href).href));
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(Promise.all([
  caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith("tcg-android-shell-")&&name!==CACHE_NAME).map(name=>caches.delete(name)))),
  self.clients.claim()
 ]));
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 // Never intercept Google Sheets or Apps Script, or any other third-party request.
 if(url.origin!==self.location.origin)return;
 if(!shellUrls.has(url.href))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();void caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
  return response;
 }).catch(async()=>{
  const cached=await caches.match(request);
  return cached||Response.error();
 }));
});
