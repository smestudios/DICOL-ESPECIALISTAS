# Control de rebates DICOL

## Responsables y lectura del tablero

- **DICOL es la importadora.** Sus especialistas son responsables de acompañar a los aliados asignados, registrar el avance y hacer seguimiento de los compromisos.
- **Los aliados son empresas.** Cada ficha individual muestra solamente sus resultados, los indicadores pendientes y una conclusión que puede usarse durante la reunión con ese aliado.
- **DICOL** puede consultar el resumen general y las tarjetas por especialista. Estas tarjetas consolidan cuántos aliados tiene cada persona, el cumplimiento promedio y cuántos necesitan gestión.

La evaluación inicial pondera PSI/ventas 50 %, demostraciones 20 %, repuestos 10 %, pilotos certificados 10 % e información/soportes 10 %. El aliado inicia con un margen base de **22 %**. Según el boletín entregado, el nivel A inicia en 80 % y proyecta 5 %; B inicia en 60 % y proyecta 3 %; C queda por debajo de 60 % y proyecta 0 %. Los pesos y niveles son configurables desde **Política vigente**, pero se deben contrastar con el boletín de políticas vigente antes de modificar o liquidar un rebate.

Además de la evaluación ponderada, el tablero muestra los requisitos operativos: **3 demostraciones pequeñas y 1 demostración grande** con soportes. Se registra también la certificación DJI de al menos una persona del equipo de ventas; por ahora se muestra como recomendación y no bloquea el rebate. El botón **Descargar resumen PDF** genera una ficha descargable con avances, faltantes, compras del trimestre e información de soportes.

## Parámetros trimestrales y cálculo automático

Use **Metas del aliado** para ajustar las metas de cada aliado y trimestre: equipos comprados, demos pequeñas, demos grandes, porcentaje de refacciones, certificados DJI Academy y cartas firmadas. Al editar la evaluación se registra el resultado real: unidades y monto de equipos, monto de refacciones, demos, certificados y cartas. Cada indicador muestra `real/meta` y su porcentaje. El ponderado es binario: un indicador aporta todo su peso únicamente al llegar a 100 %. Las demos comparten el peso 20 % y requieren que las dos metas lleguen a 100 %; las refacciones alcanzan su 10 % cuando el monto registrado llega al porcentaje configurado —por defecto 8 %— del monto de equipos.

La edición de cumplimiento se abre en una ventana separada. Antes de guardar, muestra una simulación del cumplimiento, nivel, margen previsto, equipos/kits y relación de refacciones; la ficha principal se actualiza únicamente cuando Google Sheets confirma el guardado.

> El resultado del tablero es una herramienta de seguimiento. Nunca aprueba por sí solo un pago: el rebate se revisa para el trimestre siguiente y exige validar la política, los soportes y las condiciones comerciales aplicables.

## Código de Google Apps Script

El archivo completo para pegar está en [`appscript/Code.gs`](../appscript/Code.gs). Para instalarlo:

1. Cree la hoja de cálculo que será la base de datos de rebates y abra **Extensiones → Apps Script**.
2. Reemplace el contenido por `Code.gs`, guarde y ejecute `setup()` una vez. Esto crea las pestañas **Especialistas**, **Aliados**, **Evaluaciones** y **Politica** con sus encabezados.
3. Use **Implementar → Nueva implementación → Aplicación web**. Ejecútela como la cuenta de DICOL y limite el acceso a los usuarios autorizados por DICOL. Copie la URL terminada en `/exec`.
4. La API recibe JSON con una propiedad `action`: `getData`, `saveSpecialist`, `savePartner`, `saveEvaluation`, `savePolicy`, `saveParameters`, `deleteParameter`, `deletePartner` o `deleteSpecialist`. Después de actualizar el script, cree una **nueva implementación** para que la URL `/exec` use estos cambios.

Si una hoja existente conserva los niveles de prueba anteriores, ejecute manualmente `restorePolicyBoletin2025()` una vez para restaurar los porcentajes del boletín 2025 sin modificar los aliados, ventas ni evaluaciones.

`getPartnerSummary(partnerId, period)` también se puede ejecutar desde el editor para verificar el cálculo de una ficha. El código valida los periodos Q1–Q4, limita cada indicador entre 0 % y 100 %, evita eliminar un especialista mientras conserve aliados activos y conserva un historial lógico mediante archivo (`activo=false`).

## Integración del portal

El tablero usa la URL publicada de la **Aplicación web** de Apps Script (la que termina en `/exec`), no la URL de biblioteca. Al abrir `rebates.html`, consulta las pestañas de Google Sheets y no carga datos de demostración ni utiliza `localStorage`. Las acciones de crear, editar, eliminar y guardar evaluaciones se envían a esa misma aplicación web.

Para verificar la conexión, ejecute `setup()` una vez en Apps Script y agregue los registros directamente en las pestañas creadas. El estado de conexión que aparece en la esquina superior derecha del tablero confirma si la lectura de Google Sheets fue exitosa. No se deben incluir credenciales en `rebates.js`.

## Estructura para la gestión comercial

La pestaña **Evaluaciones** conserva los indicadores de cumplimiento y añade `resultado_ventas`, `rebate_calculado`, `rebate_aplicado` y `diferencia` para cada aliado y trimestre. Así se puede registrar el resultado comercial y contrastar el rebate calculado frente al aplicado, como en el formato de seguimiento compartido. Al ejecutar `setup()` en una hoja existente se agregan estos encabezados sin eliminar el historial previo.

Para diligenciar una evaluación: **Resultado de ventas** es la cantidad de equipos/ventas que califican en el trimestre (tómela del reporte comercial y las facturas aprobadas); **rebate calculado** es el porcentaje que corresponde según el boletín de políticas, el margen y los productos que sí aplican; **rebate aplicado** es el porcentaje que fue efectivamente aprobado/aplicado después de la revisión. La nueva **Justificación y soportes** debe contener las cotizaciones, facturas, evidencias de demo, documentos pendientes o excepciones que respaldan el dato. La interfaz muestra esta misma ayuda al pasar el cursor —o enfocar con teclado— sobre cada icono `i`.

La ficha individual incluye además un **Pulso comercial** para que la conversación con cada aliado tenga en un mismo lugar la evaluación, rebates, ventas calificadas, indicadores al día y la comparación visual de cada KPI con su peso de política. No inventa valores de facturación, modelos o refacciones: esos datos solo se muestran cuando hayan sido incorporados como campos y soportados en la hoja.

## Registro comercial

La ficha ya no usa catálogo, kits ni ventas por producto. El responsable registra los montos y unidades consolidados del trimestre en la ventana de evaluación; esto evita mezclar precios de catálogo con el cumplimiento. El margen base se mantiene en 22 % y el rebate aprobado se registra por separado con su justificación.

El API y la interfaz validan que no existan dos aliados activos con el mismo nombre (sin importar mayúsculas, minúsculas o espacios). También se aplica la misma validación a especialistas y se bloquea el botón mientras una petición está en curso, evitando registros duplicados por doble clic.

## Operación diaria en el tablero

1. En **Gestionar especialistas**, agregue o elimine especialistas de DICOL. Para eliminar uno con aliados asignados, primero reasigne cada aliado.
2. Use **Agregar aliado** para registrar una empresa aliada y asignarla al especialista DICOL responsable.
3. Desde la ficha del aliado, use **Cambiar especialista** para reasignarlo sin perder su historial, notas ni evaluaciones.
4. Ajuste los deslizadores de los indicadores y seleccione **Guardar evaluación**. La ficha recalcula de inmediato el porcentaje, nivel, rebate proyectado y los pendientes del trimestre seleccionado.
