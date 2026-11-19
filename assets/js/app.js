// CashXMAS 2026 · arranque, sesión, inicio y navegación
import { h, mount, icon, guilloche, cfg, fmtDate, bs, alertBox, busy } from './ui.js';
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
    h('a', { class: 'brand', href: '#/' }, 'CashXMAS'),
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
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Entrar');
  const form = h('form', { novalidate: true, onsubmit: async (ev) => {
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
    h('h1', null, 'Entrar al portal'),
    h('p', { class: 'lead' }, 'Usa el usuario de tu tienda.'),
    h('div', { class: 'field' }, h('label', { for: 'u' }, 'Usuario'), user, h('span', { class: 'hint' }, 'Ejemplo: cortefiel-lb')),
    h('div', { class: 'field', style: 'margin-top:14px' }, h('label', { for: 'p' }, 'Contraseña'), pass),
    h('div', { style: 'margin-top:14px' }, err),
    h('div', { style: 'margin-top:8px' }, btn)
  );
  mount(h('div', { class: 'login' }, h('div', { class: 'login-card' }, heroNote(true), form)));
  user.focus();
}

function heroNote(compact = false) {
  if (cfg.KV_IMAGE) {
    return h('div', { class: 'note kv' }, h('img', { src: cfg.KV_IMAGE, alt: 'CashXMAS 2026, la Navidad que te recompensa' }));
  }
  return h('div', { class: 'note' }, guilloche(1), h('div', { class: 'frame' }),
    h('span', { class: 'serial' }, 'Nº 000001'),
    h('div', { class: 'note-inner' },
      h('p', { class: 'word' }, 'Cash', h('br'), h('span', { class: 'x' }, 'XMAS')),
      h('div', { class: 'year' }, '2026'),
      compact ? null : h('p', { class: 'tag' }, 'La Navidad que te recompensa.'),
      compact ? null : h('div', { class: 'values', 'aria-label': 'Valores de vale' }, h('span', null, 'Bs 50'), h('span', null, 'Bs 100'), h('span', null, 'Bs 150'))
    ));
}

// ------------------------------------------------------------------ inicio
function homePage() {
  const { campaign, denominations, user } = state.me;
  const minEmit = Math.min(...denominations.map(d => Number(d.emit_min)));
  const page = h('div', { class: 'page home-page' },
    h('h1', { class: 'sr' }, 'CashXMAS 2026'),
    h('div', { class: 'home' },
      heroNote(),
      h('nav', { class: 'actions', 'aria-label': 'Operaciones' },
        h('a', { class: 'action emit', href: '#/emitir' },
          h('div', null, h('div', { class: 't' }, 'REGISTRO / EMISIÓN DE VALE'),
            h('div', { class: 'd' }, `El cliente compró ${bs(minEmit)} o más y recibe su vale.`)),
          icon('ticket', 44)),
        h('a', { class: 'action redeem', href: '#/canjear' },
          h('div', null, h('div', { class: 't' }, 'CANJE DE VALE'),
            h('div', { class: 'd' }, `El cliente usa su vale del ${fmtDate(campaign.redeem_from)} al ${fmtDate(campaign.redeem_to)}.`)),
          icon('stampic', 44))
      ),
      h('div', { class: 'rules' },
        h('strong', null, 'Recuerda: '),
        'un vale por compra, no se acumula y no se combina con otros descuentos.',
        h('ul', null, denominations.map(d => h('li', null, `Vale de ${bs(d.amount)}: códigos ${d.code_from} a ${d.code_to}. Se canjea en compras desde ${bs(d.redeem_min)}.`)))
      ),
      user.role === 'admin' ? h('a', { class: 'admin-link', href: '#/panel' }, 'Panel de Marketing') : null
    )
  );
  mount(page);
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
