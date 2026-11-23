// CashXMAS 2026 · arranque, sesión, inicio y navegación
import { h, mount, icon, fmtDate, bs, alertBox, busy, logo, brandsBand, voucherSrc } from './ui.js';
import { sb, rpc, signIn, signOut, configured, NetworkError, SessionError } from './api.js';
import { emissionPage } from './emit.js';
import { redeemPage } from './redeem.js';

export const state = { me: null };

async function loadMe() {
  const me = await rpc('cx_me');
  if (!me || !me.ok) throw new Error(me?.message || 'Usuario no habilitado.');
  state.me = me;
  return me;
}

function renderChrome() {
  const me = state.me;
  const bar = document.getElementById('topbar');
  const ribbon = document.getElementById('ribbon');
  if (!me) { bar.hidden = true; ribbon.hidden = true; return; }
  ribbon.hidden = !me.campaign.test_mode;
  ribbon.textContent = 'Modo prueba: estas operaciones se borrarán antes de empezar la campaña.';
  const who = me.store
    ? h('div', { class: 'who' }, h('strong', null, me.store.name), h('span', null, [me.store.city, me.store.location].filter(Boolean).join(', ')))
    : h('div', { class: 'who' }, h('strong', null, 'Marketing'), h('span', null, 'Todas las tiendas'));
  bar.replaceChildren(
    h('a', { class: 'brand', href: '#/', 'aria-label': 'Inicio' }, logo('cream')),
    who,
    h('button', { type: 'button', onclick: async () => { await signOut(); state.me = null; location.hash = '#/'; boot(); } }, 'Salir')
  );
  bar.hidden = false;
}

// ------------------------------------------------------------------ login
function loginPage(message) {
  renderChrome();
  const err = h('p', { class: 'err', role: 'alert' }, message || '');
  const user = h('input', { class: 'input', id: 'u', name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const pass = h('input', { class: 'input', id: 'p', name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn danger block', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'ticket', novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault();
      err.textContent = '';
      if (!user.value.trim() || !pass.value) { err.textContent = 'Escribe tu usuario y contraseña.'; return; }
      busy(btn, true, 'Entrando…');
      try {
        await signIn(user.value, pass.value);
        await loadMe();
        route();
      } catch (e) {
        busy(btn, false);
        err.textContent = e instanceof NetworkError ? 'Sin conexión con el servidor. Revisa internet e inténtalo de nuevo.' : e.message;
        if (!(e instanceof NetworkError)) await signOut();
      }
    } },
    h('img', { class: 'seal', src: 'assets/img/sello-crema.png', alt: '', width: 76, height: 76 }),
    h('h2', null, 'Portal de vales'),
    h('p', { class: 'lead' }, 'Entra con el usuario de tu tienda.'),
    h('div', { class: 'field' }, h('label', { for: 'u' }, 'Usuario'), user, h('span', { class: 'hint' }, 'Ejemplo: cortefiel-lb')),
    h('div', { class: 'field', style: 'margin-top:14px' }, h('label', { for: 'p' }, 'Contraseña'), pass),
    h('div', { style: 'margin-top:12px' }, err),
    h('div', { style: 'margin-top:8px' }, btn)
  );
  mount(h('div', { class: 'login' },
    h('div', { class: 'center' }, h('div', { class: 'login-col' },
      h('div', { class: 'kicker' }, 'Navidad 2026'),
      h('h1', { class: 'sr' }, 'CashXMAS 2026'),
      logo('cream'),
      h('p', { class: 'tagline' }, 'La Navidad que te recompensa'),
      form)),
    brandsBand()));
  user.focus();
}

// ------------------------------------------------------------------ inicio
function homePage() {
  const { campaign, denominations, user } = state.me;
  const minEmit = Math.min(...denominations.map(d => Number(d.emit_min)));
  const range = (d) => d.emit_max ? `${bs(d.emit_min)} a ${bs(Number(d.emit_max) - 1)}` : `${bs(d.emit_min)} o más`;
  mount(h('div', null,
    h('section', { class: 'hero stripes' },
      h('div', { class: 'brandblock' },
        h('div', { class: 'kicker' }, 'Navidad 2026'),
        h('h1', { class: 'sr' }, 'CashXMAS 2026'),
        logo('cream'),
        h('p', { class: 'tagline' }, 'La Navidad que te recompensa')),
      h('div', { class: 'ticket', role: 'img', 'aria-label': 'Te regalamos Bs 50, Bs 100 o Bs 150 en vales de descuento' },
        h('div', { class: 't1' }, 'TE REGALAMOS'),
        h('div', { class: 'vals' }, denominations.map(d => h('span', null, h('i', null, 'Bs.'), String(d.amount)))),
        h('div', { class: 't2' }, 'EN VALES DE DESCUENTO'))),
    h('div', { class: 'home-body' },
      h('nav', { class: 'actions', 'aria-label': 'Operaciones' },
        h('a', { class: 'action emit', href: '#/emitir' },
          h('div', null, h('div', { class: 't' }, 'REGISTRO / EMISIÓN DE VALE'),
            h('div', { class: 'd' }, `El cliente compró ${bs(minEmit)} o más y recibe su vale.`)),
          icon('ticket', 46)),
        h('a', { class: 'action redeem', href: '#/canjear' },
          h('div', null, h('div', { class: 't' }, 'CANJE DE VALE'),
            h('div', { class: 'd' }, `El cliente usa su vale del ${fmtDate(campaign.redeem_from)} al ${fmtDate(campaign.redeem_to)}.`)),
          icon('stampic', 46))),
      h('section', null,
        h('h2', { class: 'section-title' }, 'Vales de la campaña'),
        h('p', { class: 'section-sub' }, 'Entrega el vale del color que corresponde a la compra.'),
        h('div', { class: 'vales' }, denominations.map(d => h('div', { class: 'vale-card' },
          h('img', { src: voucherSrc(d.amount, true), alt: `Vale de Bs ${d.amount}`, width: 480, height: 240, loading: 'lazy' }),
          h('dl', null,
            h('dt', null, 'Números'), h('dd', null, `${d.code_from} a ${d.code_to}`),
            h('dt', null, 'Compra para recibirlo'), h('dd', null, range(d)),
            h('dt', null, 'Compra para canjearlo'), h('dd', null, `desde ${bs(d.redeem_min)}`))))),
        h('p', { class: 'rules-note' }, 'Un vale por compra. No se acumula y no se combina con otros descuentos. Una compra en la que se canjea un vale no genera un vale nuevo.')),
      user.role === 'admin' ? h('a', { class: 'admin-link', href: '#/panel' }, 'Panel de Marketing') : null),
    brandsBand()));
}

// ------------------------------------------------------------------ navegación
async function route() {
  if (!state.me) return loginPage();
  renderChrome();
  const path = location.hash.replace(/^#/, '') || '/';
  try {
    if (path === '/emitir') return emissionPage(state);
    if (path === '/canjear') return redeemPage(state);
    if (path === '/panel' && state.me.user.role === 'admin') {
      const { adminPage } = await import('./admin.js');
      return adminPage(state);
    }
    return homePage();
  } catch (e) {
    return handleFatal(e);
  }
}

export async function handleFatal(e) {
  if (e instanceof SessionError) {
    await signOut(); state.me = null;
    return loginPage('Tu sesión expiró. Vuelve a entrar.');
  }
  mount(h('div', { class: 'page' }, alertBox('bad', h('strong', null, 'No se pudo cargar esta pantalla.'),
    e instanceof NetworkError ? 'Sin conexión con el servidor. Revisa internet.' : String(e.message || e),
    h('div', null, h('button', { class: 'btn small', onclick: () => route() }, 'Reintentar')))));
}

async function boot() {
  if (!configured) {
    mount(h('div', { class: 'page' }, alertBox('warn', h('strong', null, 'Portal sin configurar.'),
      'Falta pegar la URL y la clave pública de Supabase en config.js.')));
    return;
  }
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) return loginPage();
    await loadMe();
    route();
  } catch (e) {
    if (e instanceof NetworkError) {
      mount(h('div', { class: 'page' }, alertBox('bad', h('strong', null, 'Sin conexión con el servidor.'),
        'No se puede emitir ni canjear vales sin conexión. Revisa internet.',
        h('div', null, h('button', { class: 'btn small', onclick: boot }, 'Reintentar')))));
      return;
    }
    await signOut(); state.me = null;
    loginPage(e instanceof SessionError ? 'Tu sesión expiró. Vuelve a entrar.' : e.message);
  }
}

window.addEventListener('hashchange', () => route());
window.addEventListener('offline', () => document.body.classList.add('offline'));
boot();
