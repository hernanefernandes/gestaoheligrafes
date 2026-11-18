/* Lista de Encomendas — Grupo Heligrafes
 * Integra-se com o array global "sales" e saveData() do sistema v52.
 */
(function () {
  'use strict';

  const STYLE_ID = 'heli-orders-style';
  const SECTION_ID = 'heli-orders';
  const NAV_ID = 'btn-encomendas';
  let activeFilter = 'TODAS';
  let searchTerm = '';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function luandaToday() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Luanda', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const part = key => parts.find(item => item.type === key)?.value || '00';
    return part('year') + '-' + part('month') + '-' + part('day');
  }

  function formatDate(value) {
    if (!value) return 'Não definida';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] : escapeHtml(value);
  }

  function getOrders() {
    if (typeof sales === 'undefined' || !Array.isArray(sales)) return [];
    return sales.filter(item => item && item.category !== 'EXPENSE' &&
      (item.category === 'TSHIRTS' || item.category === 'ACADEMICO' || item.deliveryDate));
  }

  function getStatus(order, today) {
    if (order.deliveryStatus === 'ENTREGUE' || order.deliveredAt) return 'ENTREGUE';
    if (!order.deliveryDate) return 'SEM_PRAZO';
    if (String(order.deliveryDate) < today) return 'ATRASADA';
    return 'PENDENTE';
  }

  function statusBadge(status) {
    const map = {
      ENTREGUE: ['Entregue', 'heli-order-badge delivered'],
      ATRASADA: ['Atrasada', 'heli-order-badge overdue'],
      PENDENTE: ['Pendente', 'heli-order-badge pending'],
      SEM_PRAZO: ['Sem prazo', 'heli-order-badge no-date']
    };
    const entry = map[status] || map.PENDENTE;
    return '<span class="' + entry[1] + '">' + entry[0] + '</span>';
  }

  function orderCode(order) {
    return 'GH-' + String(order.id ?? '').slice(-6).padStart(6, '0');
  }

  function render() {
    const root = document.getElementById(SECTION_ID);
    if (!root) return;
    const today = luandaToday();
    const orders = getOrders().slice().sort((a, b) =>
      String(b.createdAt || b.id || '').localeCompare(String(a.createdAt || a.id || ''))
    );
    const counts = { TODAS: orders.length, PENDENTE: 0, ATRASADA: 0, ENTREGUE: 0, SEM_PRAZO: 0 };
    orders.forEach(order => counts[getStatus(order, today)]++);

    root.querySelector('#heli-orders-total').textContent = counts.TODAS;
    root.querySelector('#heli-orders-pending').textContent = counts.PENDENTE;
    root.querySelector('#heli-orders-overdue').textContent = counts.ATRASADA;
    root.querySelector('#heli-orders-delivered').textContent = counts.ENTREGUE;

    const filtered = orders.filter(order => {
      const status = getStatus(order, today);
      const matchesFilter = activeFilter === 'TODAS' || status === activeFilter;
      const haystack = [order.client, order.phone, order.desc, orderCode(order)]
        .join(' ').toLocaleLowerCase('pt');
      return matchesFilter && haystack.includes(searchTerm.toLocaleLowerCase('pt'));
    });

    root.querySelectorAll('[data-order-filter]').forEach(button => {
      const active = button.dataset.orderFilter === activeFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const body = root.querySelector('#heli-orders-rows');
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="7" class="heli-orders-empty">📭 Nenhuma encomenda encontrada neste filtro.</td></tr>';
      return;
    }

    body.innerHTML = filtered.map(order => {
      const status = getStatus(order, today);
      const action = status === 'ENTREGUE'
        ? '<button type="button" class="heli-order-action reopen" data-order-action="reopen" data-order-id="' + escapeHtml(order.id) + '">Reabrir</button>'
        : '<button type="button" class="heli-order-action deliver" data-order-action="deliver" data-order-id="' + escapeHtml(order.id) + '">Marcar entregue</button>';
      return '<tr>' +
        '<td><strong>' + escapeHtml(orderCode(order)) + '</strong><small>' + escapeHtml(order.date || '') + '</small></td>' +
        '<td><strong>' + escapeHtml(order.client || 'Cliente não indicado') + '</strong><small>' + escapeHtml(order.phone || '') + '</small></td>' +
        '<td>' + escapeHtml(order.desc || 'Encomenda') + '<small>' + escapeHtml(order.category === 'ACADEMICO' ? 'Trabalho académico' : order.category === 'TSHIRTS' ? 'T-Shirts & brindes' : 'Serviço') + '</small></td>' +
        '<td>' + formatDate(order.deliveryDate) + '</td>' +
        '<td>' + statusBadge(status) + '</td>' +
        '<td class="heli-order-value">' + (Number(order.total) || 0).toLocaleString('pt-PT') + ' Kz</td>' +
        '<td>' + action + '</td>' +
      '</tr>';
    }).join('');
  }

  function setDeliveryStatus(id, delivered) {
    const order = getOrders().find(item => String(item.id) === String(id));
    if (!order) return;
    if (delivered) {
      if (!window.confirm('Confirmar que a encomenda ' + orderCode(order) + ' foi entregue?')) return;
      order.deliveryStatus = 'ENTREGUE';
      order.deliveredAt = new Date().toISOString();
    } else {
      if (!window.confirm('Reabrir esta encomenda e voltar a acompanhar a entrega?')) return;
      delete order.deliveryStatus;
      delete order.deliveredAt;
    }
    if (typeof saveData === 'function') saveData();
    render();
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .heli-orders-launch{position:relative;isolation:isolate;overflow:hidden;border:1px solid rgba(255,255,255,.28)!important;background:linear-gradient(105deg,#f9bd17,#f36d16 48%,#e83e8c)!important;color:#102d55!important;font-weight:1000!important;box-shadow:0 9px 24px rgba(243,109,22,.25);animation:heliOrderGlow 2.4s ease-in-out infinite}
      .heli-orders-launch:before{content:"";position:absolute;inset:-80% auto -80% -45%;width:35%;transform:rotate(22deg);background:rgba(255,255,255,.48);animation:heliOrderShine 3.4s ease-in-out infinite;z-index:-1}
      @keyframes heliOrderGlow{0%,100%{box-shadow:0 8px 20px rgba(243,109,22,.22)}50%{box-shadow:0 10px 30px rgba(232,62,140,.42)}}
      @keyframes heliOrderShine{0%,35%{left:-45%}75%,100%{left:130%}}
      .heli-orders-wrap{display:grid;gap:20px}
      .heli-orders-hero{position:relative;overflow:hidden;padding:25px;border-radius:22px;background:linear-gradient(115deg,#082e68,#0756a8 58%,#12a6c9);color:white;box-shadow:0 15px 35px rgba(7,59,134,.2)}
      .heli-orders-hero:after{content:"📦";position:absolute;right:30px;top:5px;font-size:100px;opacity:.13;transform:rotate(-12deg)}
      .heli-orders-hero h2{font-size:clamp(22px,3vw,30px);font-weight:1000;letter-spacing:-.04em}
      .heli-orders-hero p{color:#d6eaff;font-size:13px;margin-top:5px}
      .heli-orders-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .heli-orders-stat{padding:17px;border:1px solid #e0eaf5;border-radius:17px;background:white;box-shadow:0 8px 22px rgba(29,67,110,.06)}
      .heli-orders-stat span{display:block;color:#64748b;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
      .heli-orders-stat strong{display:block;margin-top:5px;font-size:30px;line-height:1.1;font-weight:1000;color:#12345b}
      .heli-orders-stat.pending strong{color:#d97706}.heli-orders-stat.overdue strong{color:#dc2626}.heli-orders-stat.delivered strong{color:#059669}
      .heli-orders-panel{padding:20px;border:1px solid #dce8f5;border-radius:20px;background:#fff;box-shadow:0 10px 25px rgba(38,71,116,.06)}
      .heli-orders-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px}
      .heli-orders-filters{display:flex;flex-wrap:wrap;gap:7px}
      .heli-orders-filter{padding:8px 12px;border:1px solid #dbe6f2;border-radius:999px;background:#f8fbff;color:#526b87;font-size:11px;font-weight:900}
      .heli-orders-filter.active{border-color:#0b55a4;background:#0b55a4;color:white;box-shadow:0 5px 12px #0b55a433}
      .heli-orders-search{min-width:min(100%,250px);padding:10px 13px;border:1px solid #d8e5f2;border-radius:11px;outline:none;font-size:12px}
      .heli-orders-search:focus{border-color:#1faee5;box-shadow:0 0 0 3px #1faee522}
      .heli-orders-table{width:100%;border-collapse:collapse;font-size:12px}
      .heli-orders-table th{padding:12px 10px;background:#f3f7fc;color:#60748d;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
      .heli-orders-table td{padding:13px 10px;border-bottom:1px solid #edf2f8;color:#344b65;vertical-align:middle}
      .heli-orders-table td strong{display:block;color:#17324d;font-weight:900}
      .heli-orders-table td small{display:block;margin-top:3px;color:#8a9bb0;font-size:10px}
      .heli-order-badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:10px;font-weight:1000;white-space:nowrap}
      .heli-order-badge.delivered{background:#dcfce7;color:#047857}.heli-order-badge.overdue{background:#fee2e2;color:#b91c1c}.heli-order-badge.pending{background:#fef3c7;color:#a16207}.heli-order-badge.no-date{background:#e2e8f0;color:#475569}
      .heli-order-value{font-weight:900;white-space:nowrap}
      .heli-order-action{padding:7px 10px;border-radius:9px;font-size:10px;font-weight:900;white-space:nowrap}
      .heli-order-action.deliver{background:#dcfce7;color:#047857}.heli-order-action.reopen{background:#e0edff;color:#0755ad}
      .heli-orders-empty{padding:36px!important;text-align:center;color:#94a3b8!important;font-weight:800}
      @media(max-width:850px){.heli-orders-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.heli-orders-panel{padding:13px}.heli-orders-table{min-width:760px}}
      @media(max-width:480px){.heli-orders-hero{padding:20px}.heli-orders-cards{gap:8px}.heli-orders-stat{padding:13px}.heli-orders-stat strong{font-size:25px}}
      @media(prefers-reduced-motion:reduce){.heli-orders-launch,.heli-orders-launch:before{animation:none}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    if (!document.body || document.getElementById(SECTION_ID)) return;
    const nav = document.querySelector('.app-sidebar nav');
    const anchor = document.getElementById('heli-admin-nav-heading');
    const workspace = document.querySelector('.workspace-scroll');
    if (!nav || !anchor || !workspace) return;

    addStyles();
    const button = document.createElement('div');
    button.id = NAV_ID;
    button.className = 'sidebar-link heli-orders-launch';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.innerHTML = '<span class="text-xl mr-3">📋</span><span>LISTA DE ENCOMENDAS</span>';
    button.addEventListener('click', () => {
      if (typeof showTab === 'function') showTab(SECTION_ID);
      render();
    });
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        button.click();
      }
    });
    nav.insertBefore(button, anchor);

    const section = document.createElement('section');
    section.id = SECTION_ID;
    section.className = 'tab-content hidden no-print';
    section.innerHTML = `
      <div class="heli-orders-wrap fade-in">
        <header class="heli-orders-hero">
          <div class="relative z-10">
            <div class="text-[10px] font-black uppercase tracking-[.2em] text-amber-200">Grupo Heligrafes · Produção</div>
            <h2>Lista de Encomendas</h2>
            <p>Acompanhe os pedidos registados, as datas previstas e as entregas em atraso.</p>
          </div>
        </header>
        <div class="heli-orders-cards">
          <article class="heli-orders-stat"><span>Total de encomendas</span><strong id="heli-orders-total">0</strong></article>
          <article class="heli-orders-stat pending"><span>Pendentes</span><strong id="heli-orders-pending">0</strong></article>
          <article class="heli-orders-stat overdue"><span>Atrasadas</span><strong id="heli-orders-overdue">0</strong></article>
          <article class="heli-orders-stat delivered"><span>Entregues</span><strong id="heli-orders-delivered">0</strong></article>
        </div>
        <div class="heli-orders-panel">
          <div class="heli-orders-toolbar">
            <div class="heli-orders-filters">
              <button type="button" class="heli-orders-filter active" data-order-filter="TODAS">Todas</button>
              <button type="button" class="heli-orders-filter" data-order-filter="PENDENTE">Pendentes</button>
              <button type="button" class="heli-orders-filter" data-order-filter="ATRASADA">Atrasadas</button>
              <button type="button" class="heli-orders-filter" data-order-filter="ENTREGUE">Entregues</button>
              <button type="button" class="heli-orders-filter" data-order-filter="SEM_PRAZO">Sem prazo</button>
            </div>
            <input id="heli-orders-search" class="heli-orders-search" type="search" placeholder="Pesquisar cliente, descrição ou código..." aria-label="Pesquisar encomendas">
          </div>
          <div class="overflow-x-auto rounded-xl border border-slate-100">
            <table class="heli-orders-table">
              <thead><tr><th>Referência / Registo</th><th>Cliente</th><th>Encomenda</th><th>Data de entrega</th><th>Situação</th><th>Valor</th><th>Acção</th></tr></thead>
              <tbody id="heli-orders-rows"></tbody>
            </table>
          </div>
          <p class="mt-3 text-[10px] text-slate-400">As encomendas são lidas dos registos existentes. O atraso é calculado pela data local de Luanda; marcar como entregue actualiza o registo.</p>
        </div>
      </div>`;
    workspace.appendChild(section);

    section.querySelectorAll('[data-order-filter]').forEach(button => {
      button.addEventListener('click', () => {
        activeFilter = button.dataset.orderFilter;
        render();
      });
    });
    section.querySelector('#heli-orders-search').addEventListener('input', event => {
      searchTerm = event.target.value.trim();
      render();
    });
    section.querySelector('#heli-orders-rows').addEventListener('click', event => {
      const button = event.target.closest('[data-order-action]');
      if (!button) return;
      setDeliveryStatus(button.dataset.orderId, button.dataset.orderAction === 'deliver');
    });
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
  window.addEventListener('storage', event => {
    if (event.key === 'multi_sales_v52') render();
  });
  window.addEventListener('focus', render);
})();