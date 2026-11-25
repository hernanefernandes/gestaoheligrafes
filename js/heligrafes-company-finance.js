(() => {
'use strict';
const $=id=>document.getElementById(id), db=()=>window.heliSupabase;
const admin=()=>!!window.HELI_USER&&!!window.HELI_HAS_ROLE?.('owner','admin');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(Number(v)||0).toLocaleString('pt-AO',{maximumFractionDigits:2})+' Kz';
let rows=[],salesRows=[],departmentRows=[],employeeNames={},ready=false,financeChannel=null;
function inject(){
 if(!$('heli-company-finance-style')){const s=document.createElement('style');s.id='heli-company-finance-style';s.textContent=
 '#company-finance .cf-card{background:#fff;border:1px solid #dce8f5;border-radius:17px;padding:17px;box-shadow:0 8px 22px #1c47710b}'+
 '#company-finance .cf-label{font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#7890aa}'+
 '#company-finance .cf-value{display:block;margin-top:8px;font-size:clamp(19px,2vw,27px);font-weight:900;color:#123c73;overflow-wrap:anywhere}'+
 '#company-finance .cf-input{width:100%;min-width:0;border:1px solid #d4e1ef;border-radius:10px;background:#fbfdff;padding:11px 12px;color:#17324d;font:600 13px inherit}'+
 '#company-finance .cf-input:focus{outline:0;border-color:#1faee5;box-shadow:0 0 0 3px #1faee51c}'+
 '#company-finance label{display:block;margin-bottom:6px;color:#36516f;font-size:11px;font-weight:900}'+
 '#company-finance .cf-btn{border-radius:10px;padding:10px 14px;font-size:11px;font-weight:900}'+
 '#company-finance .cf-primary{background:#0755ad;color:white}#company-finance .cf-muted{background:#edf4fb;color:#315579}'+
 '#company-finance .cf-table{width:100%;border-collapse:collapse;min-width:780px;font-size:12px}#company-finance .cf-table th{padding:12px;text-align:left;background:#f3f8fd;color:#67809c;font-size:10px;text-transform:uppercase}#company-finance .cf-table td{padding:12px;border-top:1px solid #edf2f8;color:#294765;vertical-align:top}'+
 '#company-finance .cf-chip{display:inline-flex;padding:5px 8px;border-radius:99px;font-size:10px;font-weight:900;background:#eaf2fb;color:#315579}#company-finance .cf-chip.paid{background:#dcfce7;color:#166534}#company-finance .cf-chip.pending{background:#fff3d6;color:#965b00}'+
 '@media(max-width:700px){#company-finance .cf-form-grid{grid-template-columns:1fr!important}#company-finance .cf-header{align-items:flex-start!important;flex-direction:column}}';
 document.head.appendChild(s);}
}
function ensurePanel(){
 if($('company-finance'))return;
 const host=document.querySelector('.workspace-scroll');if(!host)return;
 const section=document.createElement('section');section.id='company-finance';section.className='tab-content hidden no-print';
 section.innerHTML=[
 '<div class="cf-header mb-6 flex flex-wrap items-center justify-between gap-4"><div><p class="text-[10px] font-black uppercase tracking-[.2em] text-blue-600">Controlo financeiro interno · Administração</p><h2 class="mt-1 text-2xl font-black text-slate-800">🧾 Compras & Despesas</h2><p class="mt-1 text-sm text-slate-500">Registo central de facturas, aquisições, pagamentos e comprovativos.</p></div><button id="cf-refresh" class="cf-btn cf-muted">↻ ACTUALIZAR DADOS</button></div>',
 '<div id="cf-admin-metrics" class="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">',
 '<div class="cf-card"><span class="cf-label">Vendas registadas</span><strong id="cf-sales" class="cf-value">—</strong><p class="text-[10px] text-slate-400">Total mensal</p></div>',
 '<div class="cf-card"><span class="cf-label">Compras registadas</span><strong id="cf-purchases" class="cf-value">—</strong></div>',
 '<div class="cf-card"><span class="cf-label">Despesas operacionais</span><strong id="cf-expenses" class="cf-value">—</strong></div>',
 '<div class="cf-card"><span class="cf-label">Resultado simplificado</span><strong id="cf-cash-result" class="cf-value">—</strong><p class="text-[10px] text-slate-400">Vendas − compras − despesas</p></div><div class="cf-card"><span class="cf-label">Fluxo de caixa</span><strong id="cf-cash-flow" class="cf-value">—</strong><p class="text-[10px] text-slate-400">Recebimentos − pagamentos efectuados</p></div></div>',
 '<div class="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3"><div class="cf-card"><span class="cf-label">Pagamentos por banco</span><strong id="cf-bank" class="cf-value">—</strong></div><div class="cf-card"><span class="cf-label">Pagamentos em numerário</span><strong id="cf-cash" class="cf-value">—</strong></div><div class="cf-card"><span class="cf-label">Valores por pagar</span><strong id="cf-pending" class="cf-value">—</strong></div></div>',
 '<div class="grid grid-cols-1 gap-5 xl:grid-cols-5"><div class="cf-card xl:col-span-2"><h3 class="text-base font-black text-slate-800">Novo registo</h3><p class="mb-4 text-[11px] text-slate-400">Factura, compra ou saída da empresa</p>',
 '<form id="cf-form" class="space-y-3"><div class="grid cf-form-grid grid-cols-2 gap-3">',
 '<div><label>Tipo de registo</label><select id="cf-type" class="cf-input"><option value="purchase">Compra / Aquisição</option><option value="expense">Despesa operacional</option></select></div>',
 '<div><label>Classificação</label><select id="cf-class" class="cf-input"><option value="stock">Mercadoria / Stock</option><option value="operational">Operacional</option><option value="investment">Investimento</option></select></div>',
 '<div><label>Categoria</label><select id="cf-category" class="cf-input"><option>Mercadoria</option><option>Material de escritório</option><option>Equipamentos</option><option>Internet e comunicações</option><option>Energia e água</option><option>Transporte</option><option>Renda</option><option>Manutenção</option><option>Salários</option><option>Impostos e taxas</option><option>Outros</option></select></div>',
 '<div><label>Data</label><input id="cf-date" type="date" required class="cf-input"></div>',
 '<div><label>Fornecedor / Beneficiário</label><input id="cf-supplier" class="cf-input" placeholder="Nome"></div><div><label>N.º da factura</label><input id="cf-invoice" class="cf-input" placeholder="Referência"></div></div>',
 '<div><label>Descrição</label><input id="cf-description" required class="cf-input" placeholder="Descrição da compra ou despesa"></div>',
 '<div><label>Produtos / itens (produto | quantidade | custo unitário, um por linha)</label><textarea id="cf-items" rows="3" class="cf-input" placeholder="Papel A4 | 10 | 4500"></textarea></div>',
 '<div class="grid cf-form-grid grid-cols-2 gap-3"><div><label>Valor total (Kz)</label><input id="cf-total" type="number" min=".01" step=".01" required class="cf-input"></div><div><label>Valor já pago (Kz)</label><input id="cf-paid" type="number" min="0" step=".01" value="0" class="cf-input"></div>',
 '<div><label>Método de pagamento</label><select id="cf-method" class="cf-input"><option value="">Não pago / por definir</option><option value="bank_transfer">Transferência bancária</option><option value="deposit">Depósito bancário</option><option value="cash">Dinheiro em mão</option><option value="other">Outro</option></select></div><div><label>Banco / conta / carteira</label><input id="cf-account" class="cf-input" placeholder="Ex.: BAI, BFA, caixa"></div></div>',
 '<div><label>Referência do pagamento</label><input id="cf-reference" class="cf-input"></div><div><label>Link do comprovativo (opcional)</label><input id="cf-receipt" type="url" class="cf-input" placeholder="https://..."></div><div class="grid cf-form-grid grid-cols-2 gap-3"><div id="cf-location-wrap"><label>Local</label><select id="cf-location" class="cf-input"><option value="">Empresa / Geral</option></select></div><div><label>Departamento</label><select id="cf-department" class="cf-input"><option value="">Geral / sem departamento</option></select></div></div>',
 '<button class="cf-btn cf-primary w-full" type="submit">＋ REGISTAR FACTURA / DESPESA</button><p id="cf-status" class="min-h-4 text-[11px] text-slate-500" aria-live="polite"></p></form></div>',
 '<div class="cf-card xl:col-span-3"><div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 class="text-base font-black text-slate-800">Movimentos financeiros</h3><p id="cf-history-caption" class="text-[11px] text-slate-400">Histórico central da organização</p></div><div class="flex flex-wrap gap-2"><select id="cf-location-filter" class="cf-input" style="width:auto"><option value="">Geral — todos os locais</option></select><select id="cf-department-filter" class="cf-input" style="width:auto"><option value="">Todos os departamentos</option></select><input id="cf-month" type="month" class="cf-input" style="width:auto"><select id="cf-filter" class="cf-input" style="width:auto"><option value="all">Todos</option><option value="purchase">Compras</option><option value="expense">Despesas</option><option value="pending">Por pagar</option></select></div></div>',
 '<div class="mb-3 flex flex-wrap gap-2"><button id="cf-export" class="cf-btn cf-muted">⇩ EXPORTAR CSV</button><span id="cf-count" class="cf-chip">0 registos</span></div><div class="overflow-x-auto rounded-xl border border-slate-100"><table class="cf-table"><thead><tr><th>Local</th><th>Departamento</th><th>Data / Factura</th><th>Descrição / Fornecedor</th><th>Tipo</th><th>Total</th><th>Pago</th><th>Estado</th><th>Acções</th></tr></thead><tbody id="cf-rows"></tbody></table></div>',
 '<p class="mt-3 text-[10px] leading-5 text-slate-400">Compras de stock e despesas operacionais são separadas. O saldo de caixa considera valores efectivamente recebidos e pagos. Este painel é um controlo de gestão e não substitui a contabilidade oficial.</p></div></div>'
 ].join('');
 host.appendChild(section);
 const nav=$('btn-daily-tasks');
 if(nav&&!$('btn-company-finance')){const item=document.createElement('div');item.id='btn-company-finance';item.className='sidebar-link';item.innerHTML='<span class="mr-3 text-xl">🧾</span><span>Compras & Despesas</span>';item.addEventListener('click',()=>{if(!canUsePanel())return alert('A sua conta não tem local atribuído. Contacte a administração.');showTab('company-finance');void loadData();});nav.insertAdjacentElement('afterend',item);}
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1);
 $('cf-date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Luanda'}).format(now);
 $('cf-month').value=start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0');
 $('cf-form').addEventListener('submit',saveEntry);$('cf-refresh').addEventListener('click',loadData);$('cf-month').addEventListener('change',loadData);$('cf-filter').addEventListener('change',render);$('cf-location-filter').addEventListener('change',()=>{populateDepartmentControls();render();});$('cf-department-filter').addEventListener('change',render);$('cf-export').addEventListener('click',exportCsv);
 $('cf-type').addEventListener('change',()=>{if($('cf-type').value==='expense')$('cf-class').value='operational';else if($('cf-class').value==='operational')$('cf-class').value='stock';});
}
function populateLocations(){
 const locations=admin()?(window.HELI_LOCATIONS||[]):(window.HELI_ALLOWED_LOCATIONS||[]);
 const select=$('cf-location'),filter=$('cf-location-filter');if(!select||!filter)return;
 const oldSelect=select.value,oldFilter=filter.value;
 select.innerHTML='<option value="">Empresa / Geral</option>';
 filter.innerHTML='<option value="">Todos os locais</option>';
 locations.forEach(l=>{const o=document.createElement('option');o.value=l.id;o.textContent=l.name;select.appendChild(o);const f=document.createElement('option');f.value=l.id;f.textContent=l.name;filter.appendChild(f);});
 if(admin())select.value=locations.some(l=>l.id===oldSelect)?oldSelect:'';
 else select.value=window.HELI_DEFAULT_LOCATION_ID||'';
 filter.value=locations.some(l=>l.id===oldFilter)?oldFilter:'';
}
function populateDepartmentControls(){
 const form=$('cf-department'),filter=$('cf-department-filter');if(!form||!filter)return;
 const locationId=admin()?($('cf-location-filter')?.value||''):window.HELI_DEFAULT_LOCATION_ID;
 const names=new Set();
 [...departmentRows,...rows.map(x=>({department:x.department,location_id:x.location_id}))].forEach(x=>{const n=String(x.department||'').trim();if(n&&(!locationId||x.location_id===locationId))names.add(n);});
 ['Académico','T-Shirts','Tabacaria'].forEach(n=>names.add(n));
 const oldForm=form.value,oldFilter=filter.value;
 form.innerHTML='<option value="">Geral / sem departamento</option>';
 filter.innerHTML='<option value="">Todos os departamentos</option>';
 [...names].sort((a,b)=>a.localeCompare(b,'pt')).forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;form.appendChild(o);const f=document.createElement('option');f.value=n;f.textContent=n;filter.appendChild(f);});
 if([...form.options].some(o=>o.value===oldForm))form.value=oldForm;
 if([...filter.options].some(o=>o.value===oldFilter))filter.value=oldFilter;
}
function applyRoleView(){
 const staff=!admin();
 if($('cf-admin-metrics'))$('cf-admin-metrics').style.display=staff?'none':'';
 if($('cf-location-wrap'))$('cf-location-wrap').style.display=staff?'none':'';
 if($('cf-location-filter'))$('cf-location-filter').style.display=staff?'none':'';
 if($('cf-export'))$('cf-export').style.display=staff?'none':'';
 if($('cf-refresh'))$('cf-refresh').style.display=staff?'none':'';
 if($('cf-location'))$('cf-location').disabled=staff;
 if($('cf-history-caption'))$('cf-history-caption').textContent=staff?'Movimentos do seu local':'Histórico central da organização';
 const title=$('company-finance')?.querySelector('h2');
 if(title){const own=(window.HELI_ALLOWED_LOCATIONS||[]).find(l=>l.id===window.HELI_DEFAULT_LOCATION_ID);title.textContent=staff?'🧾 Compras & Despesas · '+(own?.name||'Meu local'):'🧾 Compras & Despesas';}
}
function canUsePanel(){return !!window.HELI_USER&&!!window.HELI_ORG?.id&&(admin()||!!window.HELI_DEFAULT_LOCATION_ID);}
function connectRealtime(){if(financeChannel||!db()||!window.HELI_ORG?.id)return;financeChannel=db().channel('company-finance-'+window.HELI_ORG.id).on('postgres_changes',{event:'*',schema:'public',table:'company_financial_entries',filter:'organization_id=eq.'+window.HELI_ORG.id},()=>{void loadData();}).subscribe();}
async function loadData(){
 if(!canUsePanel()||!db())return;
 $('cf-status').textContent='A actualizar dados...';
 const month=$('cf-month').value;const from=month+'-01';const d=new Date(from+'T12:00:00+01:00');d.setMonth(d.getMonth()+1);const to=d.toISOString();
 const results=await Promise.all([
 db().from('company_financial_entries').select('*').eq('organization_id',window.HELI_ORG.id).gte('incurred_at',from+'T00:00:00+01:00').lt('incurred_at',to).order('incurred_at',{ascending:false}).limit(1000),
 db().from('pos_sales_events').select('total,paid,occurred_at,category,location_id').eq('organization_id',window.HELI_ORG.id).gte('occurred_at',from+'T00:00:00+01:00').lt('occurred_at',to).neq('category','EXPENSE').limit(2000),
 db().from('heli_daily_tasks').select('department,location_id').eq('organization_id',window.HELI_ORG.id).limit(2000)
 ]);
 if(results[0].error){$('cf-status').textContent='Erro ao carregar: '+results[0].error.message;return;}
 rows=results[0].data||[];salesRows=admin()?(results[1].data||[]):[];departmentRows=results[2].data||[];populateDepartmentControls();if(admin()){const people=await db().from('user_profiles').select('user_id,full_name').eq('organization_id',window.HELI_ORG.id);employeeNames=Object.fromEntries((people.data||[]).map(p=>[p.user_id,p.full_name]));}$('cf-status').textContent='Dados sincronizados com a base central.';render();
}
function render(){
 const selectedLocation=admin()?($('cf-location-filter')?.value||''):window.HELI_DEFAULT_LOCATION_ID,selectedDepartment=$('cf-department-filter')?.value||'';
 const a=rows.filter(x=>!x.is_void&&(!selectedLocation||x.location_id===selectedLocation)&&(!selectedDepartment||x.department===selectedDepartment)),salesRowsVisible=salesRows.filter(x=>(!selectedLocation||x.location_id===selectedLocation)&&(!selectedDepartment||({'ACADEMICO':'Académico','TSHIRTS':'T-Shirts','TABACARIA':'Tabacaria'})[String(x.category||'').toUpperCase()]===selectedDepartment)),sales=salesRowsVisible.reduce((n,x)=>n+Number(x.total||0),0),purchases=a.filter(x=>x.entry_type==='purchase').reduce((n,x)=>n+Number(x.total_amount||0),0),expenses=a.filter(x=>x.cost_class==='operational').reduce((n,x)=>n+Number(x.total_amount||0),0),paid=a.reduce((n,x)=>n+Number(x.paid_amount||0),0);
 const bank=a.filter(x=>['bank_transfer','deposit'].includes(x.payment_method)).reduce((n,x)=>n+Number(x.paid_amount||0),0),cash=a.filter(x=>x.payment_method==='cash').reduce((n,x)=>n+Number(x.paid_amount||0),0),pending=a.reduce((n,x)=>n+Math.max(0,Number(x.total_amount)-Number(x.paid_amount)),0),received=salesRowsVisible.reduce((n,x)=>n+Number(x.paid||0),0);
 $('cf-sales').textContent=money(sales);$('cf-purchases').textContent=money(purchases);$('cf-expenses').textContent=money(expenses);$('cf-cash-result').textContent=money(sales-purchases-expenses);$('cf-cash-flow').textContent=money(received-paid);$('cf-bank').textContent=money(bank);$('cf-cash').textContent=money(cash);$('cf-pending').textContent=money(pending);
 const f=$('cf-filter').value,shown=a.filter(x=>f==='all'||(f==='pending'?Number(x.paid_amount)<Number(x.total_amount):x.entry_type===f));$('cf-count').textContent=shown.length+' registos';
 $('cf-rows').innerHTML=shown.length?shown.map(x=>{
 const st=Number(x.paid_amount)>=Number(x.total_amount)?'Pago':Number(x.paid_amount)>0?'Parcial':'Pendente',date=new Date(x.incurred_at).toLocaleDateString('pt-AO',{timeZone:'Africa/Luanda'});
 const loc=(window.HELI_LOCATIONS||[]).find(l=>l.id===x.location_id)?.name||'Local não identificado';
 return '<tr><td><strong>'+esc(loc)+'</strong></td><td>'+esc(x.department||'Geral')+'</td><td><strong>'+esc(date)+'</strong><br><span class="text-[10px] text-slate-400">'+esc(x.invoice_number||'Sem n.º')+'</span></td><td><strong>'+esc(x.description)+'</strong><br><span class="text-[10px] text-slate-400">'+esc(x.supplier_name||'Fornecedor não indicado')+'</span>'+(admin()?'<br><span class="text-[10px] text-slate-500">Registado por: '+esc(employeeNames[x.created_by]||'Funcionário não identificado')+'</span>':'')+(x.receipt_url?'<br><a href="'+esc(x.receipt_url)+'" target="_blank" rel="noopener" class="font-bold text-blue-600">Ver comprovativo ↗</a>':'')+'</td><td>'+esc(x.entry_type==='purchase'?'Compra':'Despesa')+'<br><span class="text-[10px] text-slate-400">'+esc(x.cost_class)+'</span></td><td class="font-black">'+money(x.total_amount)+'</td><td>'+money(x.paid_amount)+'<br><span class="text-[10px] text-slate-400">'+esc(({bank_transfer:'Banco',deposit:'Depósito',cash:'Em mão',other:'Outro'})[x.payment_method]||'Método não indicado')+(x.payment_account?' · '+esc(x.payment_account):'')+'</span></td><td><span class="cf-chip '+(st==='Pago'?'paid':'pending')+'">'+st+'</span></td><td>'+(admin()?'<button class="cf-btn cf-muted" data-pay="'+x.id+'">Pagamento</button> <button class="cf-btn cf-muted" data-void="'+x.id+'">Anular</button>':'<span class="text-[10px] text-slate-400">Registado por '+esc(x.created_by===window.HELI_USER.id?'si':'equipa do local')+'</span>')+'</td></tr>';
 }).join(''):'<tr><td colspan="9" class="py-8 text-center text-slate-400">Sem movimentos para este filtro.</td></tr>';
 $('cf-rows').querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click',()=>addPayment(b.dataset.pay)));$('cf-rows').querySelectorAll('[data-void]').forEach(b=>b.addEventListener('click',()=>voidEntry(b.dataset.void)));
}
async function saveEntry(e){
 e.preventDefault();if(!canUsePanel())return;
 const total=Number($('cf-total').value),paid=Number($('cf-paid').value||0),method=$('cf-method').value,account=$('cf-account').value.trim();if(!(total>0)||paid<0||paid>total)return alert('O valor pago deve estar entre zero e o total.');if(paid>0&&!method)return alert('Indique se o pagamento foi por banco, depósito, dinheiro em mão ou outro método.');if(paid>0&&['bank_transfer','deposit'].includes(method)&&!account)return alert('Indique o nome do banco ou da conta utilizada.');
 const items=$('cf-items').value.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{const p=x.split('|').map(y=>y.trim());return {name:p[0]||'',quantity:Number(p[1]||0),unit_cost:Number(p[2]||0)};});
 const assignedLocation=admin()?($('cf-location').value||null):window.HELI_DEFAULT_LOCATION_ID;
 if(!assignedLocation)return alert('A sua conta não tem um local atribuído. Contacte a administração.');
 const payload={organization_id:window.HELI_ORG.id,location_id:assignedLocation,department:$('cf-department').value||null,entry_type:$('cf-type').value,cost_class:$('cf-class').value,category:$('cf-category').value,supplier_name:$('cf-supplier').value.trim()||null,invoice_number:$('cf-invoice').value.trim()||null,description:$('cf-description').value.trim(),total_amount:total,paid_amount:paid,payment_method:paid?(method||null):null,payment_account:account||null,payment_reference:$('cf-reference').value.trim()||null,payment_status:paid>=total?'paid':paid>0?'partial':'pending',receipt_url:$('cf-receipt').value.trim()||null,items,incurred_at:$('cf-date').value+'T12:00:00+01:00',created_by:window.HELI_USER.id};
 $('cf-status').textContent='A guardar...';const r=await db().from('company_financial_entries').insert(payload);if(r.error){$('cf-status').textContent='Erro: '+r.error.message;return;}
 $('cf-form').reset();$('cf-date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Luanda'}).format(new Date());$('cf-paid').value='0';$('cf-status').textContent='Registo guardado.';await loadData();
}
async function addPayment(id){
 const x=rows.find(v=>v.id===id);if(!x||!admin())return;const rest=Number(x.total_amount)-Number(x.paid_amount),raw=prompt('Valor do pagamento (saldo: '+money(rest)+')');if(raw===null)return;const amount=Number(raw);if(!(amount>0)||amount>rest)return alert('Valor inválido.');
 const m=prompt('Como foi pago? Escreva: banco, depósito, dinheiro ou outro','banco');if(m===null)return;const method=({'banco':'bank_transfer','transferência':'bank_transfer','transferencia':'bank_transfer','depósito':'deposit','deposito':'deposit','dinheiro':'cash','em mão':'cash','em mao':'cash','numerário':'cash','numerario':'cash','outro':'other'})[m.trim().toLowerCase()];if(!method)return alert('Método não reconhecido.');
 const account=(method==='bank_transfer'||method==='deposit')?prompt('Qual foi o banco/conta? (ex.: BAI, BFA, Multicaixa Express)'):prompt('Identificação do caixa/beneficiário (opcional):','Caixa');if(account===null)return;const reference=prompt('Referência ou observação do pagamento (opcional):','')??'';
 const sum=Number(x.paid_amount)+amount,r=await db().from('company_financial_entries').update({paid_amount:sum,payment_method:method,payment_account:account.trim()||null,payment_reference:reference.trim()||null,payment_status:sum>=Number(x.total_amount)?'paid':'partial',updated_at:new Date().toISOString()}).eq('id',id).eq('organization_id',window.HELI_ORG.id);if(r.error)return alert(r.error.message);await loadData();
}
async function voidEntry(id){
 const reason=prompt('Motivo da anulação (o registo será mantido no histórico):');if(!reason?.trim()||!confirm('Confirmar anulação?'))return;
 const r=await db().from('company_financial_entries').update({is_void:true,void_reason:reason.trim(),updated_at:new Date().toISOString()}).eq('id',id).eq('organization_id',window.HELI_ORG.id);if(r.error)return alert(r.error.message);await loadData();
}
function exportCsv(){
 const selectedLocation=admin()?($('cf-location-filter')?.value||''):window.HELI_DEFAULT_LOCATION_ID,selectedDepartment=$('cf-department-filter')?.value||'',list=rows.filter(x=>!x.is_void&&(!selectedLocation||x.location_id===selectedLocation)&&(!selectedDepartment||x.department===selectedDepartment)),head=['Data','Local','Departamento','Tipo','Classificação','Categoria','Fornecedor','Factura','Descrição','Total','Pago','Método','Conta','Estado'];
 const all=[head,...list.map(x=>[x.incurred_at,(window.HELI_LOCATIONS||[]).find(l=>l.id===x.location_id)?.name||'',x.department||'',x.entry_type,x.cost_class,x.category,x.supplier_name,x.invoice_number,x.description,x.total_amount,x.paid_amount,x.payment_method,x.payment_account,x.payment_status])];
 const csv='\uFEFF'+all.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='heligrafes-compras-despesas.csv';a.click();URL.revokeObjectURL(url);
}
function boot(){
 inject();ensurePanel();populateLocations();applyRoleView();const nav=$('btn-company-finance');if(nav)nav.style.display=canUsePanel()?'flex':'none';
 if(canUsePanel()&&db()){connectRealtime();if(!ready){ready=true;loadData();}}
 if(!ready)setTimeout(boot,1200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();