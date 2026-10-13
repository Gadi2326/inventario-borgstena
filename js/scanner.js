// Escaneo de códigos: con lector USB/Bluetooth (escribe como teclado y da Enter)
// o con la cámara del celular.

// Crea un campo grande para escanear. `onCodigo(texto)` se llama con cada código leído.
// opts.continuo: la cámara sigue abierta para escanear varios rollos seguidos.
function campoEscaneo(onCodigo, opts = {}) {
  const input = h('input', {
    type: 'text', class: 'scan-input', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: 'false', placeholder: opts.placeholder || 'Escanea o escribe el código y da Enter',
  });
  input.addEventListener('keydown', (e) => {
    // El código 2D trae tabuladores: el lector los "teclea" como Tab, así que los guardamos en vez de cambiar de campo.
    if (e.key === 'Tab' && input.value) {
      e.preventDefault();
      input.value += '\t';
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      if (v.trim()) onCodigo(v);
    }
  });
  const btnCam = h('button', {
    class: 'btn btn-cam', type: 'button', title: 'Escanear con la cámara',
    onclick: () => abrirCamara(onCodigo, { continuo: opts.continuo, alCerrar: () => input.focus() }),
  }, '📷 Cámara');
  const cont = h('div', { class: 'scan-box' }, input, btnCam);
  cont.enfocar = () => setTimeout(() => input.focus(), 50);
  if (opts.autofocus !== false) {
    input.dataset.autofocus = '1';
    cont.enfocar();
  }
  return cont;
}

// Si el lector "teclea" mientras ningún campo está seleccionado, mandamos el texto al campo de escaneo.
document.addEventListener('keydown', (e) => {
  const act = document.activeElement;
  if (act && act !== document.body && act.tagName !== 'BUTTON' && act.tagName !== 'A') return;
  if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
  if (document.querySelector('.modal')) return;
  const input = document.querySelector('.scan-input[data-autofocus]') || document.querySelector('.scan-input');
  if (input) input.focus();
});

async function abrirCamara(onCodigo, { continuo = false, alCerrar } = {}) {
  if (typeof Html5Qrcode === 'undefined') {
    toast('No se cargó el lector de cámara.', 'error');
    return;
  }
  const lector = h('div', { id: 'lector-camara' });
  const ultimo = h('div', { class: 'cam-ultimo' }, continuo ? 'Apunta al código de barras del rollo' : 'Apunta al código');
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'modal-box cam-box' },
      h('div', { class: 'modal-titulo' }, 'Escanear con cámara'),
      lector, ultimo,
      h('button', { class: 'btn btn-grande', onclick: () => cerrar() }, continuo ? 'Terminar' : 'Cancelar'),
    ),
  );
  document.body.append(modal);

  const F = Html5QrcodeSupportedFormats;
  const qr = new Html5Qrcode('lector-camara', {
    verbose: false,
    formatsToSupport: [F.CODE_128, F.DATA_MATRIX, F.QR_CODE, F.CODE_39, F.EAN_13],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  });
  let cerrado = false;
  let previo = '', previoT = 0;

  async function cerrar() {
    if (cerrado) return;
    cerrado = true;
    try { await qr.stop(); } catch (e) { /* ya estaba detenida */ }
    modal.remove();
    if (alCerrar) alCerrar();
  }

  try {
    await qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, hh) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(hh, w) * 0.5) }) },
      (texto) => {
        const ahora = Date.now();
        if (texto === previo && ahora - previoT < 2500) return; // evita leer el mismo código dos veces seguidas
        previo = texto; previoT = ahora;
        ultimo.textContent = 'Leído: ' + texto.replace(/\t/g, ' | ');
        onCodigo(texto);
        if (!continuo) cerrar();
      },
      () => {},
    );
  } catch (e) {
    ultimo.textContent = 'No se pudo abrir la cámara. Revisa que la página tenga permiso de usar la cámara. (' + (e.message || e) + ')';
  }
}
