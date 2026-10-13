// Foto a la etiqueta del rollo: lee TODOS los códigos de barras de la foto de una sola vez
// (número de rollo, lote, número de parte y el código 2D con metros y fecha de producción).
// Los códigos de barras no se leen mal como el texto, así que es la forma más confiable.

let _zxingListo = null;
const fotoSinRollo = {}; // recepcion_id -> códigos leídos en una foto a la que le faltó el número de rollo

// Escaneo desde el campo de texto/lector; si había una foto sin número de rollo, se completa con ella
function escanearEnRecepcion(rec, txt) {
  procesarEscaneoRecepcion(rec, txt);
  const pend = fotoSinRollo[rec.id];
  if (pend && clasificarCodigo(txt).tipo === 'rollo') {
    delete fotoSinRollo[rec.id];
    for (const t of pend) procesarEscaneoRecepcion(rec, t);
  }
}
function prepararLector() {
  if (!_zxingListo) {
    ZXingWASM.prepareZXingModule({
      overrides: {
        // El archivo .wasm va en vendor/zxing (así funciona sin internet)
        locateFile: (ruta, prefijo) => (ruta.endsWith('.wasm') ? new URL('vendor/zxing/' + ruta, location.href).href : prefijo + ruta),
      },
      fireImmediately: true,
    });
    _zxingListo = true;
  }
}

// Reduce la foto para que se lea rápido en el celular (las fotos de 12 MP tardan mucho)
async function fotoAImageData(file, max) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

async function leerCodigosDeFoto(file) {
  prepararLector();
  const base = { formats: ['Code128', 'DataMatrix', 'QRCode', 'Code39'], maxNumberOfSymbols: 10, tryHarder: true, tryRotate: true, tryInvert: true };
  const textos = new Set();
  // Se intenta a varios tamaños y modos: algunos códigos se leen mejor chicos y otros grandes
  const intentos = [[1600, 'LocalAverage'], [2400, 'LocalAverage'], [1200, 'GlobalHistogram'], [3200, 'GlobalHistogram']];
  for (const [max, binarizer] of intentos) {
    const img = await fotoAImageData(file, max);
    for (const r of await ZXingWASM.readBarcodes(img, { ...base, binarizer })) if (r.isValid && r.text) textos.add(r.text);
    const tipos = new Set([...textos].map((t) => clasificarCodigo(t).tipo));
    if (tipos.has('rollo') && (tipos.has('datamatrix') || (tipos.has('lote') && tipos.has('parte')))) break;
  }
  return [...textos];
}

// Ordena los códigos: primero el número de rollo y luego lo demás de ese mismo rollo
function ordenarCodigosEtiqueta(textos) {
  const orden = { rollo: 0, lote: 1, datamatrix: 2, parte: 3, desconocido: 4 };
  return textos.map((t) => ({ t, c: clasificarCodigo(t) })).sort((a, b) => orden[a.c.tipo] - orden[b.c.tipo]);
}

// Procesa una o varias fotos de etiquetas dentro de una recepción
async function procesarFotosEtiquetas(rec, files) {
  const total = files.length;
  let completos = 0;
  const problemas = [];
  const aviso = toastFijo(`Leyendo ${total} foto${total === 1 ? '' : 's'}…`);
  try {
    for (let i = 0; i < total; i++) {
      aviso.textContent = `Leyendo foto ${i + 1} de ${total}…`;
      let textos;
      try { textos = await leerCodigosDeFoto(files[i]); } catch (e) {
        problemas.push(`Foto ${i + 1}: no se pudo abrir (${e.message})`);
        continue;
      }
      const codigos = ordenarCodigosEtiqueta(textos);
      const rollo = codigos.find((x) => x.c.tipo === 'rollo');
      if (!rollo) {
        const utiles = codigos.filter((x) => x.c.tipo !== 'desconocido');
        if (utiles.length) {
          // Se guarda lo que sí se leyó; se completa cuando escriban o escaneen el número de rollo
          fotoSinRollo[rec.id] = utiles.map((x) => x.t);
          problemas.push(`Foto ${i + 1}: leí ${utiles.map((x) => x.t.replace(/\t/g, ' | ')).join(', ')} pero NO el número de rollo. Escríbelo o escanéalo en el campo de abajo y se completa con estos datos.`);
        } else {
          problemas.push(`Foto ${i + 1}: no pude leer ningún código. Toma la foto de frente, sin brillo y con todos los códigos completos.`);
        }
        continue;
      }
      // Se aplica como si se hubieran escaneado uno tras otro con el lector
      ultimoEscaneo[rec.id] = null;
      for (const x of codigos) if (x.c.tipo !== 'desconocido') procesarEscaneoRecepcion(rec, x.t);
      const r = Store.get('rollos', rollo.c.no_rollo);
      if (r && r.parte && r.largo_m) completos++;
      else problemas.push(`Foto ${i + 1} (${rollo.c.no_rollo}): faltó número de parte o metros; toma otra foto donde se vea el cuadrito`);
    }
  } finally {
    aviso.remove();
  }
  const msg = `📷 ${total} foto${total === 1 ? '' : 's'}: ${completos} rollo${completos === 1 ? '' : 's'} leído${completos === 1 ? '' : 's'} completo${completos === 1 ? '' : 's'}.`;
  if (total > 1 || problemas.length) {
    ultimoEscaneo[rec.id] = {
      tipo: problemas.length ? 'warn' : 'ok',
      texto: [msg, ...problemas].join('\n'),
      rolloId: ultimoEscaneo[rec.id] && ultimoEscaneo[rec.id].rolloId,
    };
  }
  beep(problemas.length ? 'warn' : 'ok');
  App.refrescar();
}

function toastFijo(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.getElementById('toasts').append(t);
  return t;
}

// Botones para usar en la recepción
function botonesFotoEtiqueta(rec) {
  const entrada = (attrs) => h('input', {
    type: 'file', accept: 'image/*', class: 'oculto', ...attrs,
    onchange: (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) procesarFotosEtiquetas(rec, fs); },
  });
  return h('div', {}, h('div', { class: 'botones-foto' },
    h('label', { class: 'btn btn-grande btn-primario' }, '📷 Foto a la etiqueta', entrada({ capture: 'environment' })),
    h('label', { class: 'btn btn-grande' }, '🖼️ Varias fotos de la galería', entrada({ multiple: true })),
  ), h('p', { class: 'tip' }, '💡 Foto de frente, sin brillo, con los 3 códigos de barras y el cuadrito completos. Puedes tomar las fotos de todos los rollos con la cámara del celular y luego elegirlas juntas en "Varias fotos".'));
}
