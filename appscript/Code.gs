/**
 * DICOL — API de rebates para Google Sheets.
 *
 * INSTALACIÓN
 * 1. Cree o abra la hoja de cálculo que será la base de datos de rebates.
 * 2. Abra Extensiones > Apps Script, pegue este archivo y guarde.
 * 3. Ejecute setup() una vez y autorice el acceso.
 * 4. Implemente como Aplicación web. Ejecute como usted y limite el acceso a
 *    los usuarios de DICOL. Copie la URL /exec para conectarla al frontend.
 *
 * La hoja no aprueba pagos: calcula seguimiento. Antes de liquidar un rebate
 * deben validarse la política vigente, documentos soporte y condiciones comerciales.
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
  partners: [
    "id",
    "nombre",
    "especialista_id",
    "zona",
    "notas",
    "activo",
    "creado_en",
  ],
  evaluations: [
    "aliado_id",
    "periodo",
    "resultado_ventas",
    "rebate_calculado",
    "rebate_aplicado",
    "diferencia",
    "justificacion",
    "sales",
    "demos",
    "parts",
    "pilots",
    "information",
    "demos_pequenas",
    "demos_grandes",
    "certificados_dji",
    "certificacion_dji_obligatoria",
    "monto_equipos",
    "monto_refacciones",
    "cartas_firmadas",
    "actualizado_en",
  ],
  policy: ["tipo", "clave", "nombre", "valor", "meta"],
  parameters: ["id", "aliado_id", "periodo", "clave", "nombre", "meta", "unidad", "activo"],
};
const DEFAULT_PARAMETERS = [
  ["ventas_equipos", "Meta de compra de equipos", 1, "unidades"],
  ["demos_pequenas", "Demostraciones pequeñas", 3, "unidades"],
  ["demos_grandes", "Demostraciones grandes", 1, "unidades"],
  ["porcentaje_refacciones", "Refacciones sobre monto de equipos", 8, "%"],
  ["certificados_dji", "Pilotos certificados DJI Academy", 1, "certificados"],
  ["cartas_firmadas", "Cartas firmadas", 1, "cartas"],
];
const DEFAULT_POLICY = [
  ["indicador", "sales", "PSI / ventas", 50, 100],
  ["indicador", "demos", "Demostraciones", 20, 100],
  ["indicador", "parts", "Repuestos", 10, 100],
  ["indicador", "pilots", "Pilotos certificados", 10, 100],
  ["indicador", "information", "Información y soportes", 10, 100],
  ["nivel", "A", "Nivel A", 5, 80],
  ["nivel", "B", "Nivel B", 3, 60],
  ["nivel", "C", "Nivel C", 0, 0],
];

function setup() {
  const spreadsheet = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach((key) =>
    ensureSheet_(spreadsheet, SHEET_NAMES[key], HEADERS[key]),
  );
  const policySheet = spreadsheet.getSheetByName(SHEET_NAMES.policy);
  if (policySheet.getLastRow() === 1)
    policySheet
      .getRange(2, 1, DEFAULT_POLICY.length, 5)
      .setValues(DEFAULT_POLICY);
}
// Ejecute esta función una sola vez solo si desea restaurar los valores del
// boletín 2025 (A 5 %, B 3 %, C 0 %) en una hoja que tenía valores de prueba.
function restorePolicyBoletin2025() {
  const sheet = sheet_(SHEET_NAMES.policy);
  if (sheet.getLastRow() > 1)
    sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.policy.length).clearContent();
  sheet.getRange(2, 1, DEFAULT_POLICY.length, HEADERS.policy.length).setValues(DEFAULT_POLICY);
}
function doGet(event) {
  return response_({ ok: true, data: getData_() }, event);
}
function doPost(event) {
  try {
    return response_(
      {
        ok: true,
        data: dispatch_(JSON.parse(event.postData.contents || "{}")),
      },
      event,
    );
  } catch (error) {
    return response_({ ok: false, error: error.message }, event);
  }
}
function dispatch_(request) {
  const data = request.data || {};
  switch (request.action) {
    case "getData":
      return getData_();
    case "saveSpecialist":
      return saveSpecialist_(data);
    case "savePartner":
      return savePartner_(data);
    case "saveEvaluation":
      return saveEvaluation_(data);
    case "savePolicy":
      return savePolicy_(data);
    case "saveParameters":
      return saveParameters_(data);
    case "deleteParameter":
      return archiveParameter_(request.id);
    case "deletePartner":
      return archivePartner_(request.id);
    case "deleteSpecialist":
      return archiveSpecialist_(request.id);
    default:
      throw new Error("Acción no permitida.");
  }
}
function getData_() {
  const specialists = rows_(SHEET_NAMES.specialists).filter(
    (row) => row.activo !== "false",
  );
  const partners = rows_(SHEET_NAMES.partners).filter(
    (row) => row.activo !== "false",
  );
  const evaluations = rows_(SHEET_NAMES.evaluations);
  const parameters = rows_(SHEET_NAMES.parameters).filter((row) => row.activo !== "false");
  const policy = { tiers: [] };
  rows_(SHEET_NAMES.policy).forEach((row) => {
    if (row.tipo === "nivel")
      policy.tiers.push({
        name: row.clave,
        rebate: number_(row.valor),
        min: number_(row.meta),
      });
    if (row.tipo === "indicador")
      policy[row.clave] = {
        label: row.nombre,
        weight: number_(row.valor),
        target: number_(row.meta),
      };
  });
  policy.tiers.sort((a, b) => b.min - a.min);
  return {
    specialists,
    partners: partners.map((partner) => ({
      ...partner,
      quarters: evaluations
        .filter((item) => item.aliado_id === partner.id)
        .reduce((all, item) => ((all[item.periodo] = item), all), {}),
    })),
    policy,
    parameters,
  };
}
function saveParameters_(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("Agregue al menos un parámetro.");
  return withLock_(function () { return items.map((item) => {
    require_(item, ["aliado_id", "periodo", "clave", "nombre", "meta"]);
    if (!/^Q[1-4]$/.test(item.periodo)) throw new Error("El periodo debe ser Q1, Q2, Q3 o Q4.");
    const key = String(item.clave).trim();
    const current = rows_(SHEET_NAMES.parameters).find((row) => row.aliado_id === item.aliado_id && row.periodo === item.periodo && row.clave === key && row.activo !== "false");
    return upsert_(SHEET_NAMES.parameters, { id: current ? current.id : Utilities.getUuid(), aliado_id: item.aliado_id, periodo: item.periodo, clave: key, nombre: item.nombre, meta: Math.max(0, number_(item.meta)), unidad: item.unidad || "unidades", activo: true });
  }); });
}
function archiveParameter_(id) {
  const item = byId_(SHEET_NAMES.parameters, id);
  if (!item) throw new Error("Parámetro no encontrado.");
  return upsert_(SHEET_NAMES.parameters, { ...item, activo: false });
}
function saveSpecialist_(data) {
  require_(data, ["nombre"]);
  return withLock_(function () {
    assertUniqueName_(SHEET_NAMES.specialists, data.nombre, data.id, "especialista");
    return upsert_(SHEET_NAMES.specialists, {
      id: data.id || Utilities.getUuid(), nombre: data.nombre, zona: data.zona || "",
      activo: true, creado_en: data.creado_en || new Date().toISOString(),
    });
  });
}
function savePartner_(data) {
  require_(data, ["nombre", "especialista_id"]);
  return withLock_(function () {
    assertUniqueName_(SHEET_NAMES.partners, data.nombre, data.id, "aliado");
    return upsert_(SHEET_NAMES.partners, {
      id: data.id || Utilities.getUuid(), nombre: data.nombre,
      especialista_id: data.especialista_id, zona: data.zona || "", notas: data.notas || "",
      activo: true, creado_en: data.creado_en || new Date().toISOString(),
    });
  });
}
function saveEvaluation_(data) {
  require_(data, ["aliado_id", "periodo"]);
  if (!/^Q[1-4]$/.test(data.periodo))
    throw new Error("El periodo debe ser Q1, Q2, Q3 o Q4.");
  const values = {
    aliado_id: data.aliado_id,
    periodo: data.periodo,
    actualizado_en: new Date().toISOString(),
  };
  values.resultado_ventas = Math.max(0, number_(data.resultado_ventas));
  values.rebate_calculado = Math.max(0, number_(data.rebate_calculado));
  values.rebate_aplicado = Math.max(0, number_(data.rebate_aplicado));
  values.diferencia = values.rebate_aplicado - values.rebate_calculado;
  values.justificacion = String(data.justificacion || "").trim();
  ["sales", "demos", "parts", "pilots", "information"].forEach(
    (key) => (values[key] = Math.max(0, Math.min(100, number_(data[key])))),
  );
  values.demos_pequenas = Math.max(0, number_(data.demos_pequenas));
  values.demos_grandes = Math.max(0, number_(data.demos_grandes));
  values.certificados_dji = Math.max(0, number_(data.certificados_dji));
  values.certificacion_dji_obligatoria = String(data.certificacion_dji_obligatoria) === "true";
  values.monto_equipos = Math.max(0, number_(data.monto_equipos));
  values.monto_refacciones = Math.max(0, number_(data.monto_refacciones));
  values.cartas_firmadas = Math.max(0, number_(data.cartas_firmadas));
  return upsert_(SHEET_NAMES.evaluations, values, ["aliado_id", "periodo"]);
}
function savePolicy_(items) {
  if (!Array.isArray(items) || !items.length)
    throw new Error("La política no contiene indicadores.");
  const sheet = sheet_(SHEET_NAMES.policy);
  if (sheet.getLastRow() > 1)
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, HEADERS.policy.length)
      .clearContent();
  sheet
    .getRange(2, 1, items.length, 5)
    .setValues(
      items.map((item) => [
        item.type,
        item.key,
        item.label,
        number_(item.value),
        number_(item.target),
      ]),
    );
  return getData_().policy;
}
function archivePartner_(id) {
  const partner = byId_(SHEET_NAMES.partners, id);
  if (!partner) throw new Error("Aliado no encontrado.");
  return upsert_(SHEET_NAMES.partners, { ...partner, activo: false });
}
function archiveSpecialist_(id) {
  if (
    rows_(SHEET_NAMES.partners).some(
      (partner) => partner.especialista_id === id && partner.activo !== "false",
    )
  )
    throw new Error("Reasigne los aliados antes de eliminar al especialista.");
  const person = byId_(SHEET_NAMES.specialists, id);
  if (!person) throw new Error("Especialista no encontrado.");
  return upsert_(SHEET_NAMES.specialists, { ...person, activo: false });
}
function getPartnerSummary(partnerId, period) {
  const data = getData_();
  const partner = data.partners.find((item) => item.id === partnerId);
  if (!partner) throw new Error("Aliado no encontrado.");
  const values = partner.quarters[period] || {};
  const rules = Object.keys(data.policy).filter((key) => key !== "tiers");
  const score = Math.round(
    rules.reduce(
      (sum, key) =>
        sum +
        (Math.min(100, number_(values[key])) * data.policy[key].weight) / 100,
      0,
    ),
  );
  const tier =
    data.policy.tiers.find((item) => score >= item.min) ||
    data.policy.tiers[data.policy.tiers.length - 1];
  return {
    partner,
    period,
    score,
    tier,
    indicators: rules.map((key) => ({
      key,
      ...data.policy[key],
      value: number_(values[key]),
    })),
  };
}
function ensureSheet_(spreadsheet, name, headers) {
  const sheet =
    spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  ensureHeaders_(sheet, headers);
  return sheet;
}
function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const missing = headers.filter((header) => current.indexOf(header) === -1);
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, 1, 1, current.length + missing.length).setFontWeight("bold");
  }
}
function assertUniqueName_(sheetName, name, id, label) {
  const normalized = String(name).trim().toUpperCase();
  const exists = rows_(sheetName).some(
    (row) => row.activo !== "false" && row.id !== id && String(row.nombre).trim().toUpperCase() === normalized,
  );
  if (exists) throw new Error(`Ya existe un ${label} activo con ese nombre.`);
}
function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return callback(); } finally { lock.releaseLock(); }
}
function sheet_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error(`No existe la hoja ${name}. Ejecute setup().`);
  return sheet;
}
function rows_(name) {
  const sheet = sheet_(name);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift();
  return values
    .filter((row) => row.some(Boolean))
    .map((row) =>
      headers.reduce(
        (object, header, index) => ((object[header] = row[index]), object),
        {},
      ),
    );
}
function byId_(name, id) {
  return rows_(name).find((row) => row.id === id);
}
function upsert_(name, value, keys) {
  const sheet = sheet_(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lookupKeys = keys || ["id"];
  const values = sheet.getDataRange().getValues();
  const index = values
    .slice(1)
    .findIndex((row) =>
      lookupKeys.every(
        (key) => String(row[headers.indexOf(key)]) === String(value[key]),
      ),
    );
  const output = headers.map((header) =>
    value[header] === undefined ? "" : value[header],
  );
  if (index < 0) sheet.appendRow(output);
  else sheet.getRange(index + 2, 1, 1, output.length).setValues([output]);
  return value;
}
function number_(value) {
  return Number(value) || 0;
}
function require_(data, fields) {
  fields.forEach((field) => {
    if (!data[field]) throw new Error(`El campo ${field} es obligatorio.`);
  });
}
function response_(payload, event) {
  const callback = event && event.parameter && event.parameter.callback;
  const content = callback
    ? `${callback}(${JSON.stringify(payload)})`
    : JSON.stringify(payload);
  return ContentService.createTextOutput(content).setMimeType(
    callback
      ? ContentService.MimeType.JAVASCRIPT
      : ContentService.MimeType.JSON,
  );
}
