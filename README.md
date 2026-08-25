# DICOL-FACTURAS

Aplicación web estática para administrar salidas, leer QR de facturas y exportar sus gastos.

## Lectura de QR

En **Legalización de gastos**, abre una salida y selecciona **Iniciar cámara**. Cuando se detecta un QR, la aplicación conserva el contenido original y busca los datos que estén codificados en el texto, incluidos:

- CUFE (`CUFE`, `documentkey`, `uuid` o una cadena hexadecimal larga).
- Número y fecha de factura.
- NIT y nombre del emisor/proveedor.
- Valor total.

También se puede pegar el texto del QR y pulsar **Usar contenido QR**. Los campos que no estén presentes en el QR permanecen para revisión o diligenciamiento manual. El concepto se propone con reglas locales sencillas; nunca reemplaza la revisión de la persona que legaliza el gasto.

## Siguiente etapa: consulta oficial e IA

El QR no siempre incluye todos los datos de la factura. Para completar datos desde la DIAN, la aplicación necesita un **backend** que consulte únicamente un mecanismo autorizado por DIAN o por el proveedor tecnológico. No se deben poner credenciales, NIT de adquiriente ni claves de IA en el navegador.

Recomendaciones para esa integración:

1. Guardar las variables `NIT_EMPRESA` y `OPENAI_API_KEY` únicamente en variables de entorno del servidor.
2. Registrar auditoría: CUFE, contenido QR, respuesta de la consulta, usuario, fecha y aprobación.
3. Validar en código los importes extraídos (subtotal + impuestos = total cuando aplique) y no permitir que un modelo modifique CUFE, NIT o importes fiscales.
4. Usar IA solo después de obtener datos verificables, para clasificar descripciones ambiguas y devolver una categoría y nivel de confianza estructurados.
5. Mantener una pantalla de revisión antes de añadir la factura y de generar el Excel oficial.

La exportación actual crea una hoja de legalización. Antes de automatizar la plantilla institucional, debe mapearse su estructura real, fórmulas y celdas protegidas.
