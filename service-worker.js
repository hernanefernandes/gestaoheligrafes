'use strict';
const CACHE_PREFIX='heligrafes-v64-';
const CACHE='heligrafes-v62-shell-v1';

self.addEventListener('install',event=>{
 event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 const navigation=request.mode==='navigate';
 const staticAsset=navigation||['script','style','image','font'].includes(request.destination)||/\.(?:html?|m?js|css|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(url.pathname);
 if(!staticAsset)return;

 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const response=await fetch(new Request(request,{cache:'no-store'}));
   if(response.status===404||response.status===410){
    const entries=await cache.keys();
    await Promise.all(entries.filter(entry=>new URL(entry.url).pathname===url.pathname).map(entry=>cache.delete(entry)));
    return response;
   }
   if(response.ok){
    if(navigation)await cache.put(new URL('./index.html',self.registration.scope).href,response.clone());
    else await cache.put(request,response.clone());
   }
   return response;
  }catch(error){
   const cached=await cache.match(request)||(navigation?await cache.match(new URL('./index.html',self.registration.scope).href):null);
   if(cached)return cached;
   throw error;
  }
 })());
});
