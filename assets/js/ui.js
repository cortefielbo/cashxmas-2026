// Utilidades de interfaz: creación segura de nodos, formatos, iconos y componentes comunes.
export const cfg = window.CASHXMAS_CONFIG || {};

// h('div', {class:'x', onclick: fn}, 'texto', otroNodo) — el texto siempre se inserta como texto (sin HTML).
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // solo para SVG/markup estático propio
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function mount(...nodes) {
  const main = document.getElementById('main');
  main.replaceChildren(...nodes);
  window.scrollTo(0, 0);
  return main;
}

// ------------------------------------------------------------------ formatos
const TZ = 'America/La_Paz';
export function bs(n, decimals = false) {
  const v = Number(n || 0);
  return 'Bs ' + v.toLocaleString('es-BO', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 });
}
export function num(n) { return Number(n || 0).toLocaleString('es-BO'); }
export function pct(a, b) { return b ? (100 * a / b).toLocaleString('es-BO', { maximumFractionDigits: 1 }) + ' %' : '—'; }
export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-BO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
export function fmtDate(isoDate) { // 'YYYY-MM-DD' (fecha local) -> DD/MM/YYYY
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
// Fecha local de Bolivia (YYYY-MM-DD) de un instante
export function localDay(iso) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return p; // en-CA => YYYY-MM-DD
}
export function normCode(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 1 && d.length <= 6 ? d.padStart(6, '0') : null;
}
export function parseAmount(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  // Acepta 1.250,50 / 1250,50 / 1250.50 / 1.250
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map(v => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// ------------------------------------------------------------------ iconos (SVG propios)
const I = {
  back: '<path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  ok: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  bad: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  info: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.2v.1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2"/>',
  ticket: '<path d="M4 8a2 2 0 002-2h20a2 2 0 002 2v4a3 3 0 000 6v4a2 2 0 00-2 2H6a2 2 0 00-2-2v-4a3 3 0 000-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" transform="translate(6 7)"/><path d="M19 17h12M19 22h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  stampic: '<path d="M18 9a6 6 0 016 6c0 3-2 4-2 7h-8c0-3-2-4-2-7a6 6 0 016-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" transform="translate(6 3)"/><path d="M12 29h24v5H12zM10 38h28" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
};
export function icon(name, size = 24) {
  const vb = (name === 'ticket' || name === 'stampic') ? '0 0 48 48' : '0 0 24 24';
  return h('span', { 'aria-hidden': 'true', style: 'display:inline-flex', html: `<svg viewBox="${vb}" width="${size}" height="${size}">${I[name]}</svg>` }).firstChild;
}

// ------------------------------------------------------------------ componentes
export function backLink(href = '#/', text = 'Inicio') {
  return h('a', { class: 'back', href }, icon('back', 16), text);
}

export function badge(status) { return h('span', { class: `badge ${status}` }, status); }

export function facts(rows) {
  return h('dl', { class: 'facts' }, rows.filter(Boolean).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))));
}

export function alertBox(kind, ...content) { return h('div', { class: `alert ${kind}`, role: kind === 'bad' ? 'alert' : 'status' }, ...content); }

// Imagen oficial del vale (cuerpo, sin talón). Se puede reemplazar desde config.js.
export function voucherSrc(den, mini = false) {
  const custom = (cfg.VOUCHER_IMAGES || {})[den];
  if (custom && !mini) return custom;
  return `assets/img/vale-${den}${mini ? '-mini' : ''}.jpg`;
}

// Comprobante visual: vale impreso + número en el recuadro de numeración + sello. No es un vale válido para circular.
export function voucherCard({ code, denomination, stamp = null }) {
  return h('div', { class: 'voucher', role: 'img', 'aria-label': `Vale de Bs ${denomination}, número ${code}${stamp ? ', ' + stamp.text : ''}` },
    h('img', { src: voucherSrc(denomination), alt: '', width: 1200, height: 601, decoding: 'async' }),
    h('div', { class: 'v-code', 'aria-hidden': 'true' }, code),
    stamp ? h('div', { class: 'stamp press' + (stamp.kind === 'issued' ? ' issued' : ''), 'aria-hidden': 'true' }, stamp.text, stamp.sub ? h('small', null, stamp.sub) : null) : null
  );
}

export function den(d) { return h('span', { class: `den d${d}` }, `Bs ${d}`); }

export function logo(color = 'cream', cls = 'logo') {
  return h('img', { class: cls, src: `assets/img/logo-${color}.svg`, alt: 'CashXMAS', width: 496, height: 172 });
}

export function brandsBand() {
  return h('div', { class: 'brands' }, h('img', { src: 'assets/img/marcas.png', width: 1844, height: 44,
    alt: "Pedro del Hierro, Cortefiel, Women'secret, Springfield, Colloky y Lacoste" }));
}

let toastTimer;
export function toast(msg) {
  const box = document.getElementById('toast');
  box.replaceChildren(h('div', { class: 't' }, msg));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.replaceChildren(), 4000);
}

export function busy(btn, on, label) {
  if (on) {
    btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.disabled = true;
    btn.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }), label || 'Guardando…');
  } else {
    btn.disabled = false;
    btn.replaceChildren(btn.dataset.label || label || '');
  }
}

export function storePath(store) {
  if (!store) return '';
  return [store.city, store.location].filter(Boolean).join(' / ');
}

// Selector de tienda: bloqueado para usuarios de tienda, jerárquico (ciudad > sucursal > tienda) para Marketing.
export function storePicker(state, { onChange, title }) {
  const wrap = h('div', { class: 'group' });
  if (state.me.store) {
    const s = state.me.store;
    wrap.append(h('div', { class: 'store-lock' }, icon('lock', 22),
      h('div', null, h('div', { class: 'path' }, storePath(s)), h('div', { class: 'name' }, s.name),
        h('div', { class: 'hint' }, 'Tu usuario opera en esta tienda.'))));
    queueMicrotask(() => onChange(s));
    return { node: wrap, get: () => s };
  }
  const stores = state.me.stores;
  const cities = [...new Set(stores.map(s => s.city))];
  let city = null, loc = null, selected = null;
  const citySeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Ciudad' });
  const locWrap = h('div');
  const listWrap = h('div');
  const render = () => {
    citySeg.replaceChildren(...cities.map(c => h('button', { type: 'button', 'aria-pressed': String(c === city), onclick: () => { city = c; loc = null; selected = null; onChange(null); render(); } }, c)));
    const locs = [...new Set(stores.filter(s => s.city === city).map(s => s.location).filter(Boolean))];
    locWrap.replaceChildren();
    if (city && locs.length) {
      locWrap.append(h('div', { class: 'sub-label' }, 'Sucursal'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Sucursal' },
        locs.map(l => h('button', { type: 'button', 'aria-pressed': String(l === loc), onclick: () => { loc = l; selected = null; onChange(null); render(); } }, l))));
    }
    listWrap.replaceChildren();
    const needLoc = locs.length > 0;
    if (city && (!needLoc || loc)) {
      const opts = stores.filter(s => s.city === city && (!needLoc || s.location === loc));
      listWrap.append(h('div', { class: 'sub-label' }, 'Tienda'), h('div', { class: 'store-list', role: 'radiogroup' },
        opts.map(s => h('label', null, h('input', { type: 'radio', name: 'store-pick', value: s.id, checked: selected && selected.id === s.id, onchange: () => { selected = s; onChange(s); } }), s.name))));
    }
  };
  wrap.append(h('div', { class: 'sub-label' }, title || 'Ciudad'), citySeg, locWrap, listWrap);
  render();
  return { node: wrap, get: () => selected };
}
