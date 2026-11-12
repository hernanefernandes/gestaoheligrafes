(() => {
'use strict';
const cfg=window.HELI_SUPABASE_CONFIG;
if(!cfg||!window.supabase?.createClient){console.error('[Heligrafes] Supabase SDK/config indisponível.');return;}
const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.heliSupabase=client;
const STATE_KEYS=['multi_sales_v52','multi_products_v52','multi_employees_v52','multi_attendance_v52','multi_payroll_payments_v52','multi_shift_history_v52','multi_shift_audit_logs_v52','multi_extra_cash_v52','multi_debt_payments_v52','multi_chat_messages_v52','multi_chat_deleted_v52'];
let identity=null,originalOnload=null,started=false,timer=null,saving=false,saveAgain=false;
const el=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function message(t,err=false){const n=el('heli-auth-message');if(n){n.textContent=t||'';n.style.color=err?'#b91c1c':'#475569';}}
function showLogin(t=''){
 document.documentElement.classList.add('heli-auth-lock');
 if(!el('heli-auth-root')){
  const root=document.createElement('div');root.id='heli-auth-root';
  root.innerHTML='<main class="heli-auth-card"><div class="heli-auth-mark">H</div><p class="heli-auth-eyebrow">GRUPO HELIGRAFES</p><h1>Gestão Heligrafes</h1><p class="heli-auth-subtitle">Acesso seguro à plataforma de gestão</p><form id="heli-auth-form"><label for="heli-auth-email">E-mail</label><input id="heli-auth-email" type="email" autocomplete="username" required value="hernanelimas88@gmail.com"><label for="heli-auth-password">Palavra-passe</label><input id="heli-auth-password" type="password" autocomplete="current-password" required placeholder="A tua palavra-passe"><button id="heli-auth-submit" type="submit">Entrar</button></form><button id="heli-auth-reset" class="heli-auth-link" type="button">Recuperar palavra-passe</button><p id="heli-auth-message" role="status"></p><small>Autenticação protegida pelo Supabase</small></main>';
  document.body.appendChild(root);
  el('heli-auth-form').addEventListener('submit',signIn);
  el('heli-auth-reset').addEventListener('click',resetPassword);
 }
 message(t);
}
async function loadIdentity(user){
 const p=await client.from('user_profiles').select('user_id,organization_id,full_name,is_active').eq('user_id',user.id).maybeSingle();
 if(p.error)throw p.error;if(!p.data||!p.data.is_active)throw new Error('A conta não tem perfil activo no Grupo Heligrafes.');
 const a=await client.from('user_role_assignments').select('role_id,location_id,organization_id').eq('user_id',user.id).eq('organization_id',p.data.organization_id);
 if(a.error)throw a.error;if(!a.data?.length)throw new Error('A conta ainda não tem função atribuída.');
 const ids=[...new Set(a.data.map(x=>x.role_id))];
 const r=await client.from('roles').select('id,code,name').in('id',ids);if(r.error)throw r.error;
 const o=await client.from('organizations').select('id,name,legal_name,currency_code,timezone').eq('id',p.data.organization_id).single();if(o.error)throw o.error;
 const l=await client.from('locations').select('id,code,name').eq('organization_id',p.data.organization_id).eq('is_active',true).order('code');if(l.error)throw l.error;
 identity={user:user,profile:p.data,assignments:a.data,roles:r.data||[],organization:o.data,locations:l.data||[]};
 window.HELI_USER=user;window.HELI_PROFILE=p.data;window.HELI_ORG=o.data;window.HELI_ROLES=r.data||[];window.HELI_LOCATIONS=l.data||[];
 window.HELI_HAS_ROLE=(...codes)=>identity.roles.some(role=>codes.includes(role.code));
 window.HELI_CAN_CLOUD_SYNC=()=>window.HELI_HAS_ROLE('owner','admin');
}
async function pushCloudState(keys=STATE_KEYS){
 if(!identity||!window.HELI_CAN_CLOUD_SYNC())return;
 if(saving){saveAgain=true;return;}saving=true;
 try{
  const rows=[];
  for(const key of keys){const raw=localStorage.getItem(key);if(raw===null)continue;try{rows.push({organization_id:identity.organization.id,state_key:key,snapshot:JSON.parse(raw),revision:Date.now(),updated_by:identity.user.id,updated_at:new Date().toISOString()});}catch(_){console.warn('[Heligrafes] Estado local inválido:',key);}}
  if(rows.length){const q=await client.from('app_state_snapshots').upsert(rows,{onConflict:'organization_id,state_key'});if(q.error)throw q.error;}
  setCloudStatus('Cloud sincronizada • '+new Date().toLocaleTimeString());
 }catch(err){console.error('[Heligrafes] Falha cloud:',err);setCloudStatus('Falha cloud; dados locais preservados.');}
 finally{saving=false;if(saveAgain){saveAgain=false;pushCloudState();}}
}
async function restoreCloudState(){
 if(!window.HELI_CAN_CLOUD_SYNC())return;
 const q=await client.from('app_state_snapshots').select('state_key,snapshot,updated_at').eq('organization_id',identity.organization.id);
 if(q.error)throw q.error;
 const cloud=new Map((q.data||[]).map(row=>[row.state_key,row.snapshot]));const missing=[];let changed=false;
 for(const key of STATE_KEYS){
  if(cloud.has(key)){
   const remote=JSON.stringify(cloud.get(key));
   const local=localStorage.getItem(key);
   let localNormalized=local;
   try{if(local!==null)localNormalized=JSON.stringify(JSON.parse(local));}catch(_){}
   if(localNormalized!==remote){
    if(local!==null){try{localStorage.setItem('heli_backup_before_cloud_'+key+'_'+Date.now(),local);}catch(_){}}
    localStorage.setItem(key,remote);changed=true;
   }
  }else if(localStorage.getItem(key)!==null)missing.push(key);
 }
 if(missing.length)await pushCloudState(missing);
 return changed;
}
function setCloudStatus(t){const n=el('heli-cloud-status');if(n)n.textContent=t;}
function scheduleCloudSave(){if(!identity||!window.HELI_CAN_CLOUD_SYNC())return;clearTimeout(timer);timer=setTimeout(()=>pushCloudState(),1500);}
function addSessionBar(){
 if(el('heli-session-bar'))return;
 const bar=document.createElement('div');bar.id='heli-session-bar';
 bar.innerHTML='<span class="heli-session-user">'+esc(identity.profile.full_name||identity.user.email)+'</span><span id="heli-cloud-status">Cloud ligada</span><button id="heli-signout" type="button">Terminar sessão</button>';
 document.body.appendChild(bar);
 el('heli-signout').addEventListener('click',async()=>{if(!confirm('Pretende terminar a sessão?'))return;await client.auth.signOut();window.location.reload();});
}
async function launch(user){
 if(started)return;
 try{
  await loadIdentity(user);const restored=await restoreCloudState();if(restored){window.location.reload();return;}
  ['multi_ops_github_config_v52','multi_ops_github_sha_v52','multi_chat_github_config_v52','multi_chat_github_sha_v52'].forEach(k=>localStorage.removeItem(k));
  started=true;document.documentElement.classList.remove('heli-auth-lock');el('heli-auth-root')?.remove();addSessionBar();
  if(!window.__heliStorageWrapped){
   const originalSetItem=Storage.prototype.setItem;
   const cloudKeys=new Set(STATE_KEYS);
   Storage.prototype.setItem=function(key,value){
    const result=originalSetItem.call(this,key,value);
    if(this===window.localStorage&&cloudKeys.has(String(key)))scheduleCloudSave();
    return result;
   };
   window.__heliStorageWrapped=true;
  }
  if(typeof originalOnload==='function')originalOnload.call(window,new Event('load'));
  setCloudStatus(window.HELI_CAN_CLOUD_SYNC()?'Cloud ligada • sincronização automática':'Sessão activa • acesso cloud restrito');
  if(window.HELI_CAN_CLOUD_SYNC())await pushCloudState();
 }catch(err){console.error('[Heligrafes] Erro de arranque:',err);showLogin(err.message||'Não foi possível iniciar a aplicação.');}
}
async function signIn(event){
 event.preventDefault();const btn=el('heli-auth-submit');btn.disabled=true;btn.textContent='A autenticar...';message('A validar as credenciais...');
 try{const q=await client.auth.signInWithPassword({email:el('heli-auth-email').value.trim(),password:el('heli-auth-password').value});if(q.error)throw q.error;await launch(q.data.user);}
 catch(err){message(err.message||'Falha no início de sessão.',true);}
 finally{if(btn.isConnected){btn.disabled=false;btn.textContent='Entrar';}}
}
async function resetPassword(){
 const email=el('heli-auth-email').value.trim();if(!email)return message('Introduza o seu e-mail.',true);
 message('A solicitar o link de recuperação...');
 const q=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
 message(q.error?q.error.message:'Se a conta existir, receberá um link de recuperação.');
}
async function boot(){
 showLogin('A verificar a sessão...');
 const q=await client.auth.getSession();if(q.error)return message(q.error.message,true);
 if(q.data.session?.user)await launch(q.data.session.user);else message('Introduza o e-mail e a palavra-passe para entrar.');
}
window.checkPermission=async function(text){if(!identity)return false;const ok=window.HELI_HAS_ROLE('owner','admin','manager','hr');if(!ok)alert(text||'Não tem permissão para esta operação.');return ok;};
originalOnload=window.onload;window.onload=()=>boot();
})();