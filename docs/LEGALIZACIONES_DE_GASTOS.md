# Configuración de Legalizaciones de Gastos

Esta integración es independiente de rebates. El archivo `appscript/LegalizacionesDeGastos.gs` se instala en un proyecto nuevo de Google Apps Script asociado a una hoja de cálculo nueva llamada **LEGALIZACIONES DE GASTOS**.

## 1. Preparar Google Sheets y Apps Script

1. Cree una hoja de cálculo en Google Drive con el nombre **LEGALIZACIONES DE GASTOS**.
2. Abra **Extensiones → Apps Script**, elimine el archivo de ejemplo y pegue `appscript/LegalizacionesDeGastos.gs`.
3. En **Configuración del proyecto → Propiedades del script**, cree las propiedades siguientes:
   - `FIREBASE_WEB_API_KEY`: la misma clave web que usa el proyecto Firebase.
   - `GITHUB_OWNER`: organización o usuario propietario del repositorio de soportes.
   - `GITHUB_REPO`: nombre del repositorio de soportes.
   - `GITHUB_BRANCH`: normalmente `main`.
   - `GITHUB_TOKEN`: token fino de GitHub descrito abajo.
4. Ejecute `setupLegalizaciones` una vez y autorice el script. Crea la pestaña `Salidas`; cada salida genera una pestaña propia (`SAL_…`) y ésta se elimina al finalizar.
5. En **Implementar → Nueva implementación → Aplicación web**, elija *Ejecutar como: yo* y *Quién tiene acceso: cualquier usuario*; la aplicación valida siempre el token Firebase enviado por el navegador. Copie la URL que termina en `/exec`.
6. Pegue esa URL en `legalizacionesAppsScriptUrl` de `assets/scripts/config/dicol-config.js` y publique la página.

> Después de cambiar `LegalizacionesDeGastos.gs`, vaya a **Implementar → Gestionar implementaciones → Editar**, seleccione **Nueva versión** y publique. Mantenga la misma implementación para conservar la URL `/exec`; de lo contrario, la página seguirá llamando el código anterior aunque el archivo del editor se haya guardado.

> **Importante para Facturas.pdf:** al actualizar el frontend también debe publicar la nueva versión de `LegalizacionesDeGastos.gs` en esa misma implementación. La página verifica la versión antes de descargar los soportes y avisará si la URL `/exec` sigue ejecutando código anterior.

> **Error `"sha" wasn't supplied` al cargar un soporte:** significa que ya existe un archivo con esa misma ruta en GitHub (normalmente porque una carga anterior terminó en GitHub pero no alcanzó a guardar la factura en Sheets). La versión actualizada del script consulta el SHA y actualiza el archivo de forma segura; publique una nueva versión de Apps Script antes de reintentar. No borre manualmente la carpeta de GitHub: vuelva a cargar el mismo documento y el script la reconciliará.

> **Comprobación de Facturas.pdf:** antes de descargar, confirme que cada foto tenga su archivo principal y que los soportes firmados obligatorios estén en verde. El generador descarga los archivos autenticado desde Apps Script, no desde enlaces públicos de GitHub, y los ordena por fecha; por cada foto el orden es foto, soporte firmado y RUT. Si aparece un error, el mensaje indica la factura y el archivo concreto que no se pudo leer.

> **Relación inalterable de soportes:** cada factura tiene su propio ID `FAC-…` y cada archivo tiene además un ID estable (`SOP-…`, `REC-…` o `RUT-…`). La ruta GitHub se construye con ambos IDs, no con el nombre del archivo. Al seleccionar de nuevo un soporte o RUT, se reemplaza exactamente ese mismo adjunto; el PDF sólo lee las rutas registradas en la fila de esa factura de Sheets, por lo que nunca toma archivos de otra factura ni archivos antiguos con nombres parecidos. Antes de crear el PDF, Apps Script verifica que puede leer cada ruta autenticada desde GitHub y muestra qué factura/documento falló si hay un permiso, ruta o archivo inválido.

> Un especialista sólo puede leer, editar o borrar las salidas cuyo `especialista_id` coincide con el `specialistId` firmado en sus custom claims Firebase. El navegador nunca elige ese ID.

### Dónde se guardan las salidas

Cada salida nueva asigna automáticamente como responsable el nombre del perfil Firebase con el que se inició sesión; el campo no se diligencia manualmente. Cada vez que se pulsa **Guardar salida**, Apps Script crea o actualiza una fila en la pestaña **`Salidas`** del archivo de Google Sheets al que está vinculado el proyecto de Apps Script publicado. Las facturas de esa salida se guardan en la pestaña `SAL_…` indicada por la columna `hoja`. No se guardan en el repositorio de esta página ni en los archivos de `EJEMPLO TERMINADO`.

La página verifica la salida con una lectura inmediata después de guardarla. Si no puede encontrarla, muestra un error en pantalla y no afirma que fue guardada. Si el mensaje indica que no se pudo verificar, confirme que la URL `/exec` configurada corresponde al Apps Script vinculado a la hoja **LEGALIZACIONES DE GASTOS**, y publique una nueva versión.

## 2. Carpeta `Facturas` de GitHub

El script crea automáticamente rutas como `Facturas/<id-especialista>/<id-salida>/<id-factura>/`. No cree ni suba archivos manualmente: GitHub crea las carpetas virtuales al recibir el primer archivo y el script elimina todos los archivos de esa salida al finalizarla.

1. Cree un **fine-grained personal access token** en GitHub, limitado únicamente al repositorio de soportes.
2. En *Repository permissions*, conceda sólo **Contents: Read and write**. No conceda permisos de administración, workflows ni organización.
3. Guarde el token **únicamente** como `GITHUB_TOKEN` en las propiedades de Apps Script. Nunca lo ponga en HTML, JavaScript, Firebase ni en este repositorio.
4. Mantenga el repositorio privado si las facturas contienen información sensible. El enlace queda registrado en Sheets y la descarga para generar el PDF pasa por Apps Script con la sesión Firebase validada; el navegador no recibe el token de GitHub.

## Flujo final

- `Legalizaciones.xlsx` se genera desde la plantilla institucional sin modificarla. Conserva la retícula, los bordes, el logo y las filas vacías de la plantilla; los totales permanecen al final del bloque. Si la salida tiene más facturas que las disponibles en la guía, agrega filas con el mismo formato antes de los totales. Las filas se ordenan por fecha.
- `Facturas.pdf` usa exactamente el mismo orden. Las facturas PDF se copian como páginas PDF, por lo que su texto sigue seleccionable y copiable, sin añadirles una portada ni modificar su contenido.
- Cada foto de factura recibe en la parte superior de su página un resumen de texto seleccionable con NIT, número de factura, valor total, proveedor, fecha, medio de pago, concepto y descripción. Si tiene soporte firmado o RUT, se insertan inmediatamente después de su foto, en ese orden, sin duplicar el resumen. Un PDF se copia tal cual y no recibe documentos auxiliares.
- Primero se elige si la factura se cargará como foto o archivo PDF y luego se diligencian los datos que usa el Excel: descripción C.O., fecha, medio de pago, número de factura, NIT, nombre del proveedor, concepto y valor. Para una foto, el interruptor **Soporte firmado** se deja inactivo si el recibo ya tiene validez contable o se activa cuando necesita la firma del jefe. Sólo las activas muestran **+ Soporte** junto a **Eliminar**: queda gris mientras está pendiente y verde cuando el recibo firmado ya fue adjuntado. Todas las facturas cargadas como foto también permiten adjuntar opcionalmente **+ RUT**; en el PDF quedará después del soporte firmado.
- Al pulsar **Finalizar salida** se solicitan los dos documentos antes de confirmar el borrado. Después de la confirmación se borran la pestaña de esa salida, las filas de control y todos sus archivos GitHub.
