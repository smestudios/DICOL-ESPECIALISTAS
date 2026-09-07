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
    "sales",
    "demos",
    "parts",
    "pilots",
    "information",
    "actualizado_en",
  ],
  policy: ["tipo", "clave", "nombre", "valor", "meta"],
};
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
  };
}
function saveSpecialist_(data) {
  require_(data, ["nombre"]);
  return upsert_(SHEET_NAMES.specialists, {
    id: data.id || Utilities.getUuid(),
    nombre: data.nombre,
    zona: data.zona || "",
    activo: true,
    creado_en: data.creado_en || new Date().toISOString(),
  });
}
function savePartner_(data) {
  require_(data, ["nombre", "especialista_id"]);
  return upsert_(SHEET_NAMES.partners, {
    id: data.id || Utilities.getUuid(),
    nombre: data.nombre,
    especialista_id: data.especialista_id,
    zona: data.zona || "",
    notas: data.notas || "",
    activo: true,
    creado_en: data.creado_en || new Date().toISOString(),
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
  ["sales", "demos", "parts", "pilots", "information"].forEach(
    (key) => (values[key] = Math.max(0, Math.min(100, number_(data[key])))),
  );
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
  return sheet;
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
