# Control de rebates DICOL

## Regla de negocio

Cada aliado tiene sus **propias metas por periodo anual** (`AAAA-Q1` a `AAAA-Q4`, por ejemplo `2026-Q3`). El selector de año y trimestre permite consultar cualquier vigencia guardada; las metas se administran con **Metas del aliado** y se guardan en la pestaña `Parametros` junto con el identificador del aliado y el periodo completo.

Las metas configurables son:

1. Compra de equipos (unidades).
2. Demostraciones pequeñas (unidades).
3. Demostraciones grandes (unidades).
4. Porcentaje de compra de refacciones sobre el monto de equipos (inicialmente 8 %).
5. Pilotos certificados DJI Academy (certificados).
6. Cartas firmadas (cartas).

En la evaluación se registran los resultados reales: equipos comprados, monto de equipos en COP, monto de refacciones en COP, demostraciones, certificados y cartas. El monto de equipos es la base de cálculo para refacciones, no una meta con peso propio. Por ejemplo, con compras de equipos por `$300.200.150`, una meta de refacciones de `8 %` exige `$24.016.012` para obtener 100 % en ese indicador.

Cada ficha presenta el avance como `real/meta`, su porcentaje con dos decimales y una barra de progreso. Los montos se muestran en COP; los demás indicadores se muestran en sus unidades respectivas.

## Cálculo del rebate

El ponderado es **binario**: cada bloque aporta todo su peso únicamente cuando alcanza 100 %. No existe aporte proporcional al rebate.

| Bloque | Regla de cumplimiento | Peso |
| --- | --- | ---: |
| Meta por compra | Equipos reales / meta de equipos | 50 % |
| Demostraciones | Las demostraciones pequeñas **y** grandes deben llegar a 100 % | 20 % |
| Refacciones | Monto de refacciones / (`monto equipos × porcentaje configurado`) | 10 % |
| DJI Academy | Certificados reales / meta | 10 % |
| Cartas | Cartas reales / meta | 10 % |

El total determina la categoría y rebate ganado:

- **A:** 80 % o más → **5 %** de rebate.
- **B:** 60 % o más → **3 %** de rebate.
- **C:** menos de 60 % → **0 %** de rebate.

El API recalcula los porcentajes, el ponderado y el rebate calculado al guardar una evaluación. Por ello Google Sheets conserva el cálculo oficial, incluso si el navegador envía valores incorrectos o desactualizados.

## Bolsa acumulada de rebate

Un rebate ganado se convierte en un **crédito de equipos**, siempre asociado al aliado que lo generó. Por ejemplo, si en `2026-Q3` un aliado alcanza categoría A (5 %) y registra 3 equipos, se acumulan **3 equipos al 5 %**. En `2027-Q1` se pueden aplicar esos tres equipos; el sistema los descuenta de la bolsa y conserva el periodo de origen, el porcentaje y el periodo donde se aplicaron.

- La bolsa se calcula en el servidor al guardar cada evaluación; no depende de un porcentaje enviado por el navegador.
- La bolsa muestra el saldo agrupado por porcentaje: por ejemplo, `3 rebates al 5 %` y `4 rebates al 3 %`. Cada rebate representa un equipo al que se puede aplicar ese porcentaje.
- Al aplicar, el usuario elige cuántos rebates usar de cada porcentaje disponible; dentro de cada porcentaje, el sistema consume primero los créditos más antiguos del mismo aliado y nunca más equipos de los que quedan disponibles.
- Si se corrige una evaluación de origen, no se puede dejar por debajo de los equipos que ya fueron aplicados.
- El saldo se mantiene por aliado y continúa entre años. Un crédito de `2026-Q4` queda disponible para `2027-Q1`; el sistema compara el periodo completo, no sólo el número de trimestre.

La pestaña `RebateCreditos` se crea al ejecutar `setup()`. Es el libro de movimientos: las filas sin `periodo_aplicacion` son saldos de origen y las filas con ese campo son las aplicaciones auditables.

> El tablero es de seguimiento; no aprueba pagos. Antes de liquidar, DICOL debe validar facturas, evidencias y condiciones comerciales.

## Instalación de Apps Script

1. En la hoja que será la base, abra **Extensiones → Apps Script** y reemplace el contenido con [`appscript/Code.gs`](../appscript/Code.gs).
2. Ejecute `setup()` una vez. Crea o completa las pestañas **Especialistas**, **Aliados**, **Evaluaciones**, **Politica**, **Parametros** y **RebateCreditos**. También restaura la política fija A/B/C indicada arriba. Si ya había datos con el formato anterior `Q1`–`Q4`, ejecute una única vez `migrateLegacyPeriods(2026)` sustituyendo `2026` por el año real de esos registros antes de operar la nueva versión.
3. Ejecute una vez `configureFirebaseApiKey('TU_API_KEY_WEB')` en Apps Script. La key web está en `assets/scripts/auth/firebase-config.js`; esta configuración permite validar los ID tokens, pero no entrega permisos administrativos.
4. Implemente el proyecto como aplicación web, ejecútelo como la cuenta de DICOL y copie la URL `/exec` en `assets/scripts/modules/rebates.js`.
5. Después de cambios en Apps Script, cree una nueva implementación para publicar el código actualizado.

La API acepta `getData`, `saveSpecialist`, `savePartner`, `saveEvaluation`, `saveParameters`, `applyRebateCredits`, `deletePartner` y `deleteSpecialist`. Todas las solicitudes usan `POST` e incluyen un ID token de Firebase. Los administradores pueden ejecutar todas las acciones y reasignar aliados. Al crear o editar un aliado, el administrador debe elegir el especialista responsable; un especialista ve su propio perfil preasignado y no puede cambiarlo. El servidor impone esa asignación con el `specialistId` firmado de Firebase, por lo que no depende del valor que envíe el navegador. Cada especialista sólo recibe su cartera y tiene permisos completos para crear, editar, archivar, configurar metas, registrar o corregir evaluaciones y aplicar créditos exclusivamente sobre sus aliados asignados; no puede reasignarlos ni gestionar especialistas. Archivar un aliado lo oculta de la cartera activa y conserva su historial comercial. Cada operación de escritura queda registrada en `AuditLog`. No contiene catálogo, precios, kits ni acciones de catálogo.

## Operación

1. Registre especialistas y aliados.
2. Abra la ficha del aliado, elija el **año** y el trimestre, y use **Metas del aliado** para definir sus compromisos de ese periodo.
3. Use **Editar evaluación** para registrar los resultados reales del periodo seleccionado.
4. Revise los indicadores, categoría y rebate ganado. En un periodo posterior —inclusive de otro año— use **Aplicar rebate acumulado**, indique cuántos rebates de 3 % y/o 5 % desea usar y confirme. Puede aplicar sólo una parte de cada saldo; la bolsa descuenta los equipos seleccionados.
