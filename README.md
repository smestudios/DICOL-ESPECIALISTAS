# Portal interno DICOL

Aplicación web estática para acceder a las herramientas internas de DICOL: legalización de gastos, solicitud de viáticos y control de rebates.

## Estructura del proyecto

La estructura separa los recursos por responsabilidad para que sea fácil localizar, actualizar y desplegar cada pieza:

```text
.
├── index.html                    # Portada y accesos a las herramientas
├── login.html                    # Inicio de sesión
├── legalizacion-gastos.html      # Módulo de legalización
├── rebates.html                  # Módulo de rebates
├── assets/
│   ├── images/                   # Recursos visuales de marca
│   ├── templates/                # Formatos institucionales descargables
│   ├── styles/                   # Estilos compartidos y específicos por módulo
│   └── scripts/
│       ├── auth/                 # Configuración y flujo de autenticación
│       └── modules/              # Lógica de cada herramienta
├── appscript/                    # Integración de Google Apps Script
└── docs/                         # Guías operativas y documentación técnica
```

### Criterios de mantenimiento

- Mantén las páginas HTML en la raíz para preservar enlaces simples y compatibilidad con hosting estático.
- Agrega imágenes en `assets/images/`, formatos oficiales en `assets/templates/` y no los mezcles con el código.
- Añade estilos y scripts del módulo correspondiente en `assets/styles/` y `assets/scripts/modules/`; reutiliza `site.css` solamente para elementos compartidos.
- Toda página interna debe cargar `assets/scripts/auth/auth-guard.js` para conservar la protección de acceso.

## Perfiles de acceso

La administración local de perfiles `admin` y `specialist` con Python, las reglas de Firestore y la integración segura con Google Sheets se documentan en [Acceso y perfiles](docs/ACCESO_Y_PERFILES.md). Las credenciales administrativas no se guardan ni se usan desde el navegador.

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

Los formatos oficiales descargables se encuentran en `assets/templates/`: `S-CON-FO-02.6 LEGALIZACION DE GASTOS. v 2.0.xlsx` y `SOLICITUD DE  VIATICOS.XLSX`. La página de inicio y el módulo de legalización los enlazan desde esa carpeta.

El nuevo tablero `rebates.html` ofrece seguimiento por aliado y trimestre, gestión local de aliados/especialistas y una lectura de indicadores. La guía de operación y la base para Google Apps Script están en [`docs/REBATES.md`](docs/REBATES.md) y [`appscript/Code.gs`](appscript/Code.gs).

## Cierre de legalizaciones

La legalización es un flujo independiente de rebates y usa exclusivamente su plantilla institucional. Sus borradores y soportes se conservan de manera local sólo mientras se diligencia la salida. Use **Finalizar salida y descargar Excel** cuando termine: se descarga el Excel de esa legalización y se elimina el borrador, sus facturas y soportes locales; nunca se mezcla con los datos ni los archivos de rebates.
