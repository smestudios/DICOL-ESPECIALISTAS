const STORAGE_KEY = 'dicol.legalizacion.salidas';
const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const state = {
  expenses: [],
  activeId: null,
  editingId: null,
  supportFiles: new Map(),
  pendingSupport: null,
  previewUrl: '',
};

const elements = {
  expenseModal: document.querySelector('#expenseModal'),
  detailModal: document.querySelector('#detailModal'),
  expenseModalTitle: document.querySelector('#expenseModalTitle'),
  expenseForm: document.querySelector('#expenseForm'),
  expenseName: document.querySelector('#expenseName'),
  expenseOwner: document.querySelector('#expenseOwner'),
  expenseIdentification: document.querySelector('#expenseIdentification'),
  expenseRole: document.querySelector('#expenseRole'),
  expenseCostCenter: document.querySelector('#expenseCostCenter'),
  expenseRoute: document.querySelector('#expenseRoute'),
  expenseLegalizationType: document.querySelector('#expenseLegalizationType'),
  expenseAdvance: document.querySelector('#expenseAdvance'),
  expenseDate: document.querySelector('#expenseDate'),
  expenseDestination: document.querySelector('#expenseDestination'),
  expenseStatus: document.querySelector('#expenseStatus'),
  expenseNotes: document.querySelector('#expenseNotes'),
  expenseList: document.querySelector('#expenseList'),
  search: document.querySelector('#search'),
  saveStatus: document.querySelector('#saveStatus'),
  detailTitle: document.querySelector('#detailTitle'),
  detailMeta: document.querySelector('#detailMeta'),
  invoiceCufe: document.querySelector('#invoiceCufe'),
  invoiceDate: document.querySelector('#invoiceDate'),
  invoiceNumber: document.querySelector('#invoiceNumber'),
  invoiceNit: document.querySelector('#invoiceNit'),
  invoiceSupplier: document.querySelector('#invoiceSupplier'),
  invoicePayment: document.querySelector('#invoicePayment'),
  invoiceConcept: document.querySelector('#invoiceConcept'),
  invoiceDescription: document.querySelector('#invoiceDescription'),
  invoiceAmount: document.querySelector('#invoiceAmount'),
  invoiceSupport: document.querySelector('#invoiceSupport'),
  invoicePhoto: document.querySelector('#invoicePhoto'),
  supportPreview: document.querySelector('#supportPreview'),
  supportPreviewImage: document.querySelector('#supportPreviewImage'),
  supportStatus: document.querySelector('#supportStatus'),
  invoiceTableWrap: document.querySelector('#invoiceTableWrap'),
  printSheet: document.querySelector('#printSheet'),
};

function createId(prefix = 'SAL') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));
}

function activeExpense() {
  return state.expenses.find((expense) => expense.id === state.activeId);
}

function totalExpense(expense) {
  return expense.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
}

function orderedInvoices(expense) {
  return [...expense.invoices].sort((first, second) => {
    const firstDate = first.date || '9999-12-31';
    const secondDate = second.date || '9999-12-31';
    return firstDate.localeCompare(secondDate)
      || String(first.number || '').localeCompare(String(second.number || ''))
      || first.id.localeCompare(second.id);
  });
}

function normalizeExpense(expense) {
  return {
    destination: '',
    status: 'Pendiente',
    identification: '', role: '', costCenter: '', route: '', legalizationType: 'FONDO DE GASTOS', advance: 0,
    ...expense,
    invoices: (expense.invoices || []).map((invoice) => ({
      nit: '',
      payment: 'Otro',
      concept: 'Otros',
      description: '',
      ...invoice,
    })),
  };
}

function loadExpenses() {
  const saved = localStorage.getItem(STORAGE_KEY);
  state.expenses = saved ? JSON.parse(saved).map(normalizeExpense) : [];
  state.activeId = state.expenses[0]?.id || null;
}

function persist(message = 'Guardado') {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses));
  if (elements.saveStatus) elements.saveStatus.textContent = message;
}

function openModal(modal) {
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

function showExpenseModal(id = null) {
  state.editingId = id;
  const expense = id ? state.expenses.find((item) => item.id === id) : null;
  elements.expenseModalTitle.textContent = expense ? 'Editar salida' : 'Nueva salida';
  elements.expenseName.value = expense?.name || '';
  elements.expenseOwner.value = expense?.owner || '';
  elements.expenseIdentification.value = expense?.identification || '';
  elements.expenseRole.value = expense?.role || '';
  elements.expenseCostCenter.value = expense?.costCenter || '';
  elements.expenseRoute.value = expense?.route || '';
  elements.expenseLegalizationType.value = expense?.legalizationType || 'FONDO DE GASTOS';
  elements.expenseAdvance.value = expense?.advance || '';
  elements.expenseDate.value = expense?.date || today();
  elements.expenseDestination.value = expense?.destination || '';
  elements.expenseStatus.value = expense?.status || 'Pendiente';
  elements.expenseNotes.value = expense?.notes || '';
  openModal(elements.expenseModal);
  elements.expenseName.focus();
}

function saveExpense() {
  const name = elements.expenseName.value.trim();
  if (!name) {
    elements.expenseName.focus();
    return;
  }

  const data = {
    name,
    owner: elements.expenseOwner.value.trim(),
    identification: elements.expenseIdentification.value.trim(),
    role: elements.expenseRole.value.trim(),
    costCenter: elements.expenseCostCenter.value.trim(),
    route: elements.expenseRoute.value.trim(),
    legalizationType: elements.expenseLegalizationType.value,
    advance: Number(elements.expenseAdvance.value) || 0,
    date: elements.expenseDate.value || today(),
    destination: elements.expenseDestination.value.trim(),
    status: elements.expenseStatus.value,
    notes: elements.expenseNotes.value.trim(),
  };

  if (state.editingId) {
    Object.assign(state.expenses.find((expense) => expense.id === state.editingId), data);
    persist('Salida modificada');
  } else {
    const expense = { id: createId(), ...data, invoices: [], createdAt: new Date().toISOString() };
    state.expenses.unshift(expense);
    state.activeId = expense.id;
    persist('Salida creada');
  }

  closeModal(elements.expenseModal);
  render();
}

function deleteExpense(id) {
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense || !window.confirm(`¿Eliminar la salida "${expense.name}" y todas sus facturas?`)) return;
  state.expenses = state.expenses.filter((item) => item.id !== id);
  state.activeId = state.expenses[0]?.id || null;
  persist('Salida eliminada');
  render();
}

function openDetail(id) {
  state.activeId = id;
  renderDetail();
  openModal(elements.detailModal);
}

function renderExpenseList() {
  const query = elements.search.value.toLowerCase();
  const list = state.expenses.filter((expense) => `${expense.name} ${expense.owner} ${expense.destination}`.toLowerCase().includes(query));

  if (list.length === 0) {
    elements.expenseList.innerHTML = '<div class="cufe-empty"><h2>No hay salidas creadas</h2><p>Crea la primera salida para comenzar a registrar CUFE y facturas.</p><button class="cufe-button cufe-button--primary" type="button" data-action="empty-create">+ Crear salida</button></div>';
    elements.expenseList.querySelector('button')?.addEventListener('click', () => showExpenseModal());
    return;
  }

  elements.expenseList.innerHTML = list.map((expense) => `
    <article class="cufe-card">
      <div class="cufe-card__top">
        <h2>${escapeHtml(expense.name)}</h2>
        <span class="cufe-badge">${escapeHtml(expense.status)}</span>
      </div>
      <p class="cufe-meta">📅 ${escapeHtml(expense.date || '-')}<br>👤 ${escapeHtml(expense.owner || '-')}<br>📍 ${escapeHtml(expense.destination || '-')}</p>
      <strong class="cufe-money">${currency(totalExpense(expense))}</strong>
      <p class="cufe-meta">🧾 ${expense.invoices.length} factura(s)</p>
      <div class="cufe-card__actions">
        <button class="cufe-button cufe-button--primary" type="button" data-open="${expense.id}">Abrir salida</button>
        <button class="cufe-button cufe-button--secondary" type="button" data-edit="${expense.id}">Editar</button>
        <button class="cufe-button cufe-button--danger" type="button" data-delete="${expense.id}">Eliminar</button>
      </div>
    </article>
  `).join('');
}

function renderDetail() {
  const expense = activeExpense();
  if (!expense) return;
  elements.detailTitle.textContent = expense.name;
  elements.detailMeta.innerHTML = `${escapeHtml(expense.date || '-')} · ${escapeHtml(expense.owner || '-')} · ${escapeHtml(expense.destination || '-')} · <b>${expense.invoices.length} facturas</b>`;
  renderInvoices(expense);
}

function renderInvoices(expense) {
  const total = totalExpense(expense);
  if (expense.invoices.length === 0) {
    elements.invoiceTableWrap.innerHTML = '<div class="cufe-empty cufe-empty--small">Aún no hay facturas en esta salida.</div>';
    return;
  }

  const invoices = orderedInvoices(expense);
  elements.invoiceTableWrap.innerHTML = `<p class="cufe-order-note">Las facturas se ordenan cronológicamente. Este es el mismo orden usado en el Excel y en el Word de soportes.</p><div class="cufe-table-wrap"><table><thead><tr><th>#</th><th>CUFE / Ref.</th><th>Fecha</th><th>Factura</th><th>NIT</th><th>Proveedor</th><th>Concepto</th><th>Medio</th><th>Valor</th><th>Soporte</th><th></th></tr></thead><tbody>${invoices.map((invoice, index) => `<tr><td>${index + 1}</td><td title="${escapeHtml(invoice.cufe)}">${escapeHtml(invoice.cufe).slice(0, 35)}${invoice.cufe.length > 35 ? '…' : ''}</td><td>${escapeHtml(invoice.date)}</td><td>${escapeHtml(invoice.number)}</td><td>${escapeHtml(invoice.nit)}</td><td>${escapeHtml(invoice.supplier)}</td><td>${escapeHtml(invoice.concept)}</td><td>${escapeHtml(invoice.payment)}</td><td>${currency(invoice.amount)}</td><td>${state.supportFiles.has(invoice.id) ? '✓ Adjuntado' : 'Sin soporte'}</td><td><button class="cufe-button cufe-button--danger cufe-button--mini" type="button" data-remove-invoice="${invoice.id}">Eliminar</button></td></tr>`).join('')}<tr class="cufe-total-row"><td colspan="8">TOTAL</td><td>${currency(total)}</td><td></td><td></td></tr></tbody></table></div>`;
}

function addInvoice() {
  const expense = activeExpense();
  const cufe = elements.invoiceCufe.value.trim();
  if (!expense) return;
  if (cufe && expense.invoices.some((invoice) => invoice.cufe === cufe)) {
    elements.saveStatus.textContent = 'Este CUFE ya está registrado en esta salida';
    return;
  }
  const support = state.pendingSupport;
  if (!support) {
    elements.saveStatus.textContent = 'Toma una foto o adjunta el PDF de la factura antes de agregarla.';
    return;
  }
  const invoice = {
    id: createId('FAC'),
    cufe,
    date: elements.invoiceDate.value || today(),
    number: elements.invoiceNumber.value.trim(),
    nit: elements.invoiceNit.value.trim(),
    supplier: elements.invoiceSupplier.value.trim(),
    payment: elements.invoicePayment.value,
    concept: elements.invoiceConcept.value,
    description: elements.invoiceDescription.value.trim(),
    amount: Number(elements.invoiceAmount.value) || 0,
  };
  expense.invoices.push(invoice);
  state.supportFiles.set(invoice.id, support);
  clearInvoiceForm();
  persist('Factura agregada');
  render();
  renderDetail();
}

function clearInvoiceForm() {
  [elements.invoiceCufe, elements.invoiceDate, elements.invoiceNumber, elements.invoiceNit, elements.invoiceSupplier, elements.invoiceDescription, elements.invoiceAmount].forEach((field) => { field.value = ''; });
  clearPendingSupport();
}

function clearPendingSupport() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = '';
  state.pendingSupport = null;
  elements.invoicePhoto.value = '';
  elements.invoiceSupport.value = '';
  elements.supportPreview.hidden = true;
  elements.supportPreviewImage.hidden = true;
  elements.supportPreviewImage.removeAttribute('src');
  elements.supportStatus.textContent = '';
}

function showPendingSupport(file, message, previewUrl = '') {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.pendingSupport = file;
  state.previewUrl = previewUrl;
  elements.supportPreview.hidden = false;
  elements.supportStatus.textContent = message;
  elements.supportPreviewImage.hidden = !previewUrl;
  if (previewUrl) elements.supportPreviewImage.src = previewUrl;
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la foto.')); };
    image.src = url;
  });
}

async function scanPhoto(file) {
  const image = await imageFromFile(file);
  const maxSide = 2200;
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * ratio);
  canvas.height = Math.round(image.naturalHeight * ratio);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  let total = 0;
  for (let index = 0; index < pixels.data.length; index += 4) total += (pixels.data[index] * 0.299) + (pixels.data[index + 1] * 0.587) + (pixels.data[index + 2] * 0.114);
  const threshold = Math.max(125, Math.min(205, (total / (pixels.data.length / 4)) + 18));
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = (pixels.data[index] * 0.299) + (pixels.data[index + 1] * 0.587) + (pixels.data[index + 2] * 0.114);
    const value = gray > threshold ? 255 : Math.max(0, Math.min(255, ((gray - 35) * 1.8)));
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No se pudo procesar la foto.');
  return new File([blob], `factura_escaneada_${Date.now()}.png`, { type: 'image/png' });
}

async function handlePhoto(file) {
  if (!file) return;
  clearPendingSupport();
  elements.supportStatus.textContent = 'Aplicando filtro de documento a la foto…';
  elements.supportPreview.hidden = false;
  try {
    const scanned = await scanPhoto(file);
    showPendingSupport(scanned, 'Foto escaneada lista para adjuntar. Leyendo texto con OCR…', URL.createObjectURL(scanned));
    if (window.Tesseract) {
      const result = await window.Tesseract.recognize(scanned, 'spa+eng');
      const populated = applyInvoiceData(parseDianInvoice(result.data.text));
      elements.supportStatus.textContent = populated
        ? `Foto escaneada lista. OCR completó ${populated} campo(s); revisa los datos antes de guardar.`
        : 'Foto escaneada lista. El OCR no encontró campos confiables; completa los datos manualmente.';
    } else {
      elements.supportStatus.textContent = 'Foto escaneada lista para adjuntar. OCR no disponible; completa los datos manualmente.';
    }
  } catch (error) {
    clearPendingSupport();
    elements.saveStatus.textContent = error.message || 'No se pudo procesar la foto.';
  }
}

function invoiceDateToIso(value) {
  const match = String(value || '').match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b|\b(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\b/);
  if (!match) return '';
  const [year, month, day] = match[4] ? [match[4], match[5], match[6]] : [match[3].length === 2 ? `20${match[3]}` : match[3], match[2], match[1]];
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
    ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    : '';
}

function invoiceAmount(value) {
  const cleaned = String(value || '').replace(/[^0-9,.-]/g, '');
  if (!cleaned) return '';
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  const separator = Math.max(comma, dot);
  const decimals = separator >= 0 && cleaned.length - separator - 1 === 2;
  const normalized = decimals
    ? `${cleaned.slice(0, separator).replace(/[.,]/g, '')}.${cleaned.slice(separator + 1)}`
    : cleaned.replace(/[.,]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : '';
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function invoiceCategory(source) {
  if (/hotel|alojamiento|habitaci[oó]n|hospedaje/i.test(source)) return 'Hotel';
  if (/peaje|parqueadero|parqueo/i.test(source)) return 'Peajes y Parqueadero';
  if (/restaurante|alimentaci[oó]n|desayuno|almuerzo|cena|comida|hamburgues|lasagna|hidrataci[oó]n/i.test(source)) return 'Alimentación';
  return 'Otros';
}

function parseDianInvoice(text) {
  const source = text.replace(/\s+/g, ' ').trim();
  const date = invoiceDateToIso(firstMatch(source, [
    /(?:fecha\s*(?:de\s*)?(?:emisi[oó]n|expedici[oó]n|factura)?|fecha)\s*[:#-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
    /(\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2})/,
  ]));
  const number = firstMatch(source, [/(?:factura(?:\s+electr[oó]nica(?:\s+de\s+venta)?)?|n[uú]mero\s+de\s+factura|no\.?\s*factura)\s*(?:no\.?|n[uú]mero)?\s*[:#-]?\s*([A-Z]{0,5}[0-9][A-Z0-9\-]{1,})/i]);
  const nit = firstMatch(source, [/(?:N\.?I\.?T\.?|nit)\s*[:#-]?\s*([0-9][0-9.\-]{5,})/i]);
  const cufe = firstMatch(source, [/(?:CUFE|UUID|c[oó]digo\s+[uú]nico\s+de\s+factura)\s*[:#-]?\s*([A-F0-9]{40,130})/i]);
  const supplier = firstMatch(source, [/(?:raz[oó]n\s+social|nombre\s+o\s+raz[oó]n\s+social|emisor|proveedor)\s*[:#-]?\s*([A-ZÁÉÍÓÚÑ0-9&. ]{3,80}?)(?=\s+(?:N\.?I\.?T\.?|direcci[oó]n|tel[eé]fono|fecha)\b|$)/i]);
  const amount = invoiceAmount(firstMatch(source, [/(?:total\s*(?:a\s*pagar|factura|venta)?|valor\s+total)\s*[:$-]?\s*(?:COP\s*)?\$?\s*([0-9][0-9., ]{2,})/i]));
  let payment = firstMatch(source, [/(?:forma|medio)\s+de\s+pago\s*[:#-]?\s*([A-ZÁÉÍÓÚÑ ]{3,35})/i]);
  if (/cr[eé]dito/i.test(payment) || /tarjeta\s+cr[eé]dito/i.test(source)) payment = 'Tarjeta Crédito';
  else if (/d[eé]bito/i.test(payment) || /tarjeta\s+d[eé]bito/i.test(source)) payment = 'Tarjeta Débito';
  else if (/transferencia|consignaci[oó]n/i.test(payment) || /transferencia|consignaci[oó]n/i.test(source)) payment = 'Consignación bancaria';
  else if (/efectivo|contado/i.test(payment) || /efectivo|contado/i.test(source)) payment = 'Efectivo';
  else payment = 'Otro';
  const concept = invoiceCategory(source);
  const description = firstMatch(source, [/(?:descripci[oó]n|detalle|concepto)\s*[:#-]?\s*([^|]{4,150}?)(?=\s+(?:subtotal|total|iva|forma\s+de\s+pago)\b|$)/i]);
  return { date, number, nit, cufe, supplier, amount, payment, concept, description };
}
function applyInvoiceData(data) {
  const fields = {
    date: elements.invoiceDate,
    number: elements.invoiceNumber,
    nit: elements.invoiceNit,
    cufe: elements.invoiceCufe,
    supplier: elements.invoiceSupplier,
    amount: elements.invoiceAmount,
    description: elements.invoiceDescription,
  };
  const updated = [];
  Object.entries(fields).forEach(([key, field]) => {
    if (data[key] !== '' && data[key] !== undefined) {
      field.value = data[key];
      updated.push(key);
    }
  });
  if (data.payment) elements.invoicePayment.value = data.payment;
  if (data.concept) elements.invoiceConcept.value = data.concept;
  return updated.length;
}

async function pdfText(file) {
  const pdfjs = await pdfLibrary();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      pages.push(content.items.map((item) => item.str).join(' '));
    }
    return pages.join(' ');
  } finally {
    await pdf.destroy();
  }
}

async function handleDianFile(file) {
  if (!file) return;
  const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
  const isXml = /xml/i.test(file.type) || file.name.toLowerCase().endsWith('.xml');
  if (!isPdf && !isXml) { elements.saveStatus.textContent = 'Selecciona un PDF o XML válido.'; return; }
  showPendingSupport(file, `${isXml ? 'XML' : 'PDF'} adjunto: ${file.name}. Leyendo los datos de la factura…`);
  try {
    const text = isXml ? await file.text() : await pdfText(file);
    const populated = applyInvoiceData(parseDianInvoice(text));
    elements.supportStatus.textContent = populated
      ? `${isXml ? 'XML' : 'PDF'} adjunto: ${file.name}. Se completaron ${populated} campo(s); revisa los datos antes de guardar.`
      : `${isXml ? 'XML' : 'PDF'} adjunto: ${file.name}. No se detectó texto suficiente; completa los datos manualmente.`;
  } catch (error) {
    elements.supportStatus.textContent = `${isXml ? 'XML' : 'PDF'} adjunto: ${file.name}. No se pudieron leer los datos automáticamente; completa los campos manualmente.`;
    console.warn('No se pudo extraer información del soporte:', error);
  }
}
function removeInvoice(invoiceId) {
  const expense = activeExpense();
  if (!expense || !window.confirm('¿Eliminar esta factura?')) return;
  expense.invoices = expense.invoices.filter((invoice) => invoice.id !== invoiceId);
  state.supportFiles.delete(invoiceId);
  persist('Factura eliminada');
  render();
  renderDetail();
}

function excelDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function categoryTotals(invoices) {
  const totals = { 'Peajes y Parqueadero': 0, Hotel: 0, Alimentación: 0, Otros: 0 };
  invoices.forEach((invoice) => { totals[invoice.concept] = (totals[invoice.concept] || 0) + (Number(invoice.amount) || 0); });
  return totals;
}

async function exportExcel() {
  const expense = activeExpense();
  if (!expense || !window.XLSX) return;
  const button = document.querySelector('[data-action="download-excel"]');
  button.disabled = true;
  try {
    const response = await fetch('S-CON-FO-02.6%20LEGALIZACION%20DE%20GASTOS.%20v%202.0.xlsx');
    if (!response.ok) throw new Error('No se pudo abrir el formato institucional.');
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array', cellStyles: true, cellDates: true });
    const sheet = workbook.Sheets['Hoja 2'] || workbook.Sheets[workbook.SheetNames[1]];
    if (!sheet) throw new Error('El formato no contiene la hoja de legalización.');
    const set = (cell, value, format) => { const { f, ...existing } = sheet[cell] || {}; sheet[cell] = { ...existing, t: value instanceof Date ? 'd' : typeof value === 'number' ? 'n' : 's', v: value, ...(format ? { z: format } : {}) }; };
    set('D6', expense.owner); set('H6', expense.identification); set('D7', expense.role);
    set('H7', `Semana ${expense.date ? Math.ceil(Number(expense.date.slice(8)) / 7) : ''}`);
    set('D8', `${expense.destination || ''}${expense.date ? `, ${expense.date}` : ''}`); set('H8', expense.costCenter);
    set('F9', expense.legalizationType === 'FONDO CAJA MENOR' ? 'x' : ''); set('H9', expense.legalizationType === 'FONDO DE GASTOS' ? 'x' : ''); set('J9', expense.legalizationType === 'ANTICIPO' ? 'x' : '');
    const invoices = orderedInvoices(expense).slice(0, 33);
    invoices.forEach((invoice, index) => {
      const row = 11 + index;
      set(`A${row}`, index + 1); set(`B${row}`, invoice.description || invoice.concept); set(`C${row}`, excelDate(invoice.date), 'dd/mm/yyyy');
      set(`D${row}`, invoice.payment); set(`E${row}`, invoice.number); set(`F${row}`, invoice.nit); set(`G${row}`, invoice.supplier); set(`H${row}`, invoice.concept); set(`I${row}`, Number(invoice.amount) || 0, '#,##0');
    });
    const totals = categoryTotals(invoices);
    set('I45', totals['Peajes y Parqueadero'], '#,##0'); set('I46', totals.Hotel, '#,##0'); set('I47', totals.Alimentación, '#,##0'); set('I48', totals.Otros, '#,##0');
    const total = totalExpense({ invoices }); set('I49', total, '#,##0'); set('I50', Number(expense.advance) || 0, '#,##0'); set('I52', total, '#,##0'); set('I53', (Number(expense.advance) || 0) - total, '#,##0');
    XLSX.writeFile(workbook, `Legalizacion_${expense.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
    elements.saveStatus.textContent = expense.invoices.length > 33 ? 'Excel descargado: solo se incluyeron las primeras 33 facturas porque el formato tiene 33 filas.' : 'Excel institucional diligenciado y descargado.';
  } catch (error) {
    elements.saveStatus.textContent = error.message || 'No se pudo crear el Excel institucional.';
  } finally { button.disabled = false; }
}
async function pdfLibrary() {
  const pdfjs = await import(PDF_JS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  return pdfjs;
}

function canvasBytes(canvas) {
  return Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (character) => character.charCodeAt(0));
}

async function pdfPages(file, pdfjs) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({ data: canvasBytes(canvas), width: viewport.width, height: viewport.height });
  }
  await pdf.destroy();
  return pages;
}

async function imagePages(file) {
  const image = await imageFromFile(file);
  return [{ data: new Uint8Array(await file.arrayBuffer()), width: image.naturalWidth, height: image.naturalHeight }];
}

async function supportPages(file, pdfjs) {
  return file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
    ? pdfPages(file, pdfjs)
    : imagePages(file);
}

async function exportSupportsWord() {
  const expense = activeExpense();
  if (!expense) return;
  if (!window.docx) throw new Error('No se pudo cargar la biblioteca para crear el Word. Comprueba tu conexión e inténtalo de nuevo.');

  const invoices = orderedInvoices(expense);
  const missing = invoices.filter((invoice) => !state.supportFiles.has(invoice.id));
  if (missing.length) {
    elements.saveStatus.textContent = `Adjunta la foto o el PDF de las ${missing.length} factura(s) pendiente(s) antes de generar los soportes.`;
    return;
  }

  const button = document.querySelector('[data-action="download-supports"]');
  button.disabled = true;
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, PageBreak } = window.docx;
  const children = [
    new Paragraph({ text: 'SOPORTES DE LEGALIZACIÓN DE GASTOS', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: expense.name, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: 'Facturas ordenadas de la fecha más antigua a la más reciente, en el mismo orden del Excel.' }),
  ];
  const failures = [];
  try {
    const pdfjs = invoices.some((invoice) => {
      const file = state.supportFiles.get(invoice.id);
      return file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
    }) ? await pdfLibrary() : null;
    for (const [index, invoice] of invoices.entries()) {
      elements.saveStatus.textContent = `Procesando soporte ${index + 1} de ${invoices.length}: ${state.supportFiles.get(invoice.id).name}`;
      try {
        const pages = await supportPages(state.supportFiles.get(invoice.id), pdfjs);
        children.push(
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({ text: `FACTURA ${index + 1}`, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Fecha: ${invoice.date || 'Sin fecha'}\n`, bold: true }), new TextRun(`Archivo: ${state.supportFiles.get(invoice.id).name}`)] }),
        );
        for (const image of pages) {
          const scale = Math.min(700 / image.width, 1);
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: image.data, transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) }, type: 'png' })] }));
        }
      } catch (error) {
        failures.push(`${state.supportFiles.get(invoice.id).name}: ${error.message || 'No se pudo abrir el soporte.'}`);
      }
    }
    if (children.length <= 3) throw new Error('No se pudo incluir ninguna factura en el Word.');
    elements.saveStatus.textContent = 'Creando el Word de soportes…';
    const document = new Document({ sections: [{ properties: { page: { margin: { top: 710, right: 710, bottom: 710, left: 710 } } }, children }] });
    const blob = await Packer.toBlob(document);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Soportes_${expense.name.replace(/[^a-z0-9]/gi, '_')}.docx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    elements.saveStatus.textContent = failures.length ? `Word descargado con ${failures.length} soporte(s) no incluidos.` : 'Word de soportes descargado correctamente.';
  } finally {
    button.disabled = false;
  }
}

function buildPrintSheet() {
  const expense = activeExpense();
  if (!expense) return;
  const rows = orderedInvoices(expense).map((invoice) => `<tr><td>${escapeHtml(invoice.cufe)}</td><td>${escapeHtml(invoice.number || '-')}</td><td>${escapeHtml(invoice.supplier || '-')} / ${escapeHtml(invoice.nit || '-')}</td><td>${escapeHtml(invoice.date || '-')}</td><td>${currency(invoice.amount)}</td></tr>`).join('');
  elements.printSheet.innerHTML = `<div class="print-document"><header><img src="Drone_Innovation_COL.webp" alt="Logo DICOL" /><div><h1>Legalización de gastos</h1><p>${escapeHtml(expense.name)}</p></div></header><section class="print-meta"><p><strong>Responsable:</strong> ${escapeHtml(expense.owner || '-')}</p><p><strong>Destino:</strong> ${escapeHtml(expense.destination || '-')}</p><p><strong>Fecha:</strong> ${escapeHtml(expense.date || '-')}</p><p><strong>Observaciones:</strong> ${escapeHtml(expense.notes || '-')}</p></section><table><thead><tr><th>CUFE / Link</th><th>Factura</th><th>Proveedor / NIT</th><th>Fecha</th><th>Valor</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Sin facturas cargadas.</td></tr>'}</tbody><tfoot><tr><th colspan="4">Total</th><th>${currency(totalExpense(expense))}</th></tr></tfoot></table></div>`;
}

function printPdf() {
  if (!activeExpense()) return;
  buildPrintSheet();
  window.print();
}

function render() {
  renderExpenseList();
}

function bindActions() {
  document.querySelector('[data-action="create-expense"]').addEventListener('click', () => showExpenseModal());
  document.querySelectorAll('[data-action="close-expense-modal"]').forEach((button) => button.addEventListener('click', () => closeModal(elements.expenseModal)));
  document.querySelector('[data-action="close-detail-modal"]').addEventListener('click', () => closeModal(elements.detailModal));
  document.querySelector('[data-action="save-expense"]').addEventListener('click', saveExpense);
  document.querySelector('[data-action="add-invoice"]').addEventListener('click', addInvoice);
  document.querySelector('[data-action="clear-invoice"]').addEventListener('click', clearInvoiceForm);
  document.querySelector('[data-action="take-photo"]').addEventListener('click', () => elements.invoicePhoto.click());
  document.querySelector('[data-action="choose-pdf"]').addEventListener('click', () => elements.invoiceSupport.click());
  document.querySelector('[data-action="remove-support"]').addEventListener('click', clearPendingSupport);
  elements.invoicePhoto.addEventListener('change', () => handlePhoto(elements.invoicePhoto.files[0]));
  elements.invoiceSupport.addEventListener('change', () => handleDianFile(elements.invoiceSupport.files[0]));
  document.querySelector('[data-action="download-excel"]').addEventListener('click', exportExcel);
  document.querySelector('[data-action="download-supports"]').addEventListener('click', () => {
    exportSupportsWord().catch((error) => {
      console.error('ERROR AL GENERAR SOPORTES:', error);
      elements.saveStatus.textContent = error.message || 'No se pudo crear el Word de soportes.';
    });
  });
  document.querySelector('[data-action="print-pdf"]').addEventListener('click', printPdf);
  elements.search.addEventListener('input', render);
  elements.expenseList.addEventListener('click', (event) => {
    const openId = event.target.closest('[data-open]')?.dataset.open;
    const editId = event.target.closest('[data-edit]')?.dataset.edit;
    const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
    if (openId) openDetail(openId);
    if (editId) showExpenseModal(editId);
    if (deleteId) deleteExpense(deleteId);
  });
  elements.invoiceTableWrap.addEventListener('click', (event) => {
    const invoiceId = event.target.closest('[data-remove-invoice]')?.dataset.removeInvoice;
    if (invoiceId) removeInvoice(invoiceId);
  });
  document.querySelectorAll('.cufe-modal').forEach((modal) => modal.addEventListener('click', (event) => {
    if (event.target !== modal) return;
    closeModal(modal);
  }));
}

loadExpenses();
bindActions();
render();
