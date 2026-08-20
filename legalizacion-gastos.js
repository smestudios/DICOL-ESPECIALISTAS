const STORAGE_KEY = 'dicol.legalizacion.salidas';

const state = {
  expenses: [],
  activeId: null,
  editingId: null,
  scanner: null,
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

function normalizeExpense(expense) {
  return {
    destination: '',
    status: 'Pendiente',
    ...expense,
    invoices: (expense.invoices || []).map((invoice) => ({
      nit: '',
      payment: 'Tarjeta',
      concept: 'Otros',
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

  elements.invoiceTableWrap.innerHTML = `<div class="cufe-table-wrap"><table><thead><tr><th>#</th><th>CUFE / QR</th><th>Fecha</th><th>Factura</th><th>NIT</th><th>Proveedor</th><th>Concepto</th><th>Medio</th><th>Valor</th><th></th></tr></thead><tbody>${expense.invoices.map((invoice, index) => `<tr><td>${index + 1}</td><td title="${escapeHtml(invoice.cufe)}">${escapeHtml(invoice.cufe).slice(0, 35)}${invoice.cufe.length > 35 ? '…' : ''}</td><td>${escapeHtml(invoice.date)}</td><td>${escapeHtml(invoice.number)}</td><td>${escapeHtml(invoice.nit)}</td><td>${escapeHtml(invoice.supplier)}</td><td>${escapeHtml(invoice.concept)}</td><td>${escapeHtml(invoice.payment)}</td><td>${currency(invoice.amount)}</td><td><button class="cufe-button cufe-button--danger cufe-button--mini" type="button" data-remove-invoice="${invoice.id}">Eliminar</button></td></tr>`).join('')}<tr class="cufe-total-row"><td colspan="8">TOTAL</td><td>${currency(total)}</td><td></td></tr></tbody></table></div>`;
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
  expense.invoices.push({
    id: createId('FAC'),
    cufe,
    date: elements.invoiceDate.value || today(),
    number: elements.invoiceNumber.value.trim(),
    nit: elements.invoiceNit.value.trim(),
    supplier: elements.invoiceSupplier.value.trim(),
    payment: elements.invoicePayment.value,
    concept: elements.invoiceConcept.value,
    amount: Number(elements.invoiceAmount.value) || 0,
  });
  clearInvoiceForm();
  persist('Factura agregada');
  render();
  renderDetail();
}

function clearInvoiceForm() {
  [elements.invoiceCufe, elements.invoiceDate, elements.invoiceNumber, elements.invoiceNit, elements.invoiceSupplier, elements.invoiceAmount].forEach((field) => { field.value = ''; });
}

function removeInvoice(invoiceId) {
  const expense = activeExpense();
  if (!expense || !window.confirm('¿Eliminar esta factura?')) return;
  expense.invoices = expense.invoices.filter((invoice) => invoice.id !== invoiceId);
  persist('Factura eliminada');
  render();
  renderDetail();
}

async function startScanner() {
  if (state.scanner || typeof Html5Qrcode === 'undefined') return;
  state.scanner = new Html5Qrcode('reader');
  try {
    await state.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, (text) => {
      elements.invoiceCufe.value = text;
      stopScanner();
      elements.saveStatus.textContent = 'QR leído correctamente';
    });
  } catch (error) {
    state.scanner = null;
    elements.saveStatus.textContent = 'No fue posible iniciar la cámara';
  }
}

async function stopScanner() {
  if (!state.scanner) return;
  try { await state.scanner.stop(); } catch (error) { /* ignore scanner stop errors */ }
  try { state.scanner.clear(); } catch (error) { /* ignore scanner clear errors */ }
  state.scanner = null;
}

function exportExcel() {
  const expense = activeExpense();
  if (!expense) return;
  const rows = expense.invoices.map((invoice) => ({
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

function buildPrintSheet() {
  const expense = activeExpense();
  if (!expense) return;
  const rows = expense.invoices.map((invoice) => `<tr><td>${escapeHtml(invoice.cufe)}</td><td>${escapeHtml(invoice.number || '-')}</td><td>${escapeHtml(invoice.supplier || '-')} / ${escapeHtml(invoice.nit || '-')}</td><td>${escapeHtml(invoice.date || '-')}</td><td>${currency(invoice.amount)}</td></tr>`).join('');
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
  document.querySelector('[data-action="download-excel"]').addEventListener('click', exportExcel);
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
