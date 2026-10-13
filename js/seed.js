// Datos iniciales y datos de prueba.
// ⚠️ Los datos de prueba son INVENTADOS (lotes Z-9xx, facturas DEMO-…): no son de la planta.
// Imitan cómo vienen las listas de embarque reales para poder practicar.

const DESC_A527 = '1.450X240X0.0060-27/035L ST GRS RB';
const DESC_A727 = '1.450X120X0.0080-27/035L ST GRS RB';
const DESC_A727_109 = '1.450X109X0.0080-27/035L ST GRS RB';

// Número de rollo inventado: 26 + lote sin guiones + consecutivo de 3 dígitos
const rollo = (lote, n) => '26' + lote.replace(/-/g, '') + String(n).padStart(3, '0');
const renglones = (parte, desc, lote, largo, consecutivos) =>
  consecutivos.map((n) => [parte, desc, lote, rollo(lote, n), largo]);

// Recepción DEMO-0001 (ya recibida)
const LISTA_DEMO_1 = [
  ...renglones('SPONGE-A527GN', DESC_A527, 'Z-901-01-01', 240, [1, 2, 3, 4, 5, 6]),
  ['SPONGE-A727GN', DESC_A727_109, 'Z-902-01-01', rollo('Z-902-01-01', 1), 109], // rollo corto
  ...renglones('SPONGE-A727GN', DESC_A727, 'Z-902-01-01', 120, [2, 3, 4, 5, 6]),
  ...renglones('SPONGE-A727GN', DESC_A727, 'Z-903-02-01', 120, [1, 2, 3, 4]),
];
const PUNTOS_DEMO_1 = [rollo('Z-903-02-01', 3)];

// Recepción DEMO-0002 (abierta, para practicar el escaneo)
const LISTA_DEMO_2 = [
  ...renglones('SPONGE-A527GN', DESC_A527, 'Z-901-01-01', 240, [7, 8, 9, 10, 11, 12, 13, 14]),
  // Un lote puede traer dos números de parte (pasa en la vida real)
  ['SPONGE-A527GN', DESC_A527, 'Z-902-01-01', rollo('Z-902-01-01', 7), 240],
  ...renglones('SPONGE-A727GN', DESC_A727, 'Z-903-02-01', 120, [5, 6, 7, 8, 9, 10]),
];
const PUNTOS_DEMO_2 = [rollo('Z-901-01-01', 9)];

function pesoTeorico(desc, largo) {
  const d = parseDescripcion(desc);
  return d ? Math.round(d.ancho_m * largo * (d.espesor_mm / 1000) * d.densidad * 10000) / 10000 : null;
}

function cargarCatalogos() {
  Store.putMany('almacenes', [
    { id: 'FOAM', nombre: 'Almacén de Foam', orden: 1 },
    { id: 'TELA', nombre: 'Almacén de Tela / Vinil / Backing', orden: 2 },
  ]);
  Store.putMany('ubicaciones', [
    { id: 'FOAM-GENERAL', almacen: 'FOAM', nombre: 'Área de foam (general)', activa: true, orden: 1 },
    { id: 'TELA-INSP-PEND', almacen: 'TELA', nombre: 'Inspección pendiente', activa: true, orden: 1 },
    { id: 'TELA-INSP-REAL', almacen: 'TELA', nombre: 'Inspección realizada', activa: true, orden: 2 },
    { id: 'TELA-SCRAP', almacen: 'TELA', nombre: 'Scrap', activa: true, orden: 3 },
    { id: 'TELA-MUESTRAS', almacen: 'TELA', nombre: 'Muestras (área provisional)', activa: true, orden: 4 },
  ]);
  Store.putMany('proveedores', [
    { id: 'UREBLOCK', nombre: 'UREBLOCK S.A. de C.V.', almacen: 'FOAM', activo: true },
  ]);
  const parte = (id, esp, largo) => ({
    id, almacen: 'FOAM', material: 'Esponja', proveedor: 'UREBLOCK',
    espesor_mm: esp, tolerancia_mm: 0.5, ancho_m: 1.45, densidad: 27, largo_tipico_m: largo, activa: true,
  });
  Store.putMany('partes', [parte('SPONGE-A327GN', 4, null), parte('SPONGE-A527GN', 6, 240), parte('SPONGE-A727GN', 8, 120)]);
  // Códigos de la descripción cuyo significado aún no sabemos
  Store.putMany('codigos', ['035L', 'ST', 'GRS', 'RB', 'LOOPER 2'].map((c) => ({ id: c, significado: '' })));
  // En la nube los usuarios se crean solos al entrar con su correo
  if (!NUBE) {
    Store.putMany('usuarios', [
      { id: 'u-sup', nombre: 'Supervisor de prueba', rol: 'supervisor', activo: true },
      { id: 'u-insp', nombre: 'Inspector de prueba', rol: 'inspector', activo: true },
      { id: 'u-alm', nombre: 'Almacenista de prueba', rol: 'almacenista', activo: true },
    ]);
  }
}

function crearRecepcionDemo(datos, lista, puntos, recibida) {
  const rec = Store.put('recepciones', {
    almacen: 'FOAM', proveedor: 'UREBLOCK', po: 'PO-DEMO-01', transporte: 'Transporte Demo',
    tracto: '', caja: '', placas2: '', entrega: 'DUAL BORGSTENA TRIM MEXICO',
    estado: recibida ? 'cerrada' : 'abierta', creado_por: 'Datos de prueba',
    creado_en: datos.fecha, cerrada_en: recibida ? datos.fecha : null, ...datos,
  });
  const rollos = lista.map(([parte, desc, lote, no, largo], i) => ({
    id: no, no_rollo: no, almacen: 'FOAM', recepcion_id: rec.id, renglon: i + 1,
    parte, descripcion: desc, lote_proveedor: lote, largo_m: largo, largo_actual_m: largo,
    peso_teorico_kg: pesoTeorico(desc, largo), en_lista: true,
    marca_punto: puntos.includes(no),
    recibido: recibida, recibido_en: recibida ? datos.fecha : null,
    recibido_por: recibida ? 'Datos de prueba' : null,
    estado: recibida ? 'inspeccion_pendiente' : 'en_transito',
    ubicacion_id: recibida ? 'FOAM-GENERAL' : null,
    alertas: [],
  }));
  Store.putMany('rollos', rollos);
  return rec;
}

function cargarDatosPrueba() {
  cargarCatalogos();
  crearRecepcionDemo({
    fecha: new Date(2026, 9, 1, 10, 0).toISOString(), factura: 'DEMO-0001', sello: '000001',
    placas: 'DEMO-01', responsable_carga: 'Persona A', chofer: 'Chofer Demo',
  }, LISTA_DEMO_1, PUNTOS_DEMO_1, true);
  crearRecepcionDemo({
    fecha: new Date(2026, 9, 2, 9, 0).toISOString(), factura: 'DEMO-0002', sello: '000002',
    placas: 'DEMO-02', responsable_carga: 'Persona B', chofer: 'Chofer Demo',
  }, LISTA_DEMO_2, PUNTOS_DEMO_2, false);

  // Etiquetas "escaneadas": una coincide y otra trae un lote distinto al de la lista
  const r1 = Store.get('rollos', rollo('Z-902-01-01', 2));
  Object.assign(r1, { lote_etiqueta: 'Z-902-01-01', parte_etiqueta: 'SPONGE-A727GN', largo_etiqueta: 120, lote_produccion: '202610010630' });
  const r2 = Store.get('rollos', rollo('Z-903-02-01', 3));
  Object.assign(r2, { lote_etiqueta: 'Z-999-01-01', parte_etiqueta: 'SPONGE-A727GN', largo_etiqueta: 120, lote_produccion: '202610010545' });
  r2.alertas = ['La etiqueta dice lote Z-999-01-01 pero la lista de embarque dice Z-903-02-01'];
  Store.putMany('rollos', [r1, r2]);
  for (const r of Store.where('rollos', (x) => x.recibido)) {
    registrarMovimiento(r, 'recepcion', 'Recibido (datos de prueba)', { usuario: 'Datos de prueba', fecha: r.recibido_en });
  }
  Store.put('config', { id: 'datos', version: 2, datos_prueba: true });
}
