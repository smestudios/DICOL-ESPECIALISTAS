/**
 * API para la hoja de cálculo de Rebates DICOL.
 * 1. Cree un Google Sheet vacío.
 * 2. Extensiones > Apps Script > pegue este archivo.
 * 3. Ejecute setup() una vez y autorice; después implemente como aplicación web.
 * 4. Configure la URL /exec resultante en el portal antes de habilitar producción.
 */
const SHEETS = { SPECIALISTS: 'Especialistas', PARTNERS: 'Aliados', EVALUATIONS: 'Evaluaciones', POLICY: 'Politica' };
const DEFAULT_POLICY = [
  ['indicador', 'nombre', 'peso', 'meta'],
  ['sales', 'PSI / ventas', 50, 100], ['demos', 'Demostraciones', 20, 100],
  ['parts', 'Repuestos', 10, 100], ['pilots', 'Pilotos certificados', 10, 100], ['information', 'Información y soportes', 10, 100],
  ['tier', 'A', 5, 80], ['tier', 'B', 3, 60], ['tier', 'C', 0, 0]
];
function doGet(e) { return json_({ ok: true, data: getData_() }); }
function doPost(e) {
  try { const request = JSON.parse(e.postData.contents || '{}'); const result = route_(request); return json_({ ok: true, data: result }); }
  catch (error) { return json_({ ok: false, error: error.message }); }
}
function setup() {
  const ss = SpreadsheetApp.getActive();
  createSheet_(ss, SHEETS.SPECIALISTS, ['id', 'nombre', 'zona', 'activo', 'creado_en']);
  createSheet_(ss, SHEETS.PARTNERS, ['id', 'nombre', 'especialista_id', 'zona', 'notas', 'activo', 'creado_en']);
  createSheet_(ss, SHEETS.EVALUATIONS, ['aliado_id', 'periodo', 'sales', 'demos', 'parts', 'pilots', 'information', 'actualizado_en']);
  const policy = createSheet_(ss, SHEETS.POLICY, DEFAULT_POLICY[0]); if (policy.getLastRow() === 1) policy.getRange(2, 1, DEFAULT_POLICY.length - 1, 4).setValues(DEFAULT_POLICY.slice(1));
}
function route_(r) {
  if (r.action === 'getData') return getData_();
  if (r.action === 'saveSpecialist') return saveSpecialist_(r.data);
  if (r.action === 'savePartner') return savePartner_(r.data);
  if (r.action === 'saveEvaluation') return saveEvaluation_(r.data);
  if (r.action === 'setPolicy') return setPolicy_(r.data);
  if (r.action === 'deletePartner') return deletePartner_(r.id);
  throw new Error('Acción no permitida.');
}
function getData_() {
  const specialists = rows_(SHEETS.SPECIALISTS).filter(x => x.activo !== 'false');
  const partners = rows_(SHEETS.PARTNERS).filter(x => x.activo !== 'false'); const evaluations = rows_(SHEETS.EVALUATIONS);
  const policyRows = rows_(SHEETS.POLICY); const policy = { tiers: [] };
  policyRows.forEach(r => r.indicador === 'tier' ? policy.tiers.push({ name:r.nombre, rebate:Number(r.peso), min:Number(r.meta) }) : policy[r.indicador] = { label:r.nombre, weight:Number(r.peso), target:Number(r.meta) });
  return { specialists, partners: partners.map(p => ({ ...p, quarters: evaluations.filter(e => e.aliado_id === p.id).reduce((a,e) => (a[e.periodo] = e, a), {}) })), policy };
}
function saveSpecialist_(d) { validate_(d, ['nombre']); return upsert_(SHEETS.SPECIALISTS, { id:d.id || Utilities.getUuid(), nombre:d.nombre, zona:d.zona || '', activo:true, creado_en:new Date().toISOString() }); }
function savePartner_(d) { validate_(d, ['nombre', 'especialista_id']); return upsert_(SHEETS.PARTNERS, { id:d.id || Utilities.getUuid(), nombre:d.nombre, especialista_id:d.especialista_id, zona:d.zona || '', notas:d.notas || '', activo:true, creado_en:new Date().toISOString() }); }
function saveEvaluation_(d) { validate_(d, ['aliado_id', 'periodo']); const values = { aliado_id:d.aliado_id, periodo:d.periodo, sales:Number(d.sales)||0, demos:Number(d.demos)||0, parts:Number(d.parts)||0, pilots:Number(d.pilots)||0, information:Number(d.information)||0, actualizado_en:new Date().toISOString() }; return upsert_(SHEETS.EVALUATIONS, values, ['aliado_id', 'periodo']); }
function setPolicy_(items) { if (!Array.isArray(items)) throw new Error('Política inválida.'); const sh=SpreadsheetApp.getActive().getSheetByName(SHEETS.POLICY); sh.getRange(2,1,Math.max(0,sh.getLastRow()-1),4).clearContent(); if(items.length) sh.getRange(2,1,items.length,4).setValues(items.map(x=>[x.key,x.label,Number(x.weight),Number(x.target)])); return getData_().policy; }
function deletePartner_(id) { const p=rows_(SHEETS.PARTNERS).find(x=>x.id===id); if(!p) throw new Error('Aliado no encontrado.'); return upsert_(SHEETS.PARTNERS,{...p,activo:false}); }
function rows_(name) { const sh=SpreadsheetApp.getActive().getSheetByName(name); if(!sh || sh.getLastRow()<2)return[]; const [head,...data]=sh.getDataRange().getDisplayValues(); return data.filter(r=>r.some(Boolean)).map(r=>head.reduce((o,h,i)=>(o[h]=r[i],o),{})); }
function upsert_(name, values, keys=['id']) { const sh=SpreadsheetApp.getActive().getSheetByName(name); const head=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; const data=sh.getDataRange().getValues(); const index=data.slice(1).findIndex(row=>keys.every(k=>String(row[head.indexOf(k)])===String(values[k]))); const row=head.map(h=>values[h] ?? ''); if(index<0) sh.appendRow(row); else sh.getRange(index+2,1,1,row.length).setValues([row]); return values; }
function createSheet_(ss,name,headers){const sh=ss.getSheetByName(name)||ss.insertSheet(name);if(sh.getLastRow()===0){sh.appendRow(headers);sh.setFrozenRows(1);sh.getRange(1,1,1,headers.length).setFontWeight('bold');}return sh;}
function validate_(data,fields){fields.forEach(f=>{if(!data[f])throw new Error(`El campo ${f} es obligatorio.`);});}
function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
