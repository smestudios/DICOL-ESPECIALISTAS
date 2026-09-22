import { auth } from "../auth/firebase-client.js";
import { DICOL_CONFIG } from "../config/dicol-config.js";
import { ACTUALIZACION_TEMPORAL_DATA } from "../data/actualizacion-temporal-data.js";

const $ = (selector) => document.querySelector(selector);
const button = $("#bulkUpdateButton");
const status = $("#bulkUpdateStatus");
const adminMessage = $("#adminOnlyMessage");
const normalizeName = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
const sourceByPartnerPeriod = new Map();

// El archivo origen trae algunas parejas aliado/periodo repetidas. Tal como se
// indicó en la carga original, la última fila suministrada es la que se envía.
ACTUALIZACION_TEMPORAL_DATA.forEach((record) => sourceByPartnerPeriod.set(`${normalizeName(record.aliado)}|${record.periodo}`, record));
const sourceRecords = [...sourceByPartnerPeriod.values()];
const partnerTotal = new Set(sourceRecords.map((item) => normalizeName(item.aliado))).size;

$("#partnerTotal").textContent = partnerTotal;
$("#evaluationTotal").textContent = sourceRecords.length;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("temporary-update__status--error", isError);
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function api(action, data, id) {
  const user = auth.currentUser;
  if (!user) throw new Error("Tu sesión expiró. Ingresa nuevamente al portal.");
  const idToken = await user.getIdToken();
  const response = await fetch(DICOL_CONFIG.appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, data, id, idToken, requestId: requestId(), clientVersion: DICOL_CONFIG.apiVersion }),
  });
  const rawText = await response.text();
  let payload;
  try { payload = JSON.parse(rawText); } catch (_) {
    const receivedHtml = /^\s*</.test(rawText);
    throw new Error(receivedHtml
      ? "Apps Script devolvió una página HTML en vez de datos. Verifique que la URL /exec sea el despliegue web activo y publíquelo nuevamente."
      : "Apps Script devolvió una respuesta que no es JSON.");
  }
  if (!response.ok) throw new Error(payload.error || `El servicio respondió con HTTP ${response.status}.`);
  if (payload.apiVersion && payload.apiVersion !== DICOL_CONFIG.apiVersion) throw new Error("La página y Apps Script tienen versiones diferentes. Actualice el despliegue web.");
  if (!payload.ok) throw new Error(payload.error || "Google Sheets no aceptó la solicitud.");
  return payload.data || {};
}

function parameterItems(record, partnerId) {
  return [
    ["ventas_equipos", "Meta de compra de equipos", record.meta_ventas, "unidades"],
    ["demos_pequenas", "Demostraciones pequeñas", record.meta_demos_pequenas, "unidades"],
    ["demos_grandes", "Demostraciones grandes", record.meta_demos_grandes, "unidades"],
    // El backend recibe la meta de refacciones como porcentaje: 8 % de AC.
    ["porcentaje_refacciones", "Compra de refacciones", 8, "% del monto de equipos"],
    ["certificados_dji", "Pilotos certificados DJI Academy", record.meta_certificados, "certificados"],
    ["cartas_firmadas", "Cartas firmadas", record.meta_cartas, "cartas"],
  ].map(([clave, nombre, meta, unidad]) => ({ id: requestId(), aliado_id: partnerId, periodo: record.periodo, clave, nombre, meta, unidad }));
}

function evaluationItem(record, partnerId) {
  return {
    aliado_id: partnerId,
    periodo: record.periodo,
    resultado_ventas: record.resultado_ventas,
    demos_pequenas: record.resultado_demos_pequenas,
    demos_grandes: record.resultado_demos_grandes,
    certificados_dji: record.resultado_certificados,
    monto_equipos: record.monto_equipos,
    monto_refacciones: record.resultado_refacciones,
    cartas_firmadas: record.resultado_cartas,
    rebate_aplicado: 0,
    justificacion: "Importado desde EVALUACIONES TRIMESTRALES 2026.xlsx",
  };
}

async function bulkUpdate() {
  if (!window.confirm(`Se cargarán ${sourceRecords.length} evaluaciones únicas con los valores originales. ¿Desea continuar?`)) return;
  button.disabled = true;
  try {
    setStatus("Leyendo la cartera actual en Google Sheets…");
    const snapshot = await api("getData");
    const partnersByName = new Map((snapshot.partners || []).map((partner) => [normalizeName(partner.nombre), partner]));
    let createdPartners = 0;
    for (const record of sourceRecords) {
      const name = normalizeName(record.aliado);
      if (partnersByName.has(name)) continue;
      setStatus(`Creando aliado ${createdPartners + 1}…`);
      const saved = await api("savePartner", { id: requestId(), nombre: record.aliado, especialista_id: "", zona: "", notas: "Importado desde EVALUACIONES TRIMESTRALES 2026.xlsx" });
      const partner = saved.result || saved;
      partnersByName.set(name, partner);
      createdPartners += 1;
    }
    for (const [index, record] of sourceRecords.entries()) {
      const partner = partnersByName.get(normalizeName(record.aliado));
      if (!partner?.id) throw new Error(`No se encontró el ID del aliado ${record.aliado}.`);
      setStatus(`Guardando metas ${index + 1}/${sourceRecords.length}: ${record.periodo} · ${record.aliado}`);
      await api("saveParameters", parameterItems(record, partner.id));
      setStatus(`Guardando evaluación ${index + 1}/${sourceRecords.length}: ${record.periodo} · ${record.aliado}`);
      await api("saveEvaluation", evaluationItem(record, partner.id));
    }
    setStatus(`Actualización terminada: ${sourceRecords.length} evaluaciones y ${sourceRecords.length * 6} metas guardadas. Aliados nuevos: ${createdPartners}.`);
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
