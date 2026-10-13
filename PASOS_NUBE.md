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

## Notas
- La primera vez que alguien entra, si la nube está vacía, se cargan los catálogos y los **datos de prueba**.
  Para usarla de verdad: ⚙️ Ajustes → **🧹 Empezar en limpio**.
- Si se cae la señal, la app sigue funcionando: arriba dice **⚠️ Sin señal (N por subir)** y sube todo cuando regresa.
- Pide permiso a tu jefe o a TI antes de meter datos reales de la planta.
