/* La información se consulta y actualiza únicamente en Google Sheets mediante Apps Script. */
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyxEKQfHQ_39AcIjS69B-5xRyleIsL4w25LJTGMmwyKMgp9uLucsNWFfHwuyWBOtUjVjQ/exec";
const POLICY = {
  sales: { label: "PSI / ventas", weight: 50, target: 100 },
  demos: { label: "Demostraciones", weight: 20, target: 100 },
  parts: { label: "Repuestos", weight: 10, target: 100 },
  pilots: { label: "Pilotos certificados", weight: 10, target: 100 },
  information: { label: "Información y soportes", weight: 10, target: 100 },
  tiers: [
    { name: "A", min: 80, rebate: 10 },
    { name: "B", min: 60, rebate: 5 },
    { name: "C", min: 0, rebate: 3 },
  ],
};
const emptyState = {
  policy: POLICY,
  specialists: [],
  partners: [],
};
let state = emptyState;
let selectedPartnerId;
let activeView = "general";
let editingEvaluation = false;
const pendingActions = new Set();
const $ = (selector) => document.querySelector(selector);
const q = () => $("#quarterFilter").value;
const currentPartner = () =>
  state.partners.find((p) => p.id === selectedPartnerId);
const specialist = (id) => state.specialists.find((s) => s.id === id);
function setConnectionStatus(message, isError = false) {
  const status = $("#connectionStatus");
  status.textContent = message;
  status.classList.toggle("connection-status--error", isError);
}
function normalizeData(data) {
  return {
    policy: { ...POLICY, ...(data.policy || {}) },
    specialists: (data.specialists || []).map((person) => ({
      id: person.id,
      name: person.nombre,
      zone: person.zona,
      createdAt: person.creado_en,
    })),
    partners: (data.partners || []).map((partner) => ({
      id: partner.id,
      name: partner.nombre,
      specialistId: partner.especialista_id,
      zone: partner.zona,
      notes: partner.notas,
      quarters: partner.quarters || {},
      createdAt: partner.creado_en,
    })),
    prices: data.prices || [],
    kits: data.kits || [],
    sales: data.sales || [],
  };
}
async function api(action, data, id) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: action === "getData" ? "GET" : "POST",
    headers: action === "getData" ? undefined : { "Content-Type": "text/plain;charset=utf-8" },
    body: action === "getData" ? undefined : JSON.stringify({ action, data, id }),
  });
  if (!response.ok) throw new Error(`No fue posible conectar con Google Sheets (${response.status}).`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "Google Sheets no aceptó la solicitud.");
  return payload.data;
}
async function loadData() {
  setConnectionStatus("Conectando con Google Sheets…");
  try {
    state = normalizeData(await api("getData"));
    selectedPartnerId = state.partners.some((partner) => partner.id === selectedPartnerId)
      ? selectedPartnerId
      : state.partners[0]?.id;
    setConnectionStatus("Datos sincronizados con Google Sheets.");
  } catch (error) {
    state = emptyState;
    selectedPartnerId = undefined;
    setConnectionStatus(error.message, true);
  }
  render();
}
async function persist(action, data, id) {
  if (pendingActions.has(action)) return false;
  pendingActions.add(action);
  document.querySelectorAll(`[data-save-action="${action}"]`).forEach((button) => (button.disabled = true));
  try {
    setConnectionStatus("Guardando en Google Sheets…");
    await api(action, data, id);
    await loadData();
    return true;
  } catch (error) {
    setConnectionStatus(error.message, true);
    return false;
  } finally {
    pendingActions.delete(action);
    document.querySelectorAll(`[data-save-action="${action}"]`).forEach((button) => (button.disabled = false));
  }
}
function evaluation(partner, period = q()) {
  const values = partner.quarters[period] || {};
  const score = Math.round(
    Object.entries(state.policy)
      .filter(([key]) => key !== "tiers")
      .reduce(
        (sum, [key, rule]) =>
          sum + (Math.min(100, Number(values[key] || 0)) / 100) * rule.weight,
        0,
      ),
  );
  return {
    score,
    values,
    tier:
      state.policy.tiers.find((tier) => score >= tier.min) ||
      state.policy.tiers.at(-1),
  };
}
function allEvaluations() {
  return state.partners.map((partner) => ({ partner, ...evaluation(partner) }));
}
function partnerSpecialistName(partner) {
  return specialist(partner.specialistId)?.name || "Sin especialista asignado";
}
function render() {
  renderSummary();
  renderTabs();
  renderGeneral();
  renderSpecialists();
  renderPartnerList();
  renderPartnerDetail();
}
function renderSummary() {
  const results = allEvaluations();
  const average = results.length
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : 0;
  const projected = results.length
    ? (
        results.reduce((sum, r) => sum + r.tier.rebate, 0) / results.length
      ).toFixed(1)
    : 0;
  $("#partnerCount").textContent = results.length;
  $("#partnerCountDetail").textContent =
    `${state.specialists.length} especialista(s) DICOL`;
  $("#averageScore").textContent = `${average}%`;
  $("#projectedRebate").textContent = `${(22 + Number(projected)).toFixed(1)}%`;
  $("#atRiskCount").textContent = results.filter((r) => r.score < 60).length;
}
function renderTabs() {
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === activeView),
    );
  $("#generalView").hidden = activeView !== "general";
  $("#specialistsView").hidden = activeView !== "specialists";
  $("#partnerView").hidden = activeView !== "partner";
}
function renderGeneral() {
  const rows = allEvaluations().sort((a, b) => a.score - b.score);
  $("#generalTable").innerHTML =
    `<table class="rebate-table"><thead><tr><th>Aliado</th><th>Especialista DICOL</th><th>Zona</th><th>Cumplimiento ${q()}</th><th>Nivel</th><th>Rebate proyectado</th><th></th></tr></thead><tbody>${rows.map(({ partner, score, tier }) => `<tr><td><b>${esc(partner.name)}</b></td><td>${esc(partnerSpecialistName(partner))}</td><td>${esc(partner.zone || "—")}</td><td>${score}%</td><td><span class="status-pill status-${tier.name.toLowerCase()}">${tier.name}</span></td><td>${tier.rebate}%</td><td><button data-open-partner="${partner.id}">Ver ficha</button></td></tr>`).join("") || '<tr><td colspan="7">Aún no hay aliados registrados.</td></tr>'}</tbody></table>`;
  document.querySelectorAll("[data-open-partner]").forEach(
    (button) =>
      (button.onclick = () => {
        selectedPartnerId = button.dataset.openPartner;
        editingEvaluation = false;
        activeView = "partner";
        render();
      }),
  );
}
function renderSpecialists() {
  const cards =
    state.specialists
      .map((person) => {
        const results = allEvaluations().filter(
          (x) => x.partner.specialistId === person.id,
        );
        const average = results.length
          ? Math.round(
              results.reduce((sum, x) => sum + x.score, 0) / results.length,
            )
          : 0;
        const atRisk = results.filter((x) => x.score < 60).length;
        return `<article class="specialist-card"><p class="eyebrow">ESPECIALISTA DICOL · ${esc(person.zone || "SIN ZONA")}</p><h3>${esc(person.name)}</h3><p>${results.length} aliado(s) asignado(s) · ${atRisk} requieren gestión.</p><strong>${average}%</strong><small>cumplimiento promedio de su cartera</small><div class="mini-progress"><span style="width:${average}%"></span></div><button class="rebate-button" data-filter-specialist="${person.id}">Ver sus aliados</button></article>`;
      })
      .join("") ||
    '<p class="empty-state">Agregue el primer especialista de DICOL.</p>';
  $("#specialistCards").innerHTML = cards;
  document.querySelectorAll("[data-filter-specialist]").forEach(
    (button) =>
      (button.onclick = () => {
        activeView = "partner";
        $("#partnerSearch").value = specialist(
          button.dataset.filterSpecialist,
        ).name;
        renderPartnerList(button.dataset.filterSpecialist);
        renderTabs();
      }),
  );
}
function renderPartnerList(forceSpecialistId) {
  const search = ($("#partnerSearch")?.value || "").toLowerCase();
  const list = state.partners.filter((partner) =>
    forceSpecialistId
      ? partner.specialistId === forceSpecialistId
      : `${partner.name} ${partnerSpecialistName(partner)}`
          .toLowerCase()
          .includes(search),
  );
  $("#partnerList").innerHTML =
    list
      .map((partner) => {
        const result = evaluation(partner);
        return `<button class="partner-item ${partner.id === selectedPartnerId ? "active" : ""}" data-partner-id="${partner.id}"><b>${esc(partner.name)}</b><small>${esc(partnerSpecialistName(partner))} · ${result.score}% · Nivel ${result.tier.name}</small></button>`;
      })
      .join("") || '<p class="empty-state">No hay aliados coincidentes.</p>';
  document.querySelectorAll("[data-partner-id]").forEach(
    (button) =>
      (button.onclick = () => {
        selectedPartnerId = button.dataset.partnerId;
        editingEvaluation = false;
        renderPartnerList();
        renderPartnerDetail();
      }),
  );
}
function renderPartnerDetail() {
  const partner = currentPartner();
  $("#emptyState").hidden = Boolean(partner);
  $("#detailContent").hidden = !partner;
  if (!partner) return;
  $("#editEvaluationButton").hidden = editingEvaluation;
  $("#saveIndicatorsButton").hidden = !editingEvaluation;
  const result = evaluation(partner);
  $("#detailName").textContent = partner.name;
  $("#detailSpecialist").textContent =
    `ESPECIALISTA DICOL RESPONSABLE · ${partnerSpecialistName(partner).toUpperCase()}`;
  $("#detailContext").textContent = [partner.zone, partner.notes]
    .filter(Boolean)
    .join(" · ");
  $("#scoreValue").textContent = `${result.score}%`;
  $("#scoreGrade").textContent = `Nivel ${result.tier.name}`;
  document
    .querySelector(".score-ring")
    .style.setProperty("--score", `${result.score}%`);
  $("#scoreExplanation").textContent =
    result.score >= 80
      ? "Cumple la meta del nivel superior en este trimestre."
      : result.score >= 60
        ? "Cumple el mínimo, pero tiene oportunidades para alcanzar el nivel A."
        : "No alcanza el mínimo trimestral; requiere un plan de acción con el especialista DICOL.";
  $("#rebateValue").textContent = `${22 + Number(result.tier.rebate)}%`;
  $("#gradeName").textContent = `Margen base 22% + rebate ${result.tier.rebate}% · Nivel ${result.tier.name}`;
  renderCommercialOverview(result);
  $("#policyNote").textContent = `Política activa: ${rules()
    .map((rule) => `${rule.label} ${rule.weight}%`)
    .join(" · ")}. Los valores son porcentajes de cumplimiento contra la meta.`;
  renderIndicators(result);
  renderRequirements(result);
  renderTrend(partner);
  renderInsights(result);
}
function renderCommercialOverview(result) {
  const partnerSales = state.sales.filter((sale) => sale.aliado_id === currentPartner().id && sale.periodo === q());
  const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
  const billing = partnerSales.reduce((sum, sale) => sum + Number(sale.total_iva || 0), 0);
  const units = partnerSales.filter((sale) => sale.tipo !== "refaccion").reduce((sum, sale) => sum + Number(sale.cantidad || 0), 0);
  const parts = partnerSales.filter((sale) => sale.tipo === "refaccion").reduce((sum, sale) => sum + Number(sale.total_iva || 0), 0);
  const indicators = rules();
  const met = indicators.filter((rule) => Number(result.values[rule.key] || 0) >= rule.target).length;
  const calculated = Number(result.values.rebate_calculado || result.tier.rebate || 0);
  const applied = Number(result.values.rebate_aplicado || 0);
  $("#commercialQuarter").textContent = q();
  $("#commercialScore").textContent = `${result.score}%`;
  $("#commercialCalculated").textContent = `${22 + calculated}%`;
  $("#commercialApplied").textContent = `${22 + applied}%`;
  $("#commercialSales").textContent = units;
  $("#commercialBilling").textContent = money(billing);
  $("#commercialDemos").textContent = `${Number(result.values.demos || 0)}%`;
  $("#commercialParts").textContent = money(parts);
  $("#commercialPartsChart").textContent = money(parts);
  $("#commercialIndicators").textContent = `${met}/${indicators.length}`;
  $("#commercialStatus").textContent = `Nivel ${result.tier.name} · Margen 22% + rebate ${calculated}% · aplicado: ${(applied - calculated).toFixed(1)}% vs. calculado`;
  $("#commercialKpis").innerHTML = indicators.map((rule) => {
    const value = Number(result.values[rule.key] || 0);
    return `<div class="commercial-kpi"><span>${esc(rule.label)}</span><div><i style="width:${Math.min(100, value)}%"></i></div><b>${value}%</b><small>peso ${rule.weight}%</small></div>`;
  }).join("");
  const models = partnerSales.filter((sale) => sale.tipo !== "refaccion").reduce((all, sale) => ((all[sale.modelo] = (all[sale.modelo] || 0) + Number(sale.cantidad || 0)), all), {});
  $("#modelSales").innerHTML = Object.entries(models).map(([model, quantity]) => `<div><b>${esc(model)}</b><span style="width:${Math.min(100, quantity * 12)}%"></span><small>${quantity} u</small></div>`).join("") || '<p class="empty-state">Registre ventas para ver unidades por modelo.</p>';
}
function rules() {
  return Object.entries(state.policy)
    .filter(([key]) => key !== "tiers")
    .map(([key, rule]) => ({ key, ...rule }));
}
function renderIndicators(result) {
  $("#salesResultInput").value = Number(result.values.resultado_ventas || 0);
  $("#calculatedRebateInput").value = Number(result.values.rebate_calculado || result.tier.rebate || 0);
  $("#appliedRebateInput").value = Number(result.values.rebate_aplicado || 0);
  $("#smallDemosInput").value = Number(result.values.demos_pequenas || 0);
  $("#largeDemosInput").value = Number(result.values.demos_grandes || 0);
  $("#djiCertifiedInput").value = Number(result.values.certificados_dji || 0);
  $("#evaluationJustification").value = result.values.justificacion || "";
  ["#salesResultInput", "#calculatedRebateInput", "#appliedRebateInput", "#smallDemosInput", "#largeDemosInput", "#djiCertifiedInput", "#evaluationJustification"].forEach((selector) => ($(selector).disabled = !editingEvaluation));
  $("#indicatorGrid").innerHTML = rules()
    .map((rule) => {
      const value = Number(result.values[rule.key] || 0);
      return `<article class="indicator"><label>${esc(rule.label)} <span class="info-tooltip" tabindex="0">i<span>Porcentaje de cumplimiento respaldado por evidencias del trimestre. La política lo pondera con un peso de ${rule.weight}%.</span></span><output>${value}%</output></label><small>Peso ${rule.weight}% · meta ${rule.target}%</small><input type="range" min="0" max="100" value="${value}" data-indicator="${rule.key}" ${editingEvaluation ? "" : "disabled"}><progress max="100" value="${value}"></progress></article>`;
    })
    .join("");
  document.querySelectorAll("[data-indicator]").forEach(
    (input) =>
      (input.oninput = () => {
        input.parentElement.querySelector("output").textContent =
          `${input.value}%`;
        input.parentElement.querySelector("progress").value = input.value;
      }),
  );
}
function renderRequirements(result) {
  const values = result.values;
  const requirements = [
    { label: "Demos pequeñas", current: Number(values.demos_pequenas || 0), target: 3, required: true },
    { label: "Demo grande", current: Number(values.demos_grandes || 0), target: 1, required: true },
    { label: "Certificación DJI", current: Number(values.certificados_dji || 0), target: 1, required: false },
  ];
  $("#requirementsProgress").innerHTML = requirements.map((item) => {
    const complete = item.current >= item.target;
    const wording = complete ? "Cumplido" : `Faltan ${item.target - item.current}`;
    return `<article class="requirement ${complete ? "requirement--complete" : ""}"><span>${item.required ? "Obligatorio" : "Recomendado"}</span><b>${esc(item.label)}</b><strong>${item.current}/${item.target}</strong><small>${wording}${item.required ? " para postular rebate" : " · aún no obligatorio"}</small></article>`;
  }).join("");
}
function renderTrend(partner) {
  $("#trendChart").innerHTML = ["Q1", "Q2", "Q3", "Q4"]
    .map((period) => {
      const score = evaluation(partner, period).score;
      return `<div style="height:${Math.max(5, score)}%"><span>${score}%</span></div>`;
    })
    .join("");
}
function renderInsights(result) {
  const pending = rules()
    .filter((rule) => Number(result.values[rule.key] || 0) < rule.target)
    .sort(
      (a, b) =>
        Number(result.values[a.key] || 0) - Number(result.values[b.key] || 0),
    );
  $("#statusTitle").textContent =
    result.score >= 80
      ? "Cumple los requisitos medidos para el nivel A."
      : result.score >= 60
        ? "Cumple parcialmente y puede mejorar su rebate."
        : "Está incumpliendo la meta trimestral.";
  $("#statusText").textContent =
    result.score >= 80
      ? "Conserve evidencias, confirme las condiciones comerciales y valide el resultado con el especialista DICOL antes de liquidar."
      : "Esta ficha indica qué revisar con el aliado. No sustituye la validación de la política, facturación ni documentos soporte.";
  $("#priorityActions").innerHTML = (
    pending.length
      ? pending
          .slice(0, 3)
          .map(
            (rule) =>
              `<li>Completar <b>${esc(rule.label)}</b> hasta la meta del ${rule.target}%.</li>`,
          )
      : [
          "<li>Todos los indicadores medidos alcanzan la meta. Revisar soportes y condiciones de la política.</li>",
        ]
  ).join("");
}
function openPartnerDialog(partner) {
  if (!state.specialists.length) {
    alert("Agregue primero un especialista de DICOL.");
    $("#specialistDialog").showModal();
    return;
  }
  $("#partnerDialogTitle").textContent = partner
    ? "Editar aliado"
    : "Agregar aliado";
  $("#partnerSubmitButton").textContent = partner
    ? "Guardar cambios"
    : "Guardar aliado";
  $("#partnerId").value = partner?.id || "";
  $("#partnerName").value = partner?.name || "";
  $("#partnerZone").value = partner?.zone || "";
  $("#partnerNotes").value = partner?.notes || "";
  $("#partnerSpecialist").innerHTML = state.specialists
    .map(
      (person) =>
        `<option value="${person.id}" ${partner?.specialistId === person.id ? "selected" : ""}>${esc(person.name)}${person.zone ? ` — ${esc(person.zone)}` : ""}</option>`,
    )
    .join("");
  $("#partnerDialog").showModal();
}
function renderSpecialistManager() {
  $("#specialistManager").innerHTML =
    state.specialists
      .map((person) => {
        const assigned = state.partners.filter(
          (partner) => partner.specialistId === person.id,
        ).length;
        return `<div class="manager-row"><div><b>${esc(person.name)}</b><span>${esc(person.zone || "Sin zona")} · ${assigned} aliado(s)</span></div><button class="text-danger" data-delete-specialist="${person.id}" ${assigned ? 'disabled title="Reasigne los aliados antes de eliminar"' : ""}>Eliminar</button></div>`;
      })
      .join("") ||
    '<p class="dialog-help">No hay especialistas registrados.</p>';
  document.querySelectorAll("[data-delete-specialist]").forEach(
    (button) =>
      (button.onclick = () => {
        persist("deleteSpecialist", undefined, button.dataset.deleteSpecialist).then(
          (saved) => saved && renderSpecialistManager(),
        );
      }),
  );
}
function esc(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
}
$("#newPartnerButton").onclick = () => openPartnerDialog();
$("#editPartnerButton").onclick = () => openPartnerDialog(currentPartner());
$("#reassignPartnerButton").onclick = () => openPartnerDialog(currentPartner());
$("#specialistButton").onclick = () => {
  renderSpecialistManager();
  $("#specialistDialog").showModal();
};
function renderCatalog() {
  const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
  $("#catalogList").innerHTML = state.prices.length
    ? state.prices.map((item) => `<div class="catalog-row"><div><b>${esc(item.descripcion)}</b><small>${esc(item.modelo)} · ${esc(item.categoria)}</small></div><span>Final: ${money(item.precio_final_iva)}<br>Aliado: ${money(item.precio_aliado_iva)}</span></div>`).join("")
    : '<p class="dialog-help">Aún no hay productos. Agregue el primero a continuación.</p>';
}
$("#catalogButton").onclick = () => {
  $("#catalogForm").reset();
  $("#catalogId").value = "";
  $("#catalogMargin").value = 22;
  renderCatalog();
  $("#catalogDialog").showModal();
};
$("#catalogForm").onsubmit = (event) => {
  event.preventDefault();
  persist("savePrice", {
    id: $("#catalogId").value || `pr-${Date.now()}`,
    descripcion: $("#catalogDescription").value.trim(), modelo: $("#catalogModel").value.trim(),
    categoria: $("#catalogCategory").value, precio_final_iva: $("#catalogFinalIva").value,
    precio_final_sin_iva: $("#catalogFinalNoIva").value, precio_aliado_iva: $("#catalogPartnerIva").value,
    precio_aliado_sin_iva: $("#catalogPartnerNoIva").value, margen_base: $("#catalogMargin").value,
  }).then((saved) => {
    if (!saved) return;
    event.target.reset();
    $("#catalogMargin").value = 22;
    renderCatalog();
  });
};
function makePdf(lines) {
  const clean = (text) => String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
  const content = lines.map((line, index) => `BT /F1 ${index === 0 ? 18 : 10} Tf 45 ${790 - index * 18} Td (${clean(line)}) Tj ET`).join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
$("#downloadSummaryButton").onclick = () => {
  const partner = currentPartner();
  if (!partner) return;
  const result = evaluation(partner);
  const values = result.values;
  const missing = [
    Number(values.demos_pequenas || 0) < 3 && `faltan ${3 - Number(values.demos_pequenas || 0)} demos pequenas`,
    Number(values.demos_grandes || 0) < 1 && "falta 1 demo grande",
    Number(values.certificados_dji || 0) < 1 && "se recomienda certificar 1 persona DJI",
  ].filter(Boolean);
  const lines = [
    `DICOL | Resumen de rebate - ${partner.name}`, `Periodo: ${q()} | Especialista: ${partnerSpecialistName(partner)}`,
    `Cumplimiento ponderado: ${result.score}% | Nivel: ${result.tier.name}`,
    `Margen base: 22% | Rebate calculado: ${Number(values.rebate_calculado || result.tier.rebate)}% | Margen proyectado: ${22 + Number(values.rebate_calculado || result.tier.rebate)}%`,
    `Ventas calificadas: ${Number(values.resultado_ventas || 0)} | Facturacion registrada: ${state.sales.filter((sale) => sale.aliado_id === partner.id && sale.periodo === q()).reduce((sum, sale) => sum + Number(sale.total_iva || 0), 0).toLocaleString("es-CO")} COP`,
    `Demos pequenas: ${Number(values.demos_pequenas || 0)}/3 | Demos grandes: ${Number(values.demos_grandes || 0)}/1`,
    `Certificados DJI: ${Number(values.certificados_dji || 0)}/1 (recomendado, aun no obligatorio)`,
    `Pendientes: ${missing.length ? missing.join("; ") : "Requisitos operativos registrados. Validar soportes."}`,
    "Indicadores de politica:", ...rules().map((rule) => `- ${rule.label}: ${Number(values[rule.key] || 0)}% (peso ${rule.weight}%)`),
    `Soportes / justificacion: ${values.justificacion || "Sin registrar"}`,
    "Este resumen es de seguimiento; no autoriza pagos. Validar politica vigente, facturas y evidencias antes de liquidar.",
  ];
  const url = URL.createObjectURL(makePdf(lines));
  const link = Object.assign(document.createElement("a"), { href: url, download: `resumen-rebate-${partner.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${q()}.pdf` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("#policyButton").onclick = () => {
  const fields = `${rules()
    .map(
      (rule) =>
        `<label>${esc(rule.label)} — peso (%)<input name="${rule.key}" type="number" min="0" max="100" value="${rule.weight}"></label>`,
    )
    .join("")}<p class="dialog-help">Rebate adicional sobre el margen base de 22 %. El margen mostrado será 22 % + el rebate del nivel.</p>${state.policy.tiers.map((tier) => `<label>Nivel ${esc(tier.name)} — rebate adicional (%)<input name="tier-${esc(tier.name)}" type="number" min="0" max="100" step="0.01" value="${tier.rebate}"></label>`).join("")}`;
  $("#policyFields").innerHTML = fields;
  $("#policyDialog").showModal();
};
$("#partnerForm").onsubmit = (event) => {
  event.preventDefault();
  const id = $("#partnerId").value || `pa-${Date.now()}`;
  const old = state.partners.find((partner) => partner.id === id);
  const partner = {
    id,
    nombre: $("#partnerName").value.trim(),
    especialista_id: $("#partnerSpecialist").value,
    zona: $("#partnerZone").value.trim(),
    notas: $("#partnerNotes").value.trim(),
    creado_en: old?.createdAt,
  };
  if (!partner.nombre) return;
  const duplicate = state.partners.some((item) => item.id !== id && item.name.trim().toUpperCase() === partner.nombre.toUpperCase());
  if (duplicate) return alert("Ya existe un aliado activo con ese nombre.");
  persist("savePartner", partner).then((saved) => {
    if (!saved) return;
    selectedPartnerId = id;
    $("#partnerDialog").close();
    activeView = "partner";
    render();
  });
};
$("#specialistForm").onsubmit = (event) => {
  event.preventDefault();
  const name = $("#specialistName").value.trim();
  if (!name) return;
  if (state.specialists.some((person) => person.name.trim().toUpperCase() === name.toUpperCase())) return alert("Ya existe un especialista activo con ese nombre.");
  const specialistData = {
    id: `sp-${Date.now()}`,
    nombre: name,
    zona: $("#specialistZone").value.trim(),
  };
  persist("saveSpecialist", specialistData).then((saved) => {
    if (!saved) return;
    event.target.reset();
    renderSpecialistManager();
  });
};
$("#policyForm").onsubmit = (event) => {
  event.preventDefault();
  const policy = [
    ...rules().map((rule) => ({
      type: "indicador",
      key: rule.key,
      label: rule.label,
      value: Math.max(0, Number(event.target.elements[rule.key].value) || 0),
      target: rule.target,
    })),
    ...state.policy.tiers.map((tier) => ({
      type: "nivel",
      key: tier.name,
      label: `Nivel ${tier.name}`,
      value: Math.max(0, Number(event.target.elements[`tier-${tier.name}`].value) || 0),
      target: tier.min,
    })),
  ];
  persist("savePolicy", policy).then((saved) => {
    if (saved) $("#policyDialog").close();
  });
};
$("#editEvaluationButton").onclick = () => {
  editingEvaluation = true;
  $("#editEvaluationButton").hidden = true;
  $("#saveIndicatorsButton").hidden = false;
  renderPartnerDetail();
};
$("#saveIndicatorsButton").onclick = () => {
  const partner = currentPartner();
  if (!partner) return;
  partner.quarters[q()] = partner.quarters[q()] || {};
  document
    .querySelectorAll("[data-indicator]")
    .forEach(
      (input) =>
        (partner.quarters[q()][input.dataset.indicator] = Number(input.value)),
    );
  persist("saveEvaluation", {
    aliado_id: partner.id,
    periodo: q(),
    resultado_ventas: $("#salesResultInput").value,
    rebate_calculado: $("#calculatedRebateInput").value,
    rebate_aplicado: $("#appliedRebateInput").value,
    demos_pequenas: $("#smallDemosInput").value,
    demos_grandes: $("#largeDemosInput").value,
    certificados_dji: $("#djiCertifiedInput").value,
    certificacion_dji_obligatoria: false,
    justificacion: $("#evaluationJustification").value.trim(),
    ...partner.quarters[q()],
  }).then((saved) => {
    if (!saved) return;
    editingEvaluation = false;
    $("#editEvaluationButton").hidden = false;
    $("#saveIndicatorsButton").hidden = true;
    render();
  });
};
$("#deletePartnerButton").onclick = () => {
  const partner = currentPartner();
  if (partner && confirm(`¿Eliminar el aliado ${partner.name}?`)) {
    persist("deletePartner", undefined, partner.id);
  }
};
$("#newSaleButton").onclick = () => {
  const items = [...state.prices, ...state.kits];
  if (!items.length) return alert("Primero agregue el catálogo en las hojas Precios o Kits.");
  $("#saleItem").innerHTML = items.map((item) => `<option value="${esc(item.id)}">${esc(item.descripcion || item.nombre)} · ${esc(item.modelo || "sin modelo")}</option>`).join("");
  $("#saleDate").value = new Date().toISOString().slice(0, 10);
  $("#saleQuantity").value = 1;
  $("#saleDialog").showModal();
};
$("#saleForm").onsubmit = (event) => {
  event.preventDefault();
  const partner = currentPartner();
  if (!partner) return;
  persist("saveSale", { aliado_id: partner.id, periodo: q(), item_id: $("#saleItem").value, fecha: $("#saleDate").value, cantidad: $("#saleQuantity").value }).then((saved) => { if (saved) $("#saleDialog").close(); });
};
$("#partnerSearch").oninput = () => renderPartnerList();
document.querySelectorAll("[data-view]").forEach(
  (button) =>
    (button.onclick = () => {
      activeView = button.dataset.view;
      render();
    }),
);
$("#quarterFilter").onchange = () => {
  editingEvaluation = false;
  $("#editEvaluationButton").hidden = false;
  $("#saveIndicatorsButton").hidden = true;
  render();
};
document
  .querySelectorAll("[data-close]")
  .forEach(
    (button) => (button.onclick = () => $(`#${button.dataset.close}`).close()),
  );
loadData();
