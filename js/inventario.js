// Inventario actual, detalle de rollo y ajustes.

function paramsHash() {
  return new URLSearchParams((location.hash.split('?')[1]) || '');
}

const filtrosInv = { estado: 'en_almacen', parte: '', lote: '', ubicacion: '' };

function vistaInventario() {
  const alm = App.almacen();
  const q = paramsHash();
  if (q.get('lote')) { filtrosInv.lote = q.get('lote'); filtrosInv.estado = ''; history.replaceState(null, '', '#/inventario'); }
  const todos = Store.where('rollos', (r) => r.almacen === alm && r.recibido);
  const f = filtrosInv;
  const rollos = todos.filter((r) =>
    (!f.estado || (f.estado === 'en_almacen' ? EN_ALMACEN.includes(r.estado) : r.estado === f.estado))
    && (!f.parte || r.parte === f.parte) && (!f.lote || r.lote_proveedor === f.lote)
    && (!f.ubicacion || r.ubicacion_id === f.ubicacion))
    .sort((a, b) => (a.parte || '').localeCompare(b.parte || '') || (a.lote_proveedor || '').localeCompare(b.lote_proveedor || '') || a.no_rollo.localeCompare(b.no_rollo));

  const opciones = (vals, sel, todosTxt) => [h('option', { value: '' }, todosTxt), ...vals.map(([v, t]) => h('option', { value: v, selected: v === sel }, t))];
  const unicos = (k) => [...new Set(todos.map((r) => r[k]).filter(Boolean))].sort();
  const sel = (k, vals, todosTxt) => h('select', { onchange: (e) => { f[k] = e.target.value; App.refrescar(); } }, opciones(vals, f[k], todosTxt));

  // Resumen por número de parte y por lote
  const porParte = agrupar(rollos, (r) => r.parte || '¿?');
  const porLote = agrupar(rollos, (r) => `${r.parte || '¿?'}|${r.lote_proveedor || '¿?'}`);
  const ubic = (id) => (Store.get('ubicaciones', id) || {}).nombre || '';

  return h('div', {},
    h('h1', {}, 'Inventario'),
    h('div', { class: 'card' },
      campoEscaneo((txt) => buscarYAbrirRollo(txt), { placeholder: 'Escanea o escribe un número de rollo', autofocus: false }),
    ),
    h('div', { class: 'card filtros' },
      h('label', { class: 'campo' }, 'Estado', sel('estado', [['en_almacen', 'En almacén (todos)'], ...Object.entries(ESTADOS).filter(([k]) => k !== 'en_transito').map(([k, v]) => [k, v.txt])], 'Cualquier estado')),
      h('label', { class: 'campo' }, 'No. parte', sel('parte', unicos('parte').map((x) => [x, x]), 'Todos')),
      h('label', { class: 'campo' }, 'Lote', sel('lote', unicos('lote_proveedor').map((x) => [x, x]), 'Todos')),
      h('label', { class: 'campo' }, 'Ubicación', sel('ubicacion', Store.where('ubicaciones', (u) => u.almacen === alm).map((u) => [u.id, u.nombre]), 'Todas')),
    ),
    h('div', { class: 'stats' },
      stat(rollos.length, 'rollos'),
      stat(fmtNum(rollos.reduce((s, r) => s + (r.largo_actual_m || 0), 0)), 'metros'),
      stat(fmtNum(rollos.reduce((s, r) => s + (r.peso_teorico_kg || 0), 0), 1), 'kg (teórico)'),
    ),
    h('div', { class: 'card' },
      h('h2', {}, 'Por número de parte'),
      tablaResumen(porParte, ['No. parte'], (k) => [k]),
    ),
    h('div', { class: 'card' },
      h('h2', {}, 'Por lote'),
      tablaResumen(porLote, ['No. parte', 'Lote'], (k) => k.split('|')),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'fila-entre' }, h('h2', {}, `Rollos (${rollos.length})`),
        h('button', { class: 'btn', onclick: () => exportarInventarioExcel(rollos, porParte, porLote) }, '📊 Exportar a Excel')),
      h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' },
        h('thead', {}, h('tr', {}, ['No. rollo', 'No. parte', 'Lote', 'Metros', 'Estado', 'Ubicación'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rollos.map((r) => h('tr', { class: r.alertas && r.alertas.length ? 'fila-alerta' : '' },
          h('td', {}, h('a', { href: '#/rollo/' + encodeURIComponent(r.id) }, r.no_rollo), r.alertas && r.alertas.length ? ' ⚠️' : ''),
          h('td', {}, r.parte || '¿?'), h('td', {}, r.lote_proveedor || '¿?'),
          h('td', { class: 'num' }, fmtNum(r.largo_actual_m)), h('td', {}, etiquetaEstado(r.estado)), h('td', {}, ubic(r.ubicacion_id)),
        ))),
      )),
    ),
  );
}

function agrupar(rollos, keyFn) {
  const m = new Map();
  for (const r of rollos) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, { rollos: 0, metros: 0, estados: {} });
    const g = m.get(k);
    g.rollos++; g.metros += r.largo_actual_m || 0;
    g.estados[r.estado] = (g.estados[r.estado] || 0) + 1;
  }
  return new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function tablaResumen(grupos, cols, split) {
  if (!grupos.size) return h('p', { class: 'muted' }, 'Sin rollos con estos filtros.');
  return h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' },
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c)), h('th', { class: 'num' }, 'Rollos'), h('th', { class: 'num' }, 'Metros'), h('th', {}, 'Estados'))),
    h('tbody', {}, [...grupos.entries()].map(([k, g]) => h('tr', {},
      split(k).map((x) => h('td', {}, x)),
      h('td', { class: 'num' }, g.rollos), h('td', { class: 'num' }, fmtNum(g.metros)),
      h('td', {}, Object.entries(g.estados).map(([e, n]) => h('span', { class: 'chip chico ' + (ESTADOS[e] || {}).cls }, `${n} ${(ESTADOS[e] || {}).txt || e}`))),
    ))),
  ));
}

function exportarInventarioExcel(rollos, porParte, porLote) {
  const ubic = (id) => (Store.get('ubicaciones', id) || {}).nombre || '';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rollos.map((r) => {
    const rec = Store.get('recepciones', r.recepcion_id) || {};
    const ins = r.inspeccion_id ? Store.get('inspecciones', r.inspeccion_id) : null;
    return {
      'No. rollo': r.no_rollo, 'No. parte': r.parte, 'Descripción': r.descripcion, 'Lote': r.lote_proveedor,
      'Metros originales': r.largo_m, 'Metros actuales': r.largo_actual_m, 'Peso teórico (kg)': r.peso_teorico_kg,
      'Estado': (ESTADOS[r.estado] || {}).txt || r.estado, 'Ubicación': ubic(r.ubicacion_id),
      'Factura': rec.factura || '', 'PO': rec.po || '', 'Fecha recepción': fmtFecha(r.recibido_en),
      'Inspección': ins ? ins.codigo : '', 'Alertas': (r.alertas || []).join('; '),
    };
  })), 'Rollos');
  const resumen = (grupos, cols, split) => [...grupos.entries()].map(([k, g]) => {
    const o = {};
    split(k).forEach((v, i) => { o[cols[i]] = v; });
    return { ...o, Rollos: g.rollos, Metros: g.metros };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen(porParte, ['No. parte'], (k) => [k])), 'Por parte');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen(porLote, ['No. parte', 'Lote'], (k) => k.split('|'))), 'Por lote');
  const hoy = fmtFecha(new Date().toISOString()).replace(/\//g, '-');
  XLSX.writeFile(wb, `Inventario_${App.almacen()}_${hoy}.xlsx`);
}

// ---------- Detalle de un rollo ----------
function vistaRollo(id) {
  const r = Store.get('rollos', id);
  if (!r) return h('div', { class: 'card' }, 'No existe el rollo ' + id);
  const rec = Store.get('recepciones', r.recepcion_id) || {};
  const ins = r.inspeccion_id ? Store.get('inspecciones', r.inspeccion_id) : null;
  const desc = parseDescripcion(r.descripcion);
  const movs = Store.where('movimientos', (m) => m.rollo_id === r.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const dato = (l, v) => h('div', { class: 'dato' }, h('span', {}, l), h('b', {}, v === null || v === undefined || v === '' ? '—' : v));
  const compara = (l, lista, etiqueta) => h('tr', { class: etiqueta && lista && etiqueta !== lista ? 'fila-alerta' : '' },
    h('td', {}, l), h('td', {}, lista || '—'), h('td', {}, etiqueta || 'no escaneado'),
    h('td', {}, !etiqueta ? '' : etiqueta === lista ? '✅' : '❌'));
  const ubics = Store.where('ubicaciones', (u) => u.almacen === r.almacen && (u.activa || u.id === r.ubicacion_id));

  return h('div', {},
    h('div', { class: 'fila-entre' }, h('h1', {}, '🧻 ' + r.no_rollo), etiquetaEstado(r.estado)),
    r.alertas && r.alertas.length ? h('div', { class: 'card borde-rojo' },
      r.alertas.map((a) => h('div', {}, '⚠️ ' + a)),
      Sesion.puede('aprobar') ? h('button', { class: 'btn btn-chico', onclick: () => {
        if (!confirmar('¿Marcar las alertas como revisadas? Quedarán en el historial.')) return;
        registrarMovimiento(r, 'alerta', 'Alertas revisadas: ' + r.alertas.join('; '));
        r.alertas_revisadas = [...(r.alertas_revisadas || []), ...r.alertas];
        r.alertas = []; Store.put('rollos', r); App.refrescar();
      } }, 'Marcar como revisadas') : null,
    ) : null,
    h('div', { class: 'card datos-grid' },
      dato('No. parte', r.parte), dato('Lote proveedor', r.lote_proveedor), dato('Descripción', r.descripcion),
      dato('Metros', `${fmtNum(r.largo_actual_m)} de ${fmtNum(r.largo_m)}`), dato('Peso teórico', fmtKg(r.peso_teorico_kg)),
      desc ? dato('Medidas nominales', `${desc.ancho_m} m ancho · ${desc.espesor_mm} mm · ${desc.densidad} kg/m³`) : null,
      desc && desc.extra ? dato('Códigos', desc.extra.split(/\s+/).map((cd) => {
        const s = (Store.get('codigos', cd) || {}).significado;
        return s ? `${cd} = ${s}` : `${cd} (¿?)`;
      }).join(' · ')) : null,
      dato('Producido (LOTE etiqueta)', r.lote_produccion ? `${r.lote_produccion} → ${fmtLoteProduccion(r.lote_produccion)}` : null),
      dato('Recepción', rec.id ? h('a', { href: '#/recepcion/' + rec.id }, `Factura ${rec.factura} (${fmtFecha(rec.fecha)})`) : null),
      dato('Recibió', r.recibido ? `${r.recibido_por || ''} · ${fmtFechaHora(r.recibido_en)}` : 'No recibido'),
      dato('Inspección', ins ? h('a', { href: '#/inspeccion/' + ins.id }, `${ins.codigo}${r.muestreado ? ' (rollo muestreado)' : ''}`) : 'Pendiente'),
      r.marca_punto ? dato('Hoja de papel', 'Marcado con punto •') : null,
    ),
    h('div', { class: 'card' },
      h('h2', {}, 'Lista de embarque vs. etiqueta'),
      h('table', { class: 'tabla' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Lista'), h('th', {}, 'Etiqueta'), h('th', {}, ''))),
        h('tbody', {},
          compara('Lote', r.lote_proveedor, r.lote_etiqueta),
          compara('No. parte', r.parte, r.parte_etiqueta),
          compara('Metros', r.largo_m ? String(r.largo_m) : null, r.largo_etiqueta ? String(r.largo_etiqueta) : null),
        )),
    ),
    EN_ALMACEN.includes(r.estado) ? h('div', { class: 'card' },
      h('h2', {}, 'Ubicación'),
      h('select', { class: 'sel-grande', onchange: (e) => {
        const de = r.ubicacion_id;
        r.ubicacion_id = e.target.value;
        Store.put('rollos', r);
        registrarMovimiento(r, 'ubicacion', `Cambio de ubicación: ${(Store.get('ubicaciones', de) || {}).nombre || '—'} → ${Store.get('ubicaciones', r.ubicacion_id).nombre}`, { de, a: r.ubicacion_id });
        toast('Ubicación actualizada.');
        App.refrescar();
      } }, ubics.map((u) => h('option', { value: u.id, selected: u.id === r.ubicacion_id }, u.nombre))),
    ) : null,
    h('div', { class: 'card' },
      h('h2', {}, 'Historial'),
      movs.length ? movs.map((m) => h('div', { class: 'mov' },
        h('span', { class: 'muted' }, fmtFechaHora(m.fecha)), ' · ', h('b', {}, m.usuario || '—'), ' · ', m.detalle)) : h('p', { class: 'muted' }, 'Sin movimientos.'),
    ),
  );
}

// ---------- Ajustes ----------
function vistaConfig() {
  if (!Sesion.puede('configurar')) return h('div', { class: 'card' }, 'Solo un supervisor puede cambiar los ajustes.');
  const alm = App.almacen();
  const ubics = Store.where('ubicaciones', (u) => u.almacen === alm).sort((a, b) => a.orden - b.orden);
  const nueva = { nombre: '' };
  const nuevoU = { nombre: '', rol: 'almacenista' };

  return h('div', {},
    h('h1', {}, 'Ajustes'),
    h('div', { class: 'card' },
      h('h2', {}, `Ubicaciones · ${Store.get('almacenes', alm).nombre}`),
      h('p', { class: 'muted' }, 'Racks, pasillos o zonas. Puedes renombrarlas o desactivarlas sin perder el historial.'),
      ubics.map((u) => h('div', { class: 'fila' },
        h('input', { value: u.nombre, onchange: (e) => { u.nombre = e.target.value; Store.put('ubicaciones', u); toast('Guardado.'); } }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: u.activa, onchange: (e) => { u.activa = e.target.checked; Store.put('ubicaciones', u); } }), 'Activa'),
      )),
      h('div', { class: 'fila' },
        h('input', { placeholder: 'Nueva ubicación (ej. Rack A-1)', oninput: (e) => { nueva.nombre = e.target.value; } }),
        h('button', { class: 'btn', onclick: () => {
          if (!nueva.nombre.trim()) return;
          Store.put('ubicaciones', { id: uid(), almacen: alm, nombre: nueva.nombre.trim(), activa: true, orden: ubics.length + 1 });
          App.refrescar();
        } }, '➕ Agregar'),
      ),
    ),
    h('div', { class: 'card' },
      h('h2', {}, 'Significado de códigos de la descripción'),
      h('p', { class: 'muted' }, 'Cuando sepas qué significa cada código, escríbelo aquí.'),
      Store.all('codigos').map((c) => h('div', { class: 'fila' },
        h('b', { class: 'cod' }, c.id),
        h('input', { value: c.significado, placeholder: '¿Qué significa?', onchange: (e) => { c.significado = e.target.value; Store.put('codigos', c); toast('Guardado.'); } }),
      )),
    ),
    h('div', { class: 'card' },
      h('h2', {}, 'Números de parte'),
      h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' },
        h('thead', {}, h('tr', {}, ['No. parte', 'Material', 'Espesor (mm)', 'Tolerancia ± (mm)', 'Ancho (m)', 'Densidad (kg/m³)'].map((t) => h('th', {}, t)))),
        h('tbody', {}, Store.where('partes', (p) => p.almacen === alm).map((p) => h('tr', {},
          h('td', {}, p.id), h('td', {}, p.material),
          ['espesor_mm', 'tolerancia_mm', 'ancho_m', 'densidad'].map((k) => h('td', {}, h('input', {
            type: 'number', step: 'any', class: 'inp-chico', value: p[k],
            onchange: (e) => { p[k] = Number(e.target.value); Store.put('partes', p); toast('Guardado.'); },
          }))),
        ))),
      )),
    ),
    h('div', { class: 'card' },
      h('h2', {}, 'Usuarios'),
      NUBE ? h('p', { class: 'muted' }, 'Para dar acceso a alguien: en Supabase → Authentication → Users → Add user (correo y contraseña). Cuando entre por primera vez aparece aquí como almacenista y tú le cambias el nombre y el rol.') : null,
      Store.all('usuarios').map((u) => h('div', { class: 'fila' },
        NUBE ? h('span', { class: 'muted', title: u.email }, u.email) : null,
        h('input', { value: u.nombre, onchange: (e) => { u.nombre = e.target.value; Store.put('usuarios', u); } }),
        h('select', { onchange: (e) => { u.rol = e.target.value; Store.put('usuarios', u); } },
          ['almacenista', 'inspector', 'supervisor'].map((r) => h('option', { value: r, selected: u.rol === r }, r))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: u.activo, onchange: (e) => { u.activo = e.target.checked; Store.put('usuarios', u); } }), 'Activo'),
      )),
      NUBE ? null : h('div', { class: 'fila' },
        h('input', { placeholder: 'Nombre del nuevo usuario', oninput: (e) => { nuevoU.nombre = e.target.value; } }),
        h('select', { onchange: (e) => { nuevoU.rol = e.target.value; } }, ['almacenista', 'inspector', 'supervisor'].map((r) => h('option', { value: r }, r))),
        h('button', { class: 'btn', onclick: () => {
          if (!nuevoU.nombre.trim()) return;
          Store.put('usuarios', { id: uid(), nombre: nuevoU.nombre.trim(), rol: nuevoU.rol, activo: true });
          App.refrescar();
        } }, '➕ Agregar'),
      ),
    ),
    h('div', { class: 'card' },
      h('h2', {}, 'Datos'),
      h('p', { class: 'muted' }, NUBE
        ? 'Los datos están en la nube (Supabase) y se comparten con todos. Descarga un respaldo de vez en cuando.'
        : 'Los datos se guardan solo en ESTE navegador. Haz respaldos seguido.'),
      h('div', { class: 'acciones' },
        h('button', { class: 'btn', onclick: () => {
          const blob = new Blob([JSON.stringify(Store.exportar(), null, 1)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `respaldo_inventario_${fmtFecha(new Date().toISOString()).replace(/\//g, '-')}.json` });
          a.click();
        } }, '💾 Descargar respaldo'),
        h('label', { class: 'btn' }, '📂 Restaurar respaldo', h('input', { type: 'file', accept: '.json', class: 'oculto', onchange: async (e) => {
          const file = e.target.files[0];
          if (!file || !confirmar('Esto REEMPLAZA todos los datos actuales por los del respaldo. ¿Continuar?')) return;
          await Store.importar(JSON.parse(await file.text()));
          toast('Respaldo restaurado.'); App.refrescar();
        } })),
        h('button', { class: 'btn btn-peligro', onclick: async () => {
          if (!confirmar(`Esto BORRA todo${NUBE ? ' EN LA NUBE (para todos)' : ''} y vuelve a cargar los datos de prueba (las 2 listas de embarque). ¿Continuar?`)) return;
          try {
            await Store.borrarTodo();
            cargarDatosPrueba();
            await Store.flush();
            toast('Datos de prueba cargados de nuevo.'); App.ir('/');
          } catch (e) { toast('No se pudo: ' + e.message, 'error'); }
        } }, '♻️ Reiniciar con datos de prueba'),
        h('button', { class: 'btn btn-peligro', onclick: async () => {
          if (!confirmar(`Esto BORRA todos los rollos, recepciones e inspecciones${NUBE ? ' EN LA NUBE (para todos)' : ''} y deja solo los catálogos y usuarios, para empezar a usarla de verdad. ¿Continuar?`)) return;
          if (!confirmar('¿Seguro? No se puede deshacer (salvo que tengas un respaldo).')) return;
          try {
            const usuarios = Store.all('usuarios');
            await Store.borrarTodo();
            cargarCatalogos();
            if (!NUBE) Store.putMany('usuarios', usuarios);
            Store.put('config', { id: 'datos', version: 1, datos_prueba: false });
            await Store.flush();
            toast('Listo: la app quedó en limpio.'); App.ir('/');
          } catch (e) { toast('No se pudo: ' + e.message, 'error'); }
        } }, '🧹 Empezar en limpio'),
      ),
    ),
  );
}
