import { auth } from "../auth/firebase-client.js";
import { DICOL_CONFIG } from "../config/dicol-config.js";

const $ = (s) => document.querySelector(s);
let partners = [], approved = new Set(), imported = [];
const normalize = (value) => String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
const number = (value) => Number(value) || 0;
const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(number(value));
function status(message, error = false) { $("#importStatus").textContent = message; $("#importStatus").classList.toggle("connection-status--error", error); }
async function api(action, data) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Tu sesión expiró. Ingresa nuevamente.");
  const response = await fetch(DICOL_CONFIG.appsScriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, data, idToken: token, clientVersion: DICOL_CONFIG.apiVersion }) });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "No fue posible actualizar los datos.");
  return payload.data;
}
function quarter(sheet) { const first = String(sheet.A1?.v || "").toUpperCase(); return /ENERO|FEBRERO|MARZO/.test(first) ? "Q1" : /ABRIL|MAYO|JUNIO/.test(first) ? "Q2" : /JULIO|AGOSTO|SEPTIEMBRE/.test(first) ? "Q3" : "Q4"; }
function importYear() {
  const value = Number($("#importYear").value);
  if (!Number.isInteger(value) || value < 2000 || value > 9999) throw new Error("Indique un año de vigencia válido, entre 2000 y 9999.");
  return value;
}
function parseSheet(ws, selectedYear) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  const headers = rows[1] || []; const find = (name) => headers.findIndex((item) => String(item).trim() === name);
  const cols = { name: find("ALIADO"), salesGoal: find("META VENTAS"), sales: find("RESUL. VENTAS"), equipment: find("FAC. VENTA DRONES"), smallGoal: find("META DEMOS P"), small: find("RESUL. DEMOS P"), largeGoal: find("META DEMOS G"), large: find("RESUL. DEMOS G"), pilotsGoal: find("META CERTIF. PILOTOS"), pilots: find("RESUL. CERTIF. PILOTOS"), parts: find("RESUL. COMP. REFAC"), lettersGoal: find("META CARTAS C.FINAL"), letters: find("RESUL. CARTAS C.FINAL") };
  if (Object.values(cols).some((column) => column < 0)) throw new Error("El archivo no tiene la estructura esperada de META VS CUMPLIMIENTO.");
  return rows.slice(3).filter((row) => String(row[cols.name]).trim()).map((row) => ({ nombre: String(row[cols.name]).trim(), periodo: `${selectedYear}-${quarter(ws)}`, metas: { ventas_equipos: number(row[cols.salesGoal]), demos_pequenas: number(row[cols.smallGoal]), demos_grandes: number(row[cols.largeGoal]), porcentaje_refacciones: 8, certificados_dji: number(row[cols.pilotsGoal]), cartas_firmadas: number(row[cols.lettersGoal]) }, evaluacion: { resultado_ventas: number(row[cols.sales]), monto_equipos: number(row[cols.equipment]), monto_refacciones: number(row[cols.parts]), demos_pequenas: number(row[cols.small]), demos_grandes: number(row[cols.large]), certificados_dji: number(row[cols.pilots]), cartas_firmadas: number(row[cols.letters]) } }));
}
function render() {
  $("#importSummary").hidden = !imported.length;
  const periods = [...new Set(imported.flatMap((x) => x.periods.map((p) => p.periodo)))].sort();
  $("#importSummary").innerHTML = `<article><span>Aliados detectados</span><strong>${imported.length}</strong><small>Última fila conservada por trimestre</small></article><article><span>Aprobados</span><strong>${approved.size}</strong><small>Listos para actualizar</small></article><article><span>Períodos a revisar</span><strong>${periods.join(" · ") || "—"}</strong><small>Q y año que se escribirán</small></article><article><span>Control</span><strong>Manual</strong><small>Cada aliado requiere aprobación</small></article>`;
  $("#applyApproved").hidden = !approved.size;
  $("#importList").innerHTML = imported.map((item) => { const exists = partners.find((partner) => normalize(partner.nombre) === normalize(item.nombre)); const periodCards = item.periods.sort((a, b) => a.periodo.localeCompare(b.periodo)).map((p) => `<section class="import-period"><h3>${p.periodo}</h3><p>${p.evaluacion.resultado_ventas} equipos · ${money(p.evaluacion.monto_equipos)} · refacciones ${money(p.evaluacion.monto_refacciones)}</p><details><summary>Ver metas y cumplimiento de ${p.periodo}</summary><p>Ventas ${p.evaluacion.resultado_ventas}/${p.metas.ventas_equipos}; demos P ${p.evaluacion.demos_pequenas}/${p.metas.demos_pequenas}; demos G ${p.evaluacion.demos_grandes}/${p.metas.demos_grandes}; pilotos ${p.evaluacion.certificados_dji}/${p.metas.certificados_dji}; cartas ${p.evaluacion.cartas_firmadas}/${p.metas.cartas_firmadas}; refacciones ${money(p.evaluacion.monto_refacciones)} (meta: 8% de ${money(p.evaluacion.monto_equipos)}).</p></details></section>`).join(""); return `<article class="import-card"><div><p class="eyebrow">${exists ? "ALIADO EXISTENTE" : "ALIADO NUEVO · SIN RESPONSABLE"}</p><h2>${item.nombre}</h2><div class="import-periods">${periodCards}</div></div><button class="rebate-button ${approved.has(item.key) ? "rebate-button--primary" : ""}" data-approve="${item.key}">${approved.has(item.key) ? "Aprobado para actualizar" : "Aprobar este aliado"}</button></article>`; }).join("") || "";
  document.querySelectorAll("[data-approve]").forEach((button) => button.onclick = () => { const key = button.dataset.approve; approved.has(key) ? approved.delete(key) : approved.add(key); render(); });
}
$("#workbookInput").onchange = async (event) => { try { const file = event.target.files[0]; if (!file) return; const filenameYear = file.name.match(/(?:^|\D)(20\d{2})(?:\D|$)/)?.[1]; if (filenameYear) $("#importYear").value = filenameYear; const selectedYear = importYear(); status(`Leyendo y comparando el archivo para la vigencia ${selectedYear}…`); const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" }); const collected = workbook.SheetNames.flatMap((name) => parseSheet(workbook.Sheets[name], selectedYear)); const byPartner = new Map(); collected.forEach((entry) => { const key = normalize(entry.nombre); const current = byPartner.get(key) || { key, nombre: entry.nombre, periods: [] }; const old = current.periods.findIndex((item) => item.periodo === entry.periodo); if (old >= 0) current.periods[old] = entry; else current.periods.push(entry); byPartner.set(key, current); }); imported = [...byPartner.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)); approved.clear(); status(`${imported.length} aliado(s) listo(s) para revisar y aprobar en ${selectedYear}.`); render(); } catch (error) { status(error.message, true); } };
$("#applyApproved").onclick = async () => { if (!confirm(`¿Actualizar ${approved.size} aliado(s) aprobados? Esta operación reemplaza metas y evaluaciones de los periodos visibles.`)) return; try { status("Actualizando Google Sheets…"); await api("importQuarterlyEvaluations", { partners: imported.filter((item) => approved.has(item.key)).map(({ nombre, periods }) => ({ nombre, periods })) }); status("Actualización completada y sincronizada con Google Sheets."); approved.clear(); render(); } catch (error) { status(error.message, true); } };
(window.dicolAuthReady || Promise.resolve()).then(async (session) => { if (session?.profile?.role !== "admin") { window.location.replace("rebates.html"); return; } const data = await api("getData"); partners = data.partners || []; });
