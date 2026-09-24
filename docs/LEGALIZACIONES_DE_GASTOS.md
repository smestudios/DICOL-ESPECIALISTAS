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

> Un especialista sólo puede leer, editar o borrar las salidas cuyo `especialista_id` coincide con el `specialistId` firmado en sus custom claims Firebase. El navegador nunca elige ese ID.

## 2. Carpeta `Facturas` de GitHub

El script crea automáticamente rutas como `Facturas/<id-especialista>/<id-salida>/<id-factura>/`. No cree ni suba archivos manualmente: GitHub crea las carpetas virtuales al recibir el primer archivo y el script elimina todos los archivos de esa salida al finalizarla.

1. Cree un **fine-grained personal access token** en GitHub, limitado únicamente al repositorio de soportes.
2. En *Repository permissions*, conceda sólo **Contents: Read and write**. No conceda permisos de administración, workflows ni organización.
3. Guarde el token **únicamente** como `GITHUB_TOKEN` en las propiedades de Apps Script. Nunca lo ponga en HTML, JavaScript, Firebase ni en este repositorio.
4. Mantenga el repositorio privado si las facturas contienen información sensible. El enlace queda registrado en Sheets y la descarga para generar el PDF pasa por Apps Script con la sesión Firebase validada; el navegador no recibe el token de GitHub.

## Flujo final

- `Legalizaciones.xlsx` se rellena desde la plantilla institucional existente y mantiene su estructura; las filas se ordenan por fecha.
- `Facturas.pdf` usa exactamente el mismo orden. Las facturas PDF se copian como páginas PDF, por lo que el texto sigue seleccionable; las fotos y los recibos firmados se incrustan como imagen.
- Para cada foto de factura, la interfaz exige un recibo de caja firmado. En el PDF se inserta inmediatamente después de su foto.
- Al pulsar **Finalizar salida** se solicitan los dos documentos antes de confirmar el borrado. Después de la confirmación se borran la pestaña de esa salida, las filas de control y todos sus archivos GitHub.
