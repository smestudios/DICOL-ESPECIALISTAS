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
  prices: "Precios",
  kits: "Kits",
  sales: "Ventas",
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
    "actualizado_en",
  ],
  policy: ["tipo", "clave", "nombre", "valor", "meta"],
  prices: ["id", "descripcion", "categoria", "modelo", "precio_final_iva", "precio_final_sin_iva", "margen_base", "precio_aliado_iva", "precio_aliado_sin_iva", "activo"],
  kits: ["id", "nombre", "modelo", "componentes", "precio_final_iva", "precio_final_sin_iva", "margen_base", "precio_aliado_iva", "precio_aliado_sin_iva", "activo"],
  sales: ["id", "aliado_id", "periodo", "fecha", "item_id", "tipo", "modelo", "cantidad", "precio_unitario_iva", "total_iva", "creado_en"],
  parameters: ["id", "periodo", "clave", "nombre", "meta", "unidad", "obligatorio", "activo"],
};
const DEFAULT_PARAMETERS = [
  ["Q1", "ventas_equipos", "Ventas de equipos / kits", 1, "unidades", true],
  ["Q1", "demos_pequenas", "Demostraciones pequeñas", 3, "eventos", true],
  ["Q1", "demos_grandes", "Demostraciones grandes", 1, "eventos", true],
  ["Q1", "certificados_dji", "Certificaciones DJI Academy", 1, "personas", false],
  ["Q1", "porcentaje_refacciones", "Compra de refacciones sobre equipos", 8, "%", true],
];
const DEFAULT_POLICY = [
  ["indicador", "sales", "PSI / ventas", 50, 100],
  ["indicador", "demos", "Demostraciones", 20, 100],
  ["indicador", "parts", "Repuestos", 10, 100],
  ["indicador", "pilots", "Pilotos certificados", 10, 100],
  ["indicador", "information", "Información y soportes", 10, 100],
  ["nivel", "A", "Nivel A", 10, 80],
  ["nivel", "B", "Nivel B", 5, 60],
  ["nivel", "C", "Nivel C", 3, 0],
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
  const parameterSheet = spreadsheet.getSheetByName(SHEET_NAMES.parameters);
  if (parameterSheet.getLastRow() === 1) {
    const rows = ["Q1", "Q2", "Q3", "Q4"].flatMap((period) =>
      DEFAULT_PARAMETERS.map((item) => [Utilities.getUuid(), period, ...item.slice(1), true]),
    );
    parameterSheet.getRange(2, 1, rows.length, HEADERS.parameters.length).setValues(rows);
  }
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
    case "saveSale":
      return saveSale_(data);
    case "savePrice":
      return savePrice_(data);
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
  const prices = rows_(SHEET_NAMES.prices)
    .filter((row) => row.activo !== "false")
    .map((row) => ({
      ...row,
      // Conserva los catálogos creados antes del cambio de encabezados.
      precio_final_iva: row.precio_final_iva || row.msrp_iva || "",
      precio_final_sin_iva: row.precio_final_sin_iva || row.msrp_sin_iva || "",
    }));
  const kits = rows_(SHEET_NAMES.kits).filter((row) => row.activo !== "false");
  const sales = rows_(SHEET_NAMES.sales);
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
    prices,
    kits,
    sales,
    parameters,
  };
}
function saveParameters_(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("Agregue al menos un parámetro.");
  return items.map((item) => {
    require_(item, ["periodo", "clave", "nombre", "meta"]);
    if (!/^Q[1-4]$/.test(item.periodo)) throw new Error("El periodo debe ser Q1, Q2, Q3 o Q4.");
    return upsert_(SHEET_NAMES.parameters, { id: item.id || Utilities.getUuid(), periodo: item.periodo, clave: item.clave, nombre: item.nombre, meta: Math.max(0, number_(item.meta)), unidad: item.unidad || "unidades", obligatorio: String(item.obligatorio) !== "false", activo: true });
  });
}
function archiveParameter_(id) {
  const item = byId_(SHEET_NAMES.parameters, id);
  if (!item) throw new Error("Parámetro no encontrado.");
  return upsert_(SHEET_NAMES.parameters, { ...item, activo: false });
}
function saveSale_(data) {
  require_(data, ["aliado_id", "periodo", "item_id", "cantidad"]);
  if (!/^Q[1-4]$/.test(data.periodo)) throw new Error("El periodo debe ser Q1, Q2, Q3 o Q4.");
  const item = rows_(SHEET_NAMES.prices).concat(rows_(SHEET_NAMES.kits)).find((row) => row.id === data.item_id && row.activo !== "false");
  if (!item) throw new Error("El producto o kit seleccionado no existe o está inactivo.");
  const quantity = number_(data.cantidad);
  if (quantity <= 0) throw new Error("La cantidad debe ser mayor que cero.");
  const unitPrice = number_(item.precio_aliado_iva);
  return upsert_(SHEET_NAMES.sales, {
    id: data.id || Utilities.getUuid(), aliado_id: data.aliado_id, periodo: data.periodo,
    fecha: data.fecha || new Date().toISOString().slice(0, 10), item_id: item.id,
    tipo: item.categoria || "kit", modelo: item.modelo || item.nombre, cantidad: quantity,
    precio_unitario_iva: unitPrice, total_iva: quantity * unitPrice, creado_en: new Date().toISOString(),
  });
}
function savePrice_(data) {
  require_(data, ["descripcion", "categoria", "modelo"]);
  const finalWithTax = Math.max(0, number_(data.precio_final_iva));
  const finalWithoutTax = Math.max(0, number_(data.precio_final_sin_iva));
  const partnerWithTax = Math.max(0, number_(data.precio_aliado_iva));
  const partnerWithoutTax = Math.max(0, number_(data.precio_aliado_sin_iva));
  if (!finalWithTax || !partnerWithTax)
    throw new Error("Registre los precios con IVA para cliente final y aliado.");
  const value = {
    id: data.id || Utilities.getUuid(), descripcion: String(data.descripcion).trim(),
    categoria: data.categoria, modelo: String(data.modelo).trim(),
    precio_final_iva: finalWithTax, precio_final_sin_iva: finalWithoutTax,
    margen_base: number_(data.margen_base) || 22, precio_aliado_iva: partnerWithTax,
    precio_aliado_sin_iva: partnerWithoutTax, activo: true,
  };
  if (data.categoria === "kit") return upsert_(SHEET_NAMES.kits, { id: value.id, nombre: value.descripcion, modelo: value.modelo, componentes: String(data.componentes || ""), precio_final_iva: finalWithTax, precio_final_sin_iva: finalWithoutTax, margen_base: value.margen_base, precio_aliado_iva: partnerWithTax, precio_aliado_sin_iva: partnerWithoutTax, activo: true });
  return upsert_(SHEET_NAMES.prices, value);
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
