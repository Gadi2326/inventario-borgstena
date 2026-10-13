// Cargar la lista de embarque rápido: pegando el texto que copia el celular de una foto
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
    const mLargo = /^\D*?(\d{2,4}(?:[.,]\d+)?)/.exec(despues);
    const desc = md ? limpiarDesc(md[1]) : '';
    const pd = desc ? parseDescripcion(desc) : null;
    filas.push({
      no_rollo,
      lote: lotes.length ? loteDeMatch(lotes[0]) : (parseNoRollo(no_rollo) || {}).lote || '',
      parte: partes.length ? parteParecida(partes[0], desc) : '',
      descripcion: desc,
      largo: mLargo ? Number(mLargo[1].replace(',', '.')) : pd ? pd.largo_m : null,
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

  // Si falta el número de parte pero hay descripción, se busca otra fila con la misma descripción
  const porDesc = new Map(filas.filter((f) => f.parte && f.descripcion).map((f) => [f.descripcion, f.parte]));
  for (const f of filas) if (!f.parte && porDesc.has(f.descripcion)) f.parte = porDesc.get(f.descripcion);
  // La letra del lote y del rollo deben coincidir (el lector a veces lee I como 1)
  for (const f of filas) {
    const pr = parseNoRollo(f.no_rollo);
    if (pr && f.lote && f.lote.slice(1) === pr.lote.slice(1) && f.lote[0] !== pr.lote[0]) f.lote = pr.lote;
  }

  // Totales del papel para comparar
  let totales = null;
  const mt = /TOTAL\s*GENERAL[^\d]*([\d,.]+)\s+(\d+)\s+([\d,.]+)/.exec(t);
  if (mt) totales = { metros: Number(mt[1].replace(/,/g, '')), rollos: Number(mt[2]), kg: Number(mt[3].replace(/,/g, '')) };

  return { encabezado: enc, filas, totales, modo };
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
      h('tbody', {}, filas.map((f, i) => h('tr', { class: f.bloqueante ? 'fila-alerta' : f.avisos.length ? 'fila-aviso' : '' },
        h('td', {}, i + 1),
        h('td', {}, h('input', { value: f.parte || '', list: 'dl-partes', class: 'inp-tabla', onchange: (e) => { f.parte = e.target.value.toUpperCase().trim(); alCambiar(); } })),
        h('td', {}, celda(f, 'lote')),
        h('td', {}, celda(f, 'no_rollo', 'text', 'mono')),
        h('td', {}, celda(f, 'largo', 'number', 'inp-num')),
        h('td', { class: 'avisos' }, f.avisos.join(' · ')),
        h('td', {}, h('button', { type: 'button', class: 'btn btn-chico', title: 'Quitar renglón', onclick: () => { filas.splice(i, 1); alCambiar(); } }, '✕')),
      ))),
    )),
  );
}

function resumenFilas(filas, totales) {
  const metros = filas.reduce((s, f) => s + (f.largo || 0), 0);
  const ok = totales ? totales.rollos === filas.length && Math.abs(totales.metros - metros) < 0.5 : null;
  const porParte = new Map();
  for (const f of filas) {
    const k = `${f.parte || '¿?'} · ${f.lote || '¿?'}`;
    porParte.set(k, (porParte.get(k) || 0) + 1);
  }
  return h('div', {},
    h('div', { class: 'calc ' + (ok === true ? 'texto-verde' : ok === false ? 'texto-rojo' : '') },
      `Leí ${filas.length} rollos · ${fmtNum(metros)} m`,
      totales ? ` — la hoja dice ${totales.rollos} rollos · ${fmtNum(totales.metros)} m ${ok ? '✅ cuadra' : '❌ NO cuadra: revisa la foto o agrega los que falten'}` : ''),
    h('div', { class: 'chips-rollos' }, [...porParte.entries()].map(([k, n]) => h('span', { class: 'chip azul' }, `${k}: ${n}`))),
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

// Bloque reutilizable: pegar texto → revisar → (el que lo usa decide qué hacer con las filas)
function bloquePegarLista(estado, { alLeer, textoBoton }) {
  return h('div', { class: 'pegar-lista' },
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
