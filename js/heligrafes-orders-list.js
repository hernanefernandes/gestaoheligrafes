(() => {
'use strict';
const $=id=>document.getElementById(id);
const isAdmin=()=>!!window.HELI_USER&&!!window.HELI_HAS_ROLE?.('owner','admin');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>(Number(value)||0).toLocaleString('pt-AO',{maximumFractionDigits:2})+' Kz';
const dateText=value=>{
 if(!value)return 'Não definida';
 const d=new Date(value.length===10?value+'T12:00:00':value);
 return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('pt-AO',{timeZone:'Africa/Luanda'});
};
let rows=[],channel=null,taskChannel=null,loading=false,ready=false;
const locationName=id=>(window.HELI_LOCATIONS||[]).find(x=>x.id===id)?.name||(window.HELI_ALLOWED_LOCATIONS||[]).find(x=>x.id===id)?.name||'Local não identificado';
function ensurePanel(){
 let root=$('heli-orders-list');
 if(root)return root;
 const host=document.querySelector('.workspace-scroll');
 if(!host)return null;
 root=document.createElement('section');
 root.id='heli-orders-list';
 root.className='tab-content hidden no-print';
 root.innerHTML=`
 <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
  <div><p class="text-[10px] font-black uppercase tracking-[.18em] text-blue-600">Gestão centralizada</p><h2 class="text-2xl font-black text-slate-800">🧾 Encomendas, vendas e dívidas</h2><p class="mt-1 text-sm text-slate-500">Registo geral de todos os tipos de venda e encomenda dos locais a que a sua conta tem acesso.</p></div>
  <button type="button" id="heli-orders-refresh" class="rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white">↻ ACTUALIZAR</button>
 </div>
 <div class="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
  <div class="rounded-2xl border border-blue-100 bg-white p-4"><p class="text-[10px] font-black uppercase text-slate-400">Encomendas</p><strong id="heli-orders-count" class="mt-1 block text-2xl font-black text-blue-800">—</strong></div>
  <div class="rounded-2xl border border-amber-100 bg-amber-50 p-4"><p class="text-[10px] font-black uppercase text-amber-600">Por pagar</p><strong id="heli-orders-debt" class="mt-1 block text-xl font-black text-amber-800">—</strong></div>
  <div class="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p class="text-[10px] font-black uppercase text-emerald-600">Valor recebido inicialmente</p><strong id="heli-orders-paid" class="mt-1 block text-xl font-black text-emerald-800">—</strong></div>
 </div>
 <section class="mb-5 rounded-2xl border border-rose-100 bg-white p-4">
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 class="font-black text-slate-800">Dívidas pendentes por cliente e local</h3><p class="text-xs text-slate-500">Agrupamento das encomendas com saldo por regularizar.</p></div><strong id="heli-orders-debt-groups-total" class="text-rose-700">—</strong></div>
  <div id="heli-orders-debt-groups" class="overflow-x-auto"><p class="text-sm text-slate-500">A calcular dívidas...</p></div>
 </section>
 <h3 class="mb-3 text-lg font-black text-slate-800">Registo de encomendas e vendas</h3>
 <div class="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
  <input id="heli-orders-search" type="search" class="big-input" placeholder="Pesquisar cliente, telefone ou descrição...">
  <select id="heli-orders-location" class="big-input"><option value="">Todos os locais disponíveis</option></select>
  <select id="heli-orders-department" class="big-input"><option value="">Todos os departamentos</option><option value="ACADEMICO">Trabalho Académico</option><option value="TSHIRTS">T-Shirts & Brindes</option></select>
  <select id="heli-orders-payment" class="big-input"><option value="">Todos os pagamentos</option><option value="PENDENTE">Por pagar</option><option value="PARCIAL">Pagamento parcial</option><option value="PAGO">Pago</option></select>
 </div>
 <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><p id="heli-orders-status" class="text-xs font-semibold text-slate-500" role="status" aria-live="polite">A preparar a lista...</p><label class="text-xs font-bold text-slate-500">Ordenar <select id="heli-orders-sort" class="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-2"><option value="delivery">Entrega mais próxima</option><option value="recent">Mais recentes</option><option value="oldest">Mais antigas</option><option value="debt">Maior dívida</option></select></label></div>
 <div id="heli-orders-results" class="grid grid-cols-1 gap-3 xl:grid-cols-2"><div class="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">A carregar encomendas...</div></div>
 <p class="mt-4 text-[10px] text-slate-400">Os valores recebidos reflectem o campo de pagamento sincronizado na venda. Se um pagamento posterior não tiver sido sincronizado na origem, o estado poderá necessitar de confirmação.</p>`;
 host.appendChild(root);
 ['heli-orders-search','heli-orders-location','heli-orders-department','heli-orders-payment','heli-orders-sort'].forEach(id=>$(id)?.addEventListener(id==='heli-orders-search'?'input':'change',render));
 $('heli-orders-refresh')?.addEventListener('click',()=>load(true));
 fillLocationFilter();
 return root;
}
function fillLocationFilter(){
 const select=$('heli-orders-location');if(!select)return;
 const current=select.value;
 const locs=window.HELI_ALLOWED_LOCATIONS||window.HELI_LOCATIONS||[];
 select.innerHTML='<option value="">Todos os locais disponíveis</option>'+locs.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.name||l.code||'Local')+'</option>').join('');
 if(locs.some(l=>l.id===current))select.value=current;
}
function statusOf(row){
 const total=Math.max(0,Number(row.total)||0),paid=Math.max(0,Number(row.paid)||0);
 if(total>0&&paid>=total)return 'PAGO';
 if(paid>0&&paid<total)return 'PARCIAL';
 if(total>0)return 'PENDENTE';
 return 'SEM_DADOS';
}
function normalizeRow(row){
 const p=row.sale_payload&&typeof row.sale_payload==='object'?row.sale_payload:{};
 const total=Number(row.total??p.total)||0,paid=Number(row.paid??p.initialPaid??p.paid)||0;
 const items=Array.isArray(p.items)?p.items:[];
 const details=items.length?items.map(item=>({name:String(item.name||item.product||item.description||'Produto'),qty:item.qty??item.quantity??1,size:item.size||item.tamanho||'',variant:item.variant||item.subtype||item.type||'',notes:item.notes||item.observation||''})):[];
 return {id:row.id,locationId:row.location_id,location:locationName(row.location_id),category:String(row.category||p.category||'').toUpperCase(),client:String(p.client||'Cliente não identificado'),phone:String(p.phone||''),description:String(p.desc||p.description||p.theme||'Descrição não informada'),details,qty:p.qty??p.quantity??'',size:String(p.size||p.tamanho||''),academicLevel:String(p.academicLevel||p.level||''),pages:String(p.pages||''),delivery:String(p.deliveryDate||''),created:row.occurred_at||p.createdAt||p.date||'',total,paid,debt:Math.max(0,total-paid),seller:String(row.seller_name||p.seller||'Não identificado')};
}
async function fetchRows(){
 const db=window.heliSupabase,org=window.HELI_ORG?.id;
 if(!db||!org)throw new Error('A sessão segura ainda não está pronta. Entre novamente e tente actualizar.');
 const all=[];let from=0,step=1000;
 while(true){
  const q=await db.from('pos_sales_events').select('id,location_id,total,paid,category,seller_name,occurred_at,sale_payload').eq('organization_id',org).order('occurred_at',{ascending:false}).range(from,from+step-1);
  if(q.error)throw q.error;
  const batch=q.data||[];all.push(...batch);
  if(batch.length<step)break;
  from+=step;
  if(from>=10000)break;
 }
 const taskQ=await db.from('heli_daily_tasks').select('id,order_reference,title,assigned_user_id,assignee_name,status,completed_at,delivery_status,delivered_at').eq('organization_id',org);
 if(taskQ.error)throw taskQ.error;
 const taskMap=new Map();(taskQ.data||[]).forEach(task=>{if(task.order_reference)taskMap.set(String(task.order_reference),task);});
 const allowed=window.HELI_ALLOWED_LOCATIONS||[];
 return all.map(normalizeRow).map(row=>({...row,workTask:taskMap.get(String(row.id))||null})).filter(x=>allowed.length===0||allowed.some(l=>l.id===x.locationId));
}
function render(){
 const target=$('heli-orders-results');if(!target)return;
 const q=String($('heli-orders-search')?.value||'').trim().toLocaleLowerCase('pt-AO');
 const loc=$('heli-orders-location')?.value||'',dep=$('heli-orders-department')?.value||'',pay=$('heli-orders-payment')?.value||'',sort=$('heli-orders-sort')?.value||'delivery';
 let filtered=rows.filter(r=>{
  const hay=[r.client,r.phone,r.description,r.location,r.seller].join(' ').toLocaleLowerCase('pt-AO');
  return (!q||hay.includes(q))&&(!loc||r.locationId===loc)&&(!dep||r.category===dep)&&(!pay||statusOf(r)===pay);
 });
 filtered.sort((a,b)=>{
  if(sort==='recent')return new Date(b.created||0)-new Date(a.created||0);
  if(sort==='oldest')return new Date(a.created||0)-new Date(b.created||0);
  if(sort==='debt')return b.debt-a.debt;
  const ad=a.delivery||'9999-12-31',bd=b.delivery||'9999-12-31';
  return ad.localeCompare(bd)||new Date(b.created||0)-new Date(a.created||0);
 });
 const totalDebt=rows.reduce((s,r)=>s+r.debt,0),totalPaid=rows.reduce((s,r)=>s+r.paid,0);
 const debtGroups=new Map();
 rows.filter(r=>r.debt>0).forEach(r=>{const key=String(r.client).trim().toLocaleLowerCase('pt-AO')+'|'+String(r.locationId);const g=debtGroups.get(key)||{client:r.client,location:r.location,debt:0,count:0,phone:r.phone};g.debt+=r.debt;g.count++;if(!g.phone)g.phone=r.phone;debtGroups.set(key,g);});
 const debtRoot=$('heli-orders-debt-groups');
 if(debtRoot)debtRoot.innerHTML=debtGroups.size?'<table class="min-w-full text-left text-xs"><thead><tr class="border-b text-[10px] uppercase text-slate-400"><th class="px-3 py-2">Cliente</th><th class="px-3 py-2">Local</th><th class="px-3 py-2">Encomendas</th><th class="px-3 py-2">Contacto</th><th class="px-3 py-2 text-right">Dívida</th></tr></thead><tbody>'+[...debtGroups.values()].sort((a,b)=>b.debt-a.debt).map(g=>'<tr class="border-b border-slate-100"><td class="px-3 py-2 font-bold">'+esc(g.client)+'</td><td class="px-3 py-2">'+esc(g.location)+'</td><td class="px-3 py-2">'+g.count+'</td><td class="px-3 py-2">'+esc(g.phone||"—")+'</td><td class="px-3 py-2 text-right font-black text-rose-700">'+money(g.debt)+'</td></tr>').join('')+'</tbody></table>':'<p class="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Não existem dívidas pendentes nos registos carregados.</p>';
 const debtTotalEl=$('heli-orders-debt-groups-total');if(debtTotalEl)debtTotalEl.textContent=money(totalDebt);
 $('heli-orders-count').textContent=String(rows.length);
 $('heli-orders-debt').textContent=money(totalDebt);
 $('heli-orders-paid').textContent=money(totalPaid);
 $('heli-orders-status').textContent=filtered.length+' de '+rows.length+' registo(s) • Actualização em '+new Date().toLocaleTimeString('pt-AO',{timeZone:'Africa/Luanda',hour:'2-digit',minute:'2-digit'});
 target.innerHTML=filtered.length?filtered.map(r=>{
  const st=statusOf(r),label=st==='PAGO'?'PAGO':st==='PARCIAL'?'PAGAMENTO PARCIAL':st==='PENDENTE'?'PAGAR':'POR CONFIRMAR';
  const badge=st==='PAGO'?'bg-emerald-100 text-emerald-800':st==='PARCIAL'?'bg-amber-100 text-amber-800':st==='PENDENTE'?'bg-rose-100 text-rose-800':'bg-slate-100 text-slate-700';
  const late=r.delivery&&r.delivery<new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Luanda'})&&st!=='PAGO';
  const work=r.workTask;
  const workLabel=!work?'SEM DISTRIBUIÇÃO':work.delivery_status==='delivered'?'ENTREGUE AO CLIENTE':work.status==='done'?'CONCLUÍDO · AGUARDA ENTREGA':'EM PRODUÇÃO';
  const workClass=work?.delivery_status==='delivered'?'bg-emerald-100 text-emerald-800':work?.status==='done'?'bg-blue-100 text-blue-800':'bg-amber-100 text-amber-800';
  const deliverButton=isAdmin()&&work?.status==='done'&&work?.delivery_status!=='delivered'?'<button type="button" data-mark-delivered="'+esc(work.id)+'" data-order-id="'+esc(r.id)+'" class="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white">FINALIZAR SERVIÇO</button>':'';
  return '<article class="rounded-2xl border '+(late?'border-rose-300 bg-rose-50/50':'border-slate-200 bg-white')+' p-4 shadow-sm"><div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0 flex-1"><div class="mb-2 flex flex-wrap items-center gap-2"><span class="rounded-full px-2 py-1 text-[10px] font-black '+(r.category==='ACADEMICO'?'bg-blue-100 text-blue-800':'bg-violet-100 text-violet-800')+'">'+(r.category==='ACADEMICO'?'🎓 ACADÉMICO':'👕 T-SHIRTS')+'</span><span class="text-[10px] font-bold text-slate-400">'+esc(r.location)+'</span>'+(late?'<span class="rounded-full bg-rose-600 px-2 py-1 text-[10px] font-black text-white">ENTREGA ATRASADA</span>':'')+'</div><h3 class="break-words text-base font-black text-slate-800">'+esc(r.client)+'</h3><p class="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">'+esc(r.description)+'</p>'+(r.details.length?'<div class="mt-2 rounded-lg border border-violet-100 bg-violet-50 p-3"><p class="mb-1 text-[10px] font-black uppercase text-violet-700">Produtos encomendados</p>'+r.details.map(item=>'<div class="py-1 text-xs text-slate-700"><b>'+esc(item.name)+'</b> · Qtd: '+esc(item.qty)+(item.size?' · Tamanho: '+esc(item.size):'')+(item.variant?' · '+esc(item.variant):'')+(item.notes?' · '+esc(item.notes):'')+'</div>').join('')+'</div>':'<div class="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">'+(r.qty!==''?'<span class="rounded bg-slate-100 px-2 py-1">Quantidade: '+esc(r.qty)+'</span>':'')+(r.size?'<span class="rounded bg-slate-100 px-2 py-1">Tamanho: '+esc(r.size)+'</span>':'')+(r.academicLevel?'<span class="rounded bg-slate-100 px-2 py-1">Nível: '+esc(r.academicLevel)+'</span>':'')+(r.pages?'<span class="rounded bg-slate-100 px-2 py-1">Páginas: '+esc(r.pages)+'</span>':'')+'</div>')+'</div><strong class="whitespace-nowrap text-lg font-black text-slate-900">'+money(r.total)+'</strong></div><div class="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4"><div><span class="block text-[9px] font-bold uppercase text-slate-400">Contacto</span><b class="break-all text-slate-700">'+(r.phone?esc(r.phone):'Sem contacto')+'</b></div><div><span class="block text-[9px] font-bold uppercase text-slate-400">Entrega</span><b class="text-slate-700">'+esc(dateText(r.delivery))+'</b></div><div><span class="block text-[9px] font-bold uppercase text-slate-400">Pago registado</span><b class="text-emerald-700">'+money(r.paid)+'</b></div><div><span class="block text-[9px] font-bold uppercase text-slate-400">Em dívida</span><b class="'+(r.debt>0?'text-rose-700':'text-emerald-700')+'">'+money(r.debt)+'</b></div></div><div class="mt-3 flex flex-wrap items-center justify-between gap-2"><span class="rounded-full px-3 py-1.5 text-[10px] font-black '+badge+'">'+label+(r.debt>0?' · '+money(r.debt):'')+'</span><span class="rounded-full px-2 py-1 text-[10px] font-black '+workClass+'">'+workLabel+'</span>'+deliverButton+'<span class="text-[10px] text-slate-400">Registado: '+esc(dateText(r.created))+' · '+esc(r.seller)+'</span></div></article>';
 }).join(''):'<div class="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Não foram encontradas encomendas com estes critérios.</div>';
 target.querySelectorAll('[data-mark-delivered]').forEach(button=>button.addEventListener('click',()=>markDelivered(button.dataset.markDelivered,button.dataset.orderId,button)));
}
async function markDelivered(taskId,orderId,button){
 if(!isAdmin())return;
 const order=rows.find(r=>String(r.id)===String(orderId));
 if(!order)return;
 if(order.debt>0){alert('Não é possível finalizar este serviço: existe uma dívida de '+money(order.debt)+'.\n\nCliente: '+order.client+'\nData do registo: '+dateText(order.created)+'\nFuncionário que atendeu: '+order.seller+'\n\nConsulte e regularize a dívida antes de confirmar a entrega.');return;}
 if(!confirm('Confirmar a entrega e finalizar o serviço?\n\nCliente: '+order.client+'\nDívida: '+money(order.debt)+'\nFuncionário: '+order.seller))return;
 button.disabled=true;button.textContent='A guardar...';
 const q=await window.heliSupabase.from('heli_daily_tasks').update({delivery_status:'delivered',delivered_at:new Date().toISOString(),delivered_by:window.HELI_USER.id}).eq('id',taskId).eq('status','done').select('id').single();
 if(q.error){button.disabled=false;button.textContent='FINALIZAR SERVIÇO';alert('Não foi possível registar a entrega: '+(q.error.message||q.error));return;}await load(false);
}
async function load(manual=false){
 if(loading)return;loading=true;
 const status=$('heli-orders-status');if(status)status.textContent='A consultar as encomendas sincronizadas...';
 try{rows=await fetchRows();fillLocationFilter();render();}
 catch(error){console.error('[Heligrafes Encomendas]',error);const target=$('heli-orders-results');if(target)target.innerHTML='<div class="col-span-full rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Não foi possível carregar as encomendas: '+esc(error.message||error)+'</div>';if(status)status.textContent='Falha ao actualizar';}
 finally{loading=false;}
}
function subscribe(){
 const db=window.heliSupabase,org=window.HELI_ORG?.id;if(!db||!org||channel)return;
 channel=db.channel('heli-orders-list-'+org).on('postgres_changes',{event:'*',schema:'public',table:'pos_sales_events',filter:'organization_id=eq.'+org},payload=>{
  const row=payload.new||payload.old||{};
  if(!row.category||['ACADEMICO','TSHIRTS'].includes(String(row.category).toUpperCase()))void load(false);
 }).subscribe();
 taskChannel=db.channel('heli-orders-task-status-'+org).on('postgres_changes',{event:'*',schema:'public',table:'heli_daily_tasks',filter:'organization_id=eq.'+org},()=>void load(false)).subscribe();
}
window.openHeliOrdersList=()=>{
 if(!isAdmin()){alert('A Lista de Encomendas está disponível exclusivamente para o administrador.');return;}
 const panel=ensurePanel();if(!panel)return;
 if(typeof showTab==='function')showTab('heli-orders-list');
 else{document.querySelectorAll('.tab-content').forEach(t=>t.classList.add('hidden'));panel.classList.remove('hidden');}
 document.querySelectorAll('.sidebar-link').forEach(x=>x.classList.remove('active'));
 $('btn-heli-orders-list')?.classList.add('active');
 document.querySelectorAll('.heli-department-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab==='heli-orders-list'));
 void load(false);
};
function init(){
 if(ready)return;ready=true;
 if(!isAdmin())return;
 ensurePanel();
 if(window.heliSupabase){subscribe();if($('heli-orders-list')&&!$('heli-orders-list').classList.contains('hidden'))void load();}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.addEventListener('heli-auth-ready',()=>{if(!isAdmin())return;ensurePanel();subscribe();if($('heli-orders-list')&&!$('heli-orders-list').classList.contains('hidden'))void load();});
})();