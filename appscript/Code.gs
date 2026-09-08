/**
 * DICOL — API de seguimiento de rebates en Google Sheets.
 *
 * Ejecute setup() una vez. Las metas se configuran por aliado y trimestre
 * desde la pantalla "Metas del aliado"; setup no crea metas sin aliado.
 */
const SHEET_NAMES = {
  specialists: "Especialistas",
  partners: "Aliados",
  evaluations: "Evaluaciones",
  policy: "Politica",
  parameters: "Parametros",
};
const HEADERS = {
  specialists: ["id", "nombre", "zona", "activo", "creado_en"],
  partners: ["id", "nombre", "especialista_id", "zona", "notas", "activo", "creado_en"],
  evaluations: [
    "aliado_id", "periodo", "resultado_ventas", "rebate_calculado",
    "rebate_aplicado", "diferencia", "justificacion", "sales", "demos",
    "parts", "pilots", "information", "demos_pequenas", "demos_grandes",
    "certificados_dji", "certificacion_dji_obligatoria", "monto_equipos",
    "monto_refacciones", "cartas_firmadas", "actualizado_en",
  ],
  policy: ["tipo", "clave", "nombre", "valor", "meta"],
  parameters: ["id", "aliado_id", "periodo", "clave", "nombre", "meta", "unidad", "activo"],
};
const DEFAULT_PARAMETERS = [
  ["ventas_equipos", "Meta de compra de equipos", 1, "unidades"],
  ["demos_pequenas", "Demostraciones pequeñas", 3, "unidades"],
  ["demos_grandes", "Demostraciones grandes", 1, "unidades"],
  ["porcentaje_refacciones", "Compra de refacciones", 8, "% del monto de equipos"],
  ["certificados_dji", "Pilotos certificados DJI Academy", 1, "certificados"],
  ["cartas_firmadas", "Cartas firmadas", 1, "cartas"],
];
const DEFAULT_POLICY = [
  ["indicador", "sales", "Cumplimiento de la meta por compra", 50, 100],
  ["indicador", "demos", "Demostraciones pequeñas y grandes", 20, 100],
  ["indicador", "parts", "Compra de refacciones", 10, 100],
  ["indicador", "pilots", "Certificados DJI Academy", 10, 100],
  ["indicador", "information", "Cartas firmadas", 10, 100],
  ["nivel", "A", "Categoría A", 5, 80],
  ["nivel", "B", "Categoría B", 3, 60],
  ["nivel", "C", "Categoría C", 0, 0],
];

function setup() {
  const spreadsheet = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach((key) => ensureSheet_(spreadsheet, SHEET_NAMES[key], HEADERS[key]));
  restorePolicyBoletin2025();
}

// Restaura exclusivamente la política oficial: A >= 80 % = 5 %, B >= 60 % = 3 %, C = 0 %.
function restorePolicyBoletin2025() {
  const sheet = sheet_(SHEET_NAMES.policy);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.policy.length).clearContent();
  sheet.getRange(2, 1, DEFAULT_POLICY.length, HEADERS.policy.length).setValues(DEFAULT_POLICY);
}

function doGet(event) { return response_({ ok: true, data: getData_() }, event); }
function doPost(event) {
  try { return response_({ ok: true, data: dispatch_(JSON.parse(event.postData.contents || "{}")) }, event); }
  catch (error) { return response_({ ok: false, error: error.message }, event); }
}
function dispatch_(request) {
  const data = request.data || {};
  switch (request.action) {
    case "getData": return getData_();
    case "saveSpecialist": return saveSpecialist_(data);
    case "savePartner": return savePartner_(data);
    case "saveEvaluation": return saveEvaluation_(data);
    case "saveParameters": return saveParameters_(data);
    case "deletePartner": return archivePartner_(request.id);
    case "deleteSpecialist": return archiveSpecialist_(request.id);
    default: throw new Error("Acción no permitida.");
  }
}
function getData_() {
  const specialists = rows_(SHEET_NAMES.specialists).filter((row) => row.activo !== "false");
  const partners = rows_(SHEET_NAMES.partners).filter((row) => row.activo !== "false");
  const evaluations = rows_(SHEET_NAMES.evaluations);
  const parameters = rows_(SHEET_NAMES.parameters).filter((row) => row.activo !== "false");
  const policy = { tiers: [] };
  rows_(SHEET_NAMES.policy).forEach((row) => {
    if (row.tipo === "nivel") policy.tiers.push({ name: row.clave, rebate: number_(row.valor), min: number_(row.meta) });
    if (row.tipo === "indicador") policy[row.clave] = { label: row.nombre, weight: number_(row.valor), target: number_(row.meta) };
  });
  policy.tiers.sort((a, b) => b.min - a.min);
  return {
    specialists,
    partners: partners.map((partner) => ({ ...partner, quarters: evaluations.filter((item) => item.aliado_id === partner.id).reduce((all, item) => ((all[item.periodo] = item), all), {}) })),
    policy,
    parameters,
  };
}
function saveParameters_(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("Agregue las metas del aliado.");
  return withLock_(function () {
    return items.map((item) => {
      require_(item, ["aliado_id", "periodo", "clave", "nombre", "meta"]);
      if (!/^Q[1-4]$/.test(item.periodo)) throw new Error("El periodo debe ser Q1, Q2, Q3 o Q4.");
      const meta = number_(item.meta);
      if (meta <= 0) throw new Error(`La meta de ${item.nombre} debe ser mayor que cero.`);
      const key = String(item.clave).trim();
      const current = rows_(SHEET_NAMES.parameters).find((row) => row.aliado_id === item.aliado_id && row.periodo === item.periodo && row.clave === key && row.activo !== "false");
      return upsert_(SHEET_NAMES.parameters, { id: current ? current.id : Utilities.getUuid(), aliado_id: item.aliado_id, periodo: item.periodo, clave: key, nombre: String(item.nombre).trim(), meta, unidad: item.unidad || "unidades", activo: true });
    });
  });
}
function saveSpecialist_(data) {
  require_(data, ["nombre"]);
  return withLock_(function () {
    assertUniqueName_(SHEET_NAMES.specialists, data.nombre, data.id, "especialista");
    return upsert_(SHEET_NAMES.specialists, { id: data.id || Utilities.getUuid(), nombre: String(data.nombre).trim(), zona: data.zona || "", activo: true, creado_en: data.creado_en || new Date().toISOString() });
  });
}
function savePartner_(data) {
  require_(data, ["nombre", "especialista_id"]);
  return withLock_(function () {
    assertUniqueName_(SHEET_NAMES.partners, data.nombre, data.id, "aliado");
    return upsert_(SHEET_NAMES.partners, { id: data.id || Utilities.getUuid(), nombre: String(data.nombre).trim(), especialista_id: data.especialista_id, zona: data.zona || "", notas: data.notas || "", activo: true, creado_en: data.creado_en || new Date().toISOString() });
  });
}
function saveEvaluation_(data) {
  require_(data, ["aliado_id", "periodo"]);
  if (!/^Q[1-4]$/.test(data.periodo)) throw new Error("El periodo debe ser Q1, Q2, Q3 o Q4.");
  const values = {
    aliado_id: data.aliado_id, periodo: data.periodo,
    resultado_ventas: nonNegative_(data.resultado_ventas), demos_pequenas: nonNegative_(data.demos_pequenas),
    demos_grandes: nonNegative_(data.demos_grandes), certificados_dji: nonNegative_(data.certificados_dji),
    monto_equipos: nonNegative_(data.monto_equipos), monto_refacciones: nonNegative_(data.monto_refacciones),
    cartas_firmadas: nonNegative_(data.cartas_firmadas), rebate_aplicado: nonNegative_(data.rebate_aplicado),
    justificacion: String(data.justificacion || "").trim(), certificacion_dji_obligatoria: false,
    actualizado_en: new Date().toISOString(),
  };
  const compliance = calculateCompliance_(values);
  ["sales", "demos", "parts", "pilots", "information"].forEach((key) => values[key] = compliance[key]);
  values.rebate_calculado = compliance.tier.rebate;
  values.diferencia = values.rebate_aplicado - values.rebate_calculado;
  return upsert_(SHEET_NAMES.evaluations, values, ["aliado_id", "periodo"]);
}
function calculateCompliance_(values) {
  const metas = parameterMap_(values.aliado_id, values.periodo);
  const target = (key) => number_(metas[key]) || number_(DEFAULT_PARAMETERS.find((item) => item[0] === key)[2]);
  const percent = (actual, goal) => goal > 0 ? Math.min(100, (number_(actual) / goal) * 100) : 0;
  const sales = percent(values.resultado_ventas, target("ventas_equipos"));
  const small = percent(values.demos_pequenas, target("demos_pequenas"));
  const large = percent(values.demos_grandes, target("demos_grandes"));
  const expectedParts = number_(values.monto_equipos) * target("porcentaje_refacciones") / 100;
  const parts = percent(values.monto_refacciones, expectedParts);
  const pilots = percent(values.certificados_dji, target("certificados_dji"));
  const information = percent(values.cartas_firmadas, target("cartas_firmadas"));
  const policy = getData_().policy;
  const score = ["sales", "demos", "parts", "pilots", "information"].reduce((sum, key) => sum + ((key === "demos" ? Math.min(small, large) : { sales, parts, pilots, information }[key]) >= 100 ? number_(policy[key].weight) : 0), 0);
  const tier = policy.tiers.find((item) => score >= item.min) || policy.tiers[policy.tiers.length - 1] || { name: "C", rebate: 0 };
  return { sales, demos: Math.min(small, large), parts, pilots, information, score, tier };
}
function parameterMap_(partnerId, period) {
  return rows_(SHEET_NAMES.parameters).filter((row) => row.activo !== "false" && row.aliado_id === partnerId && row.periodo === period).reduce((all, row) => ((all[row.clave] = row.meta), all), {});
}
function archivePartner_(id) { const partner = byId_(SHEET_NAMES.partners, id); if (!partner) throw new Error("Aliado no encontrado."); return upsert_(SHEET_NAMES.partners, { ...partner, activo: false }); }
function archiveSpecialist_(id) {
  if (rows_(SHEET_NAMES.partners).some((partner) => partner.especialista_id === id && partner.activo !== "false")) throw new Error("Reasigne los aliados antes de eliminar al especialista.");
  const person = byId_(SHEET_NAMES.specialists, id); if (!person) throw new Error("Especialista no encontrado."); return upsert_(SHEET_NAMES.specialists, { ...person, activo: false });
}
function getPartnerSummary(partnerId, period) {
  const data = getData_(); const partner = data.partners.find((item) => item.id === partnerId);
  if (!partner) throw new Error("Aliado no encontrado.");
  const compliance = calculateCompliance_({ aliado_id: partnerId, periodo: period, ...(partner.quarters[period] || {}) });
  return { partner, period, score: compliance.score, tier: compliance.tier, indicators: ["sales", "demos", "parts", "pilots", "information"].map((key) => ({ key, ...data.policy[key], value: compliance[key] })) };
}
function ensureSheet_(spreadsheet, name, headers) { const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name); if (sheet.getLastRow() === 0) { sheet.appendRow(headers); sheet.setFrozenRows(1); } ensureHeaders_(sheet, headers); sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight("bold"); return sheet; }
function ensureHeaders_(sheet, headers) { const current = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0]; const missing = headers.filter((header) => current.indexOf(header) === -1); if (missing.length) sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]); }
function assertUniqueName_(sheetName, name, id, label) { const normalized = String(name).trim().toUpperCase(); if (rows_(sheetName).some((row) => row.activo !== "false" && row.id !== id && String(row.nombre).trim().toUpperCase() === normalized)) throw new Error(`Ya existe un ${label} activo con ese nombre.`); }
function withLock_(callback) { const lock = LockService.getScriptLock(); lock.waitLock(10000); try { return callback(); } finally { lock.releaseLock(); } }
function sheet_(name) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw new Error(`No existe la hoja ${name}. Ejecute setup().`); return sheet; }
function rows_(name) { const sheet = sheet_(name); if (sheet.getLastRow() < 2) return []; const values = sheet.getDataRange().getDisplayValues(); const headers = values.shift(); return values.filter((row) => row.some(Boolean)).map((row) => headers.reduce((object, header, index) => ((object[header] = row[index]), object), {})); }
function byId_(name, id) { return rows_(name).find((row) => row.id === id); }
function upsert_(name, value, keys) { const sheet = sheet_(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; const lookupKeys = keys || ["id"]; const index = sheet.getDataRange().getValues().slice(1).findIndex((row) => lookupKeys.every((key) => String(row[headers.indexOf(key)]) === String(value[key]))); const output = headers.map((header) => value[header] === undefined ? "" : value[header]); if (index < 0) sheet.appendRow(output); else sheet.getRange(index + 2, 1, 1, output.length).setValues([output]); return value; }
function number_(value) { return Number(String(value).replace(/[^0-9.-]/g, "")) || 0; }
function nonNegative_(value) { return Math.max(0, number_(value)); }
function require_(data, fields) { fields.forEach((field) => { if (data[field] === undefined || data[field] === null || data[field] === "") throw new Error(`El campo ${field} es obligatorio.`); }); }
function response_(payload, event) { const callback = event && event.parameter && event.parameter.callback; const content = callback ? `${callback}(${JSON.stringify(payload)})` : JSON.stringify(payload); return ContentService.createTextOutput(content).setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON); }
