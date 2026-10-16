// Función de Supabase "leer-lista": recibe la foto de una lista de embarque,
// se la manda a Gemini (IA de Google) y regresa los datos ya separados.
//
// La clave de Gemini vive aquí (en los "Secrets" de Supabase), nunca en la página.
// Secrets que usa:
//   GEMINI_API_KEY  → la clave de Google AI Studio (obligatoria)
//   GEMINI_MODELO   → opcional, para cambiar de modelo sin tocar el código
// Solo responde a usuarios que iniciaron sesión en la app.

const MODELOS = [Deno.env.get('GEMINI_MODELO') || 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
const MAX_FOTOS = 6;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const INSTRUCCIONES = `Eres un capturista de un almacén. Te doy la FOTO de una "lista de embarque" (packing list) de un proveedor.
Copia SOLO el texto IMPRESO de la hoja, exactamente como está impreso.

IGNORA POR COMPLETO todo lo que esté escrito o dibujado a mano: palomitas (✓), puntos, tachones, círculos,
recuadros, flechas, manchas, números o notas escritas con pluma (arriba, al lado o abajo de la tabla).
Si una marca a mano tapa parte de un dato impreso, lee el dato impreso que hay debajo.

De la tabla, regresa un renglón por cada rollo/material, en el mismo orden de la hoja:
- no_parte: columna "NO. PARTE" (ej. SPONGE-A527GN)
- descripcion: columna "DESCRIPCIÓN" completa (ej. 1.450X240X0.0060-27/035L ST GRS RB)
- lote: columna "LOTE". Los lotes SIEMPRE empiezan con una LETRA, nunca con número (ej. J-020-01-04, I-094-04-02).
  Si parece "1-094-04-02" es la letra I.
- no_rollo: columna "NO. ROLLO", sin espacios (ej. 26J0200104019). La tercera posición también es LETRA (I, no 1).
- largo_m: columna "LARGO (m)" como número.
NO incluyas como rollo los renglones de "Total ..." ni "Total general": esos van en totales_parte y total_general.
No inventes nada: si un dato impreso no se alcanza a leer, déjalo en null y explícalo en "avisos".
Si la foto no es una lista de embarque, pon es_lista_embarque = false.

Del encabezado: proveedor (nombre de la empresa que envía), po, fecha (como está impresa, DD/MM/AAAA), factura,
sello, placas (todas las que haya), transporte, tracto, caja, responsable_carga, chofer (línea transportista/chofer), entrega.`;

const S = (descripcion?: string) => ({ type: 'STRING', nullable: true, ...(descripcion ? { description: descripcion } : {}) });
const N = { type: 'NUMBER', nullable: true };
const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    es_lista_embarque: { type: 'BOOLEAN' },
    proveedor: S(), po: S(), fecha: S('DD/MM/AAAA'), factura: S(), sello: S(),
    placas: { type: 'ARRAY', items: { type: 'STRING' } },
    transporte: S(), tracto: S(), caja: S(), responsable_carga: S(), chofer: S(), entrega: S(),
    rollos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { no_parte: S(), descripcion: S(), lote: S(), no_rollo: S(), largo_m: N },
        required: ['no_parte', 'descripcion', 'lote', 'no_rollo', 'largo_m'],
      },
    },
    totales_parte: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { no_parte: S(), metros: N, rollos: N },
        required: ['no_parte', 'metros', 'rollos'],
      },
    },
    total_general: { type: 'OBJECT', nullable: true, properties: { metros: N, rollos: N } },
    avisos: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['es_lista_embarque', 'rollos', 'totales_parte', 'avisos'],
};

function respuesta(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// Revisa que quien llama haya iniciado sesión en la app
async function usuarioValido(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') || '' },
  });
  return r.ok;
}

async function leerUnaFoto(clave: string, foto: { mime: string; datos: string }) {
  let ultimoError = '';
  for (const modelo of MODELOS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: INSTRUCCIONES }, { inlineData: { mimeType: foto.mime || 'image/jpeg', data: foto.datos } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: ESQUEMA },
      }),
    });
    if (r.ok) {
      const j = await r.json();
      const partes = j?.candidates?.[0]?.content?.parts || [];
      const texto = partes.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text || '').join('');
      try {
        return { ...JSON.parse(texto), modelo };
      } catch {
        ultimoError = 'La IA respondió algo que no se pudo leer.';
        continue;
      }
    }
    const detalle = await r.text();
    console.error(`Gemini ${modelo} respondió ${r.status}: ${detalle.slice(0, 500)}`);
    if (r.status === 400 && /API key/i.test(detalle)) return { error: 'La clave de Gemini no es válida. Revisa el secret GEMINI_API_KEY en Supabase.' };
    if (r.status === 403) return { error: 'Google rechazó la clave de Gemini (403). Revisa que la clave sea correcta y esté activa.' };
    ultimoError = r.status === 429
      ? 'Se acabó el límite gratis de la IA por ahora. Espera un minuto (o hasta mañana) o usa "pegar texto".'
      : `La IA no respondió (error ${r.status}). Intenta otra vez o usa "pegar texto".`;
  }
  return { error: ultimoError };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return respuesta({ error: 'Usa POST.' }, 405);
  if (!(await usuarioValido(req))) return respuesta({ error: 'Inicia sesión en la app para usar la lectura con IA.' }, 401);

  const clave = Deno.env.get('GEMINI_API_KEY');
  if (!clave) return respuesta({ error: 'Falta configurar la clave de Gemini (secret GEMINI_API_KEY) en Supabase.' }, 500);

  let cuerpo: { imagenes?: { mime: string; datos: string }[] };
  try { cuerpo = await req.json(); } catch { return respuesta({ error: 'No llegó la foto.' }, 400); }
  const fotos = (cuerpo.imagenes || []).filter((f) => f && f.datos).slice(0, MAX_FOTOS);
  if (!fotos.length) return respuesta({ error: 'No llegó la foto.' }, 400);

  // Cada foto se lee por separado (así se detecta si dos fotos son la misma hoja)
  const hojas = await Promise.all(fotos.map((f) => leerUnaFoto(clave, f)));
  return respuesta({ hojas });
});
