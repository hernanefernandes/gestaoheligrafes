(() => {
'use strict';
const db=()=>window.heliSupabase;
const DB_NAME='heli-sales-offline-v1', STORE='outbox', QUEUE_KEY='heli_sales_queue_v1';
let idb=null, channel=null, soundEnabled=false, panelOpen=false, notificationPermission=('Notification' in window?Notification.permission:'default');
const $=id=>document.getElementById(id);
const money=n=>(Number(n)||0).toLocaleString('pt-AO',{maximumFractionDigits:2})+' Kz';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const openDB=()=>new Promise((resolve,reject)=>{
 if(idb)return resolve(idb);
 const req=indexedDB.open(DB_NAME,1);
 req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE)){const st=d.createObjectStore(STORE,{keyPath:'id'});st.createIndex('createdAt','createdAt');}};
 req.onsuccess=()=>{idb=req.result;resolve(idb);};req.onerror=()=>reject(req.error);
});
async function putQueue(row){const d=await openDB();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function getQueue(){const d=await openDB();return new Promise((resolve,reject)=>{const r=d.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
async function removeQueue(id){const d=await openDB();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
function uuid(){return crypto.randomUUID?crypto.randomUUID():([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));}
function locate(value){
 const list=window.HELI_ALLOWED_LOCATIONS||[],v=String(value||'').trim().toLowerCase();
 return list.find(x=>[x.code,x.name,('LOCAL '+String(x.code||'').replace('LOCAL_',''))].some(y=>String(y||'').trim().toLowerCase()===v))
   || list.find(x=>v&&String(x.code||'').toLowerCase().replace('_',' ' )===v);
}
function saleRow(sale){
 const loc=(window.HELI_DEFAULT_LOCATION_ID&&(window.HELI_ALLOWED_LOCATIONS||[]).length===1?(window.HELI_ALLOWED_LOCATIONS||[]).find(x=>x.id===window.HELI_DEFAULT_LOCATION_ID):locate(sale.location||sessionStorage.getItem('multi_business_location_v52')||localStorage.getItem('multi_business_location_v52')));
 if(!loc)throw new Error('O local desta venda não está associado a um local activo no Supabase.');
 const user=window.HELI_USER,org=window.HELI_ORG;
 const occurred=sale.createdAt||new Date().toISOString();
 return {
  id:sale._heliCloudId||uuid(),organization_id:org.id,location_id:loc.id,
  local_sale_id:String(sale.id||sale._heliCloudId||uuid())+':'+String(occurred),
  sale_payload:sale,total:Number(sale.total)||0,paid:Number(sale.initialPaid!==undefined?sale.initialPaid:sale.paid)||0,
  category:String(sale.category||'OTHER'),seller_name:String(sale.seller||'Sem utilizador'),seller_email:String(user.email||'').toLowerCase(),
  created_by:user.id,occurred_at:new Date(occurred).toISOString()
 };
}
function status(t){const n=$('heli-live-status');if(n)n.textContent=t;}
async function enqueue(sale){
 if(!sale||sale.category==='EXPENSE')return;
 const row=saleRow(sale);
 try{await putQueue({...row,createdAt:Date.now(),syncStatus:'pending'});status('Venda guardada localmente • a sincronizar');}
 catch(e){console.error('[Heligrafes] Não foi possível guardar na fila offline',e);status('Falha ao guardar fila offline');return;}
 flushQueue();
}
async function flushQueue(){
 if(!navigator.onLine||!db()||!window.HELI_USER)return;
 let rows=[];try{rows=await getQueue();}catch(e){console.error(e);return;}
 for(const row of rows){
  try{
   const {createdAt,syncStatus,...payload}=row;
   const q=await db().from('pos_sales_events').upsert(payload,{onConflict:'organization_id,local_sale_id',ignoreDuplicates:true});
   if(q.error)throw q.error;
   await removeQueue(row.id);
  }catch(e){console.warn('[Heligrafes] Venda permanece na fila:',e.message);status('Sincronização pendente • '+rows.length+' venda(s)');return;}
 }
 const remaining=await getQueue();
 status(remaining.length?'Pendentes: '+remaining.length:'Tudo sincronizado');
}
function playAlert(){
 if(!soundEnabled)return;
 try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=880;g.gain.setValueAtTime(.001,c.currentTime);g.gain.exponentialRampToValueAtTime(.15,c.currentTime+.03);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.35);o.start();o.stop(c.currentTime+.36);o.onended=()=>c.close();}catch(_){}
}
async function notifySale(row){
 playAlert();
 if(notificationPermission==='granted'&&document.hidden){
  try{new Notification('Nova venda — Grupo Heligrafes',{body:(row.seller_name||'Funcionário')+' • '+money(row.paid||row.total)});}catch(_){}
 }
 if(panelOpen)await loadDashboard();
}
async function loadDashboard(){
 const root=$('heli-live-rows');if(!root||!db())return;
 const from=new Date();from.setHours(0,0,0,0);
 const q=await db().from('pos_sales_events').select('id,location_id,local_sale_id,total,paid,category,seller_name,seller_email,occurred_at,sale_payload').gte('occurred_at',from.toISOString()).order('occurred_at',{ascending:false}).limit(250);
 if(q.error){root.innerHTML='<p class="heli-muted">Não foi possível carregar as vendas: '+esc(q.error.message)+'</p>';return;}
 const locations=window.HELI_ALLOWED_LOCATIONS||[],rows=q.data||[];
 const access=await db().from('user_role_assignments').select('user_id,location_id').eq('organization_id',window.HELI_ORG.id);
 const assignedCounts=new Map();(access.data||[]).forEach(a=>{if(a.location_id)assignedCounts.set(a.location_id,(assignedCounts.get(a.location_id)||new Set()).add(a.user_id));});
 const total=rows.reduce((a,x)=>a+(Number(x.paid)||0),0);
 const totalEl=$('heli-live-total'),countEl=$('heli-live-count');if(totalEl)totalEl.textContent=money(total);if(countEl)countEl.textContent=String(rows.length);
 const byLoc=locations.map(l=>({name:l.name,amount:rows.filter(x=>x.location_id===l.id).reduce((a,x)=>a+(Number(x.paid)||0),0),count:rows.filter(x=>x.location_id===l.id).length,users:assignedCounts.get(l.id)?.size||0}));
 const locEl=$('heli-live-locations');if(locEl)locEl.innerHTML=byLoc.map(x=>'<div class="heli-live-location"><span>'+esc(x.name)+'</span><b>'+money(x.amount)+'</b><small>'+x.users+' utilizador(es) autorizado(s) · '+x.count+' venda(s)</small></div>').join('');
 root.innerHTML=rows.length?rows.map(x=>'<div class="heli-live-row"><div><b>'+esc(x.sale_payload?.desc||x.category||'Venda')+'</b><small>'+esc(locations.find(l=>l.id===x.location_id)?.name||'Local')+' · '+esc(x.seller_email||x.seller_name)+' · '+new Date(x.occurred_at).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})+'</small></div><strong>'+money(x.paid)+'</strong></div>').join(''):'<p class="heli-muted">Ainda não existem vendas sincronizadas hoje.</p>';
}
function buildPanel(){
 if($('heli-live-panel'))return;
 const btn=document.createElement('button');btn.id='heli-live-open';btn.type='button';btn.innerHTML='▣ Vendas em tempo real';btn.onclick=()=>{panelOpen=true;$('heli-live-panel').classList.add('open');loadDashboard();};
 const panel=document.createElement('section');panel.id='heli-live-panel';panel.innerHTML='<header><div><b>Central de vendas</b><small>Grupo Heligrafes · locais associados aos e-mails autorizados</small></div><button id="heli-live-close" type="button" aria-label="Fechar">×</button></header><div class="heli-live-body"><div class="heli-live-cards"><div><small>Total recebido hoje</small><strong id="heli-live-total">—</strong></div><div><small>Vendas sincronizadas</small><strong id="heli-live-count">—</strong></div></div><h3>Movimento por local</h3><div id="heli-live-locations"></div><h3>Últimas vendas</h3><div id="heli-live-rows"></div><div class="heli-live-tools"><button id="heli-live-sound" type="button">Activar alertas sonoros</button><button id="heli-live-notify" type="button">Activar notificações</button></div><p id="heli-live-status" role="status">A ligar...</p></div>';
 document.body.append(btn,panel);
 $('heli-live-close').onclick=()=>{panelOpen=false;panel.classList.remove('open');};
 $('heli-live-sound').onclick=()=>{soundEnabled=!soundEnabled;$('heli-live-sound').textContent=soundEnabled?'Alertas sonoros activos':'Activar alertas sonoros';if(soundEnabled)playAlert();};
 $('heli-live-notify').onclick=async()=>{if(!('Notification'in window))return alert('Este navegador não suporta notificações.');notificationPermission=await Notification.requestPermission();$('heli-live-notify').textContent=notificationPermission==='granted'?'Notificações activas':'Notificações não autorizadas';};
}
function subscribe(){
 if(!db()||channel)return;
 channel=db().channel('heli-pos-sales-'+window.HELI_ORG.id)
 .on('postgres_changes',{event:'INSERT',schema:'public',table:'pos_sales_events',filter:'organization_id=eq.'+window.HELI_ORG.id},payload=>{
  const row=payload.new||{};
  notifySale(row);
  if(panelOpen)loadDashboard();
 }).subscribe(s=>status(s==='SUBSCRIBED'?'Ligação em tempo real activa':'Realtime: '+s));
}
function installStyles(){
 if($('heli-live-style'))return;
 const st=document.createElement('style');st.id='heli-live-style';st.textContent=`
#heli-live-open{position:fixed;right:18px;bottom:18px;z-index:10000;background:#063b8f;color:white;border:0;border-radius:12px;padding:12px 16px;font-weight:800;box-shadow:0 8px 24px #063b8f44;cursor:pointer}
#heli-live-panel{position:fixed;z-index:10001;right:0;top:0;width:min(520px,100vw);height:100dvh;background:#f7faff;box-shadow:-16px 0 50px #102b4a33;transform:translateX(110%);transition:transform .25s;display:flex;flex-direction:column;color:#17324d}
#heli-live-panel.open{transform:translateX(0)}
#heli-live-panel header{display:flex;justify-content:space-between;align-items:center;padding:20px;background:#063b8f;color:white}
#heli-live-panel header small,#heli-live-panel small{display:block;font-size:11px;opacity:.75;margin-top:4px}
#heli-live-panel header button{font-size:28px;background:transparent;border:0;color:white}
.heli-live-body{padding:18px;overflow:auto}.heli-live-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.heli-live-cards>div,.heli-live-location,.heli-live-row{background:white;border:1px solid #dce8f5;border-radius:12px;padding:13px}
.heli-live-cards strong{display:block;font-size:20px;margin-top:8px;color:#063b8f}
.heli-live-body h3{font-size:13px;font-weight:900;margin:22px 0 10px}
.heli-live-location{display:grid;grid-template-columns:1fr auto;gap:5px;margin-bottom:7px}.heli-live-location small{grid-column:1/-1}
.heli-live-row{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:7px;font-size:12px}
.heli-live-row small{max-width:280px}.heli-live-row strong{white-space:nowrap;color:#063b8f}
.heli-live-tools{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.heli-live-tools button{background:#e6f2ff;color:#063b8f;padding:9px 11px;border-radius:9px;font-size:11px;font-weight:800}
.heli-muted{font-size:12px;color:#64748b}.heli-live-body #heli-live-status{font-size:11px;color:#64748b;margin-top:12px}
#heli-session-bar{z-index:9998!important}
`;document.head.append(st);
}
async function start(){
 if(!window.HELI_USER||!window.HELI_ORG||!db())return;
 installStyles();
 if(window.HELI_HAS_ROLE?.('owner','admin')){buildPanel();subscribe();}
 window.addEventListener('online',flushQueue);
 await flushQueue();
 if('serviceWorker'in navigator){navigator.serviceWorker.register('./service-worker.js').catch(e=>console.warn('[Heligrafes] SW não registado',e));}
}
window.HeligrafesSalesLive={enqueue,flushQueue,getPending:getQueue};
const wait=setInterval(()=>{if(window.HELI_USER&&window.HELI_ORG){clearInterval(wait);start();}},250);
})();
