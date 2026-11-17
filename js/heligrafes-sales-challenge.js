(() => {
'use strict';
const $=id=>document.getElementById(id), db=()=>window.heliSupabase;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(Number(v)||0).toLocaleString('pt-AO',{maximumFractionDigits:2})+' Kz';
let mode='month',channel=null,refreshTimer=null,loading=false,lastData=null;
function style(){if($('heli-challenge-style'))return;const s=document.createElement('style');s.id='heli-challenge-style';s.textContent=`
#heli-challenge-launch{position:fixed;left:18px;bottom:18px;z-index:9997;background:#f9bd17;color:#17324d;border:0;border-radius:13px;padding:12px 16px;font-weight:900;box-shadow:0 8px 24px #063b8f33;cursor:pointer}
#heli-challenge{position:fixed;inset:0;z-index:10003;background:#f3f7fc;color:#17324d;display:none;overflow:auto;font-family:Inter,system-ui,sans-serif}
#heli-challenge.open{display:block}#heli-challenge .hc-wrap{max-width:1180px;margin:auto;padding:clamp(12px,2vw,26px)}
#heli-challenge .hc-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:20px;border-radius:18px;color:white;background:linear-gradient(120deg,#042a68,#0755ad,#0b85c5)}
#heli-challenge .hc-head h2{font-size:22px;font-weight:900}#heli-challenge .hc-head p{font-size:11px;color:#d7eaff;margin-top:4px}
#heli-challenge button{cursor:pointer}#heli-challenge .hc-close{background:white;color:#12315c;border:0;border-radius:9px;padding:9px 13px;font-weight:900}
#heli-challenge .hc-tabs{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}#heli-challenge .hc-tabs button{padding:10px 15px;border-radius:10px;background:#e5eef9;color:#315579;font-weight:900}
#heli-challenge .hc-tabs button.active{background:#0755ad;color:white}
#heli-challenge .hc-card{background:white;border:1px solid #dce7f3;border-radius:15px;padding:15px;box-shadow:0 6px 18px #1c47710c}
#heli-challenge .hc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
#heli-challenge .hc-section{margin-top:18px}#heli-challenge h3{font-size:14px;font-weight:900;color:#123d70;margin:0 0 10px}
#heli-challenge .hc-row{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #edf2f8}
#heli-challenge .hc-row:last-child{border-bottom:0}#heli-challenge .hc-rank{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#edf5fd;color:#0755ad;font-weight:900}
#heli-challenge .hc-name{font-weight:900;font-size:12px}#heli-challenge .hc-meta{font-size:10px;color:#71849a;margin-top:3px}
#heli-challenge .hc-value{font-size:12px;font-weight:900;color:#063b8f;text-align:right}
#heli-challenge .hc-local{padding:13px;border:1px solid #e2eaf4;border-radius:12px;background:#fff}
#heli-challenge .hc-local-head{display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:900}
#heli-challenge .hc-local small{display:block;color:#71849a;font-size:10px;margin-top:6px}
#heli-challenge .hc-muted{font-size:11px;color:#71849a}
#heli-challenge .hc-winner{border:1px solid #f2d27c;background:linear-gradient(135deg,#fffdf4,#fff);padding:16px;border-radius:15px}
#heli-challenge .hc-winner strong{display:block;color:#0755ad;font-size:20px;margin-top:5px}
#heli-challenge .hc-live{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:900;color:#15803d}
#heli-challenge .hc-live:before{content:"";width:8px;height:8px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 4px #dcfce7}
#heli-challenge .hc-race-track{height:12px;background:#eaf0f7;border-radius:20px;overflow:hidden;margin-top:8px}
#heli-challenge .hc-race-fill{height:100%;width:0;border-radius:20px;background:linear-gradient(90deg,#0b55a4,#20a7df);transition:width .7s ease}
#heli-challenge .hc-race-leader .hc-race-fill{background:linear-gradient(90deg,#e6a700,#ffd75e)}
#heli-challenge .hc-race-arrow{font-size:18px;font-weight:900;min-width:28px;text-align:center}
#heli-challenge .hc-archive{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:9px}
#heli-challenge .hc-archive-item{border:1px solid #e5edf6;border-radius:12px;padding:12px;background:#fff}
@media(max-width:650px){#heli-challenge .hc-grid{grid-template-columns:1fr}#heli-challenge .hc-head h2{font-size:18px}#heli-challenge-launch{left:10px;bottom:72px}}
`;document.head.append(s);}
function rankRows(rows,isAdmin){
 if(!rows?.length)return '<p class="hc-muted">Ainda não existem vendas pagas neste período.</p>';
 const max=Math.max(1,...rows.map(r=>Number(r.progress_percent)||0));
 return rows.map((r,i)=>{
  const pos=i+1,arrow=pos===1?'🏁':pos===2?'⬆️':'➡️';
  const status=r.target_status||'Meta não definida';
  return '<div class="hc-row '+(pos===1?'hc-race-leader':'')+'"><span class="hc-rank">'+pos+'</span><div><div class="hc-name">'+esc(r.name)+'</div><div class="hc-meta">'+arrow+' '+(pos===1?'Na liderança':pos===2?'A perseguir o líder':'Na corrida')+' · '+Number(r.sales_count||0)+' venda(s) · '+esc(status)+'</div><div class="hc-race-track"><div class="hc-race-fill" style="width:'+Math.max(0,Math.min(100,Number(r.progress_percent)||0))+'%"></div></div></div><div class="hc-value">'+(isAdmin?money(r.paid)+(Number(r.target)>0?'<div class="hc-meta">Meta: '+money(r.target)+'</div>':''):'<span class="hc-race-arrow">'+arrow+'</span>')+'</div></div>';
 }).join('');
}
function winnerCard(data,isAdmin){
 const top=(data.monthly||[])[0],winner=(data.monthly_winners||[])[0];
 const current='<section class="hc-section hc-winner"><div class="hc-meta">🏆 CORRIDA DO MÊS · líder provisório</div><strong>'+(top?esc(top.name):'A corrida ainda não começou')+'</strong><div class="hc-meta">'+(top?(isAdmin?money(top.paid)+' em vendas pagas · ':'')+Number(top.sales_count||0)+' venda(s) registada(s)':'O vencedor será definido no encerramento do mês.')+'</div><p class="hc-meta">A classificação é provisória até ao fecho do último dia do mês. O vencedor é determinado pelo maior valor de vendas pagas.</p></section>';
 const previous=winner?'<section class="hc-section hc-winner"><div class="hc-meta">🥇 VENCEDOR DO ÚLTIMO MÊS FECHADO · '+esc(new Date(winner.month+'T12:00:00').toLocaleDateString('pt-AO',{month:'long',year:'numeric'}))+'</div><strong>'+esc(winner.name)+'</strong><div class="hc-meta">Parabéns pelo desempenho e pelo resultado alcançado!'+(isAdmin?' · '+money(winner.paid)+' em vendas pagas':'')+'</div></section>':'';
 return current+previous;
}
function render(data){
 const root=$('heli-challenge-content');if(!root)return;
 const isAdmin=!!data.is_admin,list=mode==='week'?data.weekly:data.monthly,locations=data.locations||[];
 root.innerHTML='<div class="hc-live">Actualização em tempo real activa</div>'+winnerCard(data,isAdmin)+
 '<section class="hc-section hc-card"><h3>🏁 Classificação '+(mode==='week'?'da semana':'do mês')+'</h3><p class="hc-muted">'+(isAdmin?'Valores de vendas pagas visíveis à administração.':'Acompanhe a posição de todos na corrida. Os valores monetários dos colegas são reservados à administração.')+'</p>'+rankRows(list,isAdmin)+'</section>'+
 '<section class="hc-section"><h3>Desafio por local de venda</h3><div class="hc-grid">'+locations.map(l=>'<div class="hc-local"><div class="hc-local-head"><span>'+esc(l.name)+'</span>'+(isAdmin?'<b>'+money(mode==='week'?l.week_paid:l.month_paid)+'</b>':'')+'</div><small>'+Number(mode==='week'?l.week_count:l.month_count||0)+' venda(s) registada(s) no período</small><small>Líder do local: '+esc((mode==='week'?l.week_leader?.name:l.month_leader?.name)||'Sem vendas')+'</small>'+(isAdmin?'<small>Despesas e saldo: '+(l.expense_data_available?money(l.month_expenses)+' despesas · saldo '+money(l.month_net):'Sem despesas registadas suficientes para calcular o saldo')+'</small>':'')+'</div>').join('')+'</div></section>'+
 '<section class="hc-section"><h3>🏆 Vencedores dos meses anteriores</h3><div class="hc-archive">'+((data.monthly_winners||[]).length?(data.monthly_winners||[]).map(w=>'<div class="hc-archive-item"><div class="hc-meta">'+esc(new Date(w.month+'T12:00:00').toLocaleDateString('pt-AO',{month:'long',year:'numeric'}))+'</div><strong>'+esc(w.name)+'</strong>'+(isAdmin?'<div class="hc-meta">'+money(w.paid)+'</div>':'')+'</div>').join(''):'<p class="hc-muted">Ainda não há meses anteriores com vendas pagas para apresentar.</p>')+'</div></section>'+
 '<p class="hc-muted" style="margin-top:14px">Os resultados consideram pagamentos sincronizados. Vendas ainda na fila offline entram na corrida depois da sincronização.</p>';
}
async function load(){if(loading||!db()||!window.HELI_ORG?.id)return;loading=true;try{const r=await db().rpc('heli_get_sales_challenge',{p_organization_id:window.HELI_ORG.id});if(r.error)throw r.error;lastData=r.data||{};render(lastData);}catch(e){const root=$('heli-challenge-content');if(root)root.innerHTML='<p class="hc-muted">Não foi possível carregar o ranking: '+esc(e.message)+'</p>';console.error('[Heligrafes] Ranking:',e);}finally{loading=false;}}
function build(){if($('heli-challenge'))return;const b=document.createElement('button');b.id='heli-challenge-launch';b.type='button';b.textContent='🏆 Ranking & Desafio';b.onclick=open;const p=document.createElement('section');p.id='heli-challenge';p.innerHTML='<div class="hc-wrap"><header class="hc-head"><div><h2>🏁 Corrida das Vendas · Heligrafes</h2><p>Classificação dinâmica semanal e mensal</p></div><button class="hc-close" id="hc-close">Fechar ✕</button></header><nav class="hc-tabs"><button data-mode="week">Esta semana</button><button class="active" data-mode="month">Este mês</button><button id="hc-refresh">Actualizar ↻</button></nav><div id="heli-challenge-content"><p class="hc-muted">A carregar corrida...</p></div></div>';document.body.append(b,p);$('hc-close').onclick=()=>$('heli-challenge').classList.remove('open');p.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{mode=x.dataset.mode;p.querySelectorAll('[data-mode]').forEach(y=>y.classList.toggle('active',y===x));if(lastData)render(lastData);else load();});$('hc-refresh').onclick=load;}
function open(){style();build();$('heli-challenge').classList.add('open');load();}
function start(){if(!window.HELI_USER||!window.HELI_ORG||!db())return;style();build();if(!channel){channel=db().channel('heli-sales-challenge-'+window.HELI_ORG.id).on('postgres_changes',{event:'*',schema:'public',table:'heli_sales_challenge_signals',filter:'organization_id=eq.'+window.HELI_ORG.id},()=>load()).subscribe();}load();if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(load,60000);}
const wait=setInterval(()=>{if(window.HELI_USER&&window.HELI_ORG&&db()){clearInterval(wait);start();}},250);
window.HeligrafesSalesChallenge={open,refresh:load};
})();