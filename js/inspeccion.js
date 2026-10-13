// Formato de inspección de recepción FR-AL-016-01 Rev. 01 ("Recepción de foam"), en digital.
// Se hace UNA hoja por lote y número de parte, dentro de cada recepción.

const SEC2 = [
  ['Número de parte', 'PO/BOM'],
  ['Descripción', 'PO/BOM'],
  ['Lote', 'Identificado y legible'],
  ['Etiqueta de proveedor', 'Completa y legible'],
  ['Cantidad', 'Conforme a PO y PL'],
  ['Certificado de calidad', 'Disponible (si aplica)'],
  ['Empaque', 'Sin daños'],
  ['Condición general', 'Sin humedad/golpes/etc'],
];
const SEC3 = [
  ['Ancho (según número de parte)', 'Flexómetro'],
  ['Densidad (según número de parte)', 'Calculadora'],
  ['Espesor (A327 GN: 4 ±0.5 mm · A527 GN: 6 ±0.5 mm · A727 GN: 8 ±0.5 mm)', 'Thickness gauge'],
  ['Arrugas', 'Visual'],
  ['Flamabilidad', 'Test de flamabilidad'],
  ['Daños', 'Visual'],
];
const RESULTADOS = { aceptado: 'Aceptado', rechazado: 'Rechazado', desviacion: 'Aceptado con desviación' };

// Grupos lote + parte de cada recepción que ya tienen rollos recibidos
function gruposInspeccion(alm) {
  const grupos = new Map();
  for (const r of Store.where('rollos', (x) => x.almacen === alm && x.recibido && x.parte && x.lote_proveedor)) {
    const k = `${r.recepcion_id}|${r.lote_proveedor}|${r.parte}`;
    if (!grupos.has(k)) grupos.set(k, { recepcion_id: r.recepcion_id, lote: r.lote_proveedor, parte: r.parte, rollos: [] });
    grupos.get(k).rollos.push(r);
  }
  const ins = Store.where('inspecciones', (i) => i.almacen === alm);
  return [...grupos.values()].map((g) => ({
    ...g,
    inspeccion: ins.find((i) => i.recepcion_id === g.recepcion_id && i.lote === g.lote && i.parte === g.parte) || null,
  }));
}

function gruposPendientesInspeccion(alm) {
  return gruposInspeccion(alm).filter((g) => !g.inspeccion || g.inspeccion.estado !== 'terminada');
}

function generarCodigoInspeccion(fecha) {
  const d = new Date(fecha);
  const base = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const mismos = Store.where('inspecciones', (i) => i.codigo === base || i.codigo.startsWith(base + '-')).length;
  return mismos ? `${base}-${mismos + 1}` : base;
}

function crearInspeccion(g) {
  if (!Sesion.puede('inspeccionar')) return toast('Tu usuario no puede hacer inspecciones.', 'error');
  const rec = Store.get('recepciones', g.recepcion_id);
  const prov = Store.get('proveedores', rec.proveedor);
  const parte = Store.get('partes', g.parte);
  const ahora = new Date();
  const metros = g.rollos.reduce((s, r) => s + (r.largo_m || 0), 0);
  // Sugerencia: muestrear los rollos que traen alerta o que venían marcados con punto en el papel
  const sugeridos = g.rollos.filter((r) => (r.alertas && r.alertas.length) || r.marca_punto).map((r) => r.id);
  const ins = Store.put('inspecciones', {
    id: uid(), codigo: generarCodigoInspeccion(ahora), almacen: rec.almacen,
    recepcion_id: g.recepcion_id, lote: g.lote, parte: g.parte, rollos: g.rollos.map((r) => r.id),
    estado: 'borrador', creada_en: ahora.toISOString(), creada_por: Sesion.usuario().nombre,
    d: {
      fecha_inspeccion: isoAFechaInput(ahora.toISOString()), hora: `${pad2(ahora.getHours())}:${pad2(ahora.getMinutes())}`,
      material: parte ? parte.material : 'Esponja', descripcion: g.rollos[0].descripcion || '',
      cantidad_recibida_m: metros, certificado: 'N/A', po: rec.po || '', proveedor: prov ? prov.nombre : rec.proveedor,
      inspector: Sesion.usuario().nombre, coa: 'N/A',
      muestra: sugeridos.length ? sugeridos.slice(0, 3) : [g.rollos[0].id],
      sec2: SEC2.map((_, i) => ({ res: [g.parte, g.rollos[0].descripcion || '', g.lote, '', fmtM(metros), 'N/A', '', ''][i] || '', eval: '' })),
      sec3: SEC3.map(() => ({ res: '', eval: '' })),
      ancho_m: '', espesores: ['', '', ''], peso_real_kg: '', largo_pesado_m: '',
      plan: '10', aprobado: '', revisado: '',
      resultado: '', dev: '', disposicion: '', area: '', rechazados: [],
      fotos_si: 'NO', fotos: [], inspecciono: Sesion.usuario().nombre, aprobo: '',
    },
  });
  App.ir('/inspeccion/' + ins.id);
}

// ---------- Lista de inspecciones ----------
function vistaInspecciones() {
  const alm = App.almacen();
  const grupos = gruposInspeccion(alm);
  const pend = grupos.filter((g) => !g.inspeccion || g.inspeccion.estado !== 'terminada');
  const hechas = Store.where('inspecciones', (i) => i.almacen === alm && i.estado === 'terminada').sort((a, b) => b.creada_en.localeCompare(a.creada_en));
  return h('div', {},
    h('h1', {}, 'Inspecciones'),
    h('div', { class: 'card' },
      h('h2', {}, `Por inspeccionar (${pend.length})`),
      pend.length === 0 ? h('p', { class: 'muted' }, 'No hay lotes pendientes. 🎉') : null,
      pend.map((g) => filaGrupo(g)),
    ),
    h('div', { class: 'card' },
      h('h2', {}, `Terminadas (${hechas.length})`),
      hechas.map((i) => h('a', { class: 'fila-link', href: '#/inspeccion/' + i.id },
        h('b', {}, i.codigo), ` · ${i.parte} · lote ${i.lote} · `, chipResultado(i.d.resultado))),
    ),
  );
}

function filaGrupo(g) {
  const rec = Store.get('recepciones', g.recepcion_id);
  const metros = g.rollos.reduce((s, r) => s + (r.largo_m || 0), 0);
  const alertas = g.rollos.filter((r) => r.alertas && r.alertas.length).length;
  return h('div', { class: 'fila-grupo' },
    h('div', {},
      h('b', {}, `${g.parte} · lote ${g.lote}`),
      h('div', { class: 'muted' }, `${g.rollos.length} rollos · ${fmtM(metros)} · factura ${rec ? rec.factura : ''} (${rec ? fmtFecha(rec.fecha) : ''})`),
      alertas ? h('div', { class: 'texto-rojo' }, `⚠️ ${alertas} rollo(s) con alerta`) : null,
    ),
    g.inspeccion
      ? h('a', { class: 'btn', href: '#/inspeccion/' + g.inspeccion.id }, '✏️ Continuar')
      : h('button', { class: 'btn btn-primario', onclick: () => crearInspeccion(g) }, '📋 Inspeccionar'),
  );
}

function chipResultado(res) {
  const cls = { aceptado: 'verde', rechazado: 'rojo', desviacion: 'azul' }[res] || 'gris';
  return h('span', { class: 'chip ' + cls }, RESULTADOS[res] || 'Sin resultado');
}

function seccionInspeccionesRecepcion(rec, recibidos) {
  const grupos = gruposInspeccion(rec.almacen).filter((g) => g.recepcion_id === rec.id);
  return h('div', { class: 'card' },
    h('h2', {}, '📋 Inspección por lote'),
    grupos.length ? null : h('p', { class: 'muted' }, 'No hay rollos recibidos con número de parte y lote.'),
    grupos.map((g) => g.inspeccion && g.inspeccion.estado === 'terminada'
      ? h('a', { class: 'fila-link', href: '#/inspeccion/' + g.inspeccion.id },
        h('b', {}, `${g.parte} · lote ${g.lote}`), ` · hoja ${g.inspeccion.codigo} · `, chipResultado(g.inspeccion.d.resultado))
      : filaGrupo(g)),
  );
}

// ---------- Llenar el formato ----------
function calculos(ins) {
  const d = ins.d;
  const parte = Store.get('partes', ins.parte) || {};
  const rollos = ins.rollos.map((id) => Store.get('rollos', id)).filter(Boolean);
  const loteM = rollos.reduce((s, r) => s + (r.largo_m || 0), 0);
  const muestra = d.muestra.map((id) => Store.get('rollos', id)).filter(Boolean);
  const muestraM = muestra.reduce((s, r) => s + (r.largo_m || 0), 0);
  const esp = d.espesores.map(Number).filter((x) => x > 0);
  const espProm = esp.length ? esp.reduce((a, b) => a + b, 0) / esp.length : null;
  const tol = parte.tolerancia_mm || 0.5;
  const espFuera = esp.filter((x) => Math.abs(x - parte.espesor_mm) > tol + 1e-9);
  const ancho = Number(d.ancho_m) || parte.ancho_m;
  const largoPesado = Number(d.largo_pesado_m) || (muestra[0] && muestra[0].largo_m);
  const densidad = Number(d.peso_real_kg) > 0 && espProm && largoPesado
    ? Number(d.peso_real_kg) / (ancho * largoPesado * espProm / 1000) : null;
  const plan = Number(d.plan) || 0;
  const sugeridoM = loteM * plan / 100;
  const largoTipico = rollos[0] ? rollos[0].largo_m : 0;
  const sugeridoRollos = largoTipico ? Math.max(1, Math.ceil(sugeridoM / largoTipico - 1e-9)) : 0;
  return { parte, rollos, loteM, muestra, muestraM, esp, espProm, espFuera, tol, ancho, largoPesado, densidad, plan, sugeridoM, sugeridoRollos };
}

function vistaInspeccion(id) {
  const ins = Store.get('inspecciones', id);
  if (!ins) return h('div', { class: 'card' }, 'No existe esta inspección.');
  const d = ins.d;
  const c = calculos(ins);
  const bloqueada = ins.estado === 'terminada';
  const guardar = (refrescar = false) => { Store.put('inspecciones', ins); if (refrescar) App.refrescar(); };

  // Campos ligados a ins.d
  const txt = (k, extra = {}) => h('input', { type: extra.tipo || 'text', value: d[k], disabled: bloqueada, step: 'any', ...extra.attrs,
    oninput: (e) => { d[k] = e.target.value; guardar(); }, onchange: () => extra.refrescar && guardar(true) });
  const evalBtns = (arr, i, auto) => h('div', { class: 'eval' }, ['OK', 'NOK', 'NA'].map((v) => h('button', {
    type: 'button', disabled: bloqueada,
    class: 'eval-btn ' + v.toLowerCase() + (arr[i].eval === v ? ' sel' : ''),
    onclick: () => { arr[i].eval = arr[i].eval === v ? '' : v; guardar(true); },
  }, v === 'NA' ? 'N/A' : v)), auto ? h('span', { class: 'auto' }, auto) : null);
  const resInp = (arr, i) => h('input', { type: 'text', value: arr[i].res, disabled: bloqueada, oninput: (e) => { arr[i].res = e.target.value; guardar(); } });

  // Validación automática del espesor
  if (c.esp.length) {
    const auto = c.espFuera.length ? 'NOK' : 'OK';
    d.sec3[2].res = `${c.esp.map((x) => fmtNum(x, 2)).join(' / ')} mm (prom. ${fmtNum(c.espProm, 2)})`;
    if (!bloqueada && d.sec3[2].eval !== auto) { d.sec3[2].eval = auto; guardar(); }
  }
  if (!bloqueada) {
    d.sec3[1].res = c.densidad ? `${fmtNum(c.densidad, 1)} kg/m³` : '';
    d.sec3[0].res = d.ancho_m ? `${fmtNum(Number(d.ancho_m), 3)} m` : '';
    guardar();
  }

  const alertasGrupo = c.rollos.filter((r) => r.alertas && r.alertas.length);
  const rec = Store.get('recepciones', ins.recepcion_id);

  return h('div', { class: 'inspeccion' },
    h('div', { class: 'fila-entre' },
      h('h1', {}, `Inspección ${ins.codigo}`),
      bloqueada ? chipResultado(d.resultado) : h('span', { class: 'chip amarillo' }, 'Borrador'),
    ),
    h('p', { class: 'muted' }, `FR-AL-016-01 Rev. 01 · ${ins.parte} · lote ${ins.lote} · ${c.rollos.length} rollos · factura ${rec ? rec.factura : ''}`),

    alertasGrupo.length ? h('div', { class: 'card borde-rojo' },
      h('b', {}, '⚠️ Rollos de este lote con alerta:'),
      alertasGrupo.map((r) => h('div', {}, h('a', { href: '#/rollo/' + encodeURIComponent(r.id) }, r.no_rollo), ' — ', r.alertas.join('; '))),
    ) : null,

    // 1. Datos generales
    h('div', { class: 'card' },
      h('h2', { class: 'sec' }, '1. Datos generales'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'campo' }, 'Fecha de inspección', txt('fecha_inspeccion', { tipo: 'date' })),
        h('label', { class: 'campo' }, 'Hora', txt('hora', { tipo: 'time' })),
        h('label', { class: 'campo' }, 'Material', h('select', { disabled: bloqueada, onchange: (e) => { d.material = e.target.value; guardar(); } },
          ['Esponja', 'Tela', 'Vinil', 'Backing'].map((m) => h('option', { selected: d.material === m }, m)))),
        h('label', { class: 'campo' }, 'Lote proveedor', h('input', { value: ins.lote, disabled: true })),
        h('label', { class: 'campo' }, 'Número de parte', h('input', { value: ins.parte, disabled: true })),
        h('label', { class: 'campo ancho' }, 'Descripción', txt('descripcion')),
        h('label', { class: 'campo' }, 'Cantidad recibida (m)', txt('cantidad_recibida_m', { tipo: 'number' })),
        h('label', { class: 'campo' }, 'Certificado de calidad', txt('certificado')),
        h('label', { class: 'campo' }, 'Número de PO', txt('po')),
        h('label', { class: 'campo' }, 'Proveedor', txt('proveedor')),
        h('label', { class: 'campo' }, 'Inspector', txt('inspector')),
        h('label', { class: 'campo' }, 'Número de COA', txt('coa')),
      ),
      h('div', { class: 'campo' }, h('span', {}, 'No. de rollo(s) inspeccionado(s) — toca para elegir la muestra'),
        h('div', { class: 'chips-rollos' }, c.rollos.map((r) => h('button', {
          type: 'button', disabled: bloqueada,
          class: 'chip-rollo' + (d.muestra.includes(r.id) ? ' sel' : '') + (r.alertas && r.alertas.length ? ' alerta' : ''),
          onclick: () => {
            d.muestra = d.muestra.includes(r.id) ? d.muestra.filter((x) => x !== r.id) : [...d.muestra, r.id];
            guardar(true);
          },
        }, r.no_rollo, r.marca_punto ? ' •' : '')))),
    ),

    // 2. Identificación y documentación
    h('div', { class: 'card' },
      h('h2', { class: 'sec' }, '2. Identificación y documentación'),
      SEC2.map(([car, req], i) => h('div', { class: 'renglon-insp' },
        h('div', { class: 'ri-car' }, h('b', {}, `${i + 1}. ${car}`), h('span', { class: 'muted' }, req)),
        resInp(d.sec2, i),
        evalBtns(d.sec2, i, i === 2 && alertasGrupo.some((r) => r.lote_etiqueta && r.lote_etiqueta !== r.lote_proveedor) ? '⚠️ Hay etiquetas con otro lote' : null),
      )),
    ),

    // 3. Inspección dimensional y física
    h('div', { class: 'card' },
      h('h2', { class: 'sec' }, '3. Inspección dimensional y física'),
      h('div', { class: 'renglon-insp' },
        h('div', { class: 'ri-car' }, h('b', {}, '1. ' + SEC3[0][0]), h('span', { class: 'muted' }, `${SEC3[0][1]} · nominal ${fmtNum(c.parte.ancho_m, 3)} m`)),
        h('label', { class: 'campo' }, 'Ancho medido (m)', txt('ancho_m', { tipo: 'number', refrescar: true, attrs: { placeholder: String(c.parte.ancho_m || '') } })),
        evalBtns(d.sec3, 0),
      ),
      h('div', { class: 'renglon-insp' },
        h('div', { class: 'ri-car' }, h('b', {}, '2. ' + SEC3[1][0]), h('span', { class: 'muted' }, `${SEC3[1][1]} · nominal ${c.parte.densidad} kg/m³`)),
        h('div', { class: 'form-grid' },
          h('label', { class: 'campo' }, 'Peso real en báscula (kg)', txt('peso_real_kg', { tipo: 'number', refrescar: true })),
          h('label', { class: 'campo' }, 'Largo de lo que pesaste (m)', txt('largo_pesado_m', { tipo: 'number', refrescar: true, attrs: { placeholder: String(c.largoPesado || '') } })),
        ),
        h('div', { class: 'calc' }, c.densidad
          ? `Densidad = ${fmtNum(Number(d.peso_real_kg), 2)} kg ÷ (${fmtNum(c.ancho, 3)} m × ${fmtNum(c.largoPesado)} m × ${fmtNum(c.espProm / 1000, 4)} m) = ${fmtNum(c.densidad, 1)} kg/m³ (${c.densidad >= c.parte.densidad ? '+' : ''}${fmtNum((c.densidad / c.parte.densidad - 1) * 100, 1)}% vs nominal)`
          : 'Escribe el peso real y mide el espesor para calcular la densidad. (El peso de la lista de embarque es teórico: siempre da 27.)'),
        evalBtns(d.sec3, 1),
      ),
      h('div', { class: 'renglon-insp' },
        h('div', { class: 'ri-car' }, h('b', {}, '3. Espesor'), h('span', { class: 'muted' }, `Thickness gauge · ${c.parte.espesor_mm} ± ${c.tol} mm`)),
        h('div', { class: 'espesores' }, d.espesores.map((v, i) => h('input', {
          type: 'number', step: 'any', value: v, disabled: bloqueada, placeholder: `Medida ${i + 1} (mm)`,
          class: v && Math.abs(Number(v) - c.parte.espesor_mm) > c.tol + 1e-9 ? 'fuera' : '',
          oninput: (e) => { d.espesores[i] = e.target.value; guardar(); }, onchange: () => guardar(true),
        })), bloqueada ? null : h('button', { type: 'button', class: 'btn btn-chico', onclick: () => { d.espesores.push(''); guardar(true); } }, '+ medida')),
        c.esp.length ? h('div', { class: 'calc ' + (c.espFuera.length ? 'texto-rojo' : 'texto-verde') },
          c.espFuera.length ? `❌ ${c.espFuera.length} medida(s) fuera de ${c.parte.espesor_mm - c.tol}–${c.parte.espesor_mm + c.tol} mm → NOK automático`
            : `✅ Todas dentro de ${c.parte.espesor_mm - c.tol}–${c.parte.espesor_mm + c.tol} mm → OK automático`) : null,
        evalBtns(d.sec3, 2, c.esp.length ? 'automático' : null),
      ),
      [3, 4, 5].map((i) => h('div', { class: 'renglon-insp' },
        h('div', { class: 'ri-car' }, h('b', {}, `${i + 1}. ${SEC3[i][0]}`), h('span', { class: 'muted' }, SEC3[i][1])),
        resInp(d.sec3, i),
        evalBtns(d.sec3, i),
      )),
    ),

    // 4. Muestreo
    h('div', { class: 'card' },
      h('h2', { class: 'sec' }, '4. Muestreo'),
      h('div', { class: 'campo' }, 'Plan de muestreo', h('div', { class: 'eval' }, ['10', '30', '50', '100'].map((p) => h('button', {
        type: 'button', disabled: bloqueada, class: 'eval-btn' + (d.plan === p ? ' sel' : ''),
        onclick: () => { d.plan = p; guardar(true); },
      }, p + '%')))),
      h('div', { class: 'datos-grid' },
        h('div', { class: 'dato' }, h('span', {}, 'Tamaño de lote'), h('b', {}, fmtM(c.loteM))),
        h('div', { class: 'dato' }, h('span', {}, 'Tamaño de muestra (rollos elegidos)'), h('b', {}, `${fmtM(c.muestraM)} (${c.muestra.length} rollo${c.muestra.length === 1 ? '' : 's'})`)),
        h('div', { class: 'dato' }, h('span', {}, `Sugerido con ${d.plan}%`), h('b', {}, `${fmtM(c.sugeridoM)} ≈ ${c.sugeridoRollos} rollo(s)`)),
      ),
      c.muestraM + 1e-9 < c.sugeridoM ? h('div', { class: 'texto-amarillo' }, `⚠️ La muestra es menor a lo que pide el plan del ${d.plan}%.`) : null,
      h('div', { class: 'form-grid' },
        h('label', { class: 'campo' }, 'Aprobado', txt('aprobado')),
        h('label', { class: 'campo' }, 'Revisado', txt('revisado')),
      ),
    ),

    // 5. Resultado
    h('div', { class: 'card' },
      h('h2', { class: 'sec' }, '5. Resultado'),
      h('div', { class: 'eval resultado' }, Object.entries(RESULTADOS).map(([k, l]) => h('button', {
        type: 'button', disabled: bloqueada, class: 'eval-btn res-' + k + (d.resultado === k ? ' sel' : ''),
        onclick: () => { d.resultado = k; guardar(true); },
      }, l))),
      d.resultado === 'aceptado' ? h('div', { class: 'form-grid' },
        h('label', { class: 'campo' }, 'DEV', txt('dev')),
        h('div', { class: 'dato' }, h('span', {}, 'Cantidad'), h('b', {}, fmtM(c.loteM))),
      ) : null,
      d.resultado === 'rechazado' ? h('div', {},
        h('p', { class: 'muted' }, 'Toca los rollos RECHAZADOS (si no eliges ninguno, se rechaza todo el lote):'),
        h('div', { class: 'chips-rollos' }, c.rollos.map((r) => h('button', {
          type: 'button', disabled: bloqueada, class: 'chip-rollo' + (d.rechazados.includes(r.id) ? ' rech' : ''),
          onclick: () => { d.rechazados = d.rechazados.includes(r.id) ? d.rechazados.filter((x) => x !== r.id) : [...d.rechazados, r.id]; guardar(true); },
        }, r.no_rollo))),
        (() => {
          const rech = d.rechazados.length ? c.rollos.filter((r) => d.rechazados.includes(r.id)) : c.rollos;
          const mr = rech.reduce((s, r) => s + (r.largo_m || 0), 0);
          return h('div', { class: 'datos-grid' },
            h('div', { class: 'dato' }, h('span', {}, 'Cantidad rechazada'), h('b', {}, `${fmtM(mr)} (${rech.length} rollos)`)),
            h('div', { class: 'dato' }, h('span', {}, 'Cantidad aceptada'), h('b', {}, fmtM(c.loteM - mr))));
        })(),
      ) : null,
      d.resultado === 'desviacion' ? h('div', { class: 'form-grid' },
        h('label', { class: 'campo' }, 'Disposición', txt('disposicion')),
        h('label', { class: 'campo' }, 'Área', txt('area')),
      ) : null,
    ),

    // 6. Firmas y evidencia
    h('div', { class: 'card' },
      h('h2', { class: 'sec' }, '6. Firmas y evidencia'),
      h('div', { class: 'campo' }, 'Fotografías', h('div', { class: 'eval' }, ['SI', 'NO'].map((v) => h('button', {
        type: 'button', disabled: bloqueada, class: 'eval-btn' + (d.fotos_si === v ? ' sel' : ''),
        onclick: () => { d.fotos_si = v; guardar(true); },
      }, v === 'SI' ? 'Sí' : 'No')))),
      d.fotos_si === 'SI' ? h('div', {},
        h('div', { class: 'fotos' }, d.fotos.map((src, i) => h('div', { class: 'foto' },
          h('img', { src, alt: 'Foto ' + (i + 1) }),
          bloqueada ? null : h('button', { type: 'button', class: 'foto-x', onclick: () => { d.fotos.splice(i, 1); guardar(true); } }, '✕')))),
        bloqueada ? null : h('label', { class: 'btn' }, '📷 Agregar foto', h('input', {
          type: 'file', accept: 'image/*', capture: 'environment', multiple: true, class: 'oculto',
          onchange: async (e) => {
            for (const f of e.target.files) d.fotos.push(await comprimirFoto(f));
            guardar(true);
          },
        })),
      ) : null,
      h('div', { class: 'form-grid' },
        h('label', { class: 'campo' }, 'Inspeccionó', txt('inspecciono')),
        h('label', { class: 'campo' }, 'Aprobó', h('div', { class: 'fila' }, txt('aprobo'),
          !bloqueada && Sesion.puede('aprobar') ? h('button', { type: 'button', class: 'btn btn-chico', onclick: () => { d.aprobo = Sesion.usuario().nombre; guardar(true); } }, 'Firmar yo') : null)),
      ),
    ),

    h('div', { class: 'acciones' },
      !bloqueada ? h('button', { class: 'btn btn-grande btn-primario', onclick: () => terminarInspeccion(ins) }, '✅ Terminar inspección') : null,
      h('a', { class: 'btn btn-grande', href: `#/inspeccion/${ins.id}/imprimir` }, '🖨️ Imprimir / PDF'),
      bloqueada && Sesion.puede('aprobar') ? h('button', { class: 'btn', onclick: () => {
        if (!confirmar('¿Reabrir esta inspección para corregirla?')) return;
        ins.estado = 'borrador'; guardar(true);
      } }, 'Reabrir') : null,
      !bloqueada ? h('button', { class: 'btn btn-peligro', onclick: () => {
        if (!confirmar('¿Borrar este borrador de inspección?')) return;
        Store.remove('inspecciones', ins.id); App.ir('/inspecciones');
      } }, 'Borrar borrador') : null,
    ),
  );
}

function terminarInspeccion(ins) {
  const d = ins.d;
  if (!d.resultado) return toast('Elige el resultado (Aceptado, Rechazado o Aceptado con desviación).', 'error');
  if (!d.muestra.length) return toast('Elige al menos un rollo inspeccionado.', 'error');
  const vacios = [...d.sec2, ...d.sec3].filter((x) => !x.eval).length;
  if (vacios && !confirmar(`Hay ${vacios} característica(s) sin marcar OK / NOK / N/A. ¿Terminar de todos modos?`)) return;
  const noks = [...d.sec2, ...d.sec3].filter((x) => x.eval === 'NOK').length;
  if (noks && d.resultado === 'aceptado' && !confirmar(`Hay ${noks} NOK pero el resultado es "Aceptado". ¿Seguro?`)) return;

  const rollos = ins.rollos.map((id) => Store.get('rollos', id)).filter(Boolean);
  for (const r of rollos) {
    let nuevo = 'aceptado';
    if (d.resultado === 'desviacion') nuevo = 'aceptado_desviacion';
    if (d.resultado === 'rechazado' && (!d.rechazados.length || d.rechazados.includes(r.id))) nuevo = 'rechazado';
    if (r.estado !== nuevo) {
      registrarMovimiento(r, 'inspeccion', `Inspección ${ins.codigo}: ${ESTADOS[r.estado].txt} → ${ESTADOS[nuevo].txt}`, { de: r.estado, a: nuevo });
      r.estado = nuevo;
    }
    r.inspeccion_id = ins.id;
    r.muestreado = d.muestra.includes(r.id);
  }
  Store.putMany('rollos', rollos);
  ins.estado = 'terminada';
  ins.terminada_en = new Date().toISOString();
  Store.put('inspecciones', ins);
  toast(`Inspección ${ins.codigo} terminada. ${rollos.length} rollos actualizados.`);
  App.refrescar();
}

// ---------- Versión para imprimir (mismo formato que el papel) ----------
function vistaImprimirInspeccion(id) {
  const ins = Store.get('inspecciones', id);
  if (!ins) return h('div', { class: 'card' }, 'No existe esta inspección.');
  const d = ins.d;
  const c = calculos(ins);
  const caja = (on) => h('span', { class: 'p-caja' }, on ? '✔' : '');
  const filaEval = (i, car, req, x) => h('tr', {},
    h('td', { class: 'c' }, i), h('td', {}, car), h('td', {}, req), h('td', {}, x.res),
    h('td', { class: 'c' }, caja(x.eval === 'OK')), h('td', { class: 'c' }, caja(x.eval === 'NOK')), h('td', { class: 'c' }, caja(x.eval === 'NA')));
  const linea = (l, v) => h('tr', {}, h('td', { class: 'p-l' }, l), h('td', { class: 'p-v' }, v || ''));
  const rech = d.resultado === 'rechazado' ? (d.rechazados.length ? c.rollos.filter((r) => d.rechazados.includes(r.id)) : c.rollos) : [];
  const mRech = rech.reduce((s, r) => s + (r.largo_m || 0), 0);
  const marcado = (on, txt) => h('div', { class: 'p-res' + (on ? ' on' : '') }, (on ? '☒ ' : '☐ ') + txt);

  return h('div', {},
    h('div', { class: 'no-print acciones' },
      h('button', { class: 'btn btn-grande btn-primario', onclick: () => window.print() }, '🖨️ Imprimir o guardar como PDF'),
      h('a', { class: 'btn btn-grande', href: '#/inspeccion/' + id }, '← Volver'),
      h('p', { class: 'muted' }, 'Para PDF: en la ventana de impresión elige "Guardar como PDF".'),
    ),
    h('div', { class: 'hoja' },
      h('table', { class: 'p-enc' }, h('tr', {},
        h('td', { class: 'p-logo' }, h('b', {}, '◖ DUAL')),
        h('td', { class: 'p-titulo' }, 'Formato de inspección incoming', h('br'), 'Recepción de foam'),
        h('td', { class: 'p-cod' }, 'Código: ', h('b', {}, ins.codigo), h('br'), 'Fecha: ', h('b', {}, fmtFecha(fechaInputAIso(d.fecha_inspeccion)))),
      )),
      h('div', { class: 'p-sec' }, '1. Datos generales'),
      h('div', { class: 'p-2col' },
        h('table', {}, linea('Fecha de inspección', fmtFecha(fechaInputAIso(d.fecha_inspeccion))), linea('Hora', d.hora),
          linea('Material (Tela/Vinil/Backing)', d.material), linea('Lote proveedor', ins.lote),
          linea('Número de parte', ins.parte), linea('Descripción', d.descripcion),
          linea('No. de rollo', c.muestra.map((r) => r.no_rollo).join(', '))),
        h('table', {}, linea('Cantidad recibida', fmtM(Number(d.cantidad_recibida_m))), linea('Certificado calidad', d.certificado),
          linea('Número de PO', d.po), linea('Proveedor', d.proveedor), linea('Inspector', d.inspector), linea('Número de COA', d.coa)),
      ),
      h('div', { class: 'p-sec' }, '2. Identificación y documentación'),
      h('table', { class: 'p-tabla' },
        h('tr', {}, ['#', 'Característica', 'Requisito', 'Resultado', 'OK', 'NOK', 'N/A'].map((t) => h('th', {}, t))),
        SEC2.map(([car, req], i) => filaEval(i + 1, car, req, d.sec2[i]))),
      h('div', { class: 'p-sec' }, '3. Inspección dimensional y física'),
      h('table', { class: 'p-tabla' },
        h('tr', {}, ['#', 'Característica', 'Equipo de medición', 'Resultado', 'OK', 'NOK', 'N/A'].map((t) => h('th', {}, t))),
        SEC3.map(([car, eq], i) => filaEval(i + 1, car, eq, d.sec3[i]))),
      h('div', { class: 'p-sec' }, '4. Muestreo'),
      h('table', { class: 'p-tabla' },
        h('tr', {}, h('td', {}, 'Plan de muestreo'), ['10', '30', '50', '100'].map((p) => h('td', { class: 'c' }, (d.plan === p ? '☒ ' : '☐ ') + p + '%'))),
        h('tr', {}, h('td', {}, 'Tamaño de lote (metros)'), h('td', { colspan: 4 }, fmtM(c.loteM))),
        h('tr', {}, h('td', {}, 'Tamaño de muestra (metros)'), h('td', { colspan: 4 }, fmtM(c.muestraM))),
        h('tr', {}, h('td', {}, 'Aprobado'), h('td', { colspan: 4 }, d.aprobado)),
        h('tr', {}, h('td', {}, 'Revisado'), h('td', { colspan: 4 }, d.revisado))),
      h('div', { class: 'p-sec' }, '5. Resultado'),
      h('div', { class: 'p-3col' },
        h('div', {}, marcado(d.resultado === 'aceptado', 'Aceptado'), h('div', {}, 'DEV: ', d.resultado === 'aceptado' ? d.dev : ''),
          h('div', {}, 'Cantidad: ', d.resultado === 'aceptado' ? fmtM(c.loteM) : '')),
        h('div', {}, marcado(d.resultado === 'rechazado', 'Rechazado'),
          h('div', {}, 'Cantidad rechazada: ', d.resultado === 'rechazado' ? fmtM(mRech) : ''),
          h('div', {}, 'Cantidad aceptada: ', d.resultado === 'rechazado' ? fmtM(c.loteM - mRech) : '')),
        h('div', {}, marcado(d.resultado === 'desviacion', 'Aceptado con desviación'),
          h('div', {}, 'Disposición: ', d.resultado === 'desviacion' ? d.disposicion : ''),
          h('div', {}, 'Área: ', d.resultado === 'desviacion' ? d.area : '')),
      ),
      h('div', { class: 'p-sec' }, '6. Firmas y evidencia'),
      h('div', { class: 'p-firmas' },
        h('div', {}, 'Fotografías: ', (d.fotos_si === 'SI' ? '☒' : '☐') + ' SÍ   ' + (d.fotos_si === 'NO' ? '☒' : '☐') + ' NO'),
        h('div', {}, 'Inspeccionó: ', h('b', {}, d.inspecciono)),
        h('div', {}, 'Aprobó: ', h('b', {}, d.aprobo)),
      ),
      d.fotos_si === 'SI' && d.fotos.length ? h('div', { class: 'p-fotos' }, d.fotos.map((src) => h('img', { src }))) : null,
      h('div', { class: 'p-pie' }, h('span', {}, 'Incoming foam'), h('span', {}, 'FR-AL-016-01 REV. 01')),
    ),
  );
}
