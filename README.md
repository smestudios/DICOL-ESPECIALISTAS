# DICOL-FACTURAS

Aplicación web para administrar salidas y registrar facturas de legalización.

## Alcance actual del lector QR

El lector QR tiene una sola responsabilidad: identificar el **CUFE** de la factura. Cuando el código también contiene una URL segura del dominio `dian.gov.co`, se habilita el botón **Consultar en DIAN**, que abre esa URL en una pestaña nueva.

La aplicación no intenta consultar, automatizar ni eludir controles de la DIAN desde el navegador. Tampoco inventa datos fiscales ni clasifica gastos a partir de texto QR incompleto.

## Flujo que vamos a construir

1. Escanear el QR y obtener el CUFE.
2. Abrir la consulta oficial incluida en el QR, cuando esté disponible, para que la persona complete cualquier control requerido por DIAN.
3. Obtener la factura desde un mecanismo autorizado por DIAN o el proveedor tecnológico (preferiblemente XML).
4. Enviar los datos fiscales verificables a un backend: CUFE, factura, emisor, NIT, fecha, impuestos, forma de pago y total.
5. Usar IA únicamente en el backend para proponer el concepto del gasto y su confianza.
6. Mostrar el resultado para aprobación humana.
7. Guardar la factura aprobada, su auditoría y generar el Excel con el mapeo exacto de la plantilla institucional.

## Requisitos para la siguiente etapa

- Confirmar el canal autorizado para consultar/descargar el XML o los datos de la factura usando CUFE y el NIT de DICOL (`901721119`) cuando corresponda.
- Crear un backend. Las credenciales, el NIT configurado y `OPENAI_API_KEY` nunca deben estar en JavaScript del navegador.
- Definir una base de datos o almacenamiento de auditoría: CUFE, documento recibido, respuesta de consulta, usuario, fecha de aprobación, clasificación y Excel generado.
- Revisar la plantilla oficial para mapear las celdas, fórmulas y campos obligatorios antes de automatizar la exportación.

## Diligenciamiento del formato de legalización

El módulo usa la segunda hoja del formato institucional (`S-CON-FO-02.6`), no una hoja nueva. A partir del ejemplo entregado se diligencian los campos de la salida (responsable, identificación, cargo, ciudad/fecha, centro de costo, tipo y valor de fondo/anticipo) y cada factura en las columnas **Descripción C.O., Fecha, Medio de pago, No. Factura, NIT, Nombre proveedor, Concepto y Valor**.

Los totales se calculan a partir de las categorías del formato: **Peajes y Parqueadero**, **Hotel**, **Alimentación** y **Otros**. El archivo exportado conserva la plantilla y deja los valores de total, valor a legalizar y valor a reintegrar calculados; la persona responsable debe revisar el resultado antes de radicarlo.

Para extracción, el navegador prioriza el texto contenido en PDF y XML. Las fotos pasan por el filtro de documento existente y OCR en español/inglés; ningún campo detectado se guarda sin que el usuario pueda revisarlo. Los archivos de ejemplo muestran que varios PDF son escaneos, por lo que el OCR es el respaldo necesario cuando no existe texto seleccionable.

## Organización de plantillas y rebates

Los formatos oficiales descargables se encuentran en `plantillas/`: `S-CON-FO-02.6 LEGALIZACION DE GASTOS. v 2.0.xlsx` y `SOLICITUD DE  VIATICOS.XLSX`. La página de inicio y el módulo de legalización los enlazan desde esa carpeta.

El nuevo tablero `rebates.html` ofrece seguimiento por aliado y trimestre, gestión local de aliados/especialistas y una lectura de indicadores. La guía de operación y la base para Google Apps Script están en [`docs/REBATES.md`](docs/REBATES.md) y [`appscript/Code.gs`](appscript/Code.gs).
