# Inventario Borgstena

App web de inventario para el almacén de foam (y después tela / vinil / backing): recepción de camiones con escaneo de rollos, inspección FR-AL-016-01, inventario y exportación a Excel. Funciona en celular, tablet y PC.

- **Probar en tu PC:** doble clic a `Abrir app.bat` → ver [COMO_PROBAR.md](COMO_PROBAR.md)
- **Nube (Supabase) y publicar:** ver [PASOS_NUBE.md](PASOS_NUBE.md)
- **Página publicada:** https://gadi2326.github.io/inventario-borgstena/ (GitHub Pages: cada cambio que se sube a `main` se publica solo en 1–2 minutos).

Los datos de prueba incluidos son **inventados**.

## Estructura
| Carpeta / archivo | Qué es |
|---|---|
| `index.html` | Página principal |
| `css/app.css` | Estilos (incluye el formato de impresión de la inspección) |
| `js/config.js` | Datos de conexión a Supabase (vacío = solo esta PC) |
| `js/store.js` | Guardado de datos (navegador + nube + modo sin señal) |
| `js/recepcion.js` · `js/inspeccion.js` · `js/inventario.js` | Pantallas |
| `js/seed.js` | Catálogos y datos de prueba inventados |
| `supabase/schema.sql` | Tabla y permisos de la base de datos |
| `supabase/functions/leer-lista/` | Función que lee la foto de la lista de embarque con IA (Gemini) |
| `vendor/` | Librerías: lector de códigos, Excel y Supabase |
