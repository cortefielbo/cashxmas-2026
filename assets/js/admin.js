// Panel de Marketing: indicadores, filtros, gráficos, tabla, acciones auditadas y Excel.
import { h, mount, bs, num, pct, fmtDateTime, fmtDate, localDay, icon, alertBox, busy, facts, badge, toast, den, voucherCard } from './ui.js';
import { rpc, NetworkError, SessionError } from './api.js';
import { handleFatal } from './app.js';

const C_EMIT = '#2A8A5C', C_REDEEM = '#A8121E'; // colores del KV, validados para daltonismo con el validador de paleta
const PAGE = 50;
const STATUSES = ['DISPONIBLE', 'EMITIDO', 'CANJEADO', 'ANULADO', 'BLOQUEADO', 'VENCIDO'];
const ACTIONS = {
  anular_emision_liberar: { label: 'Corregir: liberar código', help: 'Anula la emisión y el código vuelve a DISPONIBLE. Úsalo si se registró un código equivocado y el vale físico sigue sin entregar.' },
  anular_emision: { label: 'Anular emisión', help: 'El vale emitido queda ANULADO y no podrá canjearse.' },
  anular_canje: { label: 'Anular canje', help: 'El canje se anula y el vale vuelve a EMITIDO. Úsalo solo si el canje se registró por error.' },
  bloquear: { label: 'Bloquear', help: 'Suspende el vale mientras se revisa una incidencia.' },
  desbloquear: { label: 'Desbloquear', help: 'Devuelve el vale al estado que tenía antes del bloqueo.' },
  anular: { label: 'Anular código', help: 'Para vales perdidos o dañados que nunca se entregaron.' }
};
const ACTIONS_BY_STATUS = { DISPONIBLE: ['bloquear', 'anular'], EMITIDO: ['anular_emision_liberar', 'anular_emision', 'bloquear'], VENCIDO: ['anular_emision'], CANJEADO: ['anular_canje'], BLOQUEADO: ['desbloquear', 'anular'], ANULADO: [] };

export async function adminPage(state) {
  const me = state.me;
  const stores = Object.fromEntries(me.stores.map(s => [s.id, s]));
  const S = { data: null, rows: [], filtered: [], page: 0, sort: 'code', chartMode: 'day', f: blankFilters(), timer: null, drawerOpen: false };

  const root = h('div', { class: 'page wide' });
  mount(root);
  root.append(h('p', { class: 'muted' }, 'Cargando datos…'));
  await load();

  async function load(silent) {
    try {
      const d = await rpc('cx_admin_data', {}, { timeout: 30000 });
      if (!d.ok) { root.replaceChildren(alertBox('bad', d.message)); return; }
      S.data = d; buildRows(); render();
    } catch (e) {
      if (e instanceof SessionError) return handleFatal(e);
      if (silent) return;
      root.replaceChildren(alertBox('bad', h('strong', null, 'No se pudieron cargar los datos. '),
        e instanceof NetworkError ? 'Sin conexión con el servidor.' : e.message, h('div', null, h('button', { class: 'btn small', onclick: () => load() }, 'Reintentar'))));
    }
  }
  clearInterval(window.__cxTimer);
  window.__cxTimer = setInterval(() => {
    if (location.hash !== '#/panel') return clearInterval(window.__cxTimer);
    if (document.visibilityState === 'visible' && !S.drawerOpen) load(true);
  }, 60000);

  // ---------------------------------------------------------------- modelo
  function buildRows() {
    const today = me.campaign.today, test = me.campaign.test_mode;
    const em = {}, rd = {};
    for (const e of S.data.emissions) if (!e.voided_at) em[e.code] = e;
    for (const r of S.data.redemptions) if (!r.voided_at) rd[r.code] = r;
    S.rows = S.data.vouchers.map(v => ({
      code: v.code, den: v.denomination, status: v.status,
      eff: v.status === 'EMITIDO' && !test && today > me.campaign.redeem_to ? 'VENCIDO' : v.status,
      em: em[v.code] || null, rd: rd[v.code] || null, updated_at: v.updated_at
    }));
  }

  function blankFilters() { return { city: '', location: '', store: '', storeRole: 'any', den: '', status: '', emFrom: '', emTo: '', rdFrom: '', rdTo: '', q: '' }; }
  function hasFilters() { const b = blankFilters(); return Object.keys(b).some(k => S.f[k] !== b[k]); }

  function applyFilters() {
    const f = S.f, q = f.q.trim().toLowerCase(), qDigits = q.replace(/\D/g, '');
    const storeMatch = (sid) => {
      if (!sid) return false;
      const s = stores[sid]; if (!s) return false;
      if (f.store) return sid === f.store;
      if (f.location && s.location !== f.location) return false;
      if (f.city && s.city !== f.city) return false;
      return true;
    };
    const storeFilter = f.city || f.location || f.store;
    S.filtered = S.rows.filter(r => {
      if (f.den && r.den !== Number(f.den)) return false;
      if (f.status && r.eff !== f.status) return false;
      if (storeFilter) {
        const a = storeMatch(r.em?.store_id), b = storeMatch(r.rd?.store_id);
        if (f.storeRole === 'emision' ? !a : f.storeRole === 'canje' ? !b : !(a || b)) return false;
      }
      if (f.emFrom || f.emTo) { if (!r.em) return false; const d = localDay(r.em.created_at); if (f.emFrom && d < f.emFrom) return false; if (f.emTo && d > f.emTo) return false; }
      if (f.rdFrom || f.rdTo) { if (!r.rd) return false; const d = localDay(r.rd.created_at); if (f.rdFrom && d < f.rdFrom) return false; if (f.rdTo && d > f.rdTo) return false; }
      if (q) {
        const hay = [r.code, r.em && `${r.em.first_name} ${r.em.last_name}`, r.em?.ci, r.em?.phone, r.em?.email, r.em?.invoice, r.rd?.invoice, r.em?.seller, r.rd?.seller, r.em?.user, r.rd?.user].filter(Boolean).join(' ').toLowerCase();
        if (!(hay.includes(q) || (qDigits && qDigits.length >= 3 && r.code.includes(qDigits)))) return false;
      }
      return true;
    });
    if (S.sort === 'recent') {
      const last = r => Math.max(r.rd ? Date.parse(r.rd.created_at) : 0, r.em ? Date.parse(r.em.created_at) : 0, Date.parse(r.updated_at) || 0);
      S.filtered.sort((a, b) => last(b) - last(a));
    }
  }

  function kpis(rows) {
    const k = { total: rows.length, disp: 0, emit: 0, pend: 0, canj: 0, anul: 0, bloq: 0, venc: 0, vEmit: 0, vCanj: 0, vPend: 0 };
    for (const r of rows) {
      if (r.eff === 'DISPONIBLE') k.disp++;
      if (r.em) { k.emit++; k.vEmit += r.den; }
      if (r.eff === 'EMITIDO') { k.pend++; k.vPend += r.den; }
      if (r.eff === 'VENCIDO') k.venc++;
      if (r.status === 'CANJEADO') { k.canj++; k.vCanj += r.den; }
      if (r.status === 'ANULADO') k.anul++;
      if (r.status === 'BLOQUEADO') k.bloq++;
    }
    return k;
  }

  // ---------------------------------------------------------------- render
  function render() {
    applyFilters();
    const k = kpis(S.filtered);
    const filtered = hasFilters();
    root.replaceChildren(
      h('div', { class: 'panel-head' },
        h('h1', null, 'Panel de Marketing'),
        h('span', { class: 'stamp-time' }, `Datos al ${fmtDateTime(S.data.generated_at)}`),
        h('button', { class: 'btn small', onclick: () => load() }, 'Actualizar'),
        h('button', { class: 'btn small primary', onclick: () => exportXlsx(true) }, filtered ? 'Excel (con filtros)' : 'Excel'),
        filtered ? h('button', { class: 'btn small', onclick: () => exportXlsx(false) }, 'Excel (todo)') : null,
        h('a', { class: 'btn small', href: '#/' }, 'Inicio')),
      me.campaign.test_mode ? alertBox('warn', 'Modo prueba activo. Antes de empezar la campaña se borran estas operaciones con cx.go_live() (ver guía).') : null,
      filtersBar(),
      h('div', { class: 'kpi-group-title' }, filtered ? `Cantidad de vales (selección: ${num(k.total)} códigos)` : 'Cantidad de vales'),
      h('div', { class: 'kpis' },
        kpi(filtered ? 'Códigos en la selección' : 'Total del inventario', num(k.total)),
        kpi('Disponibles', num(k.disp)),
        kpi('Emitidos', num(k.emit), 'Con emisión vigente'),
        kpi('Pendientes de canje', num(k.pend), k.venc ? `${num(k.venc)} vencidos aparte` : null),
        kpi('Canjeados', num(k.canj)),
        kpi('Anulados o bloqueados', num(k.anul + k.bloq), `${num(k.anul)} anulados, ${num(k.bloq)} bloqueados`)),
      h('div', { class: 'kpi-group-title' }, 'Valor nominal (Bs)'),
      h('div', { class: 'kpis' },
        kpi('Valor emitido', bs(k.vEmit), null, true),
        kpi('Valor canjeado', bs(k.vCanj), null, true),
        kpi('Valor pendiente de canje', bs(k.vPend), null, true),
        kpi('Tasa de canje', pct(k.canj, k.emit), `Por valor: ${pct(k.vCanj, k.vEmit)}`)),
      definitions(),
      h('div', { class: 'grid2' }, activityBox(), denomBox()),
      h('div', { class: 'grid2' }, cityBox(), storeBox()),
      tableBox()
    );
  }

  function kpi(label, value, sub, money) {
    return h('div', { class: 'kpi' + (money ? ' money' : '') }, h('div', { class: 'k' }, label), h('div', { class: 'v' }, value), sub ? h('div', { class: 's' }, sub) : null);
  }

  function definitions() {
    return h('details', { class: 'defs' }, h('summary', null, 'Cómo se calcula cada indicador'),
      h('ul', null,
        h('li', null, 'Emitidos: vales con una emisión vigente (incluye los que luego se canjearon). Las emisiones anuladas no cuentan.'),
        h('li', null, 'Pendientes de canje: emitidos que todavía no se canjearon y siguen dentro de la vigencia.'),
        h('li', null, 'Valor emitido y canjeado: suma del valor impreso de cada vale (Bs 50, 100 o 150). No es el monto de las compras.'),
        h('li', null, 'Tasa de canje: canjeados ÷ emitidos, por cantidad de vales. Debajo, la misma tasa por valor.'),
        h('li', null, 'Filtro de tienda: por defecto incluye vales emitidos o canjeados en esa tienda; puedes limitarlo a emisión o a canje. Los vales disponibles no tienen tienda.'),
        h('li', null, 'Fechas en hora de Bolivia.')));
  }

  // ---------------------------------------------------------------- filtros
  function filtersBar() {
    const f = S.f;
    const sel = (key, label, options, onchange) => h('div', { class: 'field' }, h('label', { for: `f-${key}` }, label),
      h('select', { class: 'input', id: `f-${key}`, onchange: (e) => { f[key] = e.target.value; onchange && onchange(); S.page = 0; render(); } },
        options.map(([v, t]) => h('option', { value: v, selected: f[key] === v ? 'selected' : null }, t))));
    const date = (key, label) => h('div', { class: 'field' }, h('label', { for: `f-${key}` }, label),
      h('input', { class: 'input', type: 'date', id: `f-${key}`, value: f[key], onchange: (e) => { f[key] = e.target.value; S.page = 0; render(); } }));
    const all = me.stores;
    const cities = [...new Set(all.map(s => s.city))];
    const locs = [...new Set(all.filter(s => !f.city || s.city === f.city).map(s => s.location).filter(Boolean))];
    const storeOpts = all.filter(s => (!f.city || s.city === f.city) && (!f.location || s.location === f.location));
    const search = h('input', { class: 'input', id: 'f-q', type: 'search', value: f.q, placeholder: 'Código, cliente, CI, factura…' });
    let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.q = search.value; S.page = 0; render(); const n = document.getElementById('f-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); });
    return h('div', { class: 'filters', role: 'search' },
      sel('city', 'Ciudad', [['', 'Todas'], ...cities.map(c => [c, c])], () => { f.location = ''; f.store = ''; }),
      sel('location', 'Sucursal', [['', 'Todas'], ...locs.map(l => [l, l])], () => { f.store = ''; }),
      sel('store', 'Tienda', [['', 'Todas'], ...storeOpts.map(s => [s.id, s.name])]),
      sel('storeRole', 'La tienda', [['any', 'Emitió o canjeó'], ['emision', 'Emitió'], ['canje', 'Canjeó']]),
      sel('den', 'Valor', [['', 'Todos'], ...me.denominations.map(d => [String(d.amount), bs(d.amount)])]),
      sel('status', 'Estado', [['', 'Todos'], ...STATUSES.map(s => [s, s.charAt(0) + s.slice(1).toLowerCase()])]),
      date('emFrom', 'Emisión desde'), date('emTo', 'Emisión hasta'), date('rdFrom', 'Canje desde'), date('rdTo', 'Canje hasta'),
      h('div', { class: 'field search' }, h('label', { for: 'f-q' }, 'Buscar'), search),
      h('div', { class: 'f-actions' }, h('button', { class: 'btn small', type: 'button', disabled: !hasFilters(), onclick: () => { S.f = blankFilters(); S.page = 0; render(); } }, 'Limpiar filtros')));
  }

  // ---------------------------------------------------------------- gráficos
  function activityBox() {
    const ems = S.filtered.filter(r => r.em).map(r => localDay(r.em.created_at));
    const rds = S.filtered.filter(r => r.rd).map(r => localDay(r.rd.created_at));
    const box = h('div', { class: 'box chart' });
    const toggle = h('div', { class: 'seg', style: 'margin-bottom:8px' },
      [['day', 'Por día'], ['cum', 'Acumulado']].map(([m, t]) => h('button', { type: 'button', 'aria-pressed': String(S.chartMode === m), onclick: () => { S.chartMode = m; render(); } }, t)));
    box.append(h('h2', null, 'Emisiones y canjes'), h('p', { class: 'sub' }, S.chartMode === 'day' ? 'Vales por día (hora de Bolivia).' : 'Total acumulado de vales emitidos y canjeados.'), toggle);
    if (!ems.length && !rds.length) { box.append(h('div', { class: 'empty' }, 'Aún no hay emisiones ni canjes en esta selección.')); return box; }
    const all = [...ems, ...rds].sort();
    const days = dayRange(all[0], [all[all.length - 1], me.campaign.today].sort()[1]);
    const countBy = (list) => { const m = {}; list.forEach(d => (m[d] = (m[d] || 0) + 1)); return days.map(d => m[d] || 0); };
    let a = countBy(ems), b = countBy(rds);
    if (S.chartMode === 'cum') { a = cumulative(a); b = cumulative(b); }
    box.append(h('div', { class: 'legend' }, h('span', null, h('i', { style: `background:${C_EMIT}` }), 'Emisiones'), h('span', null, h('i', { style: `background:${C_REDEEM}` }), 'Canjes')));
    box.append(lineChart(days, [{ name: 'Emisiones', color: C_EMIT, values: a }, { name: 'Canjes', color: C_REDEEM, values: b }]));
    return box;
  }

  function denomBox() {
    const rows = me.denominations.map(d => {
      const rs = S.filtered.filter(r => r.den === d.amount), k = kpis(rs);
      return { d, k };
    });
    const maxE = Math.max(1, ...rows.map(x => x.k.emit));
    return h('div', { class: 'box' }, h('h2', null, 'Por valor del vale'), h('p', { class: 'sub' }, 'Cantidad de vales y valor nominal.'),
      h('div', { style: 'overflow:auto', tabindex: '0', role: 'region', 'aria-label': 'Tabla desplazable' }, h('table', { class: 't' },
        h('thead', null, h('tr', null, h('th', null, 'Valor'), h('th', { class: 'n' }, 'Códigos'), h('th', { class: 'n' }, 'Disponibles'), h('th', { class: 'n' }, 'Emitidos'), h('th', { class: 'n' }, 'Canjeados'), h('th', { class: 'n' }, 'Valor emitido'), h('th', { class: 'n' }, 'Valor canjeado'))),
        h('tbody', null, rows.map(({ d, k }) => h('tr', null,
          h('td', null, den(d.amount)), h('td', { class: 'n' }, num(k.total)), h('td', { class: 'n' }, num(k.disp)),
          h('td', { class: 'n' }, barCell(k.emit, maxE, '')), h('td', { class: 'n' }, barCell(k.canj, maxE, 'r')),
          h('td', { class: 'n' }, bs(k.vEmit)), h('td', { class: 'n' }, bs(k.vCanj))))))));
  }

  function byStore() {
    const out = Object.fromEntries(me.stores.map(s => [s.id, { s, e: 0, c: 0, ve: 0, vc: 0 }]));
    for (const r of S.filtered) {
      if (r.em && out[r.em.store_id]) { out[r.em.store_id].e++; out[r.em.store_id].ve += r.den; }
      if (r.rd && out[r.rd.store_id]) { out[r.rd.store_id].c++; out[r.rd.store_id].vc += r.den; }
    }
    return Object.values(out);
  }

  function cityBox() {
    const m = {};
    for (const x of byStore()) { const c = (m[x.s.city] ||= { e: 0, c: 0, ve: 0, vc: 0 }); c.e += x.e; c.c += x.c; c.ve += x.ve; c.vc += x.vc; }
    const max = Math.max(1, ...Object.values(m).map(v => Math.max(v.e, v.c)));
    return h('div', { class: 'box' }, h('h2', null, 'Por ciudad'), h('p', { class: 'sub' }, 'Emitidos según la tienda que entregó el vale; canjeados según la tienda que lo recibió.'),
      h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Ciudad'), h('th', { class: 'n' }, 'Emitidos'), h('th', { class: 'n' }, 'Canjeados'), h('th', { class: 'n' }, 'Valor emitido'), h('th', { class: 'n' }, 'Valor canjeado'))),
        h('tbody', null, Object.entries(m).map(([city, v]) => h('tr', null, h('td', null, city), h('td', { class: 'n' }, barCell(v.e, max, '')), h('td', { class: 'n' }, barCell(v.c, max, 'r')), h('td', { class: 'n' }, bs(v.ve)), h('td', { class: 'n' }, bs(v.vc)))))));
  }

  function storeBox() {
    const rows = byStore();
    const max = Math.max(1, ...rows.map(v => Math.max(v.e, v.c)));
    return h('div', { class: 'box' }, h('h2', null, 'Por tienda'), h('p', { class: 'sub' }, 'Un vale puede emitirse en una tienda y canjearse en otra.'),
      h('div', { style: 'overflow:auto', tabindex: '0', role: 'region', 'aria-label': 'Tabla desplazable' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Tienda'), h('th', { class: 'n' }, 'Emitidos'), h('th', { class: 'n' }, 'Canjeados'), h('th', { class: 'n' }, 'Valor emitido'), h('th', { class: 'n' }, 'Valor canjeado'))),
        h('tbody', null, rows.map(v => h('tr', null, h('td', { class: 'wrap' }, v.s.name, h('div', { class: 'muted', style: 'font-size:12px' }, [v.s.city, v.s.location].filter(Boolean).join(', '))),
          h('td', { class: 'n' }, barCell(v.e, max, '')), h('td', { class: 'n' }, barCell(v.c, max, 'r')), h('td', { class: 'n' }, bs(v.ve)), h('td', { class: 'n' }, bs(v.vc))))))));
  }

  function barCell(v, max, cls) {
    return h('div', { class: 'bar-cell' }, h('span', null, num(v)), h('i', { class: cls, style: `width:${Math.round(60 * v / max)}px`, 'aria-hidden': 'true' }));
  }

  // ---------------------------------------------------------------- tabla
  function tableBox() {
    const total = S.filtered.length, pages = Math.max(1, Math.ceil(total / PAGE));
    S.page = Math.min(S.page, pages - 1);
    const slice = S.filtered.slice(S.page * PAGE, S.page * PAGE + PAGE);
    const st = (id) => stores[id]?.name || '';
    const resp = (r) => [r.em && (r.em.seller ? `${r.em.seller} (${r.em.user})` : r.em.user), r.rd && (r.rd.seller ? `${r.rd.seller} (${r.rd.user})` : r.rd.user)].filter(Boolean).join(' / ');
    return h('div', { class: 'box' },
      h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px' },
        h('h2', { style: 'flex:1' }, 'Vales'),
        h('label', { class: 'muted', for: 'sort' }, 'Orden'),
        h('select', { class: 'input', id: 'sort', style: 'height:38px;width:auto;font-size:14px', onchange: (e) => { S.sort = e.target.value; S.page = 0; render(); } },
          h('option', { value: 'code', selected: S.sort === 'code' ? 'selected' : null }, 'Por código'),
          h('option', { value: 'recent', selected: S.sort === 'recent' ? 'selected' : null }, 'Actividad más reciente'))),
      h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tabla de vales' }, h('table', { class: 't' },
        h('thead', null, h('tr', null, ['Código', 'Valor', 'Estado', 'Cliente', 'Factura emisión', 'Tienda emisión', 'Fecha emisión', 'Tienda canje', 'Factura canje', 'Fecha canje', 'Responsable'].map(t => h('th', null, t)))),
        h('tbody', null, slice.length ? slice.map(r => h('tr', { class: 'click', tabindex: '0', onclick: () => openDrawer(r.code), onkeydown: (e) => { if (e.key === 'Enter') openDrawer(r.code); } },
          h('td', { class: 'code-cell' }, r.code), h('td', null, den(r.den)), h('td', null, badge(r.eff)),
          h('td', { class: 'wrap' }, r.em ? `${r.em.first_name} ${r.em.last_name}` : ''), h('td', null, r.em?.invoice || ''), h('td', null, st(r.em?.store_id)),
          h('td', null, r.em ? fmtDateTime(r.em.created_at) : ''), h('td', null, st(r.rd?.store_id)), h('td', null, r.rd?.invoice || ''),
          h('td', null, r.rd ? fmtDateTime(r.rd.created_at) : ''), h('td', null, resp(r))))
          : h('tr', null, h('td', { colspan: 11, class: 'muted', style: 'padding:24px;text-align:center' }, 'Ningún vale coincide con los filtros.'))))),
      h('div', { class: 'pager' }, `${num(total)} vales`, h('button', { class: 'btn small', disabled: S.page === 0, onclick: () => { S.page--; render(); } }, 'Anterior'),
        `Página ${S.page + 1} de ${pages}`, h('button', { class: 'btn small', disabled: S.page >= pages - 1, onclick: () => { S.page++; render(); } }, 'Siguiente')));
  }

  // ---------------------------------------------------------------- detalle + acciones
  function openDrawer(code) {
    const r = S.rows.find(x => x.code === code); if (!r) return;
    S.drawerOpen = true;
    const close = () => { S.drawerOpen = false; back.remove(); drawer.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    const hist = [
      ...S.data.emissions.filter(e => e.code === code).map(e => ({ at: e.created_at, t: `Emisión ${e.op} en ${stores[e.store_id]?.name}, factura ${e.invoice}, compra ${bs(e.amount, true)}${e.voided_at ? `. ANULADA el ${fmtDateTime(e.voided_at)}: ${e.void_reason}` : ''}` })),
      ...S.data.redemptions.filter(x => x.code === code).map(x => ({ at: x.created_at, t: `Canje ${x.op} en ${stores[x.store_id]?.name}, factura ${x.invoice}, compra ${bs(x.amount, true)}${x.voided_at ? `. ANULADO el ${fmtDateTime(x.voided_at)}: ${x.void_reason}` : ''}` })),
      ...S.data.audit.filter(a => a.code === code && !['EMISION', 'CANJE'].includes(a.action)).map(a => ({ at: a.at, t: `${a.action.replace(/_/g, ' ').toLowerCase()} por ${a.actor || 'sistema'}: ${a.details?.motivo || ''} (${a.details?.de || ''} a ${a.details?.a || ''})` }))
    ].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));

    const reason = h('textarea', { class: 'input', id: 'reason', placeholder: 'Motivo (obligatorio, queda en auditoría)' });
    const msg = h('div', { 'aria-live': 'polite' });
    const acts = ACTIONS_BY_STATUS[r.eff] || [];
    const drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Vale ${code}` },
      h('div', { class: 'hdr' }, h('h2', null, `Vale ${code}`), badge(r.eff), h('button', { class: 'btn small', onclick: close }, 'Cerrar')),
      voucherCard({ code, denomination: r.den, stamp: r.status === 'CANJEADO' ? { text: 'CANJEADO', sub: fmtDateTime(r.rd?.created_at) } : r.status === 'ANULADO' ? { text: 'ANULADO' } : null }),
      facts([
        ['Valor', bs(r.den)],
        r.em ? ['Cliente', `${r.em.first_name} ${r.em.last_name}`] : null,
        r.em ? ['Carnet', r.em.ci] : null,
        r.em ? ['Celular', r.em.phone] : null,
        r.em?.email ? ['Correo', r.em.email] : null,
        r.em ? ['Emisión', `${fmtDateTime(r.em.created_at)}, ${stores[r.em.store_id]?.name}`] : null,
        r.em ? ['Factura y compra', `${r.em.invoice}, ${bs(r.em.amount, true)}`] : null,
        r.em ? ['Emitió', r.em.seller ? `${r.em.seller} (${r.em.user})` : r.em.user] : null,
        r.rd ? ['Canje', `${fmtDateTime(r.rd.created_at)}, ${stores[r.rd.store_id]?.name}`] : null,
        r.rd ? ['Factura y compra de canje', `${r.rd.invoice}, ${bs(r.rd.amount, true)}`] : null,
        r.rd ? ['Canjeó', r.rd.seller ? `${r.rd.seller} (${r.rd.user})` : r.rd.user] : null
      ]),
      h('h3', null, 'Historial'),
      hist.length ? h('ul', { class: 'history' }, hist.map(x => h('li', null, h('div', { class: 'when' }, fmtDateTime(x.at)), x.t))) : h('p', { class: 'muted' }, 'Sin movimientos.'),
      acts.length ? h('div', null, h('h3', null, 'Acciones con permiso especial'),
        h('div', { class: 'field' }, h('label', { for: 'reason' }, 'Motivo'), reason),
        h('div', { style: 'display:grid;gap:10px;margin-top:10px' }, acts.map(a => h('div', null,
          h('button', { class: 'btn small' + (a.startsWith('anular') ? ' danger' : ''), type: 'button', onclick: (e) => act(a, e.currentTarget) }, ACTIONS[a].label),
          h('div', { class: 'hint', style: 'margin-top:4px' }, ACTIONS[a].help)))),
        msg) : null
    );
    async function act(action, btn) {
      msg.replaceChildren();
      if (reason.value.trim().length < 5) { msg.replaceChildren(alertBox('bad', 'Escribe el motivo (mínimo 5 caracteres).')); reason.focus(); return; }
      if (!confirm(`${ACTIONS[action].label} el vale ${code}?`)) return;
      busy(btn, true, 'Aplicando…');
      try {
        const res = await rpc('cx_admin_action', { p_code: code, p_action: action, p_reason: reason.value.trim() });
        if (!res.ok) { busy(btn, false); msg.replaceChildren(alertBox('bad', res.message)); return; }
        close(); toast(`Vale ${code}: ${res.from} a ${res.to}.`); await load();
      } catch (e) {
        busy(btn, false);
        if (e instanceof SessionError) return handleFatal(e);
        msg.replaceChildren(alertBox('bad', e instanceof NetworkError ? 'Sin conexión. Actualiza el panel para ver si la acción se aplicó.' : e.message));
      }
    }
    const back = h('div', { class: 'drawer-back', onclick: close });
    document.body.append(back, drawer);
    drawer.querySelector('button').focus();
  }

  // ---------------------------------------------------------------- Excel
  async function exportXlsx(useFilters) {
    if (!window.XLSX) await loadScript('vendor/xlsx.full.min.js');
    const rows = useFilters ? S.filtered : S.rows;
    const codes = new Set(rows.map(r => r.code));
    const st = (id) => stores[id] || {};
    const T = (v) => { const s = v === null || v === undefined ? '' : String(v); return { t: 's', v: /^[=+\-@\t\r]/.test(s) ? "'" + s : s }; }; // texto (sin fórmulas)
    const N = (v, z) => (v === null || v === undefined || v === '' ? { t: 's', v: '' } : { t: 'n', v: Number(v), z: z || '#,##0' });
    const D = (iso) => (iso ? { t: 'n', v: (Date.parse(iso) - 4 * 3600 * 1000) / 86400000 + 25569, z: 'dd/mm/yyyy hh:mm' } : { t: 's', v: '' });
    const sheet = (header, data, widths) => {
      const ws = window.XLSX.utils.aoa_to_sheet([header.map(T), ...data]);
      ws['!cols'] = widths.map(w => ({ wch: w }));
      ws['!autofilter'] = { ref: window.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: header.length - 1 } }) };
      return ws;
    };
    const inv = sheet(['Correlativo', 'Valor (Bs)', 'Estado', 'Tienda de emisión', 'Fecha de emisión', 'Tienda de canje', 'Fecha de canje', 'Última actualización'],
      rows.map(r => [T(r.code), N(r.den), T(r.eff), T(st(r.em?.store_id).name), D(r.em?.created_at), T(st(r.rd?.store_id).name), D(r.rd?.created_at), D(r.updated_at)]),
      [12, 10, 12, 32, 17, 32, 17, 17]);
    const ems = S.data.emissions.filter(e => codes.has(e.code));
    const emSheet = sheet(['Operación', 'Correlativo', 'Valor (Bs)', 'Tienda', 'Ciudad', 'Sucursal', 'Factura', 'Monto compra (Bs)', 'Nombre', 'Apellidos', 'Carnet', 'Celular', 'Correo', 'Atendido por', 'Usuario', 'Fecha y hora', 'Anulada', 'Motivo de anulación', 'Prueba'],
      ems.map(e => [T(e.op), T(e.code), N(e.denomination), T(st(e.store_id).name), T(st(e.store_id).city), T(st(e.store_id).location), T(e.invoice), N(e.amount, '#,##0.00'), T(e.first_name), T(e.last_name), T(e.ci), T(e.phone), T(e.email), T(e.seller), T(e.user), D(e.created_at), T(e.voided_at ? `Sí (${e.void_mode})` : 'No'), T(e.void_reason), T(e.is_test ? 'Sí' : 'No')]),
      [11, 12, 10, 32, 11, 12, 12, 14, 16, 18, 13, 11, 24, 16, 18, 17, 14, 28, 7]);
    const emStore = Object.fromEntries(S.data.emissions.filter(e => !e.voided_at).map(e => [e.code, e]));
    const rds = S.data.redemptions.filter(x => codes.has(x.code));
    const rdSheet = sheet(['Operación', 'Correlativo', 'Valor (Bs)', 'Tienda', 'Ciudad', 'Sucursal', 'Factura', 'Monto compra (Bs)', 'Sin otros descuentos', 'Atendido por', 'Usuario', 'Fecha y hora', 'Tienda de emisión', 'Anulado', 'Motivo de anulación', 'Prueba'],
      rds.map(x => [T(x.op), T(x.code), N(x.denomination), T(st(x.store_id).name), T(st(x.store_id).city), T(st(x.store_id).location), T(x.invoice), N(x.amount, '#,##0.00'), T(x.no_combine ? 'Confirmado' : 'No'), T(x.seller), T(x.user), D(x.created_at), T(st(emStore[x.code]?.store_id).name), T(x.voided_at ? 'Sí' : 'No'), T(x.void_reason), T(x.is_test ? 'Sí' : 'No')]),
      [11, 12, 10, 32, 11, 12, 12, 14, 16, 16, 18, 17, 32, 9, 28, 7]);
    const k = kpis(rows);
    const sum = [
      [T('CashXMAS 2026'), T(useFilters && hasFilters() ? 'Exportación con filtros' : 'Exportación completa')], [T('Generado'), D(new Date().toISOString())], [T('Datos al'), D(S.data.generated_at)], [],
      [T('Indicador'), T('Valor')],
      [T('Códigos'), N(k.total)], [T('Disponibles'), N(k.disp)], [T('Emitidos (emisión vigente)'), N(k.emit)], [T('Pendientes de canje'), N(k.pend)], [T('Vencidos'), N(k.venc)],
      [T('Canjeados'), N(k.canj)], [T('Anulados'), N(k.anul)], [T('Bloqueados'), N(k.bloq)],
      [T('Valor nominal emitido (Bs)'), N(k.vEmit)], [T('Valor nominal canjeado (Bs)'), N(k.vCanj)], [T('Valor pendiente de canje (Bs)'), N(k.vPend)],
      [T('Tasa de canje (cantidad)'), k.emit ? { t: 'n', v: k.canj / k.emit, z: '0.0%' } : T('')], [],
      [T('Tienda'), T('Ciudad'), T('Sucursal'), T('Emitidos'), T('Canjeados'), T('Valor emitido (Bs)'), T('Valor canjeado (Bs)')],
      ...(() => { const out = Object.fromEntries(me.stores.map(s => [s.id, { s, e: 0, c: 0, ve: 0, vc: 0 }])); for (const r of rows) { if (r.em && out[r.em.store_id]) { out[r.em.store_id].e++; out[r.em.store_id].ve += r.den; } if (r.rd && out[r.rd.store_id]) { out[r.rd.store_id].c++; out[r.rd.store_id].vc += r.den; } } return Object.values(out); })()
        .map(v => [T(v.s.name), T(v.s.city), T(v.s.location), N(v.e), N(v.c), N(v.ve), N(v.vc)])
    ];
    const sumWs = window.XLSX.utils.aoa_to_sheet(sum); sumWs['!cols'] = [{ wch: 34 }, { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
    const aud = S.data.audit.filter(a => !useFilters || !hasFilters() || !a.code || codes.has(a.code));
    const audWs = sheet(['Fecha y hora', 'Usuario', 'Acción', 'Correlativo', 'Tienda', 'Detalle'],
      aud.map(a => [D(a.at), T(a.actor), T(a.action), T(a.code), T(st(a.store_id).name), T(JSON.stringify(a.details))]), [17, 18, 22, 12, 30, 80]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, inv, 'Inventario');
    window.XLSX.utils.book_append_sheet(wb, emSheet, 'Emisiones');
    window.XLSX.utils.book_append_sheet(wb, rdSheet, 'Canjes');
    window.XLSX.utils.book_append_sheet(wb, sumWs, 'Resumen');
    window.XLSX.utils.book_append_sheet(wb, audWs, 'Auditoría');
    const stamp = fmtDateTime(new Date().toISOString()).replace(/[/: ,]+/g, '').replace(/^(\d{2})(\d{2})(\d{4})(\d{4})$/, '$3$2$1_$4');
    const filename = `CashXMAS2026_${stamp}${useFilters && hasFilters() ? '_filtrado' : ''}.xlsx`;
    window.XLSX.writeFile(wb, filename);
    rpc('cx_log_export', { p_scope: useFilters && hasFilters() ? 'filtrado' : 'completo', p_rows: rows.length, p_filters: S.f }).catch(() => {});
    toast(`Excel descargado: ${filename}`);
  }
}

function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('No se pudo cargar el generador de Excel.')); document.head.append(s); });
}

function dayRange(from, to) {
  const out = []; let d = new Date(from + 'T12:00:00Z'); const end = new Date(to + 'T12:00:00Z');
  while (d <= end && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
  return out;
}
function cumulative(a) { let s = 0; return a.map(v => (s += v)); }

// Gráfico de líneas SVG con cruz y tooltip al pasar el cursor/dedo.
function lineChart(days, series) {
  const W = 640, H = 230, L = 38, R = 92, T = 12, B = 28;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const step = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / step) * step || 1;
  const x = (i) => L + (days.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (days.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const ticks = [0, top / 2, top].map(v => Math.round(v));
  const every = Math.max(1, Math.ceil(days.length / 6));
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de ${series.map(s => s.name).join(' y ')} por día">`;
  for (const t of ticks) svg += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#EFE5D5"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t.toLocaleString('es-BO')}</text>`;
  days.forEach((d, i) => { if (i % every === 0 || i === days.length - 1) svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${d.slice(8, 10)}/${d.slice(5, 7)}</text>`; });
  for (const s of series) {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (days.length === 1) svg += `<circle cx="${x(0)}" cy="${y(s.values[0])}" r="4.5" fill="${s.color}" stroke="#fff" stroke-width="2"/>`;
  }
  // etiquetas directas al final (texto en tinta, punto de color al lado)
  const ends = series.map(s => ({ s, v: s.values[s.values.length - 1] })).sort((a, b) => b.v - a.v);
  let lastY = -99;
  ends.forEach(({ s, v }) => { let yy = y(v) + 4; if (yy - lastY < 14) yy = lastY + 14; lastY = yy;
    svg += `<circle cx="${W - R + 10}" cy="${yy - 4}" r="4" fill="${s.color}"/><text x="${W - R + 18}" y="${yy}" style="fill:#2B1416;font-weight:600">${s.name} ${v.toLocaleString('es-BO')}</text>`; });
  svg += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#6E5A55" stroke-dasharray="3 3" visibility="hidden"/>`;
  series.forEach((s, k) => { svg += `<circle class="hp hp${k}" r="5" fill="${s.color}" stroke="#fff" stroke-width="2" visibility="hidden"/>`; });
  svg += `<rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`;
  const wrap = h('div', { style: 'position:relative' });
  wrap.innerHTML = svg;
  const tip = h('div', { style: 'position:absolute;pointer-events:none;background:#3D070C;color:#F1E7D6;font-size:13px;padding:8px 10px;border-radius:8px;display:none;white-space:nowrap;z-index:2' });
  wrap.append(tip);
  const el = wrap.querySelector('svg'), xh = el.querySelector('.xh');
  const move = (clientX) => {
    const r = el.getBoundingClientRect(); const sx = (clientX - r.left) * W / r.width;
    const i = Math.max(0, Math.min(days.length - 1, Math.round((sx - L) / ((W - L - R) / Math.max(1, days.length - 1)))));
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
    series.forEach((s, k) => { const c = el.querySelector(`.hp${k}`); c.setAttribute('cx', x(i)); c.setAttribute('cy', y(s.values[i])); c.setAttribute('visibility', 'visible'); });
    tip.replaceChildren(h('div', { style: 'font-weight:600;margin-bottom:2px' }, fmtDate(days[i])), ...series.map(s => h('div', null, h('span', { style: `display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:6px` }), `${s.name}: ${s.values[i].toLocaleString('es-BO')}`)));
    tip.style.display = 'block';
    const px = x(i) * r.width / W; tip.style.left = Math.min(Math.max(0, px + 12), r.width - 150) + 'px'; tip.style.top = '8px';
  };
  const hide = () => { xh.setAttribute('visibility', 'hidden'); el.querySelectorAll('.hp').forEach(c => c.setAttribute('visibility', 'hidden')); tip.style.display = 'none'; };
  el.addEventListener('pointermove', (e) => move(e.clientX));
  el.addEventListener('pointerleave', hide);
  return wrap;
}
