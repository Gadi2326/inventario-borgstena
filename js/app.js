// Arranque de la app, menú y navegación entre pantallas.

// Cámbiala junto con version.json cada vez que se publiquen cambios: así los celulares se actualizan solos.
const VERSION_APP = '2026-10-14b';

const App = {
  almacen() {
    try { return localStorage.getItem('almacen') || 'FOAM'; } catch (e) { return 'FOAM'; }
  },
  cambiarAlmacen(id) {
    try { localStorage.setItem('almacen', id); } catch (e) { /* modo privado */ }
    this.refrescar();
  },
  ir(ruta) {
    if (location.hash === '#' + ruta) this.refrescar();
    else location.hash = ruta;
  },
  refrescar() {
    const main = document.getElementById('main');
    const y = window.scrollY;
    main.replaceChildren(renderRuta());
    pintarBarra();
    window.scrollTo(0, y);
    const scan = main.querySelector('.scan-input[data-autofocus]');
    if (scan) scan.focus({ preventScroll: true });
  },
};

const RUTAS = [
  [/^\/$/, () => vistaInicio()],
  [/^\/recepciones$/, () => vistaRecepciones()],
  [/^\/recepcion-nueva$/, () => vistaRecepcionNueva()],
  [/^\/recepcion\/([^/]+)$/, (m) => vistaRecepcion(m[1])],
  [/^\/inspecciones$/, () => vistaInspecciones()],
  [/^\/inspeccion\/([^/]+)$/, (m) => vistaInspeccion(m[1])],
  [/^\/inspeccion\/([^/]+)\/imprimir$/, (m) => vistaImprimirInspeccion(m[1])],
  [/^\/inventario$/, () => vistaInventario()],
  [/^\/rollo\/([^/]+)$/, (m) => vistaRollo(decodeURIComponent(m[1]))],
  [/^\/config$/, () => vistaConfig()],
];

// Vuelve a descargar todos los archivos de la app ignorando las copias guardadas
async function recargarSinCache() {
  const archivos = [location.pathname, ...[...document.querySelectorAll('script[src], link[rel=stylesheet]')].map((el) => el.src || el.href)];
  await Promise.all(archivos.map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
  location.reload();
}

// Si hay una versión nueva publicada, recarga la app (una sola vez por versión, para no ciclarse)
async function revisarVersion() {
  try {
    const r = await fetch('version.json', { cache: 'no-store' });
    const { version } = await r.json();
    if (!version || version === VERSION_APP) return;
    if (sessionStorage.getItem('actualizando') === version) return;
    sessionStorage.setItem('actualizando', version);
    await recargarSinCache();
  } catch (e) { /* sin señal o modo privado: seguimos con la versión que hay */ }
}

function renderRuta() {
  if (!Sesion.usuario()) return vistaLogin();
  const ruta = (location.hash || '#/').slice(1).split('?')[0] || '/';
  for (const [re, fn] of RUTAS) {
    const m = re.exec(ruta);
    if (m) {
      try { return fn(m); } catch (e) {
        console.error(e);
        // "X is not defined" casi siempre es una versión vieja de la página guardada en el navegador
        if (e instanceof ReferenceError) {
          return h('div', { class: 'card aviso' },
            h('b', {}, 'Hay una versión nueva de la app.'),
            h('p', {}, 'Tu navegador guardó una copia vieja. Toca el botón para cargar la nueva (en PC también sirve Ctrl + F5).'),
            h('button', { class: 'btn btn-primario', onclick: () => recargarSinCache() }, '🔄 Actualizar la app'));
        }
        return h('div', { class: 'card error' }, 'Ocurrió un error en esta pantalla: ' + e.message);
      }
    }
  }
  return h('div', { class: 'card' }, 'Pantalla no encontrada. ', h('a', { href: '#/' }, 'Ir al inicio'));
}

function pintarBarra() {
  const u = Sesion.usuario();
  const barra = document.getElementById('barra');
  const ruta = (location.hash || '#/').slice(1);
  const link = (href, prefijo, txt) => h('a', {
    href: '#' + href,
    class: (prefijo === '/' ? ruta === '/' : ruta.startsWith(prefijo)) ? 'activo' : '',
  }, txt);
  barra.replaceChildren();
  barra.append(...[
    h('div', { class: 'barra-top' },
      h('a', { href: '#/', class: 'logo' }, 'Inventario ', h('b', {}, 'Borgstena')),
      u ? h('select', {
        class: 'sel-almacen', title: 'Almacén',
        onchange: (e) => App.cambiarAlmacen(e.target.value),
      }, Store.all('almacenes').sort((a, b) => a.orden - b.orden)
        .map((a) => h('option', { value: a.id, selected: a.id === App.almacen() }, a.nombre))) : null,
      indicadorConexion(),
      u ? h('button', {
        class: 'btn-usuario', title: NUBE ? 'Cerrar sesión' : 'Cambiar de usuario',
        onclick: async () => {
          if (NUBE && !confirmar('¿Cerrar sesión?')) return;
          await Sesion.salir();
          App.refrescar();
        },
      }, '👤 ' + u.nombre.split(' ')[0]) : null,
    ),
    u ? h('nav', { class: 'menu' },
      link('/', '/', '🏠 Inicio'),
      link('/recepciones', '/recepcion', '🚚 Recepción'),
      link('/inspecciones', '/inspeccion', '📋 Inspección'),
      link('/inventario', '/inventario', '📦 Inventario'),
      Sesion.puede('configurar') ? link('/config', '/config', '⚙️ Ajustes') : null,
    ) : null,
  ].filter(Boolean));
}

function indicadorConexion() {
  if (!NUBE) return h('span', { class: 'conexion local', title: 'Los datos se guardan solo en este dispositivo' }, '💻 Solo esta PC');
  const e = Store.estado(), n = Store.pendientes();
  if (e === 'en_linea' && !n) return h('span', { class: 'conexion ok', title: 'Conectado a la nube' }, '☁️ En línea');
  if (e === 'en_linea') return h('span', { class: 'conexion ok', title: 'Subiendo cambios' }, `☁️ Subiendo ${n}…`);
  if (e === 'sin_conexion') return h('span', { class: 'conexion mal', title: 'Los cambios se guardan en este celular y se suben cuando regrese la señal' }, `⚠️ Sin señal${n ? ` (${n} por subir)` : ''}`);
  return null;
}

// ---------- Entrar ----------
function vistaLogin() {
  return NUBE ? vistaLoginNube() : vistaLoginLocal();
}

function vistaLoginNube() {
  const f = { email: '', password: '' };
  const a = Store.usuarioAuth();
  const entrar = async (btn) => {
    if (!f.email || !f.password) return toast('Escribe tu correo y tu contraseña.', 'error');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      await Store.iniciarSesion(f.email.trim(), f.password);
      prepararNube();
      App.ir('/');
    } catch (e) {
      const msg = /invalid login/i.test(e.message) ? 'Correo o contraseña incorrectos.'
        : /fetch|network/i.test(e.message) ? 'Sin conexión a internet. Para entrar la primera vez necesitas señal.'
          : e.message;
      toast(msg, 'error');
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  };
  return h('div', { class: 'login' },
    h('h1', {}, 'Entrar'),
    a ? h('div', { class: 'card aviso' }, `Tu usuario (${a.email}) está desactivado. Pide a un supervisor que lo active.`,
      h('button', { class: 'btn btn-chico', onclick: async () => { await Sesion.salir(); App.refrescar(); } }, 'Salir')) : null,
    h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); entrar(e.target.querySelector('button')); } },
      h('label', { class: 'campo' }, 'Correo', h('input', { type: 'email', autocomplete: 'username', oninput: (e) => { f.email = e.target.value; } })),
      h('label', { class: 'campo' }, 'Contraseña', h('input', { type: 'password', autocomplete: 'current-password', oninput: (e) => { f.password = e.target.value; } })),
      h('button', { class: 'btn btn-grande btn-primario', type: 'submit' }, 'Entrar'),
    ),
    h('p', { class: 'muted' }, 'Las cuentas las crea el supervisor en Supabase. La sesión se queda abierta en este celular.'),
  );
}

// Al conectarse a la nube por primera vez: cargar catálogos/datos de prueba y crear el perfil del usuario
function prepararNube() {
  if (!Store.usuarioAuth()) return;
  if (Store.vacio() && Store.estado() === 'en_linea') {
    cargarDatosPrueba();
    toast('La nube estaba vacía: se cargaron los catálogos y los datos de prueba.');
  }
  asegurarPerfilNube();
}

function vistaLoginLocal() {
  const usuarios = Store.where('usuarios', (u) => u.activo);
  const ROL = { almacenista: 'Almacenista', inspector: 'Inspector', supervisor: 'Supervisor' };
  return h('div', { class: 'login' },
    h('h1', {}, '¿Quién eres?'),
    h('p', { class: 'muted' }, 'Toca tu nombre para entrar. (En la versión en la nube cada quien tendrá su contraseña.)'),
    usuarios.map((u) => h('button', {
      class: 'btn btn-grande btn-usuario-login',
      onclick: () => { Sesion.entrar(u.id); App.refrescar(); },
    }, u.nombre, h('small', {}, ROL[u.rol] || u.rol))),
  );
}

// ---------- Inicio ----------
function vistaInicio() {
  const alm = App.almacen();
  const rollos = Store.where('rollos', (r) => r.almacen === alm);
  const enAlm = rollos.filter((r) => EN_ALMACEN.includes(r.estado));
  const pendInsp = gruposPendientesInspeccion(alm);
  const abiertas = Store.where('recepciones', (r) => r.almacen === alm && r.estado === 'abierta');
  const conAlerta = enAlm.filter((r) => r.alertas && r.alertas.length);
  const metros = enAlm.reduce((s, r) => s + (r.largo_actual_m || 0), 0);

  return h('div', {},
    h('h1', {}, Store.get('almacenes', alm).nombre),
    alm === 'TELA' ? h('div', { class: 'card aviso' },
      'Este almacén se habilita en la etapa 3. Por ahora solo tiene sus ubicaciones configuradas.') : null,
    h('div', { class: 'stats' },
      stat(enAlm.length, 'rollos en almacén'),
      stat(fmtNum(metros), 'metros'),
      stat(pendInsp.length, 'lotes por inspeccionar', pendInsp.length ? 'amarillo' : ''),
      stat(conAlerta.length, 'rollos con alerta', conAlerta.length ? 'rojo' : ''),
    ),
    h('div', { class: 'card' },
      h('h2', {}, '🔎 Buscar un rollo'),
      campoEscaneo((txt) => buscarYAbrirRollo(txt), { placeholder: 'Escanea el número de rollo', autofocus: false }),
    ),
    h('div', { class: 'acciones-inicio' },
      h('a', { class: 'btn btn-grande btn-primario', href: '#/recepcion-nueva' }, '🚚 Recibir camión'),
      abiertas.map((r) => h('a', { class: 'btn btn-grande', href: '#/recepcion/' + r.id },
        `▶️ Seguir recepción ${r.factura || ''} (${fmtFecha(r.fecha)})`)),
      h('a', { class: 'btn btn-grande', href: '#/inspecciones' }, `📋 Inspecciones (${pendInsp.length} pendientes)`),
      h('a', { class: 'btn btn-grande', href: '#/inventario' }, '📦 Ver inventario'),
    ),
    conAlerta.length ? h('div', { class: 'card' },
      h('h2', {}, '⚠️ Rollos con alerta'),
      conAlerta.map((r) => h('a', { class: 'fila-link', href: '#/rollo/' + encodeURIComponent(r.id) },
        h('b', {}, r.no_rollo), ' — ', r.alertas.join('; '))),
    ) : null,
    h('p', { class: 'muted centro' }, `Versión ${VERSION_APP} · ${Sesion.usuario().nombre} (${Sesion.usuario().rol})`),
  );
}

function stat(valor, txt, cls = '') {
  return h('div', { class: 'stat ' + cls }, h('div', { class: 'stat-num' }, valor), h('div', { class: 'stat-txt' }, txt));
}

function buscarYAbrirRollo(txt) {
  const c = clasificarCodigo(txt);
  const id = c.tipo === 'rollo' ? c.no_rollo : txt.trim().toUpperCase();
  if (Store.get('rollos', id)) {
    beep('ok');
    App.ir('/rollo/' + encodeURIComponent(id));
  } else if (c.tipo === 'lote') {
    App.ir('/inventario?lote=' + c.lote);
  } else {
    beep('error');
    toast(`No encontré el rollo "${txt.trim()}". Escanea el código de barras del NÚMERO DE ROLLO (ej. 26Z9010101001).`, 'error');
  }
}

// ---------- Arranque ----------
window.addEventListener('hashchange', () => { App.refrescar(); window.scrollTo(0, 0); });

// Cuando llegan cambios de otro celular, refrescamos la pantalla (sin interrumpir si estás escribiendo)
let refrescoPendiente = false;
function refrescarSiSeguro() {
  const act = document.activeElement;
  const escribiendo = act && ['INPUT', 'TEXTAREA', 'SELECT'].includes(act.tagName) && !(act.classList.contains('scan-input') && !act.value);
  if (escribiendo || document.querySelector('.modal')) { refrescoPendiente = true; return; }
  refrescoPendiente = false;
  App.refrescar();
}
document.addEventListener('focusout', () => setTimeout(() => refrescoPendiente && refrescarSiSeguro(), 300));

(async function iniciar() {
  try {
    await Store.init();
    if (!NUBE && Store.vacio()) {
      cargarDatosPrueba();
      await Store.flush();
    }
    if (NUBE) prepararNube();
  } catch (e) {
    document.getElementById('main').replaceChildren(h('div', { class: 'card error' },
      'No se pudo abrir la base de datos: ' + e.message));
    return;
  }
  let timer;
  Store.alCambiar((tipo) => {
    if (tipo === 'estado') pintarBarra();
    else { clearTimeout(timer); timer = setTimeout(refrescarSiSeguro, 400); }
  });
  App.refrescar();
  revisarVersion();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarVersion(); });
})();
