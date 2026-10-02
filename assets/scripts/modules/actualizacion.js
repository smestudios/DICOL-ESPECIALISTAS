import { auth } from "../auth/firebase-client.js";
import { DICOL_CONFIG } from "../config/dicol-config.js";

const $ = (selector) => document.querySelector(selector);
const CURRENCY = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const QUARTER_MONTHS = {
  Q1: ["ENERO", "FEBRERO", "MARZO"],
  Q2: ["ABRIL", "MAYO", "JUNIO"],
  Q3: ["JULIO", "AGOSTO", "SEPTIEMBRE"],
  Q4: ["OCTUBRE", "NOVIEMBRE", "DICIEMBRE"],
};
let existingPartners = [];
let importedPartners = [];
let approvedPartners = new Set();

const number = (value) => Number(value) || 0;
const money = (value) => CURRENCY.format(number(value));
const normalize = (value) => String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function setStatus(message, isError = false) {
  $("#importStatus").textContent = message;
  $("#importStatus").classList.toggle("connection-status--error", isError);
}

async function api(action, data) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Tu sesión expiró. Ingresa nuevamente.");
  const response = await fetch(DICOL_CONFIG.appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, data, idToken, clientVersion: DICOL_CONFIG.apiVersion }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "No fue posible actualizar los datos.");
  return payload.data;
}

function periodFromSheet(sheetName, rows) {
  const match = String(sheetName).match(/\b(Q[1-4])\s*(20\d{2})\b/i);
  if (!match) throw new Error(`La hoja “${sheetName}” debe indicar el período en su nombre, por ejemplo “Q2 2026”.`);
  const quarter = match[1].toUpperCase();
  const headerText = rows.slice(0, 3).flat().map((value) => String(value).toUpperCase()).join(" ");
  if (!QUARTER_MONTHS[quarter].some((month) => headerText.includes(month))) {
    throw new Error(`La hoja “${sheetName}” no coincide con sus meses esperados para ${quarter}.`);
  }
  return `${match[2]}-${quarter}`;
}

function parseSheet(sheet, sheetName) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const period = periodFromSheet(sheetName, rows);
  const headers = rows[1] || [];
  const find = (name) => headers.findIndex((value) => String(value).trim() === name);
  const columns = {
    name: find("ALIADO"), salesGoal: find("META VENTAS"), sales: find("RESUL. VENTAS"), equipment: find("FAC. VENTA DRONES"),
    smallGoal: find("META DEMOS P"), small: find("RESUL. DEMOS P"), largeGoal: find("META DEMOS G"), large: find("RESUL. DEMOS G"),
    pilotsGoal: find("META CERTIF. PILOTOS"), pilots: find("RESUL. CERTIF. PILOTOS"), parts: find("RESUL. COMP. REFAC"),
    lettersGoal: find("META CARTAS C.FINAL"), letters: find("RESUL. CARTAS C.FINAL"),
  };
  if (Object.values(columns).some((column) => column < 0)) throw new Error(`La hoja “${sheetName}” no tiene las columnas requeridas de META VS CUMPLIMIENTO.`);
  return rows.slice(3).filter((row) => String(row[columns.name]).trim()).map((row) => ({
    nombre: String(row[columns.name]).trim(), periodo: period, hoja: sheetName,
    metas: { ventas_equipos: number(row[columns.salesGoal]), demos_pequenas: number(row[columns.smallGoal]), demos_grandes: number(row[columns.largeGoal]), porcentaje_refacciones: 8, certificados_dji: number(row[columns.pilotsGoal]), cartas_firmadas: number(row[columns.lettersGoal]) },
    evaluacion: { resultado_ventas: number(row[columns.sales]), monto_equipos: number(row[columns.equipment]), monto_refacciones: number(row[columns.parts]), demos_pequenas: number(row[columns.small]), demos_grandes: number(row[columns.large]), certificados_dji: number(row[columns.pilots]), cartas_firmadas: number(row[columns.letters]) },
  }));
}

function periodTable(periods) {
  const rows = periods.sort((a, b) => a.periodo.localeCompare(b.periodo)).map((item) => {
    const result = item.evaluacion;
    const goals = item.metas;
    const expectedParts = result.monto_equipos * goals.porcentaje_refacciones / 100;
    return `<tr><th scope="row"><b>${escapeHtml(item.periodo)}</b><small>${escapeHtml(item.hoja)}</small></th><td>${result.demos_pequenas} / ${goals.demos_pequenas}</td><td>${result.demos_grandes} / ${goals.demos_grandes}</td><td>${result.cartas_firmadas} / ${goals.cartas_firmadas}</td><td>${money(result.monto_refacciones)} / ${money(expectedParts)}</td><td>${money(result.monto_equipos)}</td></tr>`;
  }).join("");
  return `<div class="import-table-wrap"><table class="import-table"><thead><tr><th>Trimestre</th><th>Demo P<br><small>cumplido / meta</small></th><th>Demo G<br><small>cumplido / meta</small></th><th>Cartas<br><small>cumplido / meta</small></th><th>Refacciones<br><small>cumplido / meta 8 %</small></th><th>FAC. VENTA DRONES</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function render() {
  const periods = [...new Set(importedPartners.flatMap((partner) => partner.periods.map((item) => item.periodo)))].sort();
  $("#importSummary").hidden = !importedPartners.length;
  $("#importSummary").innerHTML = `<article><span>Aliados detectados</span><strong>${importedPartners.length}</strong><small>Última fila conservada por período</small></article><article><span>Aprobados</span><strong>${approvedPartners.size}</strong><small>Listos para actualizar</small></article><article><span>Períodos del Excel</span><strong>${periods.join(" · ") || "—"}</strong><small>Se toma el trimestre y año del nombre de cada hoja</small></article><article><span>Control</span><strong>Manual</strong><small>Cada aliado requiere aprobación</small></article>`;
  $("#applyApproved").hidden = !approvedPartners.size;
  $("#importList").innerHTML = importedPartners.map((partner) => {
    const exists = existingPartners.some((item) => normalize(item.nombre) === partner.key);
    return `<article class="import-card"><div><p class="eyebrow">${exists ? "ALIADO EXISTENTE" : "ALIADO NUEVO · SIN RESPONSABLE"}</p><h2>${escapeHtml(partner.nombre)}</h2>${periodTable(partner.periods)}</div><button class="rebate-button ${approvedPartners.has(partner.key) ? "rebate-button--primary" : ""}" data-approve="${escapeHtml(partner.key)}">${approvedPartners.has(partner.key) ? "Aprobado para actualizar" : "Aprobar este aliado"}</button></article>`;
  }).join("");
  document.querySelectorAll("[data-approve]").forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.approve;
      approvedPartners.has(key) ? approvedPartners.delete(key) : approvedPartners.add(key);
      render();
    };
  });
}

$("#workbookInput").onchange = async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    setStatus("Leyendo las hojas y verificando su trimestre y año…");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const entries = workbook.SheetNames.flatMap((sheetName) => parseSheet(workbook.Sheets[sheetName], sheetName));
    const partnersByName = new Map();
    entries.forEach((entry) => {
      const key = normalize(entry.nombre);
      const partner = partnersByName.get(key) || { key, nombre: entry.nombre, periods: [] };
      const repeatedPeriod = partner.periods.findIndex((item) => item.periodo === entry.periodo);
      if (repeatedPeriod >= 0) partner.periods[repeatedPeriod] = entry; else partner.periods.push(entry);
      partnersByName.set(key, partner);
    });
    importedPartners = [...partnersByName.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    approvedPartners.clear();
    const periods = [...new Set(entries.map((entry) => entry.periodo))].sort();
    setStatus(`${importedPartners.length} aliado(s) listo(s) para revisión. Períodos detectados: ${periods.join(", ")}.`);
    render();
  } catch (error) {
    importedPartners = [];
    approvedPartners.clear();
    render();
    setStatus(error.message, true);
  }
};

$("#applyApproved").onclick = async () => {
  if (!confirm(`¿Actualizar ${approvedPartners.size} aliado(s) aprobados? Esta operación reemplaza metas y evaluaciones de los períodos mostrados.`)) return;
  try {
    setStatus("Actualizando Google Sheets…");
    await api("importQuarterlyEvaluations", { partners: importedPartners.filter((partner) => approvedPartners.has(partner.key)).map(({ nombre, periods }) => ({ nombre, periods })) });
    setStatus("Actualización completada y sincronizada con Google Sheets.");
    approvedPartners.clear();
    render();
  } catch (error) {
    setStatus(error.message, true);
  }
};

(window.dicolAuthReady || Promise.resolve()).then(async (session) => {
  if (session?.profile?.role !== "admin") { window.location.replace("rebates.html"); return; }
  const data = await api("getData");
  existingPartners = data.partners || [];
});
