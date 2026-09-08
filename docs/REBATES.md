# Control de rebates DICOL

## Regla de negocio

Cada aliado tiene sus **propias metas por trimestre** (`Q1` a `Q4`). Se administran con **Metas del aliado** y se guardan en la pestaña `Parametros` de Google Sheets junto con el identificador del aliado y el trimestre.

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

> El tablero es de seguimiento; no aprueba pagos. Antes de liquidar, DICOL debe validar facturas, evidencias y condiciones comerciales.

## Instalación de Apps Script

1. En la hoja que será la base, abra **Extensiones → Apps Script** y reemplace el contenido con [`appscript/Code.gs`](../appscript/Code.gs).
2. Ejecute `setup()` una vez. Crea o completa las pestañas **Especialistas**, **Aliados**, **Evaluaciones**, **Politica** y **Parametros**. También restaura la política fija A/B/C indicada arriba.
3. Implemente el proyecto como aplicación web, ejecútelo como la cuenta de DICOL y copie la URL `/exec` en `rebates.js`.
4. Después de cambios en Apps Script, cree una nueva implementación para publicar el código actualizado.

La API acepta `getData`, `saveSpecialist`, `savePartner`, `saveEvaluation`, `saveParameters`, `deletePartner` y `deleteSpecialist`. No contiene catálogo, precios, kits ni acciones de catálogo.

## Operación

1. Registre especialistas y aliados.
2. Abra la ficha del aliado, elija el trimestre y use **Metas del aliado** para definir sus compromisos.
3. Use **Editar evaluación** para registrar los resultados reales del trimestre.
4. Revise los indicadores, categoría y rebate ganado; capture el rebate aplicado solo cuando sea aprobado.
