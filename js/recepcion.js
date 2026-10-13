// Recepción de camiones: encabezado de la lista de embarque + escaneo de cada rollo.

const esTactil = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const ultimoEscaneo = {}; // recepcion_id -> { rolloId, tipo, texto }

function rollosDeRecepcion(recId) {
  return Store.where('rollos', (r) => r.recepcion_id === recId).sort((a, b) => (a.renglon || 9999) - (b.renglon || 9999));
}

function agregarAlerta(rollo, msg) {
  rollo.alertas = rollo.alertas || [];
  if (!rollo.alertas.includes(msg)) rollo.alertas.push(msg);
}

function nombreProveedor(id) {
  const p = Store.get('proveedores', id);
  return p ? p.nombre : id || '';
}

// ---------- Lista de recepciones ----------
function vistaRecepciones() {
  const alm = App.almacen();
  const recs = Store.where('recepciones', (r) => r.almacen === alm).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return h('div', {},
    h('h1', {}, 'Recepciones'),
    h('a', { class: 'btn btn-grande btn-primario', href: '#/recepcion-nueva' }, '🚚 Nueva recepción (llegó un camión)'),
    recs.length === 0 ? h('p', { class: 'muted' }, 'Todavía no hay recepciones en este almacén.') : null,
    recs.map((rec) => {
      const rollos = rollosDeRecepcion(rec.id);
      const esp = rollos.filter((r) => r.en_lista).length;
      const rec_ = rollos.filter((r) => r.recibido).length;
      return h('a', { class: 'card card-link', href: '#/recepcion/' + rec.id },
        h('div', { class: 'fila-entre' },
          h('b', {}, `Factura ${rec.factura || '—'} · PO ${rec.po || '—'}`),
          h('span', { class: 'chip ' + (rec.estado === 'abierta' ? 'amarillo' : 'verde') }, rec.estado === 'abierta' ? 'Abierta' : 'Cerrada'),
        ),
        h('div', { class: 'muted' }, `${fmtFecha(rec.fecha)} · ${nombreProveedor(rec.proveedor)} · Recibidos ${rec_} de ${esp} en lista`),
      );
    }),
  );
}

// ---------- Nueva recepción ----------
const CAMPOS_ENCABEZADO = [
  ['po', 'PO#'], ['factura', 'Factura'], ['transporte', 'Transporte'], ['tracto', 'Tracto#'], ['caja', 'Caja#'],
  ['sello', 'Sello'], ['placas', 'Placas'], ['placas2', 'Placas (2)'], ['responsable_carga', 'Responsable de carga'],
  ['chofer', 'Línea transportista / chofer'], ['entrega', 'Entrega'],
];

// Lo que se va capturando en "Nueva recepción" (se conserva al cambiar de pantalla)
let borradorRec = null;

function proveedoresActivos(alm) {
  return Store.where('proveedores', (p) => p.almacen === alm && p.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Agrega un proveedor nuevo preguntando su nombre; regresa su id
function agregarProveedor(alm) {
  const nombre = (window.prompt('Nombre del proveedor nuevo (ej. "ESPUMAS DEL NORTE S.A. DE C.V.")') || '').trim();
  if (!nombre) return null;
  const id = nombre.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/)[0].replace(/[^A-Z0-9]/g, '') || uid();
  const final = Store.get('proveedores', id) ? id + '-' + uid().slice(-4).toUpperCase() : id;
  Store.put('proveedores', { id: final, nombre, almacen: alm, activo: true });
  toast(`Proveedor "${nombre}" agregado.`);
  return final;
}

function vistaRecepcionNueva() {
  const alm = App.almacen();
  const provs = proveedoresActivos(alm);
  if (!borradorRec || borradorRec.almacen !== alm) {
    borradorRec = {
      almacen: alm, texto: '', filas: null, totales: null,
      f: { fecha: isoAFechaInput(new Date().toISOString()), entrega: 'DUAL BORGSTENA TRIM MEXICO', proveedor: provs[0] && provs[0].id },
    };
  }
  const b = borradorRec, f = b.f;
  const campo = (k, label, tipo = 'text') => h('label', { class: 'campo' + (b.leidos && b.leidos.includes(k) ? ' leido' : '') }, label,
    h('input', { type: tipo, value: f[k] || '', oninput: (e) => { f[k] = e.target.value; } }));

  return h('div', {},
    h('h1', {}, 'Nueva recepción'),

    h('details', { class: 'card card-rapido', open: !b.filas },
      h('summary', {}, h('b', {}, '⚡ Llenar rápido con una foto de la lista')),
      bloquePegarLista(b, {
        alLeer: (r) => {
          b.leidos = Object.keys(r.encabezado);
          Object.assign(f, r.encabezado);
          b.filas = r.filas;
          b.totales = r.totales;
          toast(`Leí ${r.filas.length} rollos${b.leidos.length ? ' y datos del encabezado' : ''}. Revísalos abajo.`);
          App.refrescar();
        },
      }),
      h('div', { class: 'acciones' },
        h('label', { class: 'btn' }, '📥 O importar un Excel', h('input', {
          type: 'file', accept: '.xlsx,.xls,.csv', class: 'oculto',
          onchange: async (e) => {
            const filas = e.target.files[0] && await leerExcelFilas(e.target.files[0]);
            if (filas && filas.length) { b.filas = filas; b.totales = null; App.refrescar(); }
          },
        })),
      ),
    ),

    h('div', { class: 'card' },
      h('h2', {}, 'Encabezado de la lista de embarque'),
      b.leidos && b.leidos.length ? h('p', { class: 'muted' }, 'Los campos en verde se llenaron solos: revísalos.') : null,
      h('div', { class: 'form-grid' },
        h('label', { class: 'campo' + (b.leidos && b.leidos.includes('proveedor') ? ' leido' : '') }, 'Proveedor',
          h('div', { class: 'fila' },
            h('select', { onchange: (e) => { f.proveedor = e.target.value; } },
              provs.map((p) => h('option', { value: p.id, selected: p.id === f.proveedor }, p.nombre))),
            h('button', {
              type: 'button', class: 'btn btn-chico', title: 'Agregar otro proveedor',
              onclick: () => { const id = agregarProveedor(alm); if (id) { f.proveedor = id; App.refrescar(); } },
            }, '➕ Otro'),
          )),
        campo('fecha', 'Fecha', 'date'),
        CAMPOS_ENCABEZADO.map(([k, l]) => campo(k, l)),
      ),
    ),

    b.filas ? h('div', { class: 'card' },
      h('h2', {}, `Rollos de la lista (${b.filas.length})`),
      resumenFilas(b.filas, b.totales),
      h('p', { class: 'muted' }, 'Corrige cualquier dato mal leído tocando la celda. Los renglones en rojo no se guardarán.'),
      tablaRevisionFilas(b.filas, () => App.refrescar()),
    ) : h('p', { class: 'muted' }, 'También puedes crear la recepción sin lista y escanear cada rollo con su código 2D (cuadrito).'),

    h('div', { class: 'acciones' },
      h('button', {
        class: 'btn btn-grande btn-primario',
        onclick: () => {
          if (!f.factura && !f.po) return toast('Escribe al menos la factura o el PO.', 'error');
          if (!f.proveedor) return toast('Elige o agrega el proveedor.', 'error');
          const filas = b.filas ? revisarFilas(b.filas) : [];
          const malas = filas.filter((x) => x.bloqueante).length;
          if (malas && !confirmar(`${malas} renglón(es) en rojo no se guardarán. ¿Continuar?`)) return;
          const rec = Store.put('recepciones', {
            ...f, fecha: fechaInputAIso(f.fecha), almacen: alm, estado: 'abierta',
            creado_por: Sesion.usuario().nombre, creado_en: new Date().toISOString(),
            totales_papel: b.totales || null,
          });
          if (filas.length) {
            const r = guardarFilasEnRecepcion(rec, filas);
            toast(`Recepción creada con ${r.n} rollos en la lista.${r.nuevas ? ` Se agregaron ${r.nuevas} números de parte nuevos (revísalos en Ajustes).` : ''}`);
          }
          borradorRec = null;
          App.ir('/recepcion/' + rec.id);
        },
      }, b.filas ? `✅ Crear recepción con ${b.filas.filter((x) => !x.bloqueante).length} rollos` : 'Crear y empezar a escanear'),
      h('button', { class: 'btn', onclick: () => { if (confirmar('¿Borrar lo capturado?')) { borradorRec = null; App.refrescar(); } } }, 'Limpiar'),
    ),
  );
}

// ---------- Detalle de una recepción ----------
function vistaRecepcion(id) {
  const rec = Store.get('recepciones', id);
  if (!rec) return h('div', { class: 'card' }, 'No existe esta recepción.');
  const rollos = rollosDeRecepcion(id);
  const enLista = rollos.filter((r) => r.en_lista);
  const recibidos = rollos.filter((r) => r.recibido);
  const faltan = enLista.filter((r) => !r.recibido);
  const sobrantes = rollos.filter((r) => !r.en_lista);
  const conAlerta = rollos.filter((r) => r.alertas && r.alertas.length);
  const abierta = rec.estado === 'abierta';
  const ult = ultimoEscaneo[id];

  return h('div', {},
    h('div', { class: 'fila-entre' },
      h('h1', {}, `Recepción · Factura ${rec.factura || '—'}`),
      h('span', { class: 'chip ' + (abierta ? 'amarillo' : 'verde') }, abierta ? 'Abierta' : 'Cerrada'),
    ),
    encabezadoRecepcion(rec),

    abierta ? h('div', { class: 'card scan-card' },
      h('h2', {}, 'Escanear rollos'),
      h('p', { class: 'muted' }, 'Escanea el NÚMERO DE ROLLO. Si quieres verificar la etiqueta, escanea después el LOTE o el código 2D (cuadrito) del mismo rollo.'),
      campoEscaneo((txt) => { procesarEscaneoRecepcion(rec, txt); App.refrescar(); },
        { continuo: true, autofocus: !esTactil(), placeholder: 'Escanea el número de rollo…' }),
      ult ? h('div', { class: 'resultado-escaneo ' + ult.tipo }, ult.texto) : null,
      h('div', { class: 'progreso' },
        h('div', { class: 'progreso-barra', style: `width:${enLista.length ? (100 * enLista.filter((r) => r.recibido).length / enLista.length) : 0}%` })),
      h('div', { class: 'muted centro' }, `${enLista.filter((r) => r.recibido).length} de ${enLista.length} rollos de la lista · ${sobrantes.length} fuera de lista`),
    ) : null,

    tablaResumenLotes(rollos),

    conAlerta.length ? h('div', { class: 'card borde-rojo' },
      h('h2', {}, `⚠️ Alertas (${conAlerta.length})`),
      conAlerta.map((r) => h('a', { class: 'fila-link', href: '#/rollo/' + encodeURIComponent(r.id) },
        h('b', {}, r.no_rollo), ' — ', r.alertas.join('; '))),
    ) : null,

    sobrantes.length ? h('div', { class: 'card borde-rojo' },
      h('h2', {}, `➕ Rollos que NO vienen en la lista (${sobrantes.length})`),
      tablaRollos(sobrantes),
    ) : null,

    faltan.length ? h('details', { class: 'card', open: !abierta },
      h('summary', {}, h('b', {}, abierta ? `Por escanear (${faltan.length})` : `❌ Faltantes: no llegaron (${faltan.length})`)),
      tablaRollos(faltan),
    ) : null,

    h('details', { class: 'card' },
      h('summary', {}, h('b', {}, `Lista de embarque completa (${enLista.length} rollos)`)),
      tablaRollos(enLista, true),
    ),

    abierta ? capturaLista(rec) : null,

    !abierta ? seccionInspeccionesRecepcion(rec, recibidos) : null,

    h('div', { class: 'acciones' },
      abierta ? h('button', {
        class: 'btn btn-grande btn-primario',
        onclick: () => cerrarRecepcion(rec),
      }, '✅ Terminar recepción') : null,
      !abierta && Sesion.puede('aprobar') ? h('button', {
        class: 'btn',
        onclick: () => {
          if (!confirmar('¿Reabrir esta recepción para seguir escaneando?')) return;
          rec.estado = 'abierta';
          for (const r of rollos) if (r.estado === 'faltante') r.estado = 'en_transito';
          Store.put('recepciones', rec); Store.putMany('rollos', rollos);
          App.refrescar();
        },
      }, 'Reabrir recepción') : null,
      h('button', { class: 'btn', onclick: () => exportarRecepcionExcel(rec) }, '📊 Exportar a Excel'),
    ),
  );
}

function encabezadoRecepcion(rec) {
  const dato = (l, v) => v ? h('div', { class: 'dato' }, h('span', {}, l), h('b', {}, v)) : null;
  return h('details', { class: 'card' },
    h('summary', {}, h('b', {}, `${fmtFecha(rec.fecha)} · ${nombreProveedor(rec.proveedor)} · PO ${rec.po || '—'}`)),
    h('div', { class: 'datos-grid' },
      CAMPOS_ENCABEZADO.map(([k, l]) => dato(l, rec[k])),
      dato('Capturó', rec.creado_por),
    ),
  );
}

// Resumen por lote y número de parte, como las cuentas a pluma de la hoja
function tablaResumenLotes(rollos) {
  const grupos = new Map();
  for (const r of rollos) {
    const k = `${r.parte || '¿?'}|${r.lote_proveedor || '¿?'}`;
    if (!grupos.has(k)) grupos.set(k, { parte: r.parte || '¿?', lote: r.lote_proveedor || '¿?', esp: 0, espM: 0, rec: 0, recM: 0, sob: 0 });
    const g = grupos.get(k);
    if (r.en_lista) { g.esp++; g.espM += r.largo_m || 0; }
    if (r.recibido) { g.rec++; g.recM += r.largo_m || 0; }
    if (!r.en_lista) g.sob++;
  }
  const gs = [...grupos.values()].sort((a, b) => (a.parte + a.lote).localeCompare(b.parte + b.lote));
  const tot = gs.reduce((t, g) => ({ esp: t.esp + g.esp, espM: t.espM + g.espM, rec: t.rec + g.rec, recM: t.recM + g.recM }), { esp: 0, espM: 0, rec: 0, recM: 0 });
  return h('div', { class: 'card' },
    h('h2', {}, 'Rollos por número de parte y lote'),
    h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'No. parte'), h('th', {}, 'Lote'), h('th', { class: 'num' }, 'En lista'),
        h('th', { class: 'num' }, 'Recibidos'), h('th', { class: 'num' }, 'Metros recibidos'), h('th', {}, ''))),
      h('tbody', {}, gs.map((g) => h('tr', {},
        h('td', {}, g.parte), h('td', {}, g.lote),
        h('td', { class: 'num' }, g.esp), h('td', { class: 'num' }, g.rec),
        h('td', { class: 'num' }, fmtM(g.recM)),
        h('td', {}, g.sob ? h('span', { class: 'chip rojo' }, `+${g.sob} fuera de lista`)
          : g.rec === g.esp ? h('span', { class: 'chip verde' }, '✓ Completo')
            : h('span', { class: 'chip amarillo' }, `Faltan ${g.esp - g.rec}`)),
      ))),
      h('tfoot', {}, h('tr', {}, h('td', { colspan: 2 }, 'Total'), h('td', { class: 'num' }, tot.esp),
        h('td', { class: 'num' }, tot.rec), h('td', { class: 'num' }, fmtM(tot.recM)), h('td', {}, ''))),
    )),
  );
}

function tablaRollos(rollos, conPalomita = false) {
  if (!rollos.length) return h('p', { class: 'muted' }, 'Ninguno.');
  return h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' },
    h('thead', {}, h('tr', {},
      conPalomita ? h('th', {}, '✓') : null,
      h('th', {}, 'No. rollo'), h('th', {}, 'No. parte'), h('th', {}, 'Lote'), h('th', { class: 'num' }, 'Largo'), h('th', {}, 'Estado'))),
    h('tbody', {}, rollos.map((r) => h('tr', { class: r.alertas && r.alertas.length ? 'fila-alerta' : '' },
      conPalomita ? h('td', { class: 'centro' }, r.recibido ? '✅' : '⬜') : null,
      h('td', {}, h('a', { href: '#/rollo/' + encodeURIComponent(r.id) }, r.no_rollo), r.marca_punto ? h('span', { title: 'Marcado con punto en la hoja de papel' }, ' •') : null),
      h('td', {}, r.parte || '¿?'), h('td', {}, r.lote_proveedor || '¿?'),
      h('td', { class: 'num' }, fmtM(r.largo_m)), h('td', {}, etiquetaEstado(r.estado)),
    ))),
  ));
}

// ---------- Lógica del escaneo ----------
function procesarEscaneoRecepcion(rec, txt) {
  const c = clasificarCodigo(txt);
  const user = Sesion.usuario().nombre;
  const ult = ultimoEscaneo[rec.id];
  const anterior = ult && ult.rolloId ? Store.get('rollos', ult.rolloId) : null;
  const res = (tipo, texto, rolloId) => {
    ultimoEscaneo[rec.id] = { tipo, texto, rolloId: rolloId !== undefined ? rolloId : (anterior && anterior.id) };
    beep(tipo === 'ok' ? 'ok' : tipo === 'warn' ? 'warn' : 'error');
  };

  if (c.tipo === 'rollo') {
    const r = Store.get('rollos', c.no_rollo);
    if (r && r.recepcion_id !== rec.id) {
      const otra = Store.get('recepciones', r.recepcion_id);
      return res('error', `❌ ${c.no_rollo} ya está registrado en otra recepción (factura ${otra ? otra.factura : '?'}, ${otra ? fmtFecha(otra.fecha) : ''}).`, null);
    }
    if (r && r.recibido) {
      r.escaneos_repetidos = (r.escaneos_repetidos || 0) + 1;
      Store.put('rollos', r);
      return res('warn', `⚠️ ${c.no_rollo} YA se había escaneado. No se contó dos veces.`, r.id);
    }
    if (r) {
      Object.assign(r, { recibido: true, recibido_en: new Date().toISOString(), recibido_por: user, estado: 'inspeccion_pendiente', ubicacion_id: ubicacionPorDefecto(rec.almacen) });
      let aviso = '';
      if (r.lote_proveedor && c.lote && c.lote !== r.lote_proveedor) {
        aviso = ` El número de rollo sugiere lote ${c.lote} y la lista dice ${r.lote_proveedor}.`;
        agregarAlerta(r, `El número de rollo sugiere lote ${c.lote} pero la lista dice ${r.lote_proveedor}`);
      }
      Store.put('rollos', r);
      registrarMovimiento(r, 'recepcion', `Recibido en factura ${rec.factura || ''}`, { a: r.ubicacion_id });
      return res(aviso ? 'warn' : 'ok', `✅ ${r.no_rollo} · ${r.parte} · lote ${r.lote_proveedor} · ${fmtM(r.largo_m)}.${aviso}`, r.id);
    }
    // No viene en la lista
    const nuevo = Store.put('rollos', {
      id: c.no_rollo, no_rollo: c.no_rollo, almacen: rec.almacen, recepcion_id: rec.id, en_lista: false,
      parte: null, descripcion: null, lote_proveedor: c.lote, lote_deducido: true, largo_m: null, largo_actual_m: null,
      recibido: true, recibido_en: new Date().toISOString(), recibido_por: user,
      estado: 'inspeccion_pendiente', ubicacion_id: ubicacionPorDefecto(rec.almacen), alertas: [],
    });
    if (rollosDeRecepcion(rec.id).some((x) => x.en_lista)) agregarAlerta(nuevo, 'No viene en la lista de embarque');
    Store.put('rollos', nuevo);
    registrarMovimiento(nuevo, 'recepcion', `Recibido (fuera de lista) en factura ${rec.factura || ''}`, { a: nuevo.ubicacion_id });
    return res('error', `➕ ${c.no_rollo} NO viene en la lista. Escanea ahora el código 2D (cuadrito) de su etiqueta para tomar número de parte y metros.`, nuevo.id);
  }

  if (!anterior) {
    return res('error', c.tipo === 'desconocido'
      ? `No reconozco el código "${c.texto}".`
      : 'Primero escanea el NÚMERO DE ROLLO; luego el lote o el código 2D de ese mismo rollo.', null);
  }
  const r = anterior;

  if (c.tipo === 'lote') {
    r.lote_etiqueta = c.lote;
    if (!r.lote_proveedor) r.lote_proveedor = c.lote;
    if (r.lote_deducido) { r.lote_proveedor = c.lote; r.lote_deducido = false; }
    Store.put('rollos', r);
    if (r.lote_proveedor !== c.lote) {
      agregarAlerta(r, `La etiqueta dice lote ${c.lote} pero la lista de embarque dice ${r.lote_proveedor}`);
      Store.put('rollos', r);
      return res('error', `❌ ¡LOTE NO COINCIDE! ${r.no_rollo}: etiqueta ${c.lote} · lista ${r.lote_proveedor}`);
    }
    return res('ok', `✅ Lote ${c.lote} coincide con la lista (${r.no_rollo}).`);
  }

  if (c.tipo === 'parte' || c.tipo === 'datamatrix') {
    r.parte_etiqueta = c.parte;
    if (c.tipo === 'datamatrix') { r.largo_etiqueta = c.largo_m; r.lote_produccion = c.lote_produccion; }
    const msgs = [];
    if (!r.parte) {
      r.parte = c.parte;
      const p = Store.get('partes', c.parte);
      if (!p) msgs.push(`el número de parte ${c.parte} no está en el catálogo`);
    } else if (r.parte !== c.parte) {
      agregarAlerta(r, `La etiqueta dice ${c.parte} pero la lista dice ${r.parte}`);
      msgs.push(`NO. PARTE NO COINCIDE (etiqueta ${c.parte}, lista ${r.parte})`);
    }
    if (c.tipo === 'datamatrix') {
      if (!r.largo_m) {
        r.largo_m = c.largo_m; r.largo_actual_m = c.largo_m;
        const p = Store.get('partes', r.parte);
        if (p) r.peso_teorico_kg = Math.round(p.ancho_m * c.largo_m * (p.espesor_mm / 1000) * p.densidad * 10000) / 10000;
      } else if (Math.abs(r.largo_m - c.largo_m) > 0.01) {
        agregarAlerta(r, `La etiqueta dice ${c.largo_m} m pero la lista dice ${r.largo_m} m`);
        msgs.push(`METROS NO COINCIDEN (etiqueta ${c.largo_m}, lista ${r.largo_m})`);
      }
    }
    Store.put('rollos', r);
    if (msgs.length) return res('error', `❌ ${r.no_rollo}: ${msgs.join('; ')}`);
    return res('ok', `✅ ${r.en_lista ? 'Etiqueta de ' + r.no_rollo + ' coincide' : 'Datos de la etiqueta guardados en ' + r.no_rollo}: ${c.parte}${c.tipo === 'datamatrix' ? ' · ' + c.largo_m + ' m · producido ' + fmtLoteProduccion(c.lote_produccion) : ''}`);
  }

  return res('error', `No reconozco el código "${c.texto}". Escanea el número de rollo, el lote, el número de parte o el código 2D.`);
}

function ubicacionPorDefecto(alm) {
  const u = Store.where('ubicaciones', (x) => x.almacen === alm && x.activa).sort((a, b) => a.orden - b.orden)[0];
  return u ? u.id : null;
}

function cerrarRecepcion(rec) {
  const rollos = rollosDeRecepcion(rec.id);
  const faltan = rollos.filter((r) => r.en_lista && !r.recibido);
  const sinParte = rollos.filter((r) => r.recibido && (!r.parte || !r.largo_m));
  let msg = `¿Terminar la recepción?\n\nRecibidos: ${rollos.filter((r) => r.recibido).length}`;
  if (faltan.length) msg += `\nFALTANTES (no escaneados): ${faltan.length} — se marcarán como "no llegó"`;
  if (sinParte.length) msg += `\nRollos sin número de parte o metros: ${sinParte.length}`;
  if (!confirmar(msg)) return;
  for (const r of faltan) r.estado = 'faltante';
  Store.putMany('rollos', faltan);
  rec.estado = 'cerrada';
  rec.cerrada_en = new Date().toISOString();
  rec.cerrada_por = Sesion.usuario().nombre;
  Store.put('recepciones', rec);
  toast('Recepción terminada. Ahora sigue la inspección por lote.');
  App.refrescar();
}

// ---------- Capturar la lista de embarque (foto/texto, Excel o a mano) ----------
const borradorLista = {}; // recepcion_id -> { texto, filas, totales }

function capturaLista(rec) {
  const partes = Store.where('partes', (p) => p.almacen === rec.almacen && p.activa);
  const b = borradorLista[rec.id] = borradorLista[rec.id] || { texto: '', filas: null, totales: null };
  const f = { parte: partes[0] && partes[0].id, lote: '', no_rollo: '', largo: '' };
  const inp = (k, ph, tipo = 'text') => h('input', { type: tipo, placeholder: ph, value: f[k], oninput: (e) => { f[k] = e.target.value; } });
  const sinLista = !rollosDeRecepcion(rec.id).some((r) => r.en_lista);
  return h('details', { class: 'card', open: sinLista || !!b.filas },
    h('summary', {}, h('b', {}, sinLista ? '⚡ Cargar la lista de embarque' : 'Agregar más renglones a la lista')),

    h('h3', {}, '📷 Desde una foto o texto'),
    bloquePegarLista(b, {
      alLeer: (r) => { b.filas = r.filas; b.totales = r.totales; App.refrescar(); },
    }),
    b.filas ? h('div', {},
      resumenFilas(b.filas, b.totales),
      tablaRevisionFilas(b.filas, () => App.refrescar()),
      h('div', { class: 'acciones' },
        h('button', {
          class: 'btn btn-primario',
          onclick: () => {
            const r = guardarFilasEnRecepcion(rec, b.filas);
            if (b.totales && !rec.totales_papel) { rec.totales_papel = b.totales; Store.put('recepciones', rec); }
            delete borradorLista[rec.id];
            toast(`Se agregaron ${r.n} rollos a la lista.${r.omitidas ? ` ${r.omitidas} en rojo se omitieron.` : ''}${r.nuevas ? ` ${r.nuevas} números de parte nuevos.` : ''}`);
            App.refrescar();
          },
        }, `✅ Agregar ${b.filas.filter((x) => !x.bloqueante).length} rollos a la lista`),
        h('button', { class: 'btn', onclick: () => { delete borradorLista[rec.id]; App.refrescar(); } }, 'Descartar'),
      ),
    ) : null,

    h('h3', {}, '📥 Desde Excel'),
    h('p', { class: 'muted' }, 'Columnas: NO. PARTE, DESCRIPCIÓN, LOTE, NO. ROLLO y LARGO.'),
    h('label', { class: 'btn' }, '📥 Importar Excel', h('input', {
      type: 'file', accept: '.xlsx,.xls,.csv', class: 'oculto',
      onchange: async (e) => {
        const filas = e.target.files[0] && await leerExcelFilas(e.target.files[0]);
        if (filas && filas.length) { b.filas = filas; b.totales = null; App.refrescar(); }
      },
    })),

    h('h3', {}, '✍️ Renglón por renglón'),
    h('div', { class: 'form-grid' },
      h('label', { class: 'campo' }, 'No. parte', h('select', { onchange: (e) => { f.parte = e.target.value; } }, partes.map((p) => h('option', { value: p.id }, p.id)))),
      h('label', { class: 'campo' }, 'Lote', inp('lote', 'Z-901-01-01')),
      h('label', { class: 'campo' }, 'No. rollo', inp('no_rollo', '26Z9010101001')),
      h('label', { class: 'campo' }, 'Largo (m)', inp('largo', 'ej. 240', 'number')),
    ),
    h('button', {
      class: 'btn',
      onclick: () => {
        const no = f.no_rollo.trim().toUpperCase();
        if (!no) return toast('Escribe el número de rollo.', 'error');
        if (Store.get('rollos', no)) return toast('Ese rollo ya existe.', 'error');
        const p = Store.get('partes', f.parte);
        const largo = Number(f.largo) || (p && p.largo_tipico_m) || null;
        const lote = f.lote.trim().toUpperCase() || (parseNoRollo(no) || {}).lote || '';
        agregarRenglonLista(rec, { parte: f.parte, lote, no_rollo: no, largo });
        App.refrescar();
      },
    }, '➕ Agregar renglón'),
  );
}

function agregarRenglonLista(rec, { parte, desc, lote, no_rollo, largo }) {
  const p = Store.get('partes', parte);
  const n = rollosDeRecepcion(rec.id).length;
  const medidas = p && p.ancho_m && p.espesor_mm && p.densidad;
  const d = desc || (medidas ? `${p.ancho_m.toFixed(3)}X${largo}X${(p.espesor_mm / 1000).toFixed(4)}-${p.densidad}` : '');
  Store.put('rollos', {
    id: no_rollo, no_rollo, almacen: rec.almacen, recepcion_id: rec.id, renglon: n + 1,
    parte, descripcion: d, lote_proveedor: lote, largo_m: largo, largo_actual_m: largo,
    peso_teorico_kg: medidas && largo ? Math.round(p.ancho_m * largo * (p.espesor_mm / 1000) * p.densidad * 10000) / 10000 : null,
    en_lista: true, recibido: false, estado: 'en_transito', ubicacion_id: null, alertas: [],
  });
}

// Lee un Excel/CSV con la lista y regresa los renglones para revisarlos antes de guardar
async function leerExcelFilas(file) {
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
    const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const iHead = filas.findIndex((f) => f.some((c) => /^NO.? ?ROLLO/.test(norm(c))));
    if (iHead < 0) { toast('No encontré la columna "NO. ROLLO" en el Excel.', 'error'); return null; }
    const head = filas[iHead].map(norm);
    const col = (re) => head.findIndex((c) => re.test(c));
    const cParte = col(/^NO.? ?PARTE/), cDesc = col(/^DESCRIPCION/), cLote = col(/^LOTE/), cRollo = col(/^NO.? ?ROLLO/), cLargo = col(/^LARGO/);
    const out = [];
    for (const f of filas.slice(iHead + 1)) {
      const no = norm(f[cRollo]).replace(/s/g, '');
      if (no.length < 4 || /TOTAL/.test(norm(f[cParte]))) continue;
      out.push({ parte: norm(f[cParte]), descripcion: f[cDesc] || '', lote: norm(f[cLote]), no_rollo: no, largo: Number(String(f[cLargo]).replace(',', '.')) || null });
    }
    if (!out.length) toast('El Excel no trae renglones con número de rollo.', 'error');
    return out;
  } catch (e) {
    toast('No se pudo leer el archivo: ' + e.message, 'error');
    return null;
  }
}

function exportarRecepcionExcel(rec) {
  const filas = rollosDeRecepcion(rec.id).map((r) => ({
    'Material': 'ROLLO', 'No. parte': r.parte, 'Descripción': r.descripcion, 'Lote': r.lote_proveedor,
    'No. rollo': r.no_rollo, 'Largo (m)': r.largo_m, 'Peso teórico (kg)': r.peso_teorico_kg,
    'En lista': r.en_lista ? 'Sí' : 'No', 'Recibido': r.recibido ? 'Sí' : 'No',
    'Fecha recibido': fmtFechaHora(r.recibido_en), 'Recibió': r.recibido_por || '',
    'Lote en etiqueta': r.lote_etiqueta || '', 'Estado': (ESTADOS[r.estado] || {}).txt || r.estado,
    'Alertas': (r.alertas || []).join('; '),
  }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rollos');
  const enc = [['PO', rec.po], ['Factura', rec.factura], ['Fecha', fmtFecha(rec.fecha)], ['Proveedor', nombreProveedor(rec.proveedor)],
    ...CAMPOS_ENCABEZADO.filter(([k]) => !['po', 'factura'].includes(k)).map(([k, l]) => [l, rec[k] || ''])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(enc), 'Encabezado');
  XLSX.writeFile(wb, `Recepcion_${(rec.factura || rec.po || 'sin_factura').replace(/\s+/g, '')}_${fmtFecha(rec.fecha).replace(/\//g, '-')}.xlsx`);
}
