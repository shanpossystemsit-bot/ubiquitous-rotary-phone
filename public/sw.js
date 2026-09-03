/* SHAN POS app shell cache. Business data and API calls are never cached. */
const CACHE='shan-pos-shell-v1';
const ASSETS=['/','/index.html','/manifest.webmanifest','/assets/SHAN_POS_SYSTEMS_LOGO.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==location.origin||url.pathname.startsWith('/.netlify/functions/')||event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response.ok&&(url.pathname==='/'||url.pathname==='/index.html'||url.pathname.startsWith('/assets/'))){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;})));});
