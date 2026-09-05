# Módulo de rebates

La interfaz está en `rebates.html`. Esta primera versión permite crear aliados y especialistas, editar el contexto comercial de cada aliado y registrar el cumplimiento para Q1–Q4. Los datos permanecen en el navegador mientras se prepara la conexión con Google Sheets.

## Política activa

La ponderación inicial usada en la vista es PSI/ventas 50%, demostraciones 20%, repuestos 10%, pilotos certificados 10% e información/soportes 10%. La escala es A (80% o más, 5%), B (60% o más, 3%) y C (menos de 60%, 0%). La política se puede revisar desde **Política y metas**; debe validarse contra el boletín vigente antes de liquidar un rebate.

El cálculo es solo un indicador de seguimiento. La pantalla recalca que el rebate se liquida en el trimestre siguiente y que deben validarse soportes y demás condiciones de la política. Esto evita convertir el reporte en una aprobación automática.

## Google Apps Script

1. Cree una hoja de cálculo de Google destinada al proceso y abra **Extensiones → Apps Script**.
2. Pegue `appscript/Code.gs`, guarde y ejecute `setup()` una sola vez.
3. Implemente como **Aplicación web**, con los usuarios y permisos definidos por DICOL.
4. La API expone los recursos de especialistas, aliados, evaluaciones y política. No publique la URL sin controles de acceso.

Cuando se habilite la conexión, el frontend debe enviar JSON con `action` a la URL de la aplicación web: `getData`, `saveSpecialist`, `savePartner`, `saveEvaluation`, `setPolicy` o `deletePartner`.
