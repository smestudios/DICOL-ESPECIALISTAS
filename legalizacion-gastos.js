const STORAGE_KEY = 'dicol.legalizacion.salidas';
const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const state = {
  expenses: [],
  activeId: null,
  editingId: null,
  scannerStream: null,
  scannerFrame: null,
  scanning: false,
  dianLookupUrl: '',
  supportFiles: new Map(),
};

const elements = {
  expenseModal: document.querySelector('#expenseModal'),
  detailModal: document.querySelector('#detailModal'),
  expenseModalTitle: document.querySelector('#expenseModalTitle'),
  expenseForm: document.querySelector('#expenseForm'),
  expenseName: document.querySelector('#expenseName'),
  expenseOwner: document.querySelector('#expenseOwner'),
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
  invoiceAmount: document.querySelector('#invoiceAmount'),
  invoiceSupport: document.querySelector('#invoiceSupport'),
  qrVideo: document.querySelector('#qrVideo'),
  qrCanvas: document.querySelector('#qrCanvas'),
  qrStatus: document.querySelector('#qrStatus'),
  dianLookup: document.querySelector('[data-action="open-dian"]'),
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
    ...expense,
    invoices: (expense.invoices || []).map((invoice) => ({
      nit: '',
      payment: 'Tarjeta',
      concept: 'Otros',
      qrContent: '',
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
  elements.invoiceTableWrap.innerHTML = `<p class="cufe-order-note">Las facturas se ordenan cronológicamente. Este es el mismo orden usado en el Excel y en el Word de soportes.</p><div class="cufe-table-wrap"><table><thead><tr><th>#</th><th>CUFE / QR</th><th>Fecha</th><th>Factura</th><th>NIT</th><th>Proveedor</th><th>Concepto</th><th>Medio</th><th>Valor</th><th>PDF</th><th></th></tr></thead><tbody>${invoices.map((invoice, index) => `<tr><td>${index + 1}</td><td title="${escapeHtml(invoice.cufe)}">${escapeHtml(invoice.cufe).slice(0, 35)}${invoice.cufe.length > 35 ? '…' : ''}</td><td>${escapeHtml(invoice.date)}</td><td>${escapeHtml(invoice.number)}</td><td>${escapeHtml(invoice.nit)}</td><td>${escapeHtml(invoice.supplier)}</td><td>${escapeHtml(invoice.concept)}</td><td>${escapeHtml(invoice.payment)}</td><td>${currency(invoice.amount)}</td><td>${state.supportFiles.has(invoice.id) ? '✓ Adjuntado' : 'Sin soporte'}</td><td><button class="cufe-button cufe-button--danger cufe-button--mini" type="button" data-remove-invoice="${invoice.id}">Eliminar</button></td></tr>`).join('')}<tr class="cufe-total-row"><td colspan="8">TOTAL</td><td>${currency(total)}</td><td></td><td></td></tr></tbody></table></div>`;
}

function addInvoice() {
  const expense = activeExpense();
  const cufe = elements.invoiceCufe.value.trim();
  if (!expense || !cufe) {
    elements.invoiceCufe.focus();
    return;
  }
  if (expense.invoices.some((invoice) => invoice.cufe === cufe)) {
    elements.saveStatus.textContent = 'Este CUFE ya está registrado en esta salida';
    return;
  }
  const support = elements.invoiceSupport.files[0];
  if (!support || (!support.type.includes('pdf') && !support.name.toLowerCase().endsWith('.pdf'))) {
    elements.saveStatus.textContent = 'Adjunta el soporte PDF de la factura antes de agregarla.';
    elements.invoiceSupport.focus();
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
    amount: Number(elements.invoiceAmount.value) || 0,
    qrContent: '',
  };
  expense.invoices.push(invoice);
  state.supportFiles.set(invoice.id, support);
  clearInvoiceForm();
  persist('Factura agregada');
  render();
  renderDetail();
}

function clearInvoiceForm() {
  [elements.invoiceCufe, elements.invoiceDate, elements.invoiceNumber, elements.invoiceNit, elements.invoiceSupplier, elements.invoiceAmount, elements.invoiceSupport].forEach((field) => { field.value = ''; });
  elements.qrStatus.textContent = 'Cámara detenida';
  elements.qrStatus.classList.remove('is-success', 'is-warning');
  state.dianLookupUrl = '';
  elements.dianLookup.disabled = true;
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

function extractCufe(text) {
  const value = String(text || '').trim();
  if (!value) return '';

  console.log('Contenido original del QR:', value);

  try {
    const url = new URL(value);
    const params = ['documentkey', 'documentKey', 'DocumentKey', 'cufe', 'CUFE', 'key', 'uuid'];
    for (const param of params) {
      const found = url.searchParams.get(param);
      if (found) {
        console.log('CUFE encontrado mediante parámetro:', param, found);
        return found.trim();
      }
    }
  } catch (error) {
    // QR content is not always a URL.
  }

  const labeled = value.match(/(?:CUFE|documentkey|key|uuid)[=:/\s]+([A-Za-z0-9._-]{40,200})/i);
  if (labeled?.[1]) {
    console.log('CUFE encontrado mediante etiqueta:', labeled[1]);
    return labeled[1];
  }

  const hex = value.match(/\b[A-Fa-f0-9]{64,128}\b/);
  if (hex?.[0]) {
    console.log('CUFE hexadecimal encontrado:', hex[0]);
    return hex[0];
  }

  console.warn('No se pudo identificar automáticamente el CUFE.');
  return '';
}

function dianUrlFromQr(text) {
  try {
    const url = new URL(String(text || '').trim());
    const host = url.hostname.toLowerCase();
    return (url.protocol === 'https:' && (host === 'dian.gov.co' || host.endsWith('.dian.gov.co')))
      ? url.href
      : '';
  } catch (error) {
    return '';
  }
}

function processQrText(text) {
  const cufe = extractCufe(text);
  elements.invoiceCufe.value = cufe;
  state.dianLookupUrl = dianUrlFromQr(text);
  elements.dianLookup.disabled = !state.dianLookupUrl;
  elements.qrStatus.textContent = cufe
    ? state.dianLookupUrl
      ? '✓ CUFE identificado. Puedes continuar en la consulta oficial de DIAN.'
      : '✓ CUFE identificado. El QR no incluye un enlace oficial de DIAN.'
    : 'QR leído; no contiene un CUFE identificable. Revisa la factura antes de agregarla.';
  elements.qrStatus.classList.toggle('is-success', Boolean(cufe));
  elements.qrStatus.classList.toggle('is-warning', !cufe);
  stopScanner({ preserveStatus: true });
}

function scanQrFrame() {
  if (!state.scanning) return;

  const video = elements.qrVideo;
  const canvas = elements.qrCanvas;
  if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR?.(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    if (code?.data) {
      console.log('QR DETECTADO:', code.data);
      processQrText(code.data);
      return;
    }

    // Aumenta la zona que normalmente coincide con la guía visual para QR pequeños.
    const cropSize = Math.min(video.videoWidth, video.videoHeight) * 0.65;
    const cropX = (video.videoWidth - cropSize) / 2;
    const cropY = (video.videoHeight - cropSize) / 2;
    const scale = 2;
    canvas.width = Math.round(cropSize * scale);
    canvas.height = Math.round(cropSize * scale);
    context.imageSmoothingEnabled = false;
    context.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
    const croppedImage = context.getImageData(0, 0, canvas.width, canvas.height);
    const croppedCode = window.jsQR?.(croppedImage.data, croppedImage.width, croppedImage.height, { inversionAttempts: 'attemptBoth' });
    if (croppedCode?.data) {
      console.log('QR DETECTADO EN ZONA CENTRAL:', croppedCode.data);
      processQrText(croppedCode.data);
      return;
    }
  }

  state.scannerFrame = requestAnimationFrame(scanQrFrame);
}

async function startScanner() {
  if (state.scanning) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    elements.qrStatus.textContent = 'Este navegador no permite acceso a cámara';
    elements.qrStatus.classList.add('is-warning');
    return;
  }

  if (typeof window.jsQR !== 'function') {
    elements.qrStatus.textContent = 'No se cargó la librería jsQR. Revisa la conexión a internet';
    elements.qrStatus.classList.add('is-warning');
    return;
  }

  try {
    state.scannerStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
    });
    elements.qrVideo.srcObject = state.scannerStream;
    elements.qrVideo.setAttribute('playsinline', 'true');
    elements.qrVideo.setAttribute('autoplay', 'true');
    elements.qrVideo.muted = true;
    await elements.qrVideo.play();
    state.scanning = true;
    elements.qrStatus.textContent = '📷 Apunta al código QR de la factura';
    elements.qrStatus.classList.remove('is-warning', 'is-success');
    state.scannerFrame = requestAnimationFrame(scanQrFrame);
  } catch (error) {
    console.error('ERROR DE CÁMARA:', error);
    state.scannerStream?.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
    elements.qrStatus.textContent = 'No se pudo acceder a la cámara. Permite el acceso e intenta de nuevo';
    elements.qrStatus.classList.add('is-warning');
  }
}

function stopScanner({ preserveStatus = false } = {}) {
  state.scanning = false;
  if (state.scannerFrame) cancelAnimationFrame(state.scannerFrame);
  state.scannerFrame = null;

  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
  }

  if (elements.qrVideo) {
    elements.qrVideo.pause();
    elements.qrVideo.srcObject = null;
  }

  if (elements.qrStatus && !elements.invoiceCufe.value && !preserveStatus) {
    elements.qrStatus.textContent = 'Cámara detenida';
  }
}

function exportExcel() {
  const expense = activeExpense();
  if (!expense) return;
  const rows = orderedInvoices(expense).map((invoice) => ({
    'Descripción C.O.': invoice.concept,
    Fecha: invoice.date,
    'Medio de pago': invoice.payment,
    'No. Factura': invoice.number,
    NIT: invoice.nit,
    'Nombre del proveedor': invoice.supplier,
    Concepto: invoice.concept,
    Valor: Number(invoice.amount) || 0,
    CUFE: invoice.cufe,
  }));
  rows.push({ 'Descripción C.O.': 'TOTAL', Valor: totalExpense(expense) });

  if (window.XLSX) {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Legalización');
    XLSX.writeFile(workbook, `Legalizacion_${expense.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
    return;
  }

  const csv = rows.map((row) => Object.values(row).map((cell = '') => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = `Legalizacion_${expense.name.replace(/[^a-z0-9]/gi, '_')}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
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

async function exportSupportsWord() {
  const expense = activeExpense();
  if (!expense) return;
  if (!window.docx) throw new Error('No se pudo cargar la biblioteca para crear el Word. Comprueba tu conexión e inténtalo de nuevo.');

  const invoices = orderedInvoices(expense);
  const missing = invoices.filter((invoice) => !state.supportFiles.has(invoice.id));
  if (missing.length) {
    elements.saveStatus.textContent = `Adjunta el PDF de las ${missing.length} factura(s) pendiente(s) antes de generar los soportes.`;
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
    const pdfjs = await pdfLibrary();
    for (const [index, invoice] of invoices.entries()) {
      elements.saveStatus.textContent = `Procesando soporte ${index + 1} de ${invoices.length}: ${state.supportFiles.get(invoice.id).name}`;
      try {
        const pages = await pdfPages(state.supportFiles.get(invoice.id), pdfjs);
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
        failures.push(`${state.supportFiles.get(invoice.id).name}: ${error.message || 'No se pudo abrir el PDF.'}`);
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
  document.querySelector('[data-action="close-detail-modal"]').addEventListener('click', async () => { await stopScanner(); closeModal(elements.detailModal); });
  document.querySelector('[data-action="save-expense"]').addEventListener('click', saveExpense);
  document.querySelector('[data-action="add-invoice"]').addEventListener('click', addInvoice);
  document.querySelector('[data-action="clear-invoice"]').addEventListener('click', clearInvoiceForm);
  document.querySelector('[data-action="start-scanner"]').addEventListener('click', startScanner);
  document.querySelector('[data-action="stop-scanner"]').addEventListener('click', stopScanner);
  elements.dianLookup.addEventListener('click', () => {
    if (state.dianLookupUrl) window.open(state.dianLookupUrl, '_blank', 'noopener,noreferrer');
  });
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
  document.querySelectorAll('.cufe-modal').forEach((modal) => modal.addEventListener('click', async (event) => {
    if (event.target !== modal) return;
    if (modal === elements.detailModal) await stopScanner();
    closeModal(modal);
  }));
}

loadExpenses();
bindActions();
render();
