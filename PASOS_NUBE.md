# Conectar a Supabase y subir la app a internet

## Parte A · Supabase (la base de datos en la nube)

### A1. Crear el proyecto
1. Entra a **supabase.com** → **New project**.
2. Nombre: `inventario-borgstena`.
3. **Database Password**: dale a "Generate a password" y **guárdala** (no me la mandes, la app no la usa).
4. Región: **East US (North Virginia)** o la más cercana a México.
5. Plan **Free** → **Create new project**. Tarda 1–2 minutos.

### A2. Crear la tabla
1. Menú izquierdo → **SQL Editor** → **New query**.
2. Abre el archivo `supabase/schema.sql` de esta carpeta, copia **todo** y pégalo.
3. Botón **Run**. Debe decir *Success. No rows returned*.

### A3. Que nadie se pueda registrar solo
1. Menú izquierdo → **Authentication** → **Sign In / Providers**.
2. **Apaga** "Allow new users to sign up" y guarda.
   Así solo entra quien tú des de alta.

### A4. Crear tu usuario (y los de tus compañeros)
1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Tu correo y una contraseña. Marca **Auto Confirm User**.
3. El **primer** usuario que entre a la app queda como **supervisor**. Los demás entran como almacenista y tú les cambias el nombre y el rol en ⚙️ Ajustes.

### A5. Copiar los 2 datos de conexión
Arriba en tu proyecto, botón **Connect** (o **Project Settings → API Keys**):
- **Project URL** → algo como `https://abcdefghijkl.supabase.co`
- **Publishable key** o **anon public** → empieza con `sb_publishable_…` o `eyJ…`

Mándamelos por el chat (estas dos son públicas, están hechas para ir dentro de la app).
⚠️ **Nunca** mandes ni pegues la **service_role** / **secret key** ni la contraseña de la base de datos.

## Parte B · La página en internet

Ya está publicada con **GitHub Pages**: **https://gadi2326.github.io/inventario-borgstena/**

- Cada vez que se suben cambios a GitHub, la página se actualiza sola en 1–2 minutos.
- En el celular: abre la dirección → menú del navegador → **"Agregar a pantalla de inicio"**.

## Parte C · Leer la lista de embarque con IA (Gemini, gratis)

La app manda la foto (o el PDF) de la lista a una función de Supabase (`leer-lista`), y esa función se la pasa a Gemini (IA de Google).
La clave de Google se guarda **solo en Supabase**, nunca en la página (la página es pública en GitHub).

### C1. Crear una cuenta de Google SOLO para la app
- Crea una cuenta de Gmail nueva (ej. `inventario.borgstena@gmail.com`). Así nada queda ligado a tu cuenta personal.
- Guarda la contraseña en un lugar seguro: la van a necesitar si algún día hay que cambiar la clave.

### C2. Sacar la clave gratis de Gemini
1. Con esa cuenta nueva entra a **https://aistudio.google.com**.
2. Acepta los términos y toca **Get API key** → **Create API key**.
3. Copia la clave (es un texto largo). **No la mandes por chat ni la pegues en la página.**
- Es gratis y no pide tarjeta. Si algún día te pide tarjeta o "activar facturación", **no lo hagas**: así nunca te pueden cobrar.

### C3. Guardar la clave en Supabase
1. supabase.com → tu proyecto → **Edge Functions** → **Secrets**.
2. **Add new secret**: Name = `GEMINI_API_KEY`, Value = la clave que copiaste → **Save**.

### C4. Subir la función `leer-lista`
1. Abre el código: https://github.com/Gadi2326/inventario-borgstena/blob/main/supabase/functions/leer-lista/index.ts
   y toca el botón **Copy raw file** (el de los dos cuadritos, arriba a la derecha del código).
2. supabase.com → tu proyecto → **Edge Functions** → **Deploy a new function** → **Via Editor**.
3. Borra el ejemplo que trae y pega el código.
4. **Abajo**, en el cuadro del nombre (trae uno de ejemplo como "bright-worker"), escribe `leer-lista` (exacto, con guion)
   **antes** de tocar **Deploy function**. Después ya no se puede cambiar la dirección.
5. Ya subida: pestaña **Settings** → **apaga** "Verify JWT with legacy secret" → **Save changes**.
   No queda abierta: el código revisa solo que quien la usa tenga sesión iniciada en la app.

### C5. Probar
En la app: **Recepción → Nueva recepción → ⚡ Llenar rápido → 📷 Foto a la lista**.
Tarda entre 10 y 60 segundos. Si sale un error, lee el mensaje: dice si falta la clave, si la clave está mal o si se acabó el límite gratis.

- **Límite gratis:** Google pone un límite por minuto y por día. Para 1–3 hojas al día sobra.
- **Privacidad:** en la versión gratis Google puede guardar las fotos y usarlas para mejorar su IA (no se publican).
- **Cambiar de modelo** (si Google retira el actual): en Secrets agrega `GEMINI_MODELO` con el nombre nuevo, sin tocar el código.
- Si la IA no funciona, el botón de **pegar texto** sigue funcionando como antes.

## Notas
- La primera vez que alguien entra, si la nube está vacía, se cargan los catálogos y los **datos de prueba**.
  Para usarla de verdad: ⚙️ Ajustes → **🧹 Empezar en limpio**.
- Si se cae la señal, la app sigue funcionando: arriba dice **⚠️ Sin señal (N por subir)** y sube todo cuando regresa.
- Pide permiso a tu jefe o a TI antes de meter datos reales de la planta.
