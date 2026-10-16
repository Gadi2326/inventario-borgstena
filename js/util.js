// Utilidades generales: crear elementos, formatos, avisos, sonidos y lectura de códigos.

// Crea un elemento HTML. Uso: h('div', {class: 'x', onclick: fn}, 'texto', otroElemento)
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Formatos (dd/mm/aaaa, metros, kg) ----------
const pad2 = (n) => String(n).padStart(2, '0');

function fmtFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtFechaHora(iso) {
  return iso ? `${fmtFecha(iso)} ${fmtHora(iso)}` : '';
}
// "2026-10-07" (de un <input type=date>) -> ISO a mediodía local, para que no cambie de día
function fechaInputAIso(v) {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
function isoAFechaInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtNum(n, dec = 0) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  return Number(n).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
const fmtM = (n) => (n === null || n === undefined ? '' : fmtNum(n, n % 1 ? 1 : 0) + ' m');
const fmtKg = (n) => (n === null || n === undefined ? '' : fmtNum(n, 2) + ' kg');

// ---------- Avisos y sonidos ----------
function toast(msg, tipo = 'ok') {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + tipo }, msg);
  box.append(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 6000 : 3000);
}

let _audio;
function beep(tipo = 'ok') {
  try {
    _audio = _audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = _audio.createOscillator();
    const g = _audio.createGain();
    o.connect(g); g.connect(_audio.destination);
    o.frequency.value = tipo === 'ok' ? 1200 : tipo === 'warn' ? 600 : 250;
    g.gain.value = 0.15;
    o.start();
    o.stop(_audio.currentTime + (tipo === 'ok' ? 0.12 : 0.4));
  } catch (e) { /* sin sonido */ }
  if (navigator.vibrate) navigator.vibrate(tipo === 'ok' ? 60 : [120, 60, 120]);
}

// ---------- Interpretar la descripción y los códigos del proveedor ----------

// "1.450X240X0.0060-27/035L ST GRS RB" -> {ancho_m, largo_m, espesor_mm, densidad, extra}
function parseDescripcion(desc) {
  const m = /^\s*([\d.]+)\s*X\s*([\d.]+)\s*X\s*([\d.]+)\s*-\s*(\d+)\s*\/?\s*(.*)$/i.exec(desc || '');
  if (!m) return null;
  return {
    ancho_m: Number(m[1]),
    largo_m: Number(m[2]),
    espesor_mm: Math.round(Number(m[3]) * 1000 * 100) / 100,
    densidad: Number(m[4]),
    extra: m[5].trim(),
  };
}

// Número de rollo: "26Z9010101001" = 26 · Z-901-01-01 · 001
// OJO: en la vida real no siempre coincide con el lote de la etiqueta.
function parseNoRollo(code) {
  const m = /^(\d{2})([A-Z])(\d{3})(\d{2})(\d{2})(\d{3})$/.exec(code || '');
  if (!m) return null;
  return { anio: m[1], lote: `${m[2]}-${m[3]}-${m[4]}-${m[5]}`, consecutivo: m[6] };
}

// Decide qué código se escaneó: rollo, lote, número de parte o el código 2D (DataMatrix).
function clasificarCodigo(raw) {
  const txt = (raw || '').replace(/\r?\n$/, '').trim();
  // El DataMatrix trae: PARTE <tab> METROS <tab> LOTE-PRODUCCIÓN
  const dm = /^([A-Z0-9-]+)[\t ]+([\d.]+)[\t ]+(\d{12})$/i.exec(txt);
  if (dm) return { tipo: 'datamatrix', parte: dm[1].toUpperCase(), largo_m: Number(dm[2]), lote_produccion: dm[3], texto: txt };
  const up = txt.toUpperCase().replace(/\s+/g, '');
  // Rollos de otros proveedores (con otro formato) que ya están en una lista
  if (!parseNoRollo(up) && Store.get('rollos', up)) return { tipo: 'rollo', no_rollo: up, lote: null, texto: up };
  if (parseNoRollo(up)) return { tipo: 'rollo', no_rollo: up, ...parseNoRollo(up), texto: up };
  if (/^[A-Z]-\d{3}-\d{2}-\d{2}$/.test(up)) return { tipo: 'lote', lote: up, texto: up };
  if (Store.get('partes', up) || /^SPONGE-/.test(up)) return { tipo: 'parte', parte: up, texto: up };
  return { tipo: 'desconocido', texto: txt };
}

// "202610010630" -> "01/10/2026 06:30" (hipótesis: fecha y hora de producción)
function fmtLoteProduccion(l) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(l || '');
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : l || '';
}

// Comprime una foto del celular para guardarla sin ocupar mucho espacio.
function comprimirFoto(file, max = 1280, calidad = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', calidad));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function confirmar(msg) {
  return window.confirm(msg);
}
