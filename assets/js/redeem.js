// Módulo B · Canje de vales
import { h, mount, backLink, bs, normCode, parseAmount, uuid, icon, alertBox, busy, facts, voucherCard, storePicker, storePath, fmtDate, badge, vlabel, voucherSrc } from './ui.js';
import { rpc, NetworkError, SessionError } from './api.js';
import { handleFatal } from './app.js';

const SELLER_KEY = 'cashxmas-seller';

export function redeemPage(state) {
  const s = { store: null, den: null, info: null, reqId: null, sending: false };
  const dens = state.me.denominations;

  // ---------------------------------------------------------------- tienda
  const storeErr = h('div', { class: 'err' });
  const picker = storePicker(state, { title: 'Ciudad', onChange: (st) => { s.store = st; storeErr.textContent = ''; renderSummary(); } });

  // ---------------------------------------------------------------- valor del vale (lo elige el cajero según el vale físico)
  const denErr = h('div', { class: 'err', 'aria-live': 'polite' });
  const denTiles = dens.map(d => h('label', { class: 'tier', 'data-den': d.amount },
    h('input', { type: 'radio', name: 'rden', value: String(d.amount), class: 'sr', onchange: () => chooseDen(d.amount) }),
    h('img', { src: voucherSrc(d.amount, true), alt: '', width: 480, height: 240 }),
    h('b', null, bs(d.amount)),
    h('span', null, `Nº ${d.code_from} a ${d.code_to}`)));
  const denPick = h('div', { class: 'tiers pick', role: 'radiogroup', 'aria-label': 'Valor del vale' }, denTiles);
  function chooseDen(amount) {
    s.den = amount; denErr.textContent = '';
    denTiles.forEach(t => { const on = Number(t.dataset.den) === amount; t.classList.toggle('on', on); t.classList.toggle('dim', !on); });
    codeInput.disabled = false;
    s.info = null; infoBox.replaceChildren(); purchaseBox.hidden = true; submitBar.hidden = true; s.reqId = null;
    if (codeInput.value.length === 6) doLookup(); else codeInput.focus();
  }

  // ---------------------------------------------------------------- número
  const codeInput = h('input', { class: 'input serial-input', id: 'rcode', inputmode: 'numeric', autocomplete: 'off', maxlength: 6, placeholder: '000000', disabled: true });
  const lookupBtn = h('button', { class: 'btn', type: 'button', onclick: () => doLookup() }, 'Consultar');
  const infoBox = h('div', { 'aria-live': 'polite' });
  const purchaseBox = h('div');
  let seq = 0;

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    s.info = null; infoBox.replaceChildren(); purchaseBox.hidden = true; submitBar.hidden = true; s.reqId = null;
    if (codeInput.value.length === 6) doLookup();
  });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLookup(); } });

  async function doLookup() {
    if (!s.den) { denErr.textContent = 'Primero elige el valor del vale.'; return; }
    const code = normCode(codeInput.value);
    if (!code) { infoBox.replaceChildren(alertBox('bad', 'Escribe el número de 6 dígitos impreso en el vale.')); return; }
    codeInput.value = code;
    const my = ++seq;
    busy(lookupBtn, true, 'Consultando…');
    try {
      const r = await rpc('cx_lookup', { p_denomination: s.den, p_number: code });
      if (my !== seq) return;
      if (!r.ok) { s.info = null; infoBox.replaceChildren(alertBox('bad', r.message)); purchaseBox.hidden = true; submitBar.hidden = true; return; }
      s.info = r;
      infoBox.replaceChildren(infoCard(r));
      purchaseBox.hidden = !r.can_redeem; submitBar.hidden = !r.can_redeem;
      renderSummary();
      if (r.can_redeem) fInvoice.input.focus();
    } catch (e) {
      if (e instanceof SessionError) return handleFatal(e);
      infoBox.replaceChildren(alertBox('bad', e instanceof NetworkError ? 'Sin conexión: no se pudo consultar el vale. Revisa internet y vuelve a consultar.' : 'No se pudo consultar el vale.'));
    } finally { busy(lookupBtn, false); }
  }

  function infoCard(r) {
    const eff = r.effective_status;
    const stamp = r.status === 'CANJEADO' ? { text: 'CANJEADO', sub: r.redeemed_at_local } : null;
    return h('div', { class: 'redeem-info' },
      voucherCard({ number: r.number, denomination: r.denomination, stamp }),
      h('div', { class: 'group' },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:10px' },
          h('div', { style: 'font:900 34px/1 var(--serif);color:var(--maroon)' }, bs(r.denomination)), badge(eff)),
        facts([
          ['Vale', vlabel(r.denomination, r.number)],
          r.emitted_at_local ? ['Emitido', r.emitted_at_local] : null,
          r.emitted_store ? ['Tienda de emisión', r.emitted_store.name] : null,
          r.customer ? ['Cliente', `${r.customer} (CI ${r.ci_hint})`] : null,
          r.redeemed_at_local ? ['Canjeado', `${r.redeemed_at_local}, ${r.redeemed_store.name}`] : null,
          ['Compra mínima para canjear', bs(r.redeem_min)],
          ['Vigencia de canje', `${fmtDate(r.redeem_from)} al ${fmtDate(r.redeem_to)}`]
        ]),
        r.can_redeem
          ? h('div', { class: 'code-state ok' }, icon('ok', 20), h('span', null, 'Vale válido para canjear.'))
          : alertBox('bad', h('strong', null, 'No se puede canjear. '), r.reason)));
  }

  // ---------------------------------------------------------------- compra de canje
  const mk = (id, label, attrs, hint) => {
    const input = h('input', { class: 'input', id, autocomplete: 'off', ...attrs });
    const err = h('div', { class: 'err', 'aria-live': 'polite' });
    return { input, err, node: h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('div', { class: 'hint' }, hint) : null, err) };
  };
  const fInvoice = mk('rinvoice', 'Número de factura de la compra de canje', { inputmode: 'numeric', maxlength: 30 });
  const fAmount = mk('ramount', 'Monto total de la compra de canje', { inputmode: 'decimal', placeholder: '0' }, 'Total de la factura antes de descontar el vale.');
  const amtWrap = h('div', { class: 'prefix', 'data-prefix': 'Bs' }, fAmount.input);
  fAmount.node.insertBefore(amtWrap, fAmount.node.children[1]);
  const fSeller = mk('rseller', 'Atendido por (opcional)', { autocapitalize: 'words', maxlength: 60, value: localStorage.getItem(SELLER_KEY) || '' });
  const amountState = h('div', { 'aria-live': 'polite' });
  const noCombine = h('input', { type: 'checkbox', id: 'nocomb' });
  const checkErr = h('div', { class: 'err' });
  const summary = h('div');
  const confirmBtn = h('button', { class: 'btn danger block', type: 'submit' }, 'CONFIRMAR CANJE');
  const serverMsg = h('div', { 'aria-live': 'assertive' });

  fAmount.input.addEventListener('input', () => { fAmount.err.textContent = ''; renderAmountState(); renderSummary(); });
  fInvoice.input.addEventListener('input', () => { fInvoice.err.textContent = ''; renderSummary(); });
  noCombine.addEventListener('change', () => { checkErr.textContent = ''; renderSummary(); });

  function renderAmountState() {
    const amt = parseAmount(fAmount.input.value);
    if (!s.info || !amt) { amountState.replaceChildren(); return; }
    const min = Number(s.info.redeem_min);
    amountState.replaceChildren(amt >= min
      ? h('div', { class: 'code-state ok' }, icon('ok', 20), h('span', null, `Cumple la compra mínima de ${bs(min)}.`))
      : h('div', { class: 'code-state bad' }, icon('bad', 20), h('span', null, `Faltan ${bs(min - amt, true)} para la compra mínima de ${bs(min)}.`)));
  }

  function renderSummary() {
    if (!s.info || !s.info.can_redeem) { summary.replaceChildren(); return; }
    const amt = parseAmount(fAmount.input.value);
    const line = (k, v) => h('div', { class: 'line' }, h('span', null, k), h('b', null, v));
    summary.replaceChildren(h('div', { class: 'summary', 'aria-label': 'Resumen del canje' },
      h('div', { class: 'ttl' }, 'Resumen'),
      line('Vale', vlabel(s.info.denomination, s.info.number)),
      line('Tienda', s.store ? s.store.name : 'Falta seleccionar'),
      line('Compra de canje', amt ? `${bs(amt, true)}${fInvoice.input.value.trim() ? ', factura ' + fInvoice.input.value.trim() : ''}` : 'Falta el monto'),
      line('Condiciones', noCombine.checked ? 'Confirmadas' : 'Falta confirmar')));
  }

  function validate() {
    const errs = [];
    if (!s.store) { storeErr.textContent = 'Selecciona la tienda donde se hace el canje.'; errs.push(picker.node); }
    if (!s.info || !s.info.can_redeem) { errs.push(codeInput); }
    const inv = fInvoice.input.value.trim().replace(/[^0-9a-z]/gi, '').replace(/^0+/, '');
    fInvoice.err.textContent = inv ? '' : 'Ingresa el número de factura.'; if (!inv) errs.push(fInvoice.input);
    const amt = parseAmount(fAmount.input.value);
    const min = s.info ? Number(s.info.redeem_min) : 0;
    const amsg = !amt ? 'Ingresa el monto de la compra.' : amt < min ? `La compra debe ser de al menos ${bs(min)}.` : '';
    fAmount.err.textContent = amsg; if (amsg) errs.push(fAmount.input);
    checkErr.textContent = noCombine.checked ? '' : 'Marca la confirmación para continuar.'; if (!noCombine.checked) errs.push(noCombine);
    return errs;
  }

  async function send() {
    if (s.sending) return;
    const errs = validate();
    if (errs.length) { errs[0].focus(); errs[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    s.reqId = s.reqId || uuid();
    const seller = fSeller.input.value.trim();
    localStorage.setItem(SELLER_KEY, seller);
    const payload = { request_id: s.reqId, store_id: s.store.id, denomination: s.info.denomination, voucher_number: s.info.number, invoice_number: fInvoice.input.value.trim(),
      purchase_amount: parseAmount(fAmount.input.value), no_combine: true, seller_name: seller };
    s.sending = true; busy(confirmBtn, true, 'Canjeando…'); serverMsg.replaceChildren();
    try {
      const r = await rpc('cx_redeem', { p: payload }, { timeout: 20000 });
      if (r.ok) { s.reqId = null; return resultPage(state, r); }
      s.reqId = null;
      serverMsg.replaceChildren(alertBox('bad', h('strong', null, 'El vale no se canjeó. '), r.message));
      if (/FACTURA|UN_VALE/.test(r.error)) { fInvoice.err.textContent = r.message; fInvoice.input.focus(); }
      if (/MONTO|COMPRA_INSUFICIENTE/.test(r.error)) { fAmount.err.textContent = r.message; fAmount.input.focus(); }
      if (/YA_CANJEADO|ANULADO|BLOQUEADO|NO_EMITIDO|CONFLICTO|FUERA/.test(r.error)) doLookup();
      if (r.error === 'VALOR_INVALIDO') denErr.textContent = r.message;
    } catch (e) {
      if (e instanceof SessionError) return handleFatal(e);
      serverMsg.replaceChildren(alertBox('warn',
        h('strong', null, 'No llegó la respuesta del servidor.'),
        'Puede que el canje se haya registrado o no. Pulsa Reintentar: si ya quedó guardado verás la misma confirmación y no se canjeará dos veces.',
        h('div', null, h('button', { class: 'btn small', type: 'button', onclick: send }, 'Reintentar'))));
    } finally {
      s.sending = false; if (document.body.contains(confirmBtn)) busy(confirmBtn, false);
    }
  }

  purchaseBox.hidden = true;
  const submitBar = h('div', { class: 'submit-bar', hidden: true }, serverMsg, confirmBtn);
  purchaseBox.append(
    h('fieldset', null, h('legend', null, 'Compra de canje'), h('div', { class: 'group' },
      fInvoice.node, fAmount.node, amountState,
      h('label', { class: 'check', for: 'nocomb' }, noCombine,
        h('span', null, 'Se usa un solo vale en esta compra y no se combina con otros descuentos ni promociones.')),
      checkErr, fSeller.node)),
    summary
  );

  const form = h('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); send(); } },
    h('fieldset', null, h('legend', null, 'Seleccionar tienda / sucursal de canje'), picker.node, storeErr),
    h('fieldset', null, h('legend', null, 'Valor del vale'), h('div', { class: 'group' },
      h('div', { class: 'hint', style: 'margin-top:-4px' }, 'Elige el valor según el color del vale que entrega el cliente.'), denPick, denErr)),
    h('fieldset', null, h('legend', null, 'Número del vale'), h('div', { class: 'group' },
      h('div', { class: 'field' }, h('label', { for: 'rcode' }, 'Número impreso en el vale'), codeInput,
        h('div', { class: 'hint' }, 'Al escribir los 6 dígitos se consulta solo.')),
      h('div', null, lookupBtn))),
    infoBox,
    h('div', { style: 'height:22px' }),
    purchaseBox,
    submitBar
  );
  mount(h('div', { class: 'page' }, h('div', { class: 'page-head' }, backLink(), h('h1', null, 'Canje de vale')), form));
  (state.me.store ? denPick.querySelector('input') : picker.node.querySelector('button'))?.focus();
}

function resultPage(state, r) {
  const page = h('div', { class: 'page' },
    h('div', { class: 'result' },
      h('h1', { class: 'redeemed', tabindex: '-1' }, icon('ok', 30), 'VALE CANJEADO CORRECTAMENTE'),
      r.replay ? alertBox('ok', 'Este canje ya estaba registrado. No se canjeó dos veces.') : null,
      voucherCard({ number: r.number, denomination: r.denomination, stamp: { text: 'CANJEADO', sub: `${r.created_at_local}, ${r.store.name}` } }),
      h('p', { class: 'watermark' }, 'Comprobante interno de la operación. No es un vale válido para usar.'),
      facts([
        ['Vale', vlabel(r.denomination, r.number)],
        ['Monto', bs(r.denomination)],
        ['Tienda', `${r.store.name}${storePath(r.store) ? ', ' + storePath(r.store) : ''}`],
        ['Factura de canje', r.invoice_number],
        ['Fecha y hora', r.created_at_local],
        ['Estado', h('span', { class: 'badge CANJEADO' }, 'CANJEADO')],
        ['Número de operación', r.op_number],
        r.emitted_store ? ['Emitido en', `${r.emitted_store.name}, ${r.emitted_at_local}`] : null
      ]),
      r.is_test ? h('p', { class: 'watermark' }, 'Operación de prueba: se borrará antes de iniciar la campaña.') : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => redeemPage(state) }, 'Nuevo canje'),
        h('a', { class: 'btn', href: '#/' }, 'Volver al inicio'))
    ));
  mount(page);
  page.querySelector('h1').focus();
}
