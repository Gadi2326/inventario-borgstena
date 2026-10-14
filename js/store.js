// Almacenamiento de datos.
//
// Las pantallas siempre leen de una copia en memoria (rápido y funciona sin señal).
// - Modo "solo esta PC" (config.js vacío): la copia se guarda en el navegador (IndexedDB).
// - Modo nube (config.js con Supabase): además se sube a Supabase. Si se cae la señal,
//   los cambios esperan en una "bandeja de salida" y se suben solos cuando regresa.
//   Los cambios de otros celulares llegan en tiempo real.
//
// Cada "tabla" es una lista de renglones con un campo `id` único.

const TABLAS = [
  'almacenes', 'ubicaciones', 'proveedores', 'partes', 'codigos', 'usuarios',
  'recepciones', 'rollos', 'inspecciones', 'movimientos', 'config',
];

const NUBE = !!(typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);

const Store = (() => {
  const DB_NAME = NUBE ? 'inventario-borgstena-nube' : 'inventario-borgstena';
  const mem = {};               // tabla -> Map(id -> renglón)
  const pendientesLocal = new Set();
  let outbox = new Map();       // "tabla|id" -> número de versión (cambios por subir a la nube)
  let version = 0;
  let db, timerLocal, timerNube, canal;
  let sb = null, usuarioAuth = null;
  let estado = NUBE ? 'desconectado' : 'local';
  const oyentes = [];

  // ---------- Copia local en el navegador ----------
  function abrir() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('tablas');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function leer(clave) {
    return new Promise((resolve, reject) => {
      const r = db.transaction('tablas').objectStore('tablas').get(clave);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  function guardarLocal() {
    if (!pendientesLocal.size) return Promise.resolve();
    const tx = db.transaction('tablas', 'readwrite');
    for (const t of pendientesLocal) {
      if (t === '__outbox') tx.objectStore('tablas').put([...outbox.entries()], '__outbox');
      else tx.objectStore('tablas').put([...mem[t].values()], t);
    }
    pendientesLocal.clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => { toast('No se pudo guardar en este dispositivo: ' + tx.error, 'error'); reject(tx.error); };
    });
  }
  function marcarLocal(...tablas) {
    tablas.forEach((t) => pendientesLocal.add(t));
    clearTimeout(timerLocal);
    timerLocal = setTimeout(guardarLocal, 150);
  }

  // ---------- Nube (Supabase) ----------
  function aOutbox(tabla, id) {
    if (!NUBE) return;
    outbox.set(`${tabla}|${id}`, ++version);
    marcarLocal('__outbox');
    programarSubida(300);
  }
  function programarSubida(ms) {
    clearTimeout(timerNube);
    timerNube = setTimeout(subir, ms);
  }
  function cambiarEstado(e) {
    if (estado === e) return;
    estado = e;
    oyentes.forEach((f) => f('estado'));
  }

  let subiendo = false;
  async function subir() {
    if (!NUBE || !usuarioAuth || subiendo || !outbox.size) return;
    subiendo = true;
    const lote = [...outbox.entries()];
    try {
      const puts = [], dels = [];
      for (const [clave] of lote) {
        const i = clave.indexOf('|');
        const tabla = clave.slice(0, i), id = clave.slice(i + 1);
        const row = mem[tabla] && mem[tabla].get(id);
        if (row) puts.push({ tabla, id, data: row });
        else dels.push({ tabla, id });
      }
      for (let i = 0; i < puts.length; i += 300) {
        const { error } = await sb.from('registros').upsert(puts.slice(i, i + 300));
        if (error) throw error;
      }
      for (const d of dels) {
        const { error } = await sb.from('registros').delete().eq('tabla', d.tabla).eq('id', d.id);
        if (error) throw error;
      }
      // Solo quitamos de la bandeja lo que no cambió mientras subíamos
      for (const [clave, v] of lote) if (outbox.get(clave) === v) outbox.delete(clave);
      marcarLocal('__outbox');
      cambiarEstado('en_linea');
    } catch (e) {
      console.warn('No se pudo subir a la nube:', e);
      cambiarEstado('sin_conexion');
      programarSubida(10000);
    } finally {
      subiendo = false;
      oyentes.forEach((f) => f('estado'));
      if (outbox.size && estado === 'en_linea') programarSubida(300);
    }
  }

  // Baja todo de la nube (lo que está pendiente de subir en este celular no se pisa)
  async function bajar() {
    const nuevos = {};
    for (const t of TABLAS) nuevos[t] = new Map();
    const PAG = 1000;
    for (let desde = 0; ; desde += PAG) {
      const { data, error } = await sb.from('registros').select('tabla,id,data').order('tabla').order('id').range(desde, desde + PAG - 1);
      if (error) throw error;
      for (const r of data) if (nuevos[r.tabla]) nuevos[r.tabla].set(r.id, r.data);
      if (data.length < PAG) break;
    }
    for (const clave of outbox.keys()) {
      const i = clave.indexOf('|');
      const tabla = clave.slice(0, i), id = clave.slice(i + 1);
      if (!nuevos[tabla]) continue;
      const local = mem[tabla].get(id);
      if (local) nuevos[tabla].set(id, local); else nuevos[tabla].delete(id);
    }
    for (const t of TABLAS) mem[t] = nuevos[t];
    marcarLocal(...TABLAS);
  }

  function escucharCambios() {
    if (canal) sb.removeChannel(canal);
    canal = sb.channel('registros')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros' }, (p) => {
        const r = p.eventType === 'DELETE' ? p.old : p.new;
        if (!r || !mem[r.tabla] || outbox.has(`${r.tabla}|${r.id}`)) return;
        if (p.eventType === 'DELETE') {
          if (!mem[r.tabla].has(r.id)) return;
          mem[r.tabla].delete(r.id);
        } else {
          const actual = mem[r.tabla].get(r.id);
          if (actual && JSON.stringify(actual) === JSON.stringify(r.data)) return; // es nuestro propio cambio
          mem[r.tabla].set(r.id, r.data);
        }
        marcarLocal(r.tabla);
        oyentes.forEach((f) => f('datos'));
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') { cambiarEstado('en_linea'); programarSubida(100); }
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') cambiarEstado('sin_conexion');
      });
  }

  async function conectar() {
    try {
      await bajar();
      cambiarEstado('en_linea');
    } catch (e) {
      console.warn('Sin conexión, se usa la copia de este celular:', e);
      cambiarEstado('sin_conexion');
    }
    escucharCambios();
    programarSubida(100);
  }

  return {
    async init() {
      db = await abrir();
      for (const t of TABLAS) mem[t] = new Map(((await leer(t)) || []).map((r) => [r.id, r]));
      outbox = new Map((await leer('__outbox')) || []);
      window.addEventListener('beforeunload', guardarLocal);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) guardarLocal();
        else if (NUBE && usuarioAuth) programarSubida(100);
      });
      window.addEventListener('online', () => NUBE && usuarioAuth && conectar());
      if (NUBE) {
        sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        const { data } = await sb.auth.getSession();
        usuarioAuth = data.session ? data.session.user : null;
        if (usuarioAuth) await conectar();
        setInterval(() => outbox.size && programarSubida(0), 30000);
      }
    },
    // ---- Sesión en la nube ----
    usuarioAuth: () => usuarioAuth,
    async iniciarSesion(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      usuarioAuth = data.user;
      await conectar();
    },
    async cerrarSesion() {
      await guardarLocal();
      if (outbox.size) await subir();
      if (canal) sb.removeChannel(canal);
      canal = null;
      await sb.auth.signOut();
      usuarioAuth = null;
      cambiarEstado('desconectado');
    },
    estado: () => estado,
    pendientes: () => outbox.size,
    alCambiar(fn) { oyentes.push(fn); },

    // ---- Lectura y escritura (igual en los dos modos) ----
    vacio() {
      return mem.partes.size === 0;
    },
    all(tabla) {
      return [...mem[tabla].values()];
    },
    get(tabla, id) {
      return mem[tabla].get(id) || null;
    },
    where(tabla, fn) {
      return this.all(tabla).filter(fn);
    },
    put(tabla, row) {
      if (!row.id) row.id = uid();
      mem[tabla].set(row.id, row);
      marcarLocal(tabla);
      aOutbox(tabla, row.id);
      return row;
    },
    putMany(tabla, rows) {
      for (const r of rows) {
        if (!r.id) r.id = uid();
        mem[tabla].set(r.id, r);
        aOutbox(tabla, r.id);
      }
      marcarLocal(tabla);
    },
    remove(tabla, id) {
      mem[tabla].delete(id);
      marcarLocal(tabla);
      aOutbox(tabla, id);
    },
    // Borra todo menos las tablas indicadas (por defecto conserva los usuarios en la nube)
    async borrarTodo(conservar = NUBE ? ['usuarios'] : []) {
      if (NUBE) {
        const { error } = await sb.from('registros').delete().not('tabla', 'in', `(${conservar.map((t) => `"${t}"`).join(',') || '""'})`);
        if (error) throw error;
        for (const k of [...outbox.keys()]) if (!conservar.includes(k.split('|')[0])) outbox.delete(k);
      }
      for (const t of TABLAS) if (!conservar.includes(t)) { mem[t].clear(); pendientesLocal.add(t); }
      pendientesLocal.add('__outbox');
      await guardarLocal();
    },
    async flush() {
      await guardarLocal();
      if (NUBE && usuarioAuth) await subir();
    },
    // Respaldo completo en un archivo JSON
    exportar() {
      const out = {};
      for (const t of TABLAS) out[t] = this.all(t);
      return out;
    },
    async importar(data) {
      await this.borrarTodo([]);
      for (const t of TABLAS) this.putMany(t, data[t] || []);
      await this.flush();
    },
  };
})();

// Guarda un movimiento en el historial (quién, cuándo, qué).
function registrarMovimiento(rollo, tipo, detalle, extra = {}) {
  const u = Sesion.usuario();
  Store.put('movimientos', {
    id: uid(),
    rollo_id: rollo.id,
    no_rollo: rollo.no_rollo,
    almacen: rollo.almacen,
    tipo,
    detalle,
    usuario: u ? u.nombre : '',
    fecha: new Date().toISOString(),
    ...extra,
  });
}

// Usuario activo.
// - Solo esta PC: se elige el nombre de una lista.
// - Nube: correo y contraseña de Supabase; el perfil (nombre y rol) se guarda en la tabla "usuarios".
const Sesion = {
  usuario() {
    if (NUBE) {
      const a = Store.usuarioAuth();
      const u = a ? Store.get('usuarios', a.id) : null;
      return u && u.activo ? u : null;
    }
    try {
      const id = localStorage.getItem('usuarioActivo');
      return id ? Store.get('usuarios', id) : null;
    } catch (e) { return null; }
  },
  entrar(id) {
    try { localStorage.setItem('usuarioActivo', id); } catch (e) { /* modo privado */ }
  },
  async salir() {
    if (NUBE) await Store.cerrarSesion();
    try { localStorage.removeItem('usuarioActivo'); } catch (e) { /* modo privado */ }
  },
  puede(accion) {
    const u = this.usuario();
    if (!u) return false;
    const permisos = {
      almacenista: ['recibir', 'mover', 'eliminar'],
      inspector: ['recibir', 'mover', 'inspeccionar', 'eliminar'],
      supervisor: ['recibir', 'mover', 'inspeccionar', 'eliminar', 'aprobar', 'configurar'],
    };
    return (permisos[u.rol] || []).includes(accion);
  },
};

// Primera vez que alguien entra en la nube: se le crea su perfil.
// El primer usuario de todos queda como supervisor; los demás como almacenista (el supervisor les cambia el rol).
// Si nadie es supervisor (por ejemplo, después de borrar datos), el que entra queda como supervisor para no quedarse sin acceso a Ajustes.
function asegurarPerfilNube() {
  const a = Store.usuarioAuth();
  if (!a) return;
  const haySupervisor = Store.all('usuarios').some((u) => u.rol === 'supervisor' && u.activo);
  const yo = Store.get('usuarios', a.id);
  if (yo) {
    if (!haySupervisor && yo.activo) { yo.rol = 'supervisor'; Store.put('usuarios', yo); }
    return;
  }
  Store.put('usuarios', {
    id: a.id, email: a.email, nombre: a.email.split('@')[0],
    rol: haySupervisor ? 'almacenista' : 'supervisor', activo: true,
  });
}

const ESTADOS = {
  en_transito: { txt: 'Esperado (no ha llegado)', cls: 'gris' },
  faltante: { txt: 'Faltante (no llegó)', cls: 'rojo' },
  inspeccion_pendiente: { txt: 'Inspección pendiente', cls: 'amarillo' },
  aceptado: { txt: 'Aceptado', cls: 'verde' },
  aceptado_desviacion: { txt: 'Aceptado con desviación', cls: 'azul' },
  rechazado: { txt: 'Rechazado', cls: 'rojo' },
  consumido: { txt: 'Consumido', cls: 'gris' },
  scrap: { txt: 'Scrap', cls: 'rojo' },
};
// Estados que cuentan como "en el almacén"
const EN_ALMACEN = ['inspeccion_pendiente', 'aceptado', 'aceptado_desviacion', 'rechazado'];

function etiquetaEstado(estado) {
  const e = ESTADOS[estado] || { txt: estado, cls: 'gris' };
  return h('span', { class: 'chip ' + e.cls }, e.txt);
}
