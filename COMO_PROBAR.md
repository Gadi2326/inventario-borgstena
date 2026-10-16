# App de inventario · Etapa 1 (Foam)

## Cómo abrirla en tu PC

1. Entra a la carpeta `app para trabajo`.
2. Dale **doble clic a `Abrir app.bat`**. Se abre una ventana negra y después tu navegador.
3. **No cierres la ventana negra** mientras uses la app. Para apagarla, ciérrala.
4. Toca **Supervisor de prueba**. (Si ya está conectada a Supabase, entra con tu correo y contraseña.)

> Sin Supabase, los datos se guardan **solo en el navegador de esta PC**. Con Supabase (`js/config.js`), todos ven lo mismo desde el celular.

## Datos de prueba (inventados)

Son **inventados** (lotes `Z-9xx`, facturas `DEMO-…`), no son de la planta.

- **Recepción DEMO-0001:** ya recibida, 16 rollos en "Inspección pendiente".
  El rollo `26Z9030201003` sale con ⚠️ porque su etiqueta dice lote Z-999-01-01.
- **Recepción DEMO-0002:** **abierta**, para que practiques el escaneo.

## Prueba paso a paso

### 1. Recepción
1. En Inicio toca **▶️ Seguir recepción DEMO-0002**.
2. En el campo grande escribe un número de rollo de la lista y da **Enter** (así funciona un lector USB):
   - `26Z9010101007` → ✅ verde, se palomea.
   - Otra vez `26Z9010101007` → ⚠️ "ya se había escaneado".
   - `Z-999-01-01` (como si escanearas el lote de la etiqueta) → ❌ "lote no coincide".
   - `26Z9050101001` → ➕ "no viene en la lista".
   - `26Z9010101001` → ❌ "ya está en otra recepción".
3. Revisa la tabla **Rollos por número de parte y lote**: cuenta sola lo que antes contabas a pluma.
4. Toca **✅ Terminar recepción**. Los que no escaneaste quedan como **Faltantes**.

### 1·IA. Llenar la recepción con FOTO o PDF de la lista (necesita la Parte C de PASOS_NUBE.md)
1. **Nueva recepción → ⚡ Llenar rápido → 📷 Foto a la lista** (o **🖼️ Elegir fotos** si la lista tiene varias hojas,
   o **📄 Abrir PDF de la lista** si el proveedor la mandó en PDF; máximo 7 MB).
2. La IA ignora palomitas, puntos y notas a mano, y llena el encabezado y los rollos.
3. Revisa los grupos por número de parte: cada uno dice si **✅ cuadra** con el renglón "Total …" de la hoja.
4. Si subes dos veces la misma hoja, o la factura ya estaba registrada, sale el aviso **DUPLICADO**.

### 1a. Recibir con FOTO A LA ETIQUETA (lo más confiable)
1. Crea la recepción solo con el encabezado (PO, factura…).
2. Toca **📷 Foto a la etiqueta** y tómale foto a la etiqueta del rollo: de frente, sin brillo, con los 3 códigos de barras y el cuadrito completos.
3. La app lee **número de rollo, lote, número de parte, metros y fecha de producción** de una sola foto.
4. Para ir más rápido: toma las fotos de todos los rollos con la cámara normal del celular y luego elígelas juntas con **🖼️ Varias fotos de la galería**.
5. Si una foto no deja leer el número de rollo, la app guarda lo demás y te pide **escribirlo o escanearlo**.
6. En **🧾 Total general de la hoja** escribe los rollos y metros del papel para comparar.

### 1b. Cargar una lista nueva rápido (foto → texto)
1. **🚚 Recepción → Nueva recepción** → abre **⚡ Llenar rápido con una foto de la lista**.
2. En el celular, toma foto a la lista con **Google Lens** (Android) o la **cámara del iPhone** y toca **Copiar texto**.
3. Pégalo en el cuadro y toca **🔎 Leer lista**:
   - El encabezado (PO, factura, sello, placas, fecha…) se llena solo y queda en **verde**.
   - Aparece la tabla de rollos: revisa y corrige cualquier celda mal leída.
   - Arriba compara contra el **Total general** de la hoja: ✅ cuadra o ❌ no cuadra.
   - **Amarillo** = número de parte nuevo (se agrega solo al catálogo). **Rojo** = repetido o ya existe (no se guarda).
4. Toca **✅ Crear recepción con N rollos** y empieza a escanear.

También acepta texto copiado de un PDF o correo, o un **Excel**.

### Proveedores y números de parte nuevos
- En **Nueva recepción**, junto a Proveedor, toca **➕ Otro** para agregar un proveedor.
- En **⚙️ Ajustes → Proveedores** cambias nombres o desactivas proveedores.
- En **⚙️ Ajustes → Números de parte** agregas números de parte nuevos con su espesor, tolerancia, ancho, densidad y largo normal del rollo. Los que se crearon solos desde una lista salen con ⚠️ para que revises sus medidas.

### Eliminar rollos o lotes capturados por error
- En la recepción, cada rollo de las tablas tiene un botón **🗑️**, y en **Rollos por número de parte y lote** está **🗑️ Eliminar lote**.
- En la ficha de un rollo, hasta abajo: **🗑️ Eliminar este rollo**.
- Lo puede hacer cualquier usuario (Ajustes sigue siendo solo del supervisor). Siempre pregunta **"¿Estás seguro?"** con la lista de rollos y metros. Se borran para todos con su historial y no se puede deshacer.

### 2. Inspección
1. Abajo, en **📋 Inspección por lote**, toca **Inspeccionar** en `SPONGE-A527GN · lote Z-901-01-01`.
2. El código (`AAAAMMDD`, o `-2`, `-3` si hay otra el mismo día), las fechas, el PO, la cantidad y el rollo muestreado se llenan solos.
3. En **Espesor** escribe medidas (ej. 6.1, 5.9, 7.0): si alguna sale de 6 ± 0.5 mm se marca **NOK solo**.
4. En **Densidad** escribe el **peso real de báscula**: la app calcula kg/m³.
5. En **4. Número de rollo** salen solos los rollos que elegiste de muestra: revisa que estén identificados, legibles y en la lista, y márcalo OK / NOK / N/A.
6. Marca OK / NOK / N/A, elige el resultado y toca **✅ Terminar inspección**. Todos los rollos del lote cambian de estado.
7. Toca **🖨️ Imprimir / PDF**: sale con el formato FR-AL-016-01.

### 3. Inventario
- **📦 Inventario**: rollos y metros por número de parte, por lote, estado y ubicación. Filtros y **📊 Exportar a Excel**.
- Escanea o escribe un número de rollo para ver su ficha: datos, etiqueta contra lista e historial.

### 4. Ajustes (solo supervisor)
- Agregar o renombrar **ubicaciones** (racks, zonas).
- Tolerancias de cada número de parte, usuarios, **respaldo** y **♻️ Reiniciar con datos de prueba**.

## Cámara del celular
La cámara funciona en la PC (con webcam) desde `Abrir app.bat`. En el celular funcionará cuando la subamos a internet (etapa de nube), porque los teléfonos solo prestan la cámara a páginas seguras (https).
