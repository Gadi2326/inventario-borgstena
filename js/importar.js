// Cargar la lista de embarque rápido: con una foto que lee la IA (Gemini, vía Supabase),
// o pegando el texto que copia el celular de una foto
// (Google Lens en Android, "Texto en vivo" en iPhone) o el de un PDF/correo del proveedor.
// La app busca en el texto los números de rollo, lotes, números de parte, descripciones y metros.

// Letras que el lector de fotos suele confundir con números (en la posición donde va una letra)
const LETRA_OCR = { '1': 'I', '|': 'I', 'L': 'I', '!': 'I', '0': 'O', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };
const letraOcr = (c) => (/[A-Z]/.test(c) && c !== 'L' ? c : LETRA_OCR[c] || c);

function normalizarTexto(t) {
  return (t || '').toUpperCase()
    .replace(/[–—−]/g, '-')
    .replace(/[“”"']/g, '')
    .replace(/ /g, ' ');
}

const RE_ROLLO = /(?<!\d)26\s?([A-Z0-9|!])\s?(\d{3})\s?(\d{2})\s?(\d{2})\s?(\d{3})(?!\d)/g;
const RE_LOTE = /(?<![A-Z0-9])([A-Z0-9|!])\s?-\s?(\d{3})\s?-\s?(\d{2})\s?-\s?(\d{2})(?![\d-])/g;
const RE_PARTE = /(?<![A-Z0-9-])([A-Z]{3,}-[A-Z0-9]{4,})(?![A-Z0-9-])/g;
const RE_DESC = /(\d[.,]\d{3}\s*X\s*\d{2,4}(?:[.,]\d+)?\s*X\s*\d[.,]\d{3,4}\s*-\s*\d{2}[^\n]*?)(?=\s+[A-Z0-9|!]\s?-\s?\d{3}\s?-|\s*$)/;

// Busca la parte del catálogo más parecida (para errores de lectura como SPONGE-AS27GN).
// Si hay empate, gana la que tiene el mismo espesor que la descripción.
function parteParecida(txt, desc) {
  const partes = Store.all('partes');
  if (partes.some((p) => p.id === txt)) return txt;
  const esp = (parseDescripcion(desc) || {}).espesor_mm;
  let mejor = null, dist = 3;
  for (const p of partes) {
    const d = distancia(txt, p.id) - (esp && p.espesor_mm === esp ? 0.5 : 0);
    if (d < dist) { dist = d; mejor = p.id; }
  }
  return mejor || txt;
}
function distancia(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function rolloDeMatch(m) {
  return `26${letraOcr(m[1])}${m[2]}${m[3]}${m[4]}${m[5]}`;
}
function loteDeMatch(m) {
  return `${letraOcr(m[1])}-${m[2]}-${m[3]}-${m[4]}`;
}
function limpiarDesc(d) {
  return d.replace(/,/g, '.').replace(/\s*X\s*/g, 'X').replace(/\s*-\s*/, '-').replace(/\s+/g, ' ').trim();
}

function parsearListaTexto(texto) {
  const t = normalizarTexto(texto);
  const enc = parsearEncabezado(t);
  const lineas = t.split(/\r?\n/);

  // 1) Intento renglón por renglón (cuando el texto conserva los renglones de la tabla)
  const filas = [];
  for (const linea of lineas) {
    const mr = [...linea.matchAll(RE_ROLLO)];
    if (mr.length !== 1) continue;
    const no_rollo = rolloDeMatch(mr[0]);
    const lotes = [...linea.matchAll(RE_LOTE)];
    const partes = [...linea.matchAll(RE_PARTE)].map((m) => m[1]).filter((p) => !/^TOTAL/.test(p));
    const md = RE_DESC.exec(linea);
    const despues = linea.slice(mr[0].index + mr[0][0].length);
    // El primer número entero después del rollo es el largo (no el peso, que trae decimales)
    const mLargo = /^\D*?(\d{2,4})(?![\d.,])/.exec(despues);
    const desc = md ? limpiarDesc(md[1]) : '';
    const pd = desc ? parseDescripcion(desc) : null;
    // Si el largo leído no coincide con el de la descripción, se confía en la descripción
    const largoLeido = mLargo ? Number(mLargo[1]) : null;
    filas.push({
      no_rollo,
      lote: lotes.length ? loteDeMatch(lotes[0]) : (parseNoRollo(no_rollo) || {}).lote || '',
      parte: partes.length ? parteParecida(partes[0], desc) : '',
      descripcion: desc,
      largo: pd && pd.largo_m ? pd.largo_m : largoLeido,
    });
  }
  let modo = 'renglones';

  // 2) Si el texto vino por columnas (pasa con algunas fotos), se emparejan las columnas en orden
  const completas = filas.filter((f) => f.parte && f.largo).length;
  if (!filas.length || completas < filas.length * 0.6) {
    const rollos = [...t.matchAll(RE_ROLLO)].map(rolloDeMatch);
    if (rollos.length) {
      const partes = [];
      for (const m of t.matchAll(RE_PARTE)) {
        const antes = t.slice(Math.max(0, m.index - 8), m.index);
        if (/TOTAL\s*$/.test(antes) || /^TOTAL/.test(m[1])) continue;
        partes.push(m[1]);
      }
      const descs = [];
      const reDescG = /\d[.,]\d{3}\s*X\s*\d{2,4}(?:[.,]\d+)?\s*X\s*\d[.,]\d{3,4}\s*-\s*\d{2}\/?[A-Z0-9]*(?:\s+(?:ST|GRS|RB|[A-Z]{2,3}))*/g;
      for (const m of t.matchAll(reDescG)) descs.push(limpiarDesc(m[0]));
      const lotes = [...t.matchAll(RE_LOTE)].map(loteDeMatch);
      const n = rollos.length;
      const previas = new Map(filas.map((f) => [f.no_rollo, f]));
      filas.length = 0;
      rollos.forEach((no_rollo, i) => {
        const pre = previas.get(no_rollo) || {};
        const desc = pre.descripcion || (descs.length === n ? descs[i] : '');
        const pd = desc ? parseDescripcion(desc) : null;
        filas.push({
          no_rollo,
          lote: pre.lote || (lotes.length === n ? lotes[i] : (parseNoRollo(no_rollo) || {}).lote || ''),
          parte: pre.parte || (partes.length === n ? parteParecida(partes[i], desc) : ''),
          descripcion: desc,
          largo: pre.largo || (pd ? pd.largo_m : null),
        });
      });
      modo = 'columnas';
    }
  }

  ajustarFilas(filas, enc.proveedor);

  // Totales del papel para comparar (general y por número de parte)
  let totales = null;
  const num = (x) => Number(String(x).replace(/,/g, ''));
  const mt = /TOTAL\s*GENERAL[^\d]*([\d,.]+)\s+(\d+)\s+([\d,.]+)/.exec(t);
  if (mt) totales = { metros: num(mt[1]), rollos: Number(mt[2]), kg: num(mt[3]) };
  const porParte = [...t.matchAll(/TOTAL\s+([A-Z]{3,}-[A-Z0-9]{4,})\s+([\d,.]+)\s+(\d+)\b/g)]
    .map((m) => ({ parte: m[1], metros: num(m[2]), rollos: Number(m[3]) }));
  if (porParte.length) totales = { ...(totales || {}), partes: porParte };

  return { encabezado: enc, filas, totales, modo };
}

// Correcciones finales a lo leído (sirve para el texto pegado y para la lectura con IA)
function ajustarFilas(filas, proveedor) {
  deducirFaltantes(filas, proveedor);
  // La letra del lote y del rollo deben coincidir (el lector a veces lee I como 1)
  for (const f of filas) {
    const pr = parseNoRollo(f.no_rollo);
    if (pr && f.lote && f.lote.slice(1) === pr.lote.slice(1) && f.lote[0] !== pr.lote[0]) f.lote = pr.lote;
  }
  // Se acomodan por número de parte (en el orden en que aparecen en la hoja)
  const orden = [...new Set(filas.map((f) => f.parte || ''))];
  filas.sort((a, b) => orden.indexOf(a.parte || '') - orden.indexOf(b.parte || ''));
  return filas;
}

// ---------- Leer la lista desde una foto con IA (Gemini, a través de Supabase) ----------

const sinEspacios = (x) => String(x ?? '').toUpperCase().replace(/\s+/g, '');
const mismaFactura = (a, b) => !!a && !!b && sinEspacios(a) === sinEspacios(b);

// Recepción que ya tenga esa factura (para avisar de listas repetidas)
function recepcionConFactura(factura, excluirId) {
  if (!factura) return null;
  return Store.all('recepciones').find((r) => r.id !== excluirId && mismaFactura(r.factura, factura)) || null;
}

// Junta lo que la IA leyó de cada foto en el mismo formato que el texto pegado
function hojasIAaLista(hojas) {
  const avisos = [];
  const buenas = [];
  hojas.forEach((hj, i) => {
    const n = hojas.length > 1 ? `Foto ${i + 1}: ` : '';
    if (!hj || hj.error) return avisos.push(n + ((hj && hj.error) || 'no se pudo leer.'));
    if (hj.es_lista_embarque === false || !(hj.rollos || []).length) return avisos.push(n + 'no parece una lista de embarque (no encontré rollos).');
    // ¿Es la misma hoja que otra foto? (casi todos los rollos se repiten)
    const set = new Set(hj.rollos.map((r) => sinEspacios(r.no_rollo)));
    const igual = buenas.find((b) => b.rollos.filter((r) => set.has(sinEspacios(r.no_rollo))).length >= Math.min(set.size, b.rollos.length) * 0.8);
    if (igual) return avisos.push(`⚠️ ${n}es la MISMA hoja que la foto ${igual.num} (DUPLICADA): no la tomé en cuenta.`);
    for (const a of hj.avisos || []) avisos.push(n + a);
    buenas.push({ ...hj, num: i + 1 });
  });
  if (!buenas.length) return { encabezado: {}, filas: [], totales: null, avisos, modo: 'ia' };

  const facturas = [...new Set(buenas.map((b) => sinEspacios(b.factura)).filter(Boolean))];
  if (facturas.length > 1) {
    throw new Error(`Las fotos son de ${facturas.length} facturas distintas (${facturas.join(', ')}). Sube solo las hojas de UNA lista a la vez.`);
  }

  const enc = encabezadoIA(buenas[0]);
  const filas = [];
  for (const b of buenas) {
    for (const r of b.rollos) {
      const desc = r.descripcion ? limpiarDesc(normalizarTexto(r.descripcion)) : '';
      filas.push({
        no_rollo: limpiarRolloIA(r.no_rollo),
        lote: limpiarLoteIA(r.lote),
        parte: limpiarParteIA(r.no_parte, desc),
        descripcion: desc,
        largo: Number(r.largo_m) || null,
      });
    }
  }
  ajustarFilas(filas, enc.proveedor);

  // Totales impresos: si hay varias hojas, cada una puede traer los suyos
  const partes = new Map();
  let general = null;
  for (const b of buenas) {
    for (const tp of b.totales_parte || []) {
      if (!tp.no_parte) continue;
      const k = limpiarParteIA(tp.no_parte, '');
      const prev = partes.get(k) || { parte: k, metros: 0, rollos: 0 };
      partes.set(k, { parte: k, metros: prev.metros + (Number(tp.metros) || 0), rollos: prev.rollos + (Number(tp.rollos) || 0) });
    }
    if (b.total_general && (b.total_general.metros || b.total_general.rollos)) {
      general = { metros: (general ? general.metros : 0) + (Number(b.total_general.metros) || 0), rollos: (general ? general.rollos : 0) + (Number(b.total_general.rollos) || 0) };
    }
  }
  let totales = general;
  if (partes.size) totales = { ...(totales || {}), partes: [...partes.values()] };

  return { encabezado: enc, filas, totales, avisos, modo: 'ia' };
}

function limpiarRolloIA(x) {
  const t = sinEspacios(x);
  // UREBLOCK: 26 + LETRA + 10 dígitos (la letra a veces se lee como número)
  return /^\d{2}[A-Z0-9|!]\d{10}$/.test(t) ? t.slice(0, 2) + letraOcr(t[2]) + t.slice(3) : t;
}
function limpiarLoteIA(x) {
  const t = sinEspacios(x).replace(/[–—−]/g, '-');
  // Los lotes siempre empiezan con letra
  return t && /[0-9|!]/.test(t[0]) && /^.-/.test(t) ? letraOcr(t[0]) + t.slice(1) : t;
}
// Solo corrige el número de parte si es casi igual a uno del catálogo y del mismo espesor
function limpiarParteIA(x, desc) {
  const t = sinEspacios(x);
  if (!t || Store.get('partes', t)) return t;
  const parecida = parteParecida(t, desc);
  const p = Store.get('partes', parecida);
  const esp = (parseDescripcion(desc) || {}).espesor_mm;
  return p && esp && p.espesor_mm === esp ? parecida : t;
}

function encabezadoIA(hj) {
  const enc = {};
  const pon = (k, v) => { const s = String(v ?? '').trim(); if (s) enc[k] = s.toUpperCase(); };
  ['po', 'factura', 'sello', 'transporte', 'tracto', 'caja', 'responsable_carga', 'chofer', 'entrega'].forEach((k) => pon(k, hj[k]));
  const placas = (hj.placas || []).map((p) => String(p).trim()).filter(Boolean);
  pon('placas', placas[0]);
  pon('placas2', placas[1]);
  const mf = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(hj.fecha || '');
  if (mf) enc.fecha = `${mf[3]}-${pad2(mf[2])}-${pad2(mf[1])}`;
  if (hj.proveedor) {
    const t = normalizarTexto(hj.proveedor);
    const prov = Store.all('proveedores').find((p) => t.includes(p.id) || t.includes(normalizarTexto(p.nombre)) || normalizarTexto(p.nombre).includes(t));
    if (prov) enc.proveedor = prov.id;
  }
  return enc;
}

async function leerFotosConIA(estado, files, alLeer) {
  estado.leyendo = true;
  App.refrescar();
  try {
    const imagenes = [];
    for (const f of files.slice(0, 6)) {
      // Grande y nítida para que se lean bien las letras chicas de la tabla
      const url = await comprimirFoto(f, 2400, 0.85);
      imagenes.push({ mime: 'image/jpeg', datos: url.split(',')[1] });
    }
    const resp = await Store.funcion('leer-lista', { imagenes });
    const r = hojasIAaLista(resp.hojas || []);
    if (!r.filas.length) {
      toast(r.avisos[0] || 'No encontré rollos en la foto.', 'error');
      estado.avisos = r.avisos;
      return;
    }
    estado.avisos = r.avisos;
    alLeer(r);
  } catch (e) {
    toast(e.message || 'No se pudo leer la foto.', 'error');
  } finally {
    estado.leyendo = false;
    App.refrescar();
  }
}

// Avisos de la lectura (fotos duplicadas, datos que no se alcanzaron a leer…)
function avisosLectura(avisos) {
  if (!avisos || !avisos.length) return null;
  return h('div', { class: 'card aviso' }, avisos.map((a) => h('div', {}, a.startsWith('⚠️') ? a : '⚠️ ' + a)));
}

// Cuando Google Lens no leyó el número de parte o los metros, se deducen de lo que sí leyó.
// Lo deducido queda marcado para que la persona lo revise.
function deducirFaltantes(filas, proveedor) {
  const masComun = (vals) => {
    const c = new Map();
    for (const v of vals) if (v) c.set(v, (c.get(v) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  };
  const marcar = (f, campo, valor, como) => { f[campo] = valor; (f.deducido = f.deducido || []).push(`${campo === 'parte' ? 'No. parte' : 'metros'} ${como}`); };
  const partes = Store.all('partes').filter((p) => p.activa !== false && (!proveedor || !p.proveedor || p.proveedor === proveedor));

  for (const f of filas) {
    if (f.parte) continue;
    const d = parseDescripcion(f.descripcion);
    // 1) Misma descripción en otro renglón
    const porDesc = f.descripcion && masComun(filas.filter((x) => x !== f && x.parte && x.descripcion === f.descripcion).map((x) => x.parte));
    if (porDesc) { marcar(f, 'parte', porDesc, 'por la descripción'); continue; }
    // 2) El catálogo: el único número de parte con ese espesor
    if (d) {
      const cand = partes.filter((p) => p.espesor_mm === d.espesor_mm && (!p.ancho_m || Math.abs(p.ancho_m - d.ancho_m) < 0.01));
      if (cand.length === 1) { marcar(f, 'parte', cand[0].id, `por el espesor (${d.espesor_mm} mm)`); continue; }
    }
    // 3) Los demás rollos del mismo lote
    const porLote = f.lote && masComun(filas.filter((x) => x !== f && x.parte && x.lote === f.lote).map((x) => x.parte));
    if (porLote) marcar(f, 'parte', porLote, 'por el lote');
  }

  for (const f of filas) {
    if (f.largo) continue;
    const d = parseDescripcion(f.descripcion);
    if (d && d.largo_m) { marcar(f, 'largo', d.largo_m, 'de la descripción'); continue; }
    const porLote = masComun(filas.filter((x) => x !== f && x.largo && x.lote === f.lote && x.parte === f.parte).map((x) => x.largo));
    if (porLote) { marcar(f, 'largo', porLote, 'por el lote'); continue; }
    const p = Store.get('partes', f.parte);
    if (p && p.largo_tipico_m) marcar(f, 'largo', p.largo_tipico_m, 'normal del número de parte');
  }
}

function parsearEncabezado(t) {
  const busca = (re) => { const m = re.exec(t); return m ? m[1].trim() : ''; };
  const enc = {
    po: busca(/PO\s*#?\s*:?\s*([A-Z]{2,}\d{3,}[A-Z0-9]*)/),
    factura: busca(/FACTURA\s*:?\s*(\d{4,}\s?[A-Z0-9]{0,3})\b/),
    sello: busca(/SELLO\s*:?\s*(\d{3,})/),
    transporte: busca(/TRANSPORTE\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]{1,30}?)\s*(?:\n|TRACTO|$)/),
    responsable_carga: busca(/RESPONSABLE\s+DE\s+CARGA\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]{1,30}?)\s*(?:\n|NOMBRE|$)/),
    chofer: busca(/CHOFER\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]{1,30}?)\s*(?:\n|NOMBRE|$)/),
  };
  const placas = [...t.matchAll(/PLACAS[ \t]*:?[ \t]*([A-Z0-9]{5,8})\b/g)].map((m) => m[1]).filter((p) => !/^PLACAS/.test(p));
  if (placas[0]) enc.placas = placas[0];
  if (placas[1]) enc.placas2 = placas[1];
  const mf = /FECHA\s*:?\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(t);
  if (mf) enc.fecha = `${mf[3]}-${pad2(mf[2])}-${pad2(mf[1])}`;
  const prov = Store.all('proveedores').find((p) => t.includes(p.id) || t.includes(normalizarTexto(p.nombre)));
  if (prov) enc.proveedor = prov.id;
  for (const k of Object.keys(enc)) if (!enc[k]) delete enc[k];
  return enc;
}

// Revisa cada fila antes de guardarla
function revisarFilas(filas) {
  const vistos = new Map();
  for (const f of filas) {
    const av = [];
    if (!f.no_rollo) av.push('Falta No. de rollo');
    else if (!parseNoRollo(f.no_rollo)) av.push('No. de rollo con formato distinto al de UREBLOCK (revisa)');
    if (vistos.has(f.no_rollo)) av.push('Repetido en la lista');
    vistos.set(f.no_rollo, true);
    const existente = Store.get('rollos', f.no_rollo);
    if (existente) {
      const rec = Store.get('recepciones', existente.recepcion_id);
      av.push(`Ya existe (factura ${rec ? rec.factura : '?'})`);
    }
    if (!f.parte) av.push('Falta No. de parte');
    else if (!Store.get('partes', f.parte)) av.push('No. de parte NUEVO: se agregará al catálogo');
    if (!f.lote) av.push('Falta lote');
    if (!f.largo) av.push('Faltan metros');
    if (f.deducido && f.deducido.length) av.push('Deducido: ' + f.deducido.join(', ') + ' (revisa)');
    f.avisos = av;
    f.bloqueante = av.some((a) => /Falta No\. de rollo|Repetido|Ya existe/.test(a));
  }
  return filas;
}

// Tabla para revisar y corregir lo que se leyó
function tablaRevisionFilas(filas, alCambiar) {
  revisarFilas(filas);
  const celda = (f, k, tipo = 'text', cls = '') => h('input', {
    type: tipo, value: f[k] ?? '', class: 'inp-tabla ' + cls, step: 'any',
    onchange: (e) => { f[k] = tipo === 'number' ? Number(e.target.value) || null : e.target.value.toUpperCase().trim(); alCambiar(); },
  });
  const listaPartes = h('datalist', { id: 'dl-partes' }, Store.all('partes').map((p) => h('option', { value: p.id })));
  return h('div', {},
    listaPartes,
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla tabla-edit' },
      h('thead', {}, h('tr', {}, ['#', 'No. parte', 'Lote', 'No. rollo', 'Metros', 'Avisos', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, filas.map((f, i) => [
        // Separador cada vez que cambia el número de parte
        i === 0 || filas[i - 1].parte !== f.parte
          ? h('tr', { class: 'fila-separador' }, h('td', { colspan: 7 }, `${f.parte || 'Sin No. de parte'} · ${filas.filter((x) => x.parte === f.parte).length} rollos`))
          : null,
        h('tr', { class: f.bloqueante ? 'fila-alerta' : f.avisos.length ? 'fila-aviso' : '' },
        h('td', {}, i + 1),
        h('td', {}, h('input', { value: f.parte || '', list: 'dl-partes', class: 'inp-tabla', onchange: (e) => { f.parte = e.target.value.toUpperCase().trim(); alCambiar(); } })),
        h('td', {}, celda(f, 'lote')),
        h('td', {}, celda(f, 'no_rollo', 'text', 'mono')),
        h('td', {}, celda(f, 'largo', 'number', 'inp-num')),
        h('td', { class: 'avisos' }, f.avisos.join(' · ')),
        h('td', {}, h('button', { type: 'button', class: 'btn btn-chico', title: 'Quitar renglón', onclick: () => { filas.splice(i, 1); alCambiar(); } }, '✕')),
      )])),
    )),
  );
}

function resumenFilas(filas, totales) {
  const metros = filas.reduce((s, f) => s + (f.largo || 0), 0);
  const hayGeneral = totales && (totales.rollos || totales.metros);
  const ok = hayGeneral ? totales.rollos === filas.length && Math.abs(totales.metros - metros) < 0.5 : null;
  const porLote = new Map();
  for (const f of filas) {
    const k = `${f.parte || '¿?'} · ${f.lote || '¿?'}`;
    porLote.set(k, (porLote.get(k) || 0) + 1);
  }
  // Por número de parte: lo leído contra el renglón "Total ..." de la hoja
  const grupos = new Map();
  for (const f of filas) {
    const g = grupos.get(f.parte || '¿?') || { rollos: 0, metros: 0, largos: new Map() };
    g.rollos++; g.metros += f.largo || 0;
    g.largos.set(f.largo || 0, (g.largos.get(f.largo || 0) || 0) + 1);
    grupos.set(f.parte || '¿?', g);
  }
  const hoja = new Map(((totales && totales.partes) || []).map((p) => [p.parte, p]));
  for (const p of hoja.keys()) if (!grupos.has(p)) grupos.set(p, { rollos: 0, metros: 0, largos: new Map() });
  const lineaParte = ([parte, g]) => {
    const t = hoja.get(parte);
    const okP = t ? t.rollos === g.rollos && Math.abs(t.metros - g.metros) < 0.5 : null;
    const largos = g.largos.size > 1
      ? ` (${[...g.largos.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${n} de ${fmtNum(l)} m`).join(', ')})`
      : '';
    return h('div', { class: okP === true ? 'texto-verde' : okP === false ? 'texto-rojo' : '' },
      h('b', {}, parte), ` — ${g.rollos} rollos · ${fmtNum(g.metros)} m${largos}`,
      t ? (okP ? ' ✅ cuadra con la hoja' : ` ❌ la hoja dice ${t.rollos} rollos · ${fmtNum(t.metros)} m`) : '');
  };
  return h('div', {},
    h('div', { class: 'calc ' + (ok === true ? 'texto-verde' : ok === false ? 'texto-rojo' : '') },
      `Leí ${filas.length} rollos · ${fmtNum(metros)} m`,
      hayGeneral ? ` — la hoja dice ${totales.rollos} rollos · ${fmtNum(totales.metros)} m ${ok ? '✅ cuadra' : '❌ NO cuadra: revisa la foto o agrega los que falten'}` : ''),
    h('div', { class: 'resumen-partes' }, [...grupos.entries()].map(lineaParte)),
    h('div', { class: 'chips-rollos' }, [...porLote.entries()].map(([k, n]) => h('span', { class: 'chip azul' }, `${k}: ${n}`))),
  );
}

// Crea los rollos de la lista (y los números de parte nuevos)
function guardarFilasEnRecepcion(rec, filas) {
  let n = 0, nuevas = 0;
  for (const f of revisarFilas(filas)) {
    if (f.bloqueante) continue;
    if (f.parte && !Store.get('partes', f.parte)) {
      crearParteDesdeDescripcion(f.parte, f.descripcion, rec.proveedor, rec.almacen);
      nuevas++;
    }
    agregarRenglonLista(rec, { parte: f.parte, desc: f.descripcion, lote: f.lote, no_rollo: f.no_rollo, largo: f.largo });
    n++;
  }
  return { n, nuevas, omitidas: filas.length - n };
}

function crearParteDesdeDescripcion(id, desc, proveedor, almacen) {
  const d = parseDescripcion(desc) || {};
  return Store.put('partes', {
    id, almacen, proveedor: proveedor || '', material: almacen === 'FOAM' ? 'Esponja' : '',
    espesor_mm: d.espesor_mm || null, tolerancia_mm: 0.5, ancho_m: d.ancho_m || null, densidad: d.densidad || null,
    largo_tipico_m: d.largo_m || null,
    activa: true, revisar: true,
  });
}

// Bloque reutilizable: foto con IA o pegar texto → revisar → (el que lo usa decide qué hacer con las filas)
function bloquePegarLista(estado, { alLeer, textoBoton }) {
  const entrada = (attrs) => h('input', {
    type: 'file', accept: 'image/*', class: 'oculto', disabled: estado.leyendo, ...attrs,
    onchange: (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) leerFotosConIA(estado, fs, alLeer); },
  });
  const conIA = NUBE ? h('div', { class: 'leer-ia' },
    h('h3', {}, '🤖 Leer la foto con IA'),
    estado.leyendo
      ? h('div', { class: 'calc' }, '⏳ Leyendo la lista… puede tardar hasta un minuto. No cierres la pantalla.')
      : h('div', { class: 'botones-foto' },
        h('label', { class: 'btn btn-grande btn-primario' }, '📷 Foto a la lista', entrada({ capture: 'environment' })),
        h('label', { class: 'btn btn-grande' }, '🖼️ Elegir fotos (varias hojas)', entrada({ multiple: true })),
      ),
    h('p', { class: 'tip' }, '💡 De frente y con buena luz, que se vea toda la tabla hasta el "Total general". Las palomitas y notas a mano no importan: se ignoran.'),
    h('h3', {}, '📋 O pega el texto'),
  ) : null;
  return h('div', { class: 'pegar-lista' },
    conIA,
    h('ol', { class: 'pasos' },
      h('li', {}, 'Toma foto a la lista de embarque con ', h('b', {}, 'Google Lens'), ' (Android) o la ', h('b', {}, 'cámara del iPhone'), '.'),
      h('li', {}, 'Toca ', h('b', {}, '"Copiar texto"'), ' (o selecciona todo el texto y copia).'),
      h('li', {}, 'Pégalo aquí abajo y toca ', h('b', {}, textoBoton || 'Leer lista'), '. También sirve texto copiado de un PDF o correo.'),
    ),
    h('textarea', {
      class: 'texto-lista', rows: 6, placeholder: 'Pega aquí el texto de la lista de embarque…',
      oninput: (e) => { estado.texto = e.target.value; },
    }, estado.texto || ''),
    h('div', { class: 'acciones' },
      h('button', {
        type: 'button', class: 'btn btn-primario',
        onclick: () => {
          if (!(estado.texto || '').trim()) return toast('Primero pega el texto.', 'error');
          const r = parsearListaTexto(estado.texto);
          if (!r.filas.length) return toast('No encontré números de rollo en el texto. Revisa que copiaste la tabla.', 'error');
          estado.avisos = null;
          alLeer(r);
        },
      }, '🔎 ' + (textoBoton || 'Leer lista')),
      h('button', {
        type: 'button', class: 'btn',
        onclick: async () => {
          try {
            estado.texto = await navigator.clipboard.readText();
            App.refrescar();
          } catch (e) { toast('No pude leer el portapapeles. Mantén presionado el cuadro y elige "Pegar".', 'error'); }
        },
      }, '📋 Pegar'),
    ),
  );
}
