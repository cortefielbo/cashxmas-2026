// Módulo A · Registro y emisión de vales
import { h, mount, backLink, bs, num, normCode, parseAmount, uuid, icon, alertBox, busy, facts, voucherCard, storePicker, storePath, cfg, voucherSrc, den } from './ui.js';
import { rpc, NetworkError, SessionError } from './api.js';
import { handleFatal } from './app.js';

const SELLER_KEY = 'cashxmas-seller';

export function emissionPage(state) {
  const dens = state.me.denominations;
  const s = { store: null, den: null, code: null, codeOk: false, reqId: null, sending: false };

  // ---------------------------------------------------------------- campos
  const field = (id, label, input, hint, optional) => {
    const err = h('div', { class: 'err', id: `${id}-err`, 'aria-live': 'polite' });
    input.id = id; input.setAttribute('aria-describedby', `${id}-err`);
    const node = h('div', { class: 'field' }, h('label', { for: id }, label, optional ? h('span', { class: 'opt' }, ' (opcional)') : null), input, hint ? h('div', { class: 'hint' }, hint) : null, err);
    return { node, input, err };
  };
  const inp = (attrs) => h('input', { class: 'input', autocomplete: 'off', ...attrs });

  const fAmount = field('amount', 'Monto total de la compra', inp({ inputmode: 'decimal', placeholder: '0' }));
  const amountWrap = h('div', { class: 'prefix', 'data-prefix': 'Bs' }, fAmount.input);
  fAmount.node.insertBefore(amountWrap, fAmount.node.children[1]);
  const fInvoice = field('invoice', 'Número de factura', inp({ inputmode: 'numeric', maxlength: 30 }));
  const fFirst = field('first', 'Nombre', inp({ autocapitalize: 'words', maxlength: 60 }));
  const fLast = field('last', 'Apellidos', inp({ autocapitalize: 'words', maxlength: 80 }));
  const fCi = field('ci', 'Carnet de identidad', inp({ autocapitalize: 'characters', maxlength: 20 }), 'Con complemento o extensión si tiene. Ej: 7845123 SC');
  const fPhone = field('phone', 'Celular', inp({ inputmode: 'tel', maxlength: 16, placeholder: '7XXXXXXX' }));
  const fEmail = field('email', 'Correo electrónico', inp({ type: 'email', inputmode: 'email', autocapitalize: 'none', maxlength: 120 }), null, true);
  const fSeller = field('seller', 'Atendido por', inp({ autocapitalize: 'words', maxlength: 60, value: localStorage.getItem(SELLER_KEY) || '' }), 'Se recuerda en este equipo.', true);

  // ---------------------------------------------------------------- tramos
  const tiers = h('div', { class: 'tiers' });
  const tierMsg = h('div', { class: 'tier-msg', 'aria-live': 'polite' });
  const renderTiers = () => {
    const amt = parseAmount(fAmount.input.value);
    const match = amt ? dens.find(d => amt >= Number(d.emit_min) && (d.emit_max === null || amt < Number(d.emit_max))) : null;
    s.den = match ? match.amount : null;
    tiers.replaceChildren(...dens.map(d => h('div', { class: 'tier' + (s.den === d.amount ? ' on' : (amt ? ' dim' : '')) },
      h('img', { src: voucherSrc(d.amount, true), alt: '', width: 480, height: 240 }),
      h('b', null, bs(d.amount)),
      h('span', null, d.emit_max ? `${num(d.emit_min)} a ${num(Number(d.emit_max) - 1)}` : `${num(d.emit_min)} o más`))));
    tierMsg.classList.toggle('bad', !!amt && !match);
    if (!amt) { tierMsg.textContent = ''; tierMsg.hidden = true; return; }
    tierMsg.hidden = false;
    if (!match) tierMsg.textContent = `Esta compra no recibe vale: el mínimo es ${bs(Math.min(...dens.map(d => Number(d.emit_min))))}.`;
    else tierMsg.textContent = `Entrega un vale de ${bs(match.amount)}: códigos ${match.code_from} a ${match.code_to}.`;
  };
  fAmount.input.addEventListener('input', () => { renderTiers(); fAmount.err.textContent = ''; recheckCode(); });

  // ---------------------------------------------------------------- código de vale
  const codeInput = h('input', { class: 'input serial-input', id: 'code', inputmode: 'numeric', autocomplete: 'off', maxlength: 6, placeholder: '000000', 'aria-describedby': 'code-hint code-state' });
  const suggest = h('ul', { class: 'suggest', role: 'listbox', 'aria-label': 'Códigos disponibles' });
  const codeState = h('div', { id: 'code-state', 'aria-live': 'polite' });
  let suggestTimer, suggestSeq = 0;

  const setCodeState = (kind, text) => {
    codeState.replaceChildren(text ? h('div', { class: `code-state ${kind}` }, icon(kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'info', 20), h('span', null, text)) : '');
  };
  const evaluateExact = (ex) => {
    s.codeOk = false;
    if (!ex) { setCodeState('bad', `El código ${s.code} no pertenece al inventario de la campaña.`); return; }
    if (ex.status !== 'DISPONIBLE') { setCodeState('bad', `El vale ${ex.code} está ${ex.status.toLowerCase()} y no puede emitirse.`); return; }
    if (s.den && ex.denomination !== s.den) {
      const d = dens.find(x => x.amount === s.den);
      setCodeState('bad', `El vale ${ex.code} es de ${bs(ex.denomination)}, pero a esta compra le corresponde uno de ${bs(s.den)} (del ${d.code_from} al ${d.code_to}).`);
      return;
    }
    s.codeOk = true;
    setCodeState('ok', s.den ? `Vale ${ex.code} de ${bs(ex.denomination)} disponible.` : `Vale ${ex.code} de ${bs(ex.denomination)} disponible. Falta el monto de la compra.`);
  };
  const lookup = async (q, exactOnly) => {
    const seq = ++suggestSeq;
    try {
      const r = await rpc('cx_suggest', { p_query: q, p_denomination: s.den });
      if (seq !== suggestSeq) return;
      if (exactOnly) { suggest.replaceChildren(); evaluateExact(r.exact); return; }
      const opts = r.options || [];
      suggest.replaceChildren(...opts.slice(0, 6).map(o => h('li', null, h('button', { type: 'button', role: 'option', onclick: () => pick(o.code) },
        h('span', { class: 'c' }, o.code), den(o.denomination), h('span', { class: 'badge EMITIDO' }, 'Disponible')))));
      if (!opts.length) setCodeState('info', s.den ? `No hay vales de ${bs(s.den)} disponibles que contengan "${q}".` : `No hay vales disponibles que contengan "${q}".`);
      else setCodeState('', '');
    } catch (e) {
      if (seq !== suggestSeq) return;
      setCodeState('bad', e instanceof NetworkError ? 'Sin conexión: no se pudo comprobar el código.' : 'No se pudo comprobar el código.');
    }
  };
  const pick = (code) => { codeInput.value = code; s.code = code; suggest.replaceChildren(); lookup(code, true); };
  function recheckCode() { if (s.code) lookup(s.code, true); }
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    const q = codeInput.value;
    s.code = null; s.codeOk = false;
    clearTimeout(suggestTimer);
    if (!q) { suggest.replaceChildren(); setCodeState('', ''); return; }
    if (q.length === 6) { s.code = q; lookup(q, true); return; }
    suggestTimer = setTimeout(() => lookup(q, false), 220);
  });

  // ---------------------------------------------------------------- tienda
  const storeErr = h('div', { class: 'err' });
  const picker = storePicker(state, { onChange: (st) => { s.store = st; storeErr.textContent = ''; } });

  // ---------------------------------------------------------------- validación local (el servidor vuelve a validar todo)
  const clean = (v) => String(v || '').trim().replace(/\s+/g, ' ');
  function validate() {
    const errs = [];
    const set = (f, msg) => { f.err.textContent = msg || ''; f.input.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (msg) errs.push(f.input); };
    if (!s.store) { storeErr.textContent = 'Selecciona la tienda.'; errs.push(picker.node); }
    const amt = parseAmount(fAmount.input.value);
    set(fAmount, !amt ? 'Ingresa el monto de la compra.' : !s.den ? 'La compra no alcanza el mínimo para recibir un vale.' : '');
    set(fInvoice, !clean(fInvoice.input.value).replace(/[^0-9a-z]/gi, '').replace(/^0+/, '') ? 'Ingresa el número de factura.' : '');
    if (!s.code) { setCodeState('bad', 'Escribe el código de 6 dígitos o elígelo de la lista.'); errs.push(codeInput); }
    else if (!s.codeOk) errs.push(codeInput);
    const badName = /[0-9<>@#$%^*=_{}|\\/:;"]/;
    const fn = clean(fFirst.input.value), ln = clean(fLast.input.value);
    set(fFirst, fn.length < 2 || badName.test(fn) ? 'Escribe el nombre del cliente.' : '');
    set(fLast, ln.length < 2 || badName.test(ln) ? 'Escribe los apellidos del cliente.' : '');
    const ci = fCi.input.value.toUpperCase().replace(/[\s.]/g, '');
    set(fCi, !/^[0-9]{4,10}(-?[0-9A-Z]{1,5})?$/.test(ci) ? 'Revisa el carnet: números y, si tiene, complemento o extensión.' : '');
    let ph = fPhone.input.value.replace(/\D/g, '');
    if (ph.length === 11 && ph.startsWith('591')) ph = ph.slice(3);
    set(fPhone, !/^[67]\d{7}$/.test(ph) ? 'El celular debe tener 8 dígitos y empezar con 6 o 7.' : '');
    const em = clean(fEmail.input.value);
    set(fEmail, em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) ? 'Correo no válido. Déjalo vacío si el cliente no quiere darlo.' : '');
    return errs;
  }

  const FIELD_BY_ERROR = { MONTO_INVALIDO: fAmount, COMPRA_INSUFICIENTE: fAmount, FACTURA_INVALIDA: fInvoice, FACTURA_YA_USADA: fInvoice, FACTURA_DE_CANJE: fInvoice,
    NOMBRE_INVALIDO: fFirst, APELLIDO_INVALIDO: fLast, CI_INVALIDO: fCi, CELULAR_INVALIDO: fPhone, EMAIL_INVALIDO: fEmail };

  // ---------------------------------------------------------------- envío
  const submitBtn = h('button', { class: 'btn primary block', type: 'submit' }, 'Emitir vale');
  const serverMsg = h('div', { 'aria-live': 'assertive' });

  async function send() {
    if (s.sending) return;
    const errs = validate();
    if (errs.length) { errs[0].focus(); errs[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    s.reqId = s.reqId || uuid();
    const payload = {
      request_id: s.reqId, store_id: s.store.id, purchase_amount: parseAmount(fAmount.input.value),
      invoice_number: clean(fInvoice.input.value), voucher_code: s.code,
      first_name: clean(fFirst.input.value), last_name: clean(fLast.input.value), ci: fCi.input.value,
      phone: fPhone.input.value, email: clean(fEmail.input.value), seller_name: clean(fSeller.input.value)
    };
    localStorage.setItem(SELLER_KEY, payload.seller_name);
    s.sending = true; busy(submitBtn, true, 'Emitiendo…'); serverMsg.replaceChildren();
    try {
      const r = await rpc('cx_emit', { p: payload }, { timeout: 20000 });
      if (r.ok) { s.reqId = null; return resultPage(state, r); }
      if (/^CODIGO|DENOMINACION|CONFLICTO/.test(r.error)) { setCodeState('bad', r.message); s.codeOk = false; codeInput.focus(); }
      const f = FIELD_BY_ERROR[r.error];
      if (f) { f.err.textContent = r.message; f.input.setAttribute('aria-invalid', 'true'); f.input.focus(); }
      serverMsg.replaceChildren(alertBox('bad', h('strong', null, 'El vale no se emitió. '), r.message));
      s.reqId = null; // la operación fue rechazada: la próxima es una solicitud nueva
    } catch (e) {
      if (e instanceof SessionError) return handleFatal(e);
      serverMsg.replaceChildren(alertBox('warn',
        h('strong', null, 'No llegó la respuesta del servidor.'),
        'Puede que el vale se haya registrado o no. Pulsa Reintentar: si ya quedó guardado verás la misma confirmación y no se duplicará.',
        h('div', null, h('button', { class: 'btn small', type: 'button', onclick: send }, 'Reintentar'))));
    } finally {
      s.sending = false; if (document.body.contains(submitBtn)) busy(submitBtn, false);
    }
  }

  // ---------------------------------------------------------------- pantalla
  const form = h('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); send(); } },
    h('fieldset', null, h('legend', null, 'Tienda de emisión'), picker.node, storeErr),
    h('fieldset', null, h('legend', null, 'Compra'), h('div', { class: 'group' }, fAmount.node, h('div', { class: 'field' }, h('span', { class: 'label' }, 'Vale que corresponde'), tiers, tierMsg, h('div', { class: 'hint' }, 'Se marca solo según el monto de la compra.')), fInvoice.node)),
    h('fieldset', null, h('legend', null, 'Vale físico'), h('div', { class: 'group' },
      h('div', { class: 'field' }, h('label', { for: 'code' }, 'Código impreso en el vale'), codeInput,
        h('div', { class: 'hint', id: 'code-hint' }, 'Escribe los 6 dígitos o los últimos números y elige de la lista.')),
      suggest, codeState)),
    h('fieldset', null, h('legend', null, 'Cliente'), h('div', { class: 'group' },
      h('div', { class: 'row2' }, fFirst.node, fLast.node), fCi.node, fPhone.node, fEmail.node,
      h('div', { class: 'hint' }, cfg.PRIVACY_NOTE))),
    h('fieldset', null, h('legend', null, 'Operación'), h('div', { class: 'group' }, fSeller.node)),
    h('div', { class: 'submit-bar' }, serverMsg, submitBtn)
  );
  renderTiers();
  mount(h('div', { class: 'page' }, h('div', { class: 'page-head' }, backLink(), h('h1', null, 'Emisión de vale')), form));
  fAmount.input.focus();
}

function resultPage(state, r) {
  const page = h('div', { class: 'page' },
    h('div', { class: 'result' },
      h('h1', { tabindex: '-1' }, icon('ok', 30), 'VALE EMITIDO CORRECTAMENTE'),
      r.replay ? alertBox('ok', 'Esta operación ya estaba registrada. No se creó un vale duplicado.') : null,
      voucherCard({ code: r.code, denomination: r.denomination, stamp: { kind: 'issued', text: 'EMITIDO', sub: r.created_at_local } }),
      facts([
        ['Correlativo', r.code],
        ['Valor del vale', bs(r.denomination)],
        ['Cliente', r.customer],
        ['Sucursal', `${r.store.name}${storePath(r.store) ? ', ' + storePath(r.store) : ''}`],
        ['Factura', r.invoice_number],
        ['Fecha y hora', r.created_at_local],
        ['Estado', h('span', { class: 'badge EMITIDO' }, 'EMITIDO')],
        ['Operación', r.op_number]
      ]),
      r.is_test ? h('p', { class: 'watermark' }, 'Operación de prueba: se borrará antes de iniciar la campaña.') : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => emissionPage(state) }, 'Nueva emisión'),
        h('a', { class: 'btn', href: '#/' }, 'Volver al inicio'))
    ));
  mount(page);
  page.querySelector('h1').focus();
  history.replaceState(null, '', '#/emitir');
}
