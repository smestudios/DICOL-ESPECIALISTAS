const STORAGE_KEY = 'dicol.legalizacion.salidas';

const state = {
  expenses: [],
  activeId: null,
  editingMode: 'create',
};

const elements = {
  formPanel: document.querySelector('#expenseFormPanel'),
  expenseForm: document.querySelector('#expenseForm'),
  expenseName: document.querySelector('#expenseName'),
  expenseOwner: document.querySelector('#expenseOwner'),
  expenseDate: document.querySelector('#expenseDate'),
  expenseNotes: document.querySelector('#expenseNotes'),
  expenseList: document.querySelector('#expenseList'),
  saveStatus: document.querySelector('#saveStatus'),
  emptyState: document.querySelector('#emptyState'),
  selectedContent: document.querySelector('#selectedContent'),
  selectedTitle: document.querySelector('#selectedTitle'),
  selectedMeta: document.querySelector('#selectedMeta'),
  selectedNotes: document.querySelector('#selectedNotes'),
  selectedTotal: document.querySelector('#selectedTotal'),
  cufeSource: document.querySelector('#cufeSource'),
  qrImage: document.querySelector('#qrImage'),
  invoiceTable: document.querySelector('#invoiceTable'),
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

function activeExpense() {
  return state.expenses.find((expense) => expense.id === state.activeId);
}

function totalExpense(expense) {
  return expense.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
}

function loadExpenses() {
  const saved = localStorage.getItem(STORAGE_KEY);
  state.expenses = saved ? JSON.parse(saved) : [];
  state.activeId = state.expenses[0]?.id || null;
}

function persist(message = 'Guardado') {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses));
  elements.saveStatus.textContent = message;
}

function showForm(mode) {
  state.editingMode = mode;
  elements.formPanel.classList.remove('is-hidden');

  if (mode === 'edit') {
    const expense = activeExpense();
    if (!expense) {
      elements.saveStatus.textContent = 'Selecciona una salida para modificar';
      elements.formPanel.classList.add('is-hidden');
      return;
    }

    elements.expenseName.value = expense.name;
    elements.expenseOwner.value = expense.owner;
    elements.expenseDate.value = expense.date;
    elements.expenseNotes.value = expense.notes;
    elements.saveStatus.textContent = 'Modificando salida';
    elements.expenseName.focus();
    return;
  }

  elements.expenseForm.reset();
  elements.expenseDate.value = today();
  elements.saveStatus.textContent = 'Creando salida';
  elements.expenseName.focus();
}

function hideForm() {
  elements.formPanel.classList.add('is-hidden');
  elements.expenseForm.reset();
}

function saveExpense() {
  const name = elements.expenseName.value.trim();
  if (!name) {
    elements.expenseName.focus();
    elements.saveStatus.textContent = 'El nombre es obligatorio';
    return;
  }

  if (state.editingMode === 'edit') {
    const expense = activeExpense();
    if (!expense) return;

    expense.name = name;
    expense.owner = elements.expenseOwner.value.trim();
    expense.date = elements.expenseDate.value || today();
    expense.notes = elements.expenseNotes.value.trim();
    persist('Salida modificada');
    hideForm();
    render();
    return;
  }

  const expense = {
    id: createId(),
    name,
    owner: elements.expenseOwner.value.trim(),
    date: elements.expenseDate.value || today(),
    notes: elements.expenseNotes.value.trim(),
    invoices: [],
    createdAt: new Date().toISOString(),
  };

  state.expenses.unshift(expense);
  state.activeId = expense.id;
  persist('Salida creada');
  hideForm();
  render();
}

function deleteExpense() {
  const expense = activeExpense();
  if (!expense) {
    elements.saveStatus.textContent = 'Selecciona una salida para eliminar';
    return;
  }

  const confirmed = window.confirm(`¿Eliminar la salida "${expense.name}"?`);
  if (!confirmed) return;

  state.expenses = state.expenses.filter((item) => item.id !== expense.id);
  state.activeId = state.expenses[0]?.id || null;
  persist('Salida eliminada');
  hideForm();
  render();
}

function parseCufeSource(source) {
  const text = source.trim();
  const url = text.match(/https?:\/\/[^\s]+/i)?.[0] || '';
  const cufe = text.match(/[a-fA-F0-9]{40,}/)?.[0] || url || text;
  const invoiceNumber = text.match(/(?:factura|invoice|fac|no\.?|nro\.?)\s*[:#-]?\s*([A-Z0-9-]{4,})/i)?.[1] || '';
  const supplier = text.match(/(?:nit|proveedor|emisor)\s*[:#-]?\s*([0-9A-Z .-]{5,})/i)?.[1]?.trim() || '';
  const amountText = text.match(/(?:valor|total|amount)\s*[:$-]?\s*([0-9.,]+)/i)?.[1] || '0';
  const date = text.match(/\b(20\d{2}[-/]\d{2}[-/]\d{2})\b/)?.[1]?.replaceAll('/', '-') || today();

  return {
    id: createId('FAC'),
    cufe,
    source: text,
    number: invoiceNumber || `FAC-${Date.now().toString().slice(-5)}`,
    supplier: supplier || 'Pendiente por validar',
    date,
    amount: Number(amountText.replace(/\./g, '').replace(',', '.')) || 0,
  };
}

function addInvoiceFromCufe() {
  const expense = activeExpense();
  if (!expense) {
    elements.saveStatus.textContent = 'Selecciona una salida primero';
    return;
  }

  const source = elements.cufeSource.value.trim();
  if (!source) {
    elements.cufeSource.focus();
    elements.saveStatus.textContent = 'Pega el link del CUFE o texto QR';
    return;
  }

  expense.invoices.push(parseCufeSource(source));
  elements.cufeSource.value = '';
  elements.qrImage.value = '';
  persist('Factura agregada');
  render();
}

async function readQrFromImage() {
  const file = elements.qrImage.files?.[0];
  if (!file) {
    elements.saveStatus.textContent = 'Selecciona una imagen QR';
    return;
  }

  if (!('BarcodeDetector' in window)) {
    elements.saveStatus.textContent = 'Tu navegador no soporta lectura QR automática';
    return;
  }

  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  const image = await createImageBitmap(file);
  const codes = await detector.detect(image);
  elements.cufeSource.value = codes[0]?.rawValue || '';
  elements.saveStatus.textContent = codes.length ? 'QR leído correctamente' : 'No se detectó QR';
}

function removeInvoice(invoiceId) {
  const expense = activeExpense();
  if (!expense) return;

  expense.invoices = expense.invoices.filter((invoice) => invoice.id !== invoiceId);
  persist('Factura eliminada');
  render();
}

function selectExpense(expenseId) {
  state.activeId = expenseId;
  hideForm();
  render();
}

function renderExpenseList() {
  elements.expenseList.innerHTML = '';

  if (state.expenses.length === 0) {
    elements.expenseList.innerHTML = '<div class="empty-card">No hay salidas creadas. Usa el botón “Crear salida”.</div>';
    return;
  }

  state.expenses.forEach((expense) => {
    const button = document.createElement('button');
    button.className = `expense-card${expense.id === state.activeId ? ' is-active' : ''}`;
    button.type = 'button';
    button.innerHTML = `
      <span>${expense.date || 'Sin fecha'}</span>
      <strong>${expense.name}</strong>
      <small>${expense.owner || 'Sin responsable'} · ${expense.invoices.length} factura(s)</small>
      <b>${currency(totalExpense(expense))}</b>
    `;
    button.addEventListener('click', () => selectExpense(expense.id));
    elements.expenseList.appendChild(button);
  });
}

function renderSelectedExpense() {
  const expense = activeExpense();

  elements.emptyState.classList.toggle('is-hidden', Boolean(expense));
  elements.selectedContent.classList.toggle('is-hidden', !expense);

  if (!expense) return;

  elements.selectedTitle.textContent = expense.name;
  elements.selectedMeta.textContent = `${expense.date || 'Sin fecha'} · ${expense.owner || 'Sin responsable'} · ${expense.invoices.length} factura(s)`;
  elements.selectedNotes.textContent = expense.notes || 'Sin observaciones registradas.';
  elements.selectedTotal.textContent = currency(totalExpense(expense));
  renderInvoices(expense);
}

function renderInvoices(expense) {
  elements.invoiceTable.innerHTML = '';

  if (expense.invoices.length === 0) {
    elements.invoiceTable.innerHTML = '<tr><td colspan="6" class="empty-row">Esta salida aún no tiene facturas cargadas.</td></tr>';
    return;
  }

  expense.invoices.forEach((invoice) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${invoice.cufe}</td>
      <td>${invoice.number || '-'}</td>
      <td>${invoice.supplier || '-'}</td>
      <td>${invoice.date || '-'}</td>
      <td>${currency(invoice.amount)}</td>
      <td><button class="table-action" type="button">Eliminar</button></td>
    `;
    row.querySelector('button').addEventListener('click', () => removeInvoice(invoice.id));
    elements.invoiceTable.appendChild(row);
  });
}

function render() {
  renderExpenseList();
  renderSelectedExpense();
}

function downloadCsv() {
  const expense = activeExpense();
  if (!expense) {
    elements.saveStatus.textContent = 'Selecciona una salida para descargar';
    return;
  }

  const rows = [
    ['Salida', expense.name],
    ['Responsable', expense.owner],
    ['Fecha', expense.date],
    ['Observaciones', expense.notes],
    [],
    ['CUFE / Link', 'Factura', 'Proveedor / NIT', 'Fecha', 'Valor'],
    ...expense.invoices.map((invoice) => [invoice.cufe, invoice.number, invoice.supplier, invoice.date, invoice.amount]),
  ];

  const csv = rows.map((row) => row.map((cell = '') => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${expense.name.replace(/\s+/g, '-').toLowerCase()}-legalizacion.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildPrintSheet() {
  const expense = activeExpense();
  if (!expense) return;

  const rows = expense.invoices.map((invoice) => `
    <tr>
      <td>${invoice.cufe}</td>
      <td>${invoice.number || '-'}</td>
      <td>${invoice.supplier || '-'}</td>
      <td>${invoice.date || '-'}</td>
      <td>${currency(invoice.amount)}</td>
    </tr>
  `).join('');

  elements.printSheet.innerHTML = `
    <div class="print-document">
      <header>
        <img src="Drone_Innovation_COL.webp" alt="Logo DICOL" />
        <div>
          <h1>Legalización de gastos</h1>
          <p>${expense.name}</p>
        </div>
      </header>
      <section class="print-meta">
        <p><strong>Responsable:</strong> ${expense.owner || '-'}</p>
        <p><strong>Fecha:</strong> ${expense.date || '-'}</p>
        <p><strong>Observaciones:</strong> ${expense.notes || '-'}</p>
      </section>
      <table>
        <thead>
          <tr><th>CUFE / Link</th><th>Factura</th><th>Proveedor / NIT</th><th>Fecha</th><th>Valor</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5">Sin facturas cargadas.</td></tr>'}</tbody>
        <tfoot><tr><th colspan="4">Total</th><th>${currency(totalExpense(expense))}</th></tr></tfoot>
      </table>
    </div>
  `;
}

function printPdf() {
  if (!activeExpense()) {
    elements.saveStatus.textContent = 'Selecciona una salida para imprimir';
    return;
  }

  buildPrintSheet();
  window.print();
}

function bindActions() {
  document.querySelector('[data-action="create-expense"]').addEventListener('click', () => showForm('create'));
  document.querySelector('[data-action="delete-expense"]').addEventListener('click', deleteExpense);
  document.querySelector('[data-action="edit-expense"]').addEventListener('click', () => showForm('edit'));
  document.querySelector('[data-action="cancel-edit"]').addEventListener('click', hideForm);
  document.querySelector('[data-action="save-expense"]').addEventListener('click', saveExpense);
  document.querySelector('[data-action="read-qr"]').addEventListener('click', readQrFromImage);
  document.querySelector('[data-action="add-from-cufe"]').addEventListener('click', addInvoiceFromCufe);
  document.querySelector('[data-action="download-csv"]').addEventListener('click', downloadCsv);
  document.querySelector('[data-action="print-pdf"]').addEventListener('click', printPdf);
}

loadExpenses();
bindActions();
render();
