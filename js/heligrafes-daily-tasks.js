(() => {
'use strict';
const $ = id => document.getElementById(id);
const db = () => window.heliSupabase;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => (Number(value)||0).toLocaleString('pt-AO',{maximumFractionDigits:2})+' Kz';
const isAdmin = () => !!window.HELI_HAS_ROLE?.('owner','admin');
const todayKey = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Luanda'}).format(new Date());
let taskChannel = null, staffRows = [], taskRows = [], todayOrders = [], selectedDate = todayKey();

function isAllowedDepartment(value){ const s=String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase(); return s.includes('ACADEM')||s.includes('TSHIRT')||s.includes('T-SHIRT'); }\nfunction getTodayOrders(){ return todayOrders.filter(x=>isAllowedDepartment(x.category)); }
async function loadTodayOrders(){
  todayOrders=[];
  if(!isAdmin()||!db()||!window.HELI_ORG?.id)return;
  const start=new Date(selectedDate+'T00:00:00+01:00');
  const end=new Date(start.getTime()+24*60*60*1000);
  const [salesQ,locationsQ]=await Promise.all([
    db().from('pos_sales_events').select('id,local_sale_id,sale_payload,total,paid,category,occurred_at,location_id,seller_name').eq('organization_id',window.HELI_ORG.id).gte('occurred_at',start.toISOString()).lt('occurred_at',end.toISOString()).order('occurred_at',{ascending:false}).limit(500),
    db().from('locations').select('id,name').eq('organization_id',window.HELI_ORG.id)
  ]);
  if(!salesQ.error){
    const locationMap=new Map((locationsQ.data||[]).map(x=>[x.id,x.name]));
    todayOrders=(salesQ.data||[]).filter(x=>x.category!=='EXPENSE').map(x=>{
      const p=x.sale_payload||{};
      const desc=String(p.desc||p.description||p.product||x.category||'Encomenda');
      const client=String(p.client||p.customer||'Cliente');
      return {id:x.id,reference:x.local_sale_id,location_id:x.location_id,desc,client,category:x.category,total:Number(x.total||0),paid:Number(x.paid||0),location_name:locationMap.get(x.location_id)||'Local'};
    });
  }
  if(!todayOrders.length){
    try{
      if(typeof sales!=='undefined'&&Array.isArray(sales)){
        const today=new Date().toLocaleDateString('pt-PT',{timeZone:'Africa/Luanda'});
        todayOrders=sales.filter(s=>s&&s.category!=='EXPENSE'&&(String(s.date||'')===today||(s.createdAt&&new Date(s.createdAt).toLocaleDateString('pt-PT',{timeZone:'Africa/Luanda'})===today))).slice().reverse();
      }
    }catch(_){}
  }
}
function ensureUi(){
  if (!$('heli-task-tab')) {
    const nav = document.querySelector('#btn-chat')?.parentElement;
    const chat = $('btn-chat');
    if (chat && ! $('btn-daily-tasks')) {
      const link = document.createElement('div');
      link.id='btn-daily-tasks'; link.className='sidebar-link';
      link.innerHTML='<span class="text-xl mr-3">📋</span><span>Trabalhos do Dia</span>';
      link.onclick=openDailyTasks;
      chat.insertAdjacentElement('afterend',link);
    }
    const host=document.querySelector('.workspace-scroll');
    if (!host) return false;
    const section=document.createElement('section');
    section.id='heli-task-tab'; section.className='tab-content hidden no-print';
    section.innerHTML='<div class="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 class="text-2xl font-black text-slate-800">📋 Trabalhos do Dia</h2><p class="text-sm text-slate-500">Tarefas distribuídas por funcionário, equipa e encomenda.</p></div><button id="heli-task-refresh" class="rounded-xl border bg-white px-4 py-2 text-sm font-bold">↻ Actualizar</button></div><div id="heli-task-employee-view"></div><div id="heli-task-admin-view" class="hidden"></div>';
    host.appendChild(section);
    $('heli-task-refresh').onclick=()=>loadTasks();
  }
  return true;
}
function openDailyTasks(){
  if(!ensureUi()) return;
  if(typeof showTab==='function') showTab('heli-task-tab');
  else { document.querySelectorAll('.tab-content').forEach(t=>t.classList.add('hidden')); $('heli-task-tab').classList.remove('hidden'); }
  $('btn-daily-tasks')?.classList.add('active');
  loadTasks();
}
window.openDailyTasks=openDailyTasks;

async function loadStaff(){
  if(!isAdmin()||!db()||!window.HELI_ORG?.id) return;
  const [profiles,assignments,roles,locations]=await Promise.all([
    db().from('user_profiles').select('user_id,full_name,email,is_active').eq('organization_id',window.HELI_ORG.id).eq('is_active',true).order('full_name'),
    db().from('user_role_assignments').select('user_id,location_id,role_id').eq('organization_id',window.HELI_ORG.id),
    db().from('roles').select('id,code,name'),
    db().from('locations').select('id,name').eq('organization_id',window.HELI_ORG.id)
  ]);
  for(const q of [profiles,assignments,roles,locations]) if(q.error) throw q.error;
  const roleMap=new Map((roles.data||[]).map(r=>[r.id,r]));
  const locationMap=new Map((locations.data||[]).map(l=>[l.id,l]));
  const assignmentMap=new Map();
  (assignments.data||[]).forEach(a=>{
    const role=roleMap.get(a.role_id);
    if(role && ['owner','admin'].includes(role.code)) return;
    if(!assignmentMap.has(a.user_id)) assignmentMap.set(a.user_id,a);
  });
  staffRows=(profiles.data||[]).filter(p=>assignmentMap.has(p.user_id)).map(p=>{
    const a=assignmentMap.get(p.user_id);
    return {...p,location_id:a.location_id||null,location_name:locationMap.get(a.location_id)?.name||'Sem local',team_name:roleMap.get(a.role_id)?.name||'Produção'};
  });
}
function renderAdminForm(){
  const root=$('heli-task-admin-view'); if(!root) return;
  const orders=getTodayOrders();
  const orderOptions=orders.map((s,i)=>'<option value="'+esc(String(s.reference || s.id || i))+'" data-title="'+esc(s.desc||s.category||'Trabalho da encomenda')+'" data-description="'+esc((s.location_name?s.location_name+' · ':'')+(s.client||'Cliente')+' · '+(s.desc||s.category||'Encomenda')+' · '+money(s.total||s.paid))+'">'+esc((s.location_name?s.location_name+' — ':'')+(s.client||'Cliente')+' — '+(s.desc||s.category||'Encomenda')+' — '+money(s.total||s.paid))+'</option>').join('');
  const staffOptions=staffRows.map(p=>'<option value="'+esc(p.user_id)+'">'+esc(p.full_name||p.email)+' · '+esc(p.location_name)+'</option>').join('');
  root.innerHTML='<div class="grid grid-cols-1 xl:grid-cols-5 gap-5"><div class="xl:col-span-2 glass-panel bg-white p-5"><h3 class="mb-4 text-lg font-black text-slate-800">Distribuir novo trabalho</h3><form id="heli-task-create-form" class="space-y-3"><label class="block text-xs font-bold text-slate-600">Encomenda de hoje (opcional)<select id="heli-task-order" class="big-input mt-1"><option value="">Trabalho geral / sem encomenda</option>'+orderOptions+'</select></label><label class="block text-xs font-bold text-slate-600">Título do trabalho<input id="heli-task-title" required maxlength="140" class="big-input mt-1" placeholder="Ex.: Imprimir e encadernar trabalho"></label><label class="block text-xs font-bold text-slate-600">Detalhes<textarea id="heli-task-description" rows="2" class="big-input mt-1" placeholder="Prazo, quantidade, acabamento..."></textarea></label><div class="grid grid-cols-2 gap-3"><label class="block text-xs font-bold text-slate-600">Departamento<select id="heli-task-department" class="big-input mt-1"><option>Académico</option><option>T-Shirts</option></select></label><label class="block text-xs font-bold text-slate-600">Equipa<input id="heli-task-team" class="big-input mt-1" maxlength="80" placeholder="Ex.: Equipa de impressão"></label></div><label class="block text-xs font-bold text-slate-600">Funcionário responsável<select id="heli-task-assignee" required class="big-input mt-1"><option value="">Seleccione o funcionário</option>'+staffOptions+'</select></label><button id="heli-task-submit" class="w-full rounded-xl bg-blue-700 px-4 py-3 font-black text-white">+ DISTRIBUIR TRABALHO</button></form><p id="heli-task-form-status" class="mt-3 text-xs text-slate-500"></p></div><div class="xl:col-span-3 glass-panel bg-white p-5"><div class="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 class="text-lg font-black text-slate-800">Trabalhos distribuídos por equipas</h3><input id="heli-task-date" type="date" value="'+esc(selectedDate)+'" class="big-input max-w-52"></div><div id="heli-task-admin-list"></div></div></div>';
  $('heli-task-order').addEventListener('change',()=>{
    const opt=$('heli-task-order').selectedOptions[0];
    const title=opt?.dataset.title||'';
    if(title&&!$('heli-task-title').value) $('heli-task-title').value=title;
  });
  $('heli-task-create-form').addEventListener('submit',createTask);
  $('heli-task-date').addEventListener('change',e=>{selectedDate=e.target.value||todayKey();loadTasks();});
}
async function createTask(event){
  event.preventDefault();
  if(!isAdmin()) return;
  const userId=$('heli-task-assignee').value, staff=staffRows.find(p=>p.user_id===userId);
  const orderSelect=$('heli-task-order'), order=orderSelect?.selectedOptions[0];
  if(!staff) return;
  const button=$('heli-task-submit');button.disabled=true;button.textContent='A distribuir...';
  const payload={
    organization_id:window.HELI_ORG.id,location_id:staff.location_id,
    task_date:selectedDate,order_reference:orderSelect.value||null,
    order_description:order?.dataset.description||null,
    department:$('heli-task-department').value,
    title:$('heli-task-title').value.trim(),
    description:$('heli-task-description').value.trim()||null,
    team_name:$('heli-task-team').value.trim()||staff.team_name||'Geral',
    assigned_user_id:staff.user_id,assignee_name:staff.full_name||staff.email,
    assigned_by:window.HELI_USER.id
  };
  try{
    const result=await db().from('heli_daily_tasks').insert(payload).select('*').single();
    if(result.error) throw result.error;
    $('heli-task-create-form').reset();$('heli-task-form-status').textContent='Trabalho distribuído e enviado ao funcionário.';
    await loadTasks();
  }catch(error){$('heli-task-form-status').textContent='Não foi possível distribuir: '+(error.message||error);}
  finally{button.disabled=false;button.textContent='+ DISTRIBUIR TRABALHO';}
}
function taskCard(task,admin=false){
  const done=task.status==='done';
  return '<article class="rounded-xl border '+(done?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-white')+' p-4 mb-3"><div class="flex flex-wrap items-start justify-between gap-2"><div><div class="mb-1 text-[10px] font-black uppercase tracking-wide text-blue-700">'+esc(task.department)+' · '+esc(task.team_name)+'</div><h4 class="font-black text-slate-800">'+esc(task.title)+'</h4><p class="mt-1 text-xs text-slate-500">'+esc(task.order_description||'Trabalho sem encomenda associada')+'</p><p class="mt-2 text-sm text-slate-600">'+esc(task.description||'Sem instruções adicionais')+'</p></div><span class="rounded-full px-3 py-1 text-xs font-black '+(done?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800')+'">'+(done?'✓ FEITO':'PENDENTE')+'</span></div><div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>'+esc(task.assignee_name)+' · '+esc(task.task_date)+'</span>'+(done?'<b class="text-emerald-700">👍 '+esc(task.completion_reaction||'Bom, concluído')+' · '+(task.completed_at?new Date(task.completed_at).toLocaleTimeString('pt-PT',{timeZone:'Africa/Luanda',hour:'2-digit',minute:'2-digit'}):'')+'</b>':(!admin?'<button data-complete="'+esc(task.id)+'" class="rounded-lg bg-emerald-600 px-4 py-2 font-black text-white">👍 BOM — CONCLUÍDO</button>':''))+'</div></article>';
}
function renderEmployee(){
  const root=$('heli-task-employee-view');if(!root)return;
  const mine=taskRows.filter(t=>t.assigned_user_id===window.HELI_USER?.id && isAllowedDepartment(t.department));
  const pending=mine.filter(t=>t.status!=='done'),done=mine.filter(t=>t.status==='done');
  root.innerHTML='<div class="mb-4 grid grid-cols-2 gap-3"><div class="rounded-2xl border border-amber-200 bg-amber-50 p-4"><small class="font-bold text-amber-700">Por fazer</small><div class="text-3xl font-black text-amber-900">'+pending.length+'</div></div><div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><small class="font-bold text-emerald-700">Concluídos</small><div class="text-3xl font-black text-emerald-900">'+done.length+'</div></div></div><h3 class="mb-3 text-lg font-black text-slate-800">Os meus trabalhos de '+esc(selectedDate)+'</h3>'+(pending.length?pending.map(t=>taskCard(t)).join(''):'<p class="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Não existem trabalhos pendentes para esta data.</p>')+'<h3 class="mb-3 mt-6 text-lg font-black text-slate-700">Trabalhos concluídos</h3>'+(done.length?done.map(t=>taskCard(t)).join(''):'<p class="text-sm text-slate-400">Ainda não concluiu tarefas nesta data.</p>');
  root.querySelectorAll('[data-complete]').forEach(btn=>btn.addEventListener('click',()=>completeTask(btn.dataset.complete,btn)));
}
function renderAdminList(){
  const root=$('heli-task-admin-list');if(!root)return;
  const groups=new Map();
  taskRows.forEach(t=>{const key=t.team_name||'Geral';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);});
  root.innerHTML=groups.size?[...groups.entries()].map(([team,rows])=>'<section class="mb-5"><div class="mb-2 flex items-center justify-between"><h4 class="font-black text-slate-800">'+esc(team)+'</h4><span class="text-xs text-slate-500">'+rows.filter(t=>t.status==='done').length+'/'+rows.length+' concluídos</span></div>'+rows.map(t=>taskCard(t,true)).join('')+'</section>').join(''):'<p class="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Ainda não foram distribuídos trabalhos para esta data.</p>';
}
async function completeTask(id,button){
  button.disabled=true;button.textContent='A guardar...';
  try{
    const result=await db().from('heli_daily_tasks').update({status:'done',completion_reaction:'Bom, concluído',completed_at:new Date().toISOString()}).eq('id',id).eq('assigned_user_id',window.HELI_USER.id).select('id').single();
    if(result.error) throw result.error;
    await loadTasks();
  }catch(error){alert('Não foi possível confirmar a conclusão: '+(error.message||error));button.disabled=false;button.textContent='👍 BOM — CONCLUÍDO';}
}
async function loadTasks(){
  if(!db()||!window.HELI_USER?.id||!window.HELI_ORG?.id)return;
  const root=$('heli-task-employee-view');if(root)root.innerHTML='<p class="p-5 text-sm text-slate-500">A carregar os seus trabalhos...</p>';
  try{
    if(isAdmin()){await loadStaff();await loadTodayOrders();renderAdminForm();}else $('heli-task-admin-view')?.classList.add('hidden');
    let query=db().from('heli_daily_tasks').select('*').eq('organization_id',window.HELI_ORG.id).eq('task_date',selectedDate).in('department',['Académico','T-Shirts']).order('task_date',{ascending:true}).order('created_at',{ascending:true});
    const result=await query;
    if(result.error) throw result.error;
    taskRows=result.data||[];
    renderEmployee();
    if(isAdmin()){ $('heli-task-admin-view').classList.remove('hidden');renderAdminList(); }
  }catch(error){if(root)root.innerHTML='<p class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Falha ao carregar trabalhos. Confirme se a migração heli_daily_tasks foi executada no Supabase. '+esc(error.message||error)+'</p>';}
}
function subscribe(){
  if(taskChannel||!db()||!window.HELI_ORG?.id)return;
  taskChannel=db().channel('heli-daily-tasks-'+window.HELI_ORG.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'heli_daily_tasks',filter:'organization_id=eq.'+window.HELI_ORG.id},payload=>{
      if(isAdmin()&&payload.eventType==='UPDATE'&&payload.new?.status==='done'){
        const who=payload.new.assignee_name||'Funcionário';
        showNotice('Tarefa concluída',who+' marcou "'+payload.new.title+'" como feita.');
      }
      if($('heli-task-tab')&&!$('heli-task-tab').classList.contains('hidden'))loadTasks();
    }).subscribe();
}
function showNotice(title,message){
  let box=$('heli-task-notice');
  if(!box){box=document.createElement('div');box.id='heli-task-notice';box.style.cssText='position:fixed;z-index:99999;right:20px;top:20px;max-width:360px;padding:14px 18px;border-radius:14px;background:#0b376f;color:#fff;box-shadow:0 12px 30px #0003;font:600 13px system-ui';document.body.appendChild(box);}
  box.innerHTML='<b>'+esc(title)+'</b><div style="margin-top:4px;font-weight:400">'+esc(message)+'</div>';
  box.hidden=false;setTimeout(()=>{box.hidden=true;},7000);
}
function boot(){
  if(!window.HELI_USER?.id||!window.HELI_ORG?.id){return false;}
  ensureUi();subscribe();return true;
}
const bootTimer=setInterval(()=>{if(boot()){clearInterval(bootTimer);}},700);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&$('heli-task-tab')&&!$('heli-task-tab').classList.contains('hidden'))loadTasks();});
})();