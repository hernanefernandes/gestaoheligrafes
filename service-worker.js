'use strict';
const CACHE='heligrafes-v52-shell-v2';
const SHELL=['./','./index.html','./js/supabase-config.js','./js/heligrafes-cloud.js','./js/heligrafes-sales-live.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('heligrafes-v52-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 const sameOrigin=url.origin===self.location.origin;
 const cacheableLocal=sameOrigin;
 const cacheableRemote=!sameOrigin&&['script','style','font'].includes(req.destination);
 if(!cacheableLocal&&!cacheableRemote)return;
 event.respondWith(caches.match(req).then(hit=>{
  if(hit)return hit;
  return fetch(req).then(res=>{
   if(res&&(res.ok||res.type==='opaque')){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});}
   return res;
  }).catch(()=>{
   if(req.mode==='navigate')return caches.match('./index.html');
   return caches.match(req);
  });
 }));
});
