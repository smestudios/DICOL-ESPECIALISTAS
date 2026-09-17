# Acceso, perfiles y Firestore

## Diseño

Firebase Authentication identifica a la persona. El perfil canónico se guarda en Firestore como `users/{uid}` y contiene `displayName`, `email`, `role`, `specialistId` y `active`.

El rol se duplica como un **custom claim** de Firebase Authentication. Para un especialista, el claim `specialistId` debe coincidir exactamente con la columna `id` de la pestaña **Especialistas** en Google Sheets. Apps Script valida ese vínculo activo en cada solicitud y con él decide qué puede consultar o editar; nunca confía en un especialista enviado por el navegador.

| Rol | Firestore | Rebates / Google Sheets |
| --- | --- | --- |
| `admin` | Puede leer todos los perfiles. | Administra especialistas, aliados, metas y evaluaciones. |
| `specialist` | Puede leer sólo su perfil. | Consulta y gestiona únicamente su cartera: puede crear, modificar y eliminar sus aliados, metas, evaluaciones y créditos de rebate; no puede reasignar aliados ni administrar usuarios. |

> La `apiKey` web de Firebase sirve para identificar el proyecto en el navegador; no otorga privilegios de administrador. Nunca use esa key para crear roles desde el cliente. La cuenta de servicio utilizada por la herramienta local no debe subirse al repositorio.

## Configuración local en Visual Studio Code

1. Abra esta carpeta en VS Code. Para la herramienta en Python instale Python 3.10 o superior y ejecute `python -m pip install -r requirements-admin.txt` en la terminal integrada. La alternativa de Node sigue disponible con `npm install`.
2. En Firebase Console abra **Project settings → Service accounts**, genere una clave privada y guárdela fuera del repositorio, por ejemplo en `secrets/firebase-service-account.json`.
3. Copie `.env.example` a `.env` y establezca `FIREBASE_SERVICE_ACCOUNT_PATH` con la ruta del archivo descargado. `.env` y `secrets/` ya están ignorados por Git.
4. Despliegue las reglas: `npx firebase-tools deploy --only firestore:rules --project dicol-especialistas`.
5. Cree primero el registro del especialista en la hoja de Google Sheets. Copie su columna `id`: ese valor será el `specialistId` del perfil Firebase.

## Crear perfiles

### Python (recomendado)

Use la cuenta de servicio privada únicamente desde su equipo. Puede indicar la ruta en cada comando o definir la variable de entorno `FIREBASE_SERVICE_ACCOUNT_PATH`.

```bash
# Windows PowerShell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = ".\\secrets\\firebase-service-account.json"

# macOS / Linux
export FIREBASE_SERVICE_ACCOUNT_PATH="./secrets/firebase-service-account.json"
```

Crear o actualizar un administrador:

```bash
python tools/manage_users.py upsert --email admin@dicol.com --name "Nombre Admin" --role admin --password "CambiaEstaClave123!"
```

Crear o actualizar a Sebastian Rengifo como especialista de Colombia. Primero, desde **Rebates → Gestionar usuarios**, cree el usuario responsable “Sebastian Rengifo” con zona “Colombia” y copie el valor **ID Firebase/Sheets** que muestra la ventana. Ese valor debe ir exactamente en `--specialist-id`:

```bash
python tools/manage_users.py upsert --email especialista@dicol.com --name "Nombre Especialista" --role specialist --specialist-id "UUID-DE-LA-HOJA" --password "CambiaEstaClave123!"
```

Para Sebastian, sustituya únicamente `ID-DE-SEBASTIAN` y la contraseña temporal por valores reales:

```bash
python tools/manage_users.py upsert --email "Sebastianrengifo05@gmail.com" --name "Sebastian Rengifo" --country "Colombia" --role specialist --specialist-id "ID-DE-SEBASTIAN" --password "CONTRASENA-TEMPORAL-SEGURA"
```

Para Andrés Gonzaga, cuando tenga su correo, use el mismo comando sin `--specialist-id`:

```bash
python tools/manage_users.py upsert --email "CORREO-DE-ANDRES" --name "Andres Gonzaga" --country "Colombia" --role admin --password "CONTRASENA-TEMPORAL-SEGURA"
```

Desactivar un usuario:

```bash
python tools/manage_users.py disable --email especialista@dicol.com
```

### Node.js (alternativa)

Para crear o actualizar un administrador:

```bash
npm run create:user -- --email admin@dicol.com --name "Nombre Admin" --role admin --password "CambiaEstaClave123!"
```

Para un especialista, `--specialist-id` debe coincidir exactamente con el `id` de la pestaña **Especialistas** de Google Sheets:

```bash
npm run create:user -- --email especialista@dicol.com --name "Nombre Especialista" --role specialist --specialist-id "UUID-DE-LA-HOJA" --password "CambiaEstaClave123!"
```

La herramienta es idempotente: si el correo ya existe, actualiza su nombre, perfil Firestore, claims y lo habilita. Una cuenta nueva requiere `--password`. Tras cambiar un rol, la persona debe cerrar sesión y volver a entrar para renovar su token.

Para bloquear el acceso:

```bash
npm run disable:user -- --email especialista@dicol.com
```

## Apps Script y Google Sheets

1. Pegue la versión actual de `appscript/Code.gs` en el proyecto de Apps Script de la hoja.
2. Ejecute `setup()` y luego ejecute una vez `configureFirebaseApiKey('TU_API_KEY_WEB')`. La API key web ya está definida en `assets/scripts/auth/firebase-config.js`; no use una cuenta de servicio en Apps Script.
3. Cree una implementación nueva de aplicación web, ejecútela como la cuenta de DICOL y configure el acceso según la política de la organización. Copie la URL `/exec` en `assets/scripts/modules/rebates.js` si cambia.
4. Cree los perfiles con la herramienta local. Apps Script validará el ID token en cada llamada y aplicará el rol y el `specialistId` incluidos en los custom claims.

El Apps Script ya no entrega datos por `GET` ni acepta acciones sin sesión Firebase válida. La autorización se aplica en el servidor: ocultar botones en el navegador no es el mecanismo de seguridad.

## Reglas de Firestore

El archivo [`firebase/firestore.rules`](../firebase/firestore.rules) permite a un administrador leer y modificar todos los perfiles. Un especialista sólo puede leer su propio perfil y cambiar `displayName` o `country`; no puede alterar su rol, estado, correo ni `specialistId`. Los aliados, metas, evaluaciones y créditos de rebate se protegen en Apps Script, que filtra la cartera usando el custom claim firmado `specialistId`.
