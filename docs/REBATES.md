# Control de rebates DICOL

## Responsables y lectura del tablero

- **DICOL es la importadora.** Sus especialistas son responsables de acompañar a los aliados asignados, registrar el avance y hacer seguimiento de los compromisos.
- **Los aliados son empresas.** Cada ficha individual muestra solamente sus resultados, los indicadores pendientes y una conclusión que puede usarse durante la reunión con ese aliado.
- **DICOL** puede consultar el resumen general y las tarjetas por especialista. Estas tarjetas consolidan cuántos aliados tiene cada persona, el cumplimiento promedio y cuántos necesitan gestión.

La evaluación inicial pondera PSI/ventas 50 %, demostraciones 20 %, repuestos 10 %, pilotos certificados 10 % e información/soportes 10 %. El nivel A empieza en 80 % y proyecta 5 %; B empieza en 60 % y proyecta 3 %; C proyecta 0 %. Los pesos son configurables desde **Política vigente**, pero se deben contrastar con el boletín de políticas vigente antes de modificar o liquidar un rebate.

> El resultado del tablero es una herramienta de seguimiento. Nunca aprueba por sí solo un pago: el rebate se revisa para el trimestre siguiente y exige validar la política, los soportes y las condiciones comerciales aplicables.

## Código de Google Apps Script

El archivo completo para pegar está en [`appscript/Code.gs`](../appscript/Code.gs). Para instalarlo:

1. Cree la hoja de cálculo que será la base de datos de rebates y abra **Extensiones → Apps Script**.
2. Reemplace el contenido por `Code.gs`, guarde y ejecute `setup()` una vez. Esto crea las pestañas **Especialistas**, **Aliados**, **Evaluaciones** y **Politica** con sus encabezados.
3. Use **Implementar → Nueva implementación → Aplicación web**. Ejecútela como la cuenta de DICOL y limite el acceso a los usuarios autorizados por DICOL. Copie la URL terminada en `/exec`.
4. La API recibe JSON con una propiedad `action`: `getData`, `saveSpecialist`, `savePartner`, `saveEvaluation`, `savePolicy`, `deletePartner` o `deleteSpecialist`.

`getPartnerSummary(partnerId, period)` también se puede ejecutar desde el editor para verificar el cálculo de una ficha. El código valida los periodos Q1–Q4, limita cada indicador entre 0 % y 100 %, evita eliminar un especialista mientras conserve aliados activos y conserva un historial lógico mediante archivo (`activo=false`).

## Integración del portal

El tablero usa la URL publicada de la **Aplicación web** de Apps Script (la que termina en `/exec`), no la URL de biblioteca. Al abrir `rebates.html`, consulta las pestañas de Google Sheets y no carga datos de demostración ni utiliza `localStorage`. Las acciones de crear, editar, eliminar y guardar evaluaciones se envían a esa misma aplicación web.

Para verificar la conexión, ejecute `setup()` una vez en Apps Script y agregue los registros directamente en las pestañas creadas. El estado de conexión que aparece en la esquina superior derecha del tablero confirma si la lectura de Google Sheets fue exitosa. No se deben incluir credenciales en `rebates.js`.

## Estructura para la gestión comercial

La pestaña **Evaluaciones** conserva los indicadores de cumplimiento y añade `resultado_ventas`, `rebate_calculado`, `rebate_aplicado` y `diferencia` para cada aliado y trimestre. Así se puede registrar el resultado comercial y contrastar el rebate calculado frente al aplicado, como en el formato de seguimiento compartido. Al ejecutar `setup()` en una hoja existente se agregan estos encabezados sin eliminar el historial previo.

Para diligenciar una evaluación: **Resultado de ventas** es la cantidad de equipos/ventas que califican en el trimestre (tómela del reporte comercial y las facturas aprobadas); **rebate calculado** es el porcentaje que corresponde según el boletín de políticas, el margen y los productos que sí aplican; **rebate aplicado** es el porcentaje que fue efectivamente aprobado/aplicado después de la revisión. La nueva **Justificación y soportes** debe contener las cotizaciones, facturas, evidencias de demo, documentos pendientes o excepciones que respaldan el dato. La interfaz muestra esta misma ayuda al pasar el cursor —o enfocar con teclado— sobre cada icono `i`.

El API y la interfaz validan que no existan dos aliados activos con el mismo nombre (sin importar mayúsculas, minúsculas o espacios). También se aplica la misma validación a especialistas y se bloquea el botón mientras una petición está en curso, evitando registros duplicados por doble clic.

## Operación diaria en el tablero

1. En **Gestionar especialistas**, agregue o elimine especialistas de DICOL. Para eliminar uno con aliados asignados, primero reasigne cada aliado.
2. Use **Agregar aliado** para registrar una empresa aliada y asignarla al especialista DICOL responsable.
3. Desde la ficha del aliado, use **Cambiar especialista** para reasignarlo sin perder su historial, notas ni evaluaciones.
4. Ajuste los deslizadores de los indicadores y seleccione **Guardar evaluación**. La ficha recalcula de inmediato el porcentaje, nivel, rebate proyectado y los pendientes del trimestre seleccionado.
