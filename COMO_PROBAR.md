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

### 2. Inspección
1. Abajo, en **📋 Inspección por lote**, toca **Inspeccionar** en `SPONGE-A527GN · lote Z-901-01-01`.
2. El código (`AAAAMMDD`, o `-2`, `-3` si hay otra el mismo día), las fechas, el PO, la cantidad y el rollo muestreado se llenan solos.
3. En **Espesor** escribe medidas (ej. 6.1, 5.9, 7.0): si alguna sale de 6 ± 0.5 mm se marca **NOK solo**.
4. En **Densidad** escribe el **peso real de báscula**: la app calcula kg/m³.
5. Marca OK / NOK / N/A, elige el resultado y toca **✅ Terminar inspección**. Todos los rollos del lote cambian de estado.
6. Toca **🖨️ Imprimir / PDF**: sale con el formato FR-AL-016-01.

### 3. Inventario
- **📦 Inventario**: rollos y metros por número de parte, por lote, estado y ubicación. Filtros y **📊 Exportar a Excel**.
- Escanea o escribe un número de rollo para ver su ficha: datos, etiqueta contra lista e historial.

### 4. Ajustes (solo supervisor)
- Agregar o renombrar **ubicaciones** (racks, zonas).
- Escribir el **significado de 035L, ST, GRS, RB** cuando lo sepas.
- Tolerancias de cada número de parte, usuarios, **respaldo** y **♻️ Reiniciar con datos de prueba**.

## Cámara del celular
La cámara funciona en la PC (con webcam) desde `Abrir app.bat`. En el celular funcionará cuando la subamos a internet (etapa de nube), porque los teléfonos solo prestan la cámara a páginas seguras (https).
