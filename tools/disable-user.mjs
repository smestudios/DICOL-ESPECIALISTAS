import "dotenv/config";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const email = process.argv[process.argv.indexOf("--email") + 1]?.trim().toLowerCase();
if (!email || email.startsWith("--")) throw new Error("Uso: npm run disable:user -- --email correo@dicol.com");
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error("Configure FIREBASE_SERVICE_ACCOUNT_PATH en .env.");
const serviceAccount = JSON.parse(await readFile(serviceAccountPath, "utf8"));
if (!getApps().length) initializeApp({ credential: cert(serviceAccount), projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id });
const user = await getAuth().getUserByEmail(email);
await getAuth().updateUser(user.uid, { disabled: true });
await getFirestore().collection("users").doc(user.uid).set({ active: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
console.log(`Perfil desactivado: ${email}`);
