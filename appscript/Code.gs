/**
 * DICOL — API de seguimiento de rebates en Google Sheets.
 *
 * Ejecute setup() una vez. Las metas se configuran por aliado y trimestre
 * desde la pantalla "Metas del aliado"; setup no crea metas sin aliado.
 *
 * Seguridad: configure FIREBASE_WEB_API_KEY en las propiedades del script con
 * configureFirebaseApiKey('...'). Los roles llegan como custom claims firmados
 * por Firebase; nunca se aceptan desde el navegador.
 */
const SHEET_NAMES = {
  specialists: "Especialistas",
  partners: "Aliados",
  evaluations: "Evaluaciones",
  policy: "Politica",
  parameters: "Parametros",
  rebateCredits: "RebateCreditos",
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
  rebateCredits: ["id", "aliado_id", "periodo_origen", "rebate_pct", "equipos_ganados", "equipos_aplicados", "saldo_equipos", "periodo_aplicacion", "creado_en", "actualizado_en"],
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
// Cache de una sola ejecución: evita volver a leer una pestaña en la misma
// solicitud, sin conservar datos entre usuarios ni entre escrituras.
const REQUEST_ROWS = {};

function setup() {
  const spreadsheet = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach((key) => ensureSheet_(spreadsheet, SHEET_NAMES[key], HEADERS[key]));
  restorePolicyBoletin2025();
}

// Ejecute una sola vez al pasar del formato antiguo Q1…Q4 al formato 2026-Q1.
// El año es obligatorio para no atribuir silenciosamente históricos al año equivocado.
function migrateLegacyPeriods(year) {
  if (!/^\d{4}$/.test(String(year))) throw new Error("Indique el año de los datos antiguos, por ejemplo 2026.");
  return withLock_(function () {
    return [
      migratePeriodColumn_(SHEET_NAMES.evaluations, "periodo", year),
      migratePeriodColumn_(SHEET_NAMES.parameters, "periodo", year),
      migratePeriodColumn_(SHEET_NAMES.rebateCredits, "periodo_origen", year),
      migratePeriodColumn_(SHEET_NAMES.rebateCredits, "periodo_aplicacion", year),
    ].reduce((sum, count) => sum + count, 0);
  });
}

// Restaura exclusivamente la política oficial: A >= 80 % = 5 %, B >= 60 % = 3 %, C = 0 %.
function restorePolicyBoletin2025() {
  const sheet = sheet_(SHEET_NAMES.policy);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.policy.length).clearContent();
  sheet.getRange(2, 1, DEFAULT_POLICY.length, HEADERS.policy.length).setValues(DEFAULT_POLICY);
}

function doGet(event) { return response_({ ok: false, error: "Use POST autenticado." }, event); }
function doPost(event) {
  try { return response_({ ok: true, data: dispatch_(JSON.parse(event.postData.contents || "{}")) }, event); }
  catch (error) { return response_({ ok: false, error: error.message }, event); }
}
function configureFirebaseApiKey(apiKey) {
  if (!apiKey) throw new Error("Indique la API key web de Firebase.");
  PropertiesService.getScriptProperties().setProperty("FIREBASE_WEB_API_KEY", String(apiKey));
}
function dispatch_(request) {
  Object.keys(REQUEST_ROWS).forEach((name) => delete REQUEST_ROWS[name]);
  const data = request.data || {};
  const session = firebaseSession_(request.idToken);
  assertSpecialistLink_(session);
  switch (request.action) {
    case "getData": return getData_(session);
    case "saveSpecialist": requireAdmin_(session); return saveSpecialist_(data);
    case "savePartner": return savePartnerAuthorized_(data, session);
    case "saveParameters": return saveParametersAuthorized_(data, session);
    case "deletePartner": authorizePartner_(session, request.id); return archivePartner_(request.id);
    case "applyRebateCredits": authorizePartner_(session, data.aliado_id); return applyRebateCredits_(data);
    case "deleteSpecialist": requireAdmin_(session); return archiveSpecialist_(request.id);
    case "saveEvaluation": authorizeEvaluation_(session, data.aliado_id); return saveEvaluation_(data, session);
    default: throw new Error("Acción no permitida.");
  }
}
function firebaseSession_(idToken) {
  if (!idToken) throw new Error("Sesión de Firebase requerida.");
  const apiKey = PropertiesService.getScriptProperties().getProperty("FIREBASE_WEB_API_KEY");
  if (!apiKey) throw new Error("Falta configurar FIREBASE_WEB_API_KEY en Apps Script.");
  const response = UrlFetchApp.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "post", contentType: "application/json", payload: JSON.stringify({ idToken }), muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error("No fue posible validar la sesión de Firebase.");
  const user = JSON.parse(response.getContentText()).users && JSON.parse(response.getContentText()).users[0];
  if (!user || user.disabled) throw new Error("La cuenta no está disponible.");
  const claims = user.customAttributes ? JSON.parse(user.customAttributes) : {};
  if (!["admin", "specialist"].includes(claims.role)) throw new Error("Tu cuenta no tiene un rol autorizado.");
  return { uid: user.localId, email: user.email || "", role: claims.role, specialistId: claims.specialistId || "" };
}
function requireAdmin_(session) { if (session.role !== "admin") throw new Error("Esta acción requiere un perfil administrador."); }
// La cartera depende de este vínculo firmado: nunca se toma el especialista desde el navegador.
function assertSpecialistLink_(session) {
  if (session.role !== "specialist") return;
  if (!session.specialistId) throw new Error("Tu usuario Firebase no está vinculado a un especialista de Google Sheets.");
  const linked = rows_(SHEET_NAMES.specialists).find((row) => row.id === session.specialistId && row.activo !== "false");
  if (!linked) throw new Error("El ID de especialista de tu usuario Firebase no existe o está inactivo en Google Sheets.");
}
function authorizePartner_(session, partnerId) {
  if (session.role === "admin") return;
  const partner = byId_(SHEET_NAMES.partners, partnerId);
  if (!partner || partner.activo === "false" || partner.especialista_id !== session.specialistId) throw new Error("No puedes gestionar este aliado.");
}
function authorizeEvaluation_(session, partnerId) { authorizePartner_(session, partnerId); }
function savePartnerAuthorized_(data, session) {
  if (session.role === "admin") return savePartner_(data);
  // El navegador genera un ID antes de guardar un aliado nuevo. Sólo se debe
  // comprobar la pertenencia cuando ese ID ya existe; de lo contrario se
  // bloquearía erróneamente la creación con "No puedes gestionar este aliado".
  const existing = data.id && byId_(SHEET_NAMES.partners, data.id);
  if (existing) authorizePartner_(session, existing.id);
  // El especialista sólo puede crear aliados dentro de su propia cartera.
  return savePartner_({ ...data, especialista_id: session.specialistId });
}
function saveParametersAuthorized_(items, session) {
  if (!Array.isArray(items) || !items.length) throw new Error("Agregue las metas del aliado.");
  items.forEach((item) => authorizePartner_(session, item.aliado_id));
  return saveParameters_(items);
}
function getData_(session) {
  const allSpecialists = rows_(SHEET_NAMES.specialists).filter((row) => row.activo !== "false");
  const allPartners = rows_(SHEET_NAMES.partners).filter((row) => row.activo !== "false");
  const specialists = session.role === "admin" ? allSpecialists : allSpecialists.filter((row) => row.id === session.specialistId);
  const partners = session.role === "admin" ? allPartners : allPartners.filter((row) => row.especialista_id === session.specialistId);
  const evaluations = rows_(SHEET_NAMES.evaluations);
  const parameters = rows_(SHEET_NAMES.parameters).filter((row) => row.activo !== "false" && partners.some((partner) => partner.id === row.aliado_id));
  const policy = policy_();
  const rebateCredits = rows_(SHEET_NAMES.rebateCredits).filter((row) => partners.some((partner) => partner.id === row.aliado_id));
  return {
    // El cliente necesita saber qué perfil autenticado está viendo la cartera
    // para preasignar aliados. No se usa como fuente de autorización: cada
    // escritura vuelve a validar la sesión y savePartnerAuthorized_ impone el ID.
    viewer: { role: session.role, specialistId: session.specialistId },
    specialists,
    partners: partners.map((partner) => ({ ...partner, quarters: evaluations.filter((item) => item.aliado_id === partner.id).reduce((all, item) => ((all[item.periodo] = item), all), {}) })),
    policy,
    parameters,
    rebateCredits,
  };
}
function policy_() {
  const policy = { tiers: [] };
  rows_(SHEET_NAMES.policy).forEach((row) => {
    if (row.tipo === "nivel") policy.tiers.push({ name: row.clave, rebate: number_(row.valor), min: number_(row.meta) });
    if (row.tipo === "indicador") policy[row.clave] = { label: row.nombre, weight: number_(row.valor), target: number_(row.meta) };
  });
  policy.tiers.sort((a, b) => b.min - a.min);
  return policy;
}
function saveParameters_(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("Agregue las metas del aliado.");
  return withLock_(function () {
    return items.map((item) => {
      require_(item, ["aliado_id", "periodo", "clave", "nombre", "meta"]);
      if (!isPeriod_(item.periodo)) throw new Error("El periodo debe tener el formato AAAA-Q1, por ejemplo 2026-Q3.");
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
function saveEvaluation_(data, session) {
  require_(data, ["aliado_id", "periodo"]);
  if (!isPeriod_(data.periodo)) throw new Error("El periodo debe tener el formato AAAA-Q1, por ejemplo 2026-Q3.");
  return withLock_(function () {
    const values = {
      aliado_id: data.aliado_id, periodo: data.periodo,
      resultado_ventas: nonNegative_(data.resultado_ventas), demos_pequenas: nonNegative_(data.demos_pequenas),
      demos_grandes: nonNegative_(data.demos_grandes), certificados_dji: nonNegative_(data.certificados_dji),
      monto_equipos: nonNegative_(data.monto_equipos), monto_refacciones: nonNegative_(data.monto_refacciones),
      // El especialista puede actualizar toda la evaluación de los aliados de
      // su cartera; authorizeEvaluation_ ya comprobó que el aliado es suyo.
      cartas_firmadas: nonNegative_(data.cartas_firmadas), rebate_aplicado: nonNegative_(data.rebate_aplicado),
      justificacion: String(data.justificacion || "").trim(), certificacion_dji_obligatoria: false,
      actualizado_en: new Date().toISOString(),
    };
    const compliance = calculateCompliance_(values);
    ["sales", "demos", "parts", "pilots", "information"].forEach((key) => values[key] = compliance[key]);
    values.rebate_calculado = compliance.tier.rebate;
    values.diferencia = values.rebate_aplicado - values.rebate_calculado;
    // Valide primero que el crédito ya utilizado sigue cubierto antes de escribir la evaluación.
    syncEarnedCredit_(values);
    return upsert_(SHEET_NAMES.evaluations, values, ["aliado_id", "periodo"]);
  });
}
function syncEarnedCredit_(values) {
  const earnedUnits = values.rebate_calculado > 0 ? nonNegative_(values.resultado_ventas) : 0;
  const existing = rows_(SHEET_NAMES.rebateCredits).find((row) => row.aliado_id === values.aliado_id && row.periodo_origen === values.periodo && !row.periodo_aplicacion);
  const applied = existing ? nonNegative_(existing.equipos_aplicados) : 0;
  if (earnedUnits < applied) throw new Error("No puede reducir los equipos ganados: ya hay rebate aplicado de este trimestre.");
  return upsert_(SHEET_NAMES.rebateCredits, {
    id: existing ? existing.id : Utilities.getUuid(), aliado_id: values.aliado_id,
    periodo_origen: values.periodo, rebate_pct: values.rebate_calculado,
    equipos_ganados: earnedUnits, equipos_aplicados: applied, saldo_equipos: earnedUnits - applied,
    periodo_aplicacion: "", creado_en: existing ? existing.creado_en : new Date().toISOString(), actualizado_en: new Date().toISOString(),
  });
}
function applyRebateCredits_(data) {
  require_(data, ["aliado_id", "periodo", "aplicaciones"]);
  if (!isPeriod_(data.periodo)) throw new Error("El periodo debe tener el formato AAAA-Q1, por ejemplo 2026-Q3.");
  if (!Array.isArray(data.aplicaciones) || !data.aplicaciones.length) throw new Error("Seleccione al menos un rebate acumulado para aplicar.");
  const requestedByRate = data.aplicaciones.reduce((all, item) => {
    const rate = number_(item.rebate_pct);
    const units = nonNegative_(item.equipos);
    if (units && !Number.isInteger(units)) throw new Error("Los rebates se aplican en equipos completos.");
    if (units) all[rate] = (all[rate] || 0) + units;
    return all;
  }, {});
  if (!Object.keys(requestedByRate).length) throw new Error("Indique cuántos rebates desea aplicar.");
  return withLock_(function () {
    const credits = rows_(SHEET_NAMES.rebateCredits).filter((row) => row.aliado_id === data.aliado_id && !row.periodo_aplicacion && number_(row.saldo_equipos) > 0 && periodIndex_(row.periodo_origen) < periodIndex_(data.periodo)).sort((a, b) => periodIndex_(a.periodo_origen) - periodIndex_(b.periodo_origen));
    const availableByRate = credits.reduce((all, credit) => {
      const rate = number_(credit.rebate_pct);
      all[rate] = (all[rate] || 0) + number_(credit.saldo_equipos);
      return all;
    }, {});
    Object.keys(requestedByRate).forEach((rate) => {
      if (requestedByRate[rate] > (availableByRate[rate] || 0)) throw new Error(`Sólo hay ${availableByRate[rate] || 0} rebate(s) acumulado(s) al ${rate}% disponibles.`);
    });
    const applications = [];
    Object.keys(requestedByRate).forEach((rate) => {
      let remaining = requestedByRate[rate];
      credits.filter((credit) => number_(credit.rebate_pct) === number_(rate)).forEach((credit) => {
        if (!remaining) return;
        const applied = Math.min(remaining, number_(credit.saldo_equipos));
        const usage = { id: Utilities.getUuid(), aliado_id: credit.aliado_id, periodo_origen: credit.periodo_origen, rebate_pct: credit.rebate_pct, equipos_ganados: 0, equipos_aplicados: applied, saldo_equipos: 0, periodo_aplicacion: data.periodo, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() };
        upsert_(SHEET_NAMES.rebateCredits, usage);
        upsert_(SHEET_NAMES.rebateCredits, { ...credit, equipos_aplicados: number_(credit.equipos_aplicados) + applied, saldo_equipos: number_(credit.saldo_equipos) - applied, actualizado_en: new Date().toISOString() });
        applications.push(usage);
        remaining -= applied;
      });
    });
    return applications;
  });
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
  const policy = policy_();
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
function ensureSheet_(spreadsheet, name, headers) { const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name); if (sheet.getLastRow() === 0) { sheet.appendRow(headers); sheet.setFrozenRows(1); } ensureHeaders_(sheet, headers); sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight("bold"); delete REQUEST_ROWS[name]; return sheet; }
function ensureHeaders_(sheet, headers) { const current = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0]; const missing = headers.filter((header) => current.indexOf(header) === -1); if (missing.length) sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]); }
function migratePeriodColumn_(sheetName, column, year) {
  const sheet = sheet_(sheetName);
  if (sheet.getLastRow() < 2) return 0;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const columnIndex = headers.indexOf(column);
  if (columnIndex < 0) throw new Error(`No existe la columna ${column} en ${sheetName}.`);
  const range = sheet.getRange(2, columnIndex + 1, sheet.getLastRow() - 1, 1);
  const values = range.getValues();
  let migrated = 0;
  const output = values.map(([value]) => {
    if (/^Q[1-4]$/.test(String(value))) { migrated += 1; return [`${year}-${value}`]; }
    return [value];
  });
  if (migrated) range.setValues(output);
  delete REQUEST_ROWS[sheetName];
  return migrated;
}
function assertUniqueName_(sheetName, name, id, label) { const normalized = String(name).trim().toUpperCase(); if (rows_(sheetName).some((row) => row.activo !== "false" && row.id !== id && String(row.nombre).trim().toUpperCase() === normalized)) throw new Error(`Ya existe un ${label} activo con ese nombre.`); }
function withLock_(callback) { const lock = LockService.getScriptLock(); lock.waitLock(10000); try { return callback(); } finally { lock.releaseLock(); } }
function sheet_(name) { const sheet = SpreadsheetApp.getActive().getSheetByName(name); if (!sheet) throw new Error(`No existe la hoja ${name}. Ejecute setup().`); return sheet; }
function rows_(name) {
  if (REQUEST_ROWS[name]) return REQUEST_ROWS[name];
  const sheet = sheet_(name);
  if (sheet.getLastRow() < 2) return REQUEST_ROWS[name] = [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift();
  return REQUEST_ROWS[name] = values.filter((row) => row.some(Boolean)).map((row) => headers.reduce((object, header, index) => ((object[header] = row[index]), object), {}));
}
function byId_(name, id) { return rows_(name).find((row) => row.id === id); }
function upsert_(name, value, keys) { const sheet = sheet_(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; const lookupKeys = keys || ["id"]; const index = sheet.getDataRange().getValues().slice(1).findIndex((row) => lookupKeys.every((key) => String(row[headers.indexOf(key)]) === String(value[key]))); const output = headers.map((header) => value[header] === undefined ? "" : value[header]); if (index < 0) sheet.appendRow(output); else sheet.getRange(index + 2, 1, 1, output.length).setValues([output]); delete REQUEST_ROWS[name]; return value; }
function number_(value) { return Number(String(value).replace(/[^0-9.-]/g, "")) || 0; }
function nonNegative_(value) { return Math.max(0, number_(value)); }
function isPeriod_(value) { return /^\d{4}-Q[1-4]$/.test(String(value)); }
function periodIndex_(value) { const match = String(value).match(/^(\d{4})-Q([1-4])$/); return match ? Number(match[1]) * 4 + Number(match[2]) : -1; }
function require_(data, fields) { fields.forEach((field) => { if (data[field] === undefined || data[field] === null || data[field] === "") throw new Error(`El campo ${field} es obligatorio.`); }); }
function response_(payload, event) { const callback = event && event.parameter && event.parameter.callback; const content = callback ? `${callback}(${JSON.stringify(payload)})` : JSON.stringify(payload); return ContentService.createTextOutput(content).setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON); }
