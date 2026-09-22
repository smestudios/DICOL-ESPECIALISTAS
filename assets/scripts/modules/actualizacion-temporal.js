import { auth } from "../auth/firebase-client.js";
import { DICOL_CONFIG } from "../config/dicol-config.js";
import { ACTUALIZACION_TEMPORAL_DATA } from "../data/actualizacion-temporal-data.js";

const $ = (selector) => document.querySelector(selector);
const status = $("#bulkUpdateStatus");
const adminMessage = $("#adminOnlyMessage");
const reviewList = $("#partnerReviewList");
const reviewSummary = $("#reviewSummary");
const normalizeName = (value) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
const sourceByPartnerPeriod = new Map();

// El archivo origen trae algunas parejas aliado/periodo repetidas. Tal como se
// indicó en la carga original, la última fila suministrada es la que se envía.
ACTUALIZACION_TEMPORAL_DATA.forEach((record) => sourceByPartnerPeriod.set(`${normalizeName(record.aliado)}|${record.periodo}`, record));
const sourceRecords = [...sourceByPartnerPeriod.values()];
const partnerTotal = new Set(sourceRecords.map((item) => normalizeName(item.aliado))).size;
const periods = [...new Set(sourceRecords.map((item) => item.periodo))].sort();
const recordsByPartner = sourceRecords.reduce((all, record) => {
  const key = normalizeName(record.aliado);
  if (!all.has(key)) all.set(key, { name: record.aliado, records: [] });
  all.get(key).records.push(record);
  return all;
}, new Map());
let canApply = false;
let isApplying = false;

$("#partnerTotal").textContent = partnerTotal;
$("#evaluationTotal").textContent = sourceRecords.length;
$("#periodTotal").textContent = periods.length;

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

const numberFormat = new Intl.NumberFormat("es-CO");
const moneyFormat = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
function metric(meta, result, isMoney = false) {
  const format = isMoney ? moneyFormat : numberFormat;
  return `${format.format(Number(meta || 0))} / ${format.format(Number(result || 0))}`;
}

function renderReview() {
  reviewList.replaceChildren();
  reviewSummary.textContent = `${partnerTotal} aliados · ${sourceRecords.length} evaluaciones únicas · ${periods.join(", ")}`;
  for (const { name, records } of [...recordsByPartner.values()].sort((a, b) => a.name.localeCompare(b.name, "es"))) {
    records.sort((a, b) => a.periodo.localeCompare(b.periodo));
    const card = document.createElement("article");
    card.className = "partner-review";
    const heading = document.createElement("div");
    heading.className = "partner-review__head";
    const title = document.createElement("h3");
    title.textContent = name;
    const detail = document.createElement("p");
    detail.textContent = `${records.length} trimestre${records.length === 1 ? "" : "s"} para revisar`;
    heading.append(title, detail);
    const tableWrap = document.createElement("div");
    tableWrap.className = "partner-review__table-wrap";
    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>Periodo</th><th>Equipos<br><small>Meta / resultado</small></th><th>Monto comprado en equipos (COP)<br><small>Resultado</small></th><th>Demos P<br><small>Meta / resultado</small></th><th>Demos G<br><small>Meta / resultado</small></th><th>Certificados<br><small>Meta / resultado</small></th><th>Refacciones (COP)<br><small>Meta / resultado</small></th><th>Cartas<br><small>Meta / resultado</small></th></tr></thead>";
    const body = document.createElement("tbody");
    records.forEach((record) => {
      const row = document.createElement("tr");
      [record.periodo, metric(record.meta_ventas, record.resultado_ventas), moneyFormat.format(Number(record.monto_equipos || 0)), metric(record.meta_demos_pequenas, record.resultado_demos_pequenas), metric(record.meta_demos_grandes, record.resultado_demos_grandes), metric(record.meta_certificados, record.resultado_certificados), metric(record.meta_refacciones, record.resultado_refacciones, true), metric(record.meta_cartas, record.resultado_cartas)].forEach((value) => {
        const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
      });
      body.append(row);
    });
    table.append(body); tableWrap.append(table);
    const footer = document.createElement("div"); footer.className = "partner-review__footer";
    const source = document.createElement("p"); source.textContent = "Metas y resultados extraídos de las columnas «META VS CUMPLIMIENTO» del Excel.";
    const applyButton = document.createElement("button"); applyButton.className = "btn-primary partner-review__apply"; applyButton.type = "button"; applyButton.textContent = "Aplicar este aliado"; applyButton.disabled = !canApply;
    applyButton.addEventListener("click", () => applyPartner(name, records, applyButton, card));
    footer.append(source, applyButton); card.append(heading, tableWrap, footer); reviewList.append(card);
  }
}

async function applyPartner(name, records, applyButton, card) {
  if (!canApply || isApplying) return;
  if (!window.confirm(`Se guardarán las metas y resultados de ${records.length} periodo(s) para ${name}. Esta acción actualizará esos periodos en Google Sheets. ¿Desea continuar?`)) return;
  isApplying = true;
  applyButton.disabled = true;
  try {
    setStatus(`Aplicando ${name} en Google Sheets…`);
    const saved = await api("bulkImportTemporal", { records });
    const result = saved.result || {};
    card.classList.add("partner-review--applied");
    applyButton.textContent = "Aplicado";
    setStatus(`${name} actualizado: ${result.evaluations || records.length} evaluaciones y ${result.parameters || records.length * 6} metas guardadas.${result.createdPartners ? " Se creó el aliado." : ""}`);
  } catch (error) {
    setStatus(error.message || "No fue posible completar la actualización.", true);
    applyButton.disabled = false;
  } finally {
    isApplying = false;
  }
}

(window.dicolAuthReady || Promise.reject(new Error("AUTH_REQUIRED"))).then(({ profile }) => {
  if (profile?.role !== "admin") {
    adminMessage.hidden = false;
    setStatus("No tienes permisos de administrador.", true);
    renderReview();
    return;
  }
  canApply = true;
  renderReview();
  setStatus("Datos validados. Revise y aplique cada aliado cuando esté conforme.");
}).catch(() => { renderReview(); setStatus("No fue posible validar tu acceso.", true); });
