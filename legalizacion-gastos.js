const STORAGE_KEY = 'dicol.legalizacion.salidas';

const state = {
  expenses: [],
  activeId: null,
};

const elements = {
  expenseList: document.querySelector('#expenseList'),
  expenseForm: document.querySelector('#expenseForm'),
  expenseName: document.querySelector('#expenseName'),
  expenseOwner: document.querySelector('#expenseOwner'),
  expenseDate: document.querySelector('#expenseDate'),
  expenseNotes: document.querySelector('#expenseNotes'),
  scanInput: document.querySelector('#scanInput'),
  invoiceCufe: document.querySelector('#invoiceCufe'),
  invoiceNumber: document.querySelector('#invoiceNumber'),
  invoiceSupplier: document.querySelector('#invoiceSupplier'),
  invoiceAmount: document.querySelector('#invoiceAmount'),
  invoiceTable: document.querySelector('#invoiceTable'),
  saveStatus: document.querySelector('#saveStatus'),
  printSheet: document.querySelector('#printSheet'),
};

function createId() {
  return `SAL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

function currency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function loadExpenses() {
  try {
    state.expenses = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    state.expenses = [];
  }

  if (state.expenses.length === 0) {
    createExpense(false);
  } else {
    state.activeId = state.expenses[0].id;
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses));
  elements.saveStatus.textContent = 'Guardado';
}

function activeExpense() {
  return state.expenses.find((expense) => expense.id === state.activeId);
}

function createExpense(shouldRender = true) {
  const expense = {
    id: createId(),
    name: 'Nueva salida',
    owner: '',
    date: today(),
    notes: '',
    invoices: [],
    createdAt: new Date().toISOString(),
  };

  state.expenses.unshift(expense);
  state.activeId = expense.id;
  persist();

  if (shouldRender) {
    render();
    elements.expenseName.focus();
    elements.expenseName.select();
  }
}

function saveActiveExpense() {
  const expense = activeExpense();
  if (!expense) return;

  expense.name = elements.expenseName.value.trim() || 'Salida sin nombre';
  expense.owner = elements.expenseOwner.value.trim();
  expense.date = elements.expenseDate.value || today();
  expense.notes = elements.expenseNotes.value.trim();
  persist();
  renderExpenseList();
}

function deleteActiveExpense() {
  const expense = activeExpense();
  if (!expense) return;

  const confirmed = window.confirm(`¿Eliminar la salida "${expense.name}"?`);
  if (!confirmed) return;

  state.expenses = state.expenses.filter((item) => item.id !== expense.id);
  state.activeId = state.expenses[0]?.id || null;

  if (!state.activeId) {
    createExpense(false);
  }

  persist();
  render();
}

function parseScanText() {
  const text = elements.scanInput.value.trim();
  if (!text) return;

  const cufeMatch = text.match(/[a-fA-F0-9]{40,}/);
  const invoiceMatch = text.match(/(?:factura|invoice|fac|no\.?|nro\.?)\s*[:#-]?\s*([A-Z0-9-]{4,})/i);
  const nitMatch = text.match(/(?:nit|proveedor)\s*[:#-]?\s*([0-9.-]{6,})/i);
  const valueMatch = text.match(/(?:valor|total|amount)\s*[:$-]?\s*([0-9.,]+)/i);

  elements.invoiceCufe.value = cufeMatch?.[0] || text;
  elements.invoiceNumber.value = invoiceMatch?.[1] || elements.invoiceNumber.value;
  elements.invoiceSupplier.value = nitMatch?.[1] || elements.invoiceSupplier.value;
  elements.invoiceAmount.value = valueMatch?.[1]?.replace(/\./g, '').replace(',', '.') || elements.invoiceAmount.value;
  elements.saveStatus.textContent = 'Escaneo leído';
}

function addInvoice() {
  const expense = activeExpense();
  if (!expense) return;

  const cufe = elements.invoiceCufe.value.trim();
  if (!cufe) {
    elements.invoiceCufe.focus();
    elements.saveStatus.textContent = 'CUFE requerido';
    return;
  }

  expense.invoices.push({
    id: createId(),
    cufe,
    number: elements.invoiceNumber.value.trim(),
    supplier: elements.invoiceSupplier.value.trim(),
    amount: Number(elements.invoiceAmount.value || 0),
  });

  elements.scanInput.value = '';
  elements.invoiceCufe.value = '';
  elements.invoiceNumber.value = '';
  elements.invoiceSupplier.value = '';
  elements.invoiceAmount.value = '';

  persist();
  renderInvoices();
  renderExpenseList();
}

function removeInvoice(invoiceId) {
  const expense = activeExpense();
  if (!expense) return;

  expense.invoices = expense.invoices.filter((invoice) => invoice.id !== invoiceId);
  persist();
  renderInvoices();
  renderExpenseList();
}

function renderExpenseList() {
  elements.expenseList.innerHTML = '';

  state.expenses.forEach((expense) => {
    const total = expense.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const button = document.createElement('button');
    button.className = `expense-item${expense.id === state.activeId ? ' is-active' : ''}`;
    button.type = 'button';
    button.innerHTML = `
      <strong>${expense.name}</strong>
      <span>${expense.date || 'Sin fecha'} · ${expense.invoices.length} factura(s)</span>
      <small>${currency(total)}</small>
    `;
    button.addEventListener('click', () => {
      saveActiveExpense();
      state.activeId = expense.id;
      render();
    });
    elements.expenseList.appendChild(button);
  });
}

function renderForm() {
  const expense = activeExpense();
  if (!expense) return;

  elements.expenseName.value = expense.name;
  elements.expenseOwner.value = expense.owner;
  elements.expenseDate.value = expense.date;
  elements.expenseNotes.value = expense.notes;
}

function renderInvoices() {
  const expense = activeExpense();
  elements.invoiceTable.innerHTML = '';

  if (!expense || expense.invoices.length === 0) {
    elements.invoiceTable.innerHTML = '<tr><td colspan="5" class="empty-row">Aún no hay facturas cargadas para esta salida.</td></tr>';
    return;
  }

  expense.invoices.forEach((invoice) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${invoice.cufe}</td>
      <td>${invoice.number || '-'}</td>
      <td>${invoice.supplier || '-'}</td>
      <td>${currency(invoice.amount)}</td>
      <td><button class="table-action" type="button">Eliminar</button></td>
    `;
    row.querySelector('button').addEventListener('click', () => removeInvoice(invoice.id));
    elements.invoiceTable.appendChild(row);
  });
}

function render() {
  renderExpenseList();
  renderForm();
  renderInvoices();
}

function downloadCsv() {
  saveActiveExpense();
  const expense = activeExpense();
  if (!expense) return;

  const rows = [
    ['Salida', expense.name],
    ['Responsable', expense.owner],
    ['Fecha', expense.date],
    ['Observaciones', expense.notes],
    [],
    ['CUFE', 'Factura', 'Proveedor / NIT', 'Valor'],
    ...expense.invoices.map((invoice) => [invoice.cufe, invoice.number, invoice.supplier, invoice.amount]),
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
  saveActiveExpense();
  const expense = activeExpense();
  if (!expense) return;

  const total = expense.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const rows = expense.invoices.map((invoice) => `
    <tr>
      <td>${invoice.cufe}</td>
      <td>${invoice.number || '-'}</td>
      <td>${invoice.supplier || '-'}</td>
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
          <tr><th>CUFE</th><th>Factura</th><th>Proveedor / NIT</th><th>Valor</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4">Sin facturas cargadas.</td></tr>'}</tbody>
        <tfoot><tr><th colspan="3">Total</th><th>${currency(total)}</th></tr></tfoot>
      </table>
    </div>
  `;
}

function printPdf() {
  buildPrintSheet();
  window.print();
}

function bindActions() {
  document.querySelectorAll('[data-action="new-expense"]').forEach((button) => {
    button.addEventListener('click', () => createExpense());
  });

  document.querySelector('[data-action="save-expense"]').addEventListener('click', saveActiveExpense);
  document.querySelector('[data-action="delete-expense"]').addEventListener('click', deleteActiveExpense);
  document.querySelector('[data-action="parse-scan"]').addEventListener('click', parseScanText);
  document.querySelector('[data-action="add-invoice"]').addEventListener('click', addInvoice);
  document.querySelector('[data-action="download-csv"]').addEventListener('click', downloadCsv);
  document.querySelector('[data-action="print-pdf"]').addEventListener('click', printPdf);

  elements.expenseForm.addEventListener('input', () => {
    elements.saveStatus.textContent = 'Cambios pendientes';
  });
}

loadExpenses();
bindActions();
render();
