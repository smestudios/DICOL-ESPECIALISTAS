import "dotenv/config";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const USAGE = `Uso:
  npm run create:user -- --email correo@dicol.com --name "Nombre completo" --role admin
  npm run create:user -- --email correo@dicol.com --name "Nombre completo" --role specialist --specialist-id ID_DE_GOOGLE_SHEETS

Opciones: --email, --name, --role (admin|specialist), --specialist-id (obligatorio para specialist), --password (opcional).`;

function argsFrom(argv) {
  return argv.reduce((result, item, index, all) => {
    if (!item.startsWith("--")) return result;
    result[item.slice(2)] = all[index + 1]?.startsWith("--") ? true : all[index + 1];
    return result;
  }, {});
}

function required(value, label) {
  if (!value || value === true) throw new Error(`Falta ${label}.\n\n${USAGE}`);
  return String(value).trim();
}

const options = argsFrom(process.argv.slice(2));
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}

const email = required(options.email, "--email").toLowerCase();
const displayName = required(options.name, "--name");
const role = required(options.role, "--role");
const specialistId = options["specialist-id"] ? String(options["specialist-id"]).trim() : "";
if (!["admin", "specialist"].includes(role)) throw new Error(`El rol debe ser admin o specialist.\n\n${USAGE}`);
if (role === "specialist" && !specialistId) throw new Error(`Un especialista requiere --specialist-id.\n\n${USAGE}`);

const serviceAccountPath = required(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "FIREBASE_SERVICE_ACCOUNT_PATH en .env");
const serviceAccount = JSON.parse(await readFile(serviceAccountPath, "utf8"));
if (!getApps().length) initializeApp({ credential: cert(serviceAccount), projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id });

const auth = getAuth();
const db = getFirestore();
let user;
let existed = true;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { displayName, disabled: false, ...(options.password ? { password: String(options.password) } : {}) });
} catch (error) {
  if (error.code !== "auth/user-not-found") throw error;
  existed = false;
  if (!options.password) throw new Error("Para crear una cuenta nueva indique --password. Después podrá usar el restablecimiento de contraseña de Firebase.");
  user = await auth.createUser({ email, displayName, password: options.password ? String(options.password) : undefined, emailVerified: false, disabled: false });
}

const claims = { role, ...(role === "specialist" ? { specialistId } : {}) };
await auth.setCustomUserClaims(user.uid, claims);
await db.collection("users").doc(user.uid).set({
  uid: user.uid,
  email,
  displayName,
  role,
  specialistId: role === "specialist" ? specialistId : null,
  active: true,
  updatedAt: FieldValue.serverTimestamp(),
  ...(!existed ? { createdAt: FieldValue.serverTimestamp() } : {}),
}, { merge: true });

console.log(`Perfil ${role} listo para ${email}. UID: ${user.uid}`);
console.log("La persona debe cerrar e iniciar sesión para recibir el nuevo rol.");
