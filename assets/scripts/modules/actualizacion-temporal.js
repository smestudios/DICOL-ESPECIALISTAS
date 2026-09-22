import { auth } from "../auth/firebase-client.js";
import { DICOL_CONFIG } from "../config/dicol-config.js";
import { ACTUALIZACION_TEMPORAL_DATA } from "../data/actualizacion-temporal-data.js";

const $ = (selector) => document.querySelector(selector);
const button = $("#bulkUpdateButton");
const status = $("#bulkUpdateStatus");
const adminMessage = $("#adminOnlyMessage");
const partnerTotal = new Set(ACTUALIZACION_TEMPORAL_DATA.map((item) => item.aliado.trim().toUpperCase())).size;

$("#partnerTotal").textContent = partnerTotal;
$("#evaluationTotal").textContent = ACTUALIZACION_TEMPORAL_DATA.length;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("temporary-update__status--error", isError);
}

async function bulkUpdate() {
  if (!window.confirm(`Se cargarán ${ACTUALIZACION_TEMPORAL_DATA.length} evaluaciones con sus valores originales. ¿Desea continuar?`)) return;
  button.disabled = true;
  setStatus("Actualizando metas y resultados en Google Sheets…");
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Tu sesión expiró. Ingresa nuevamente al portal.");
    const response = await fetch(DICOL_CONFIG.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "bulkImportTemporal", idToken, requestId: crypto.randomUUID(), clientVersion: DICOL_CONFIG.apiVersion, data: { records: ACTUALIZACION_TEMPORAL_DATA } }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || `El servicio respondió con HTTP ${response.status}.`);
    const result = payload.data?.result || {};
    setStatus(`Actualización terminada: ${result.evaluations || 0} evaluaciones y ${result.parameters || 0} metas guardadas. Aliados nuevos: ${result.createdPartners || 0}.`);
  } catch (error) {
    setStatus(error.message || "No fue posible completar la actualización.", true);
    button.disabled = false;
  }
}

button.addEventListener("click", bulkUpdate);
(window.dicolAuthReady || Promise.reject(new Error("AUTH_REQUIRED"))).then(({ profile }) => {
  if (profile?.role !== "admin") {
    adminMessage.hidden = false;
    setStatus("No tienes permisos de administrador.", true);
    return;
  }
  button.disabled = false;
  setStatus("Datos validados y listos para actualizar.");
}).catch(() => setStatus("No fue posible validar tu acceso.", true));
