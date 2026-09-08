/* La información se consulta y actualiza únicamente en Google Sheets mediante Apps Script. */
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyxEKQfHQ_39AcIjS69B-5xRyleIsL4w25LJTGMmwyKMgp9uLucsNWFfHwuyWBOtUjVjQ/exec";
const POLICY = {
  sales: { label: "Cumplimiento de la meta por compra", weight: 50, target: 100 },
  demos: { label: "Demostraciones pequeñas y grandes", weight: 20, target: 100 },
  parts: { label: "Compra de refacciones", weight: 10, target: 100 },
  pilots: { label: "Certificados DJI Academy", weight: 10, target: 100 },
  information: { label: "Cartas firmadas", weight: 10, target: 100 },
  tiers: [
    { name: "A", min: 80, rebate: 5 },
    { name: "B", min: 60, rebate: 3 },
    { name: "C", min: 0, rebate: 0 },
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
    parameters: data.parameters || [],
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
  const values = { ...(partner.quarters[period] || {}), ...calculatedCompliance(partner, period) };
  const score = Math.round(
    Object.entries(state.policy)
      .filter(([key]) => key !== "tiers")
      .reduce(
        (sum, [key, rule]) =>
          sum + (Number(values[key] || 0) >= 100 ? rule.weight : 0),
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
function parametersFor(partnerId, period = q()) { return state.parameters.filter((item) => item.aliado_id === partnerId && item.periodo === period); }
function parameter(key, partnerId = currentPartner()?.id, period = q()) { return parametersFor(partnerId, period).find((item) => item.clave === key); }
function calculatedCompliance(partner, period = q()) {
  const raw = partner.quarters[period] || {};
  const equipmentTotal = Number(raw.monto_equipos || 0);
  const partsTotal = Number(raw.monto_refacciones || 0);
  const equipmentUnits = Number(raw.resultado_ventas || 0);
  const ratio = equipmentTotal ? (partsTotal / equipmentTotal) * 100 : 0;
  const defaults = { ventas_equipos: 1, demos_pequenas: 3, demos_grandes: 1, porcentaje_refacciones: 8, certificados_dji: 1, cartas_firmadas: 1 };
  const percent = (actual, key) => { const target = Number(parameter(key, partner.id, period)?.meta || defaults[key] || 0); return target ? Math.min(100, (actual / target) * 100) : 0; };
  const demos = Math.min(percent(Number(raw.demos_pequenas || 0), "demos_pequenas"), percent(Number(raw.demos_grandes || 0), "demos_grandes"));
  return { sales: percent(equipmentUnits, "ventas_equipos"), demos, parts: percent(ratio, "porcentaje_refacciones"), pilots: percent(Number(raw.certificados_dji || 0), "certificados_dji"), information: percent(Number(raw.cartas_firmadas || 0), "cartas_firmadas"), equipmentUnits, equipmentTotal, partsTotal, partsRatio: ratio };
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
  $("#projectedRebate").textContent = `${Number(projected).toFixed(1)}%`;
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
  $("#rebateValue").textContent = `${Number(result.tier.rebate)}%`;
  $("#gradeName").textContent = `Categoría ${result.tier.name} · rebate ganado ${result.tier.rebate}%`;
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
  const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
  const billing = Number(result.values.equipmentTotal || 0);
  const units = Number(result.values.equipmentUnits || 0);
  const parts = Number(result.values.partsTotal || 0);
  const indicators = rules();
  const met = indicators.filter((rule) => Number(result.values[rule.key] || 0) >= rule.target).length;
  const calculated = Number(result.values.rebate_calculado || result.tier.rebate || 0);
  const applied = Number(result.values.rebate_aplicado || 0);
  $("#commercialQuarter").textContent = q();
  $("#commercialScore").textContent = `${result.score}%`;
  $("#commercialCalculated").textContent = `${calculated}%`;
  $("#commercialApplied").textContent = `${applied}%`;
  $("#commercialSales").textContent = units;
  $("#commercialBilling").textContent = money(billing);
  $("#commercialDemos").textContent = `${Math.round(Number(result.values.demos || 0))}%`;
  $("#commercialParts").textContent = money(parts);
  $("#commercialPartsChart").textContent = money(parts);
  $("#commercialIndicators").textContent = `${met}/${indicators.length}`;
  $("#commercialStatus").textContent = `Categoría ${result.tier.name} · rebate ganado ${calculated}% · aplicado: ${(applied - calculated).toFixed(1)}% vs. calculado`;
  $("#commercialKpis").innerHTML = indicators.map((rule) => {
    const value = Number(result.values[rule.key] || 0);
    return `<div class="commercial-kpi"><span>${esc(rule.label)}</span><div><i style="width:${Math.min(100, value)}%"></i></div><b>${value}%</b><small>peso ${rule.weight}%</small></div>`;
  }).join("");
  $("#modelSales").innerHTML = `<div><b>Equipos comprados</b><span style="width:${Math.min(100, Number(result.values.sales || 0))}%"></span><small>${units} u</small></div>`;
}
function rules() {
  return Object.entries(state.policy)
    .filter(([key]) => key !== "tiers")
    .map(([key, rule]) => ({ key, ...rule }));
}
function money(value) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
}
function metricDefinitions(values, partner = currentPartner(), period = q()) {
  const target = (key, fallback) => Number(parameter(key, partner.id, period)?.meta || fallback);
  const percent = (actual, goal) => goal ? Math.min(100, (actual / goal) * 100) : 0;
  const partsRate = target("porcentaje_refacciones", 8);
  const expectedParts = Number(values.equipmentTotal || 0) * partsRate / 100;
  return [
    { key: "sales", label: "Meta por compra", actual: Number(values.equipmentUnits || 0), target: target("ventas_equipos", 1), unit: "unidades", weight: 50 },
    { key: "small", label: "Demostraciones pequeñas", actual: Number(values.demos_pequenas || 0), target: target("demos_pequenas", 3), unit: "demostraciones", weight: 0 },
    { key: "large", label: "Demostraciones grandes", actual: Number(values.demos_grandes || 0), target: target("demos_grandes", 1), unit: "demostraciones", weight: 20 },
    { key: "parts", label: "Compra de refacciones", actual: Number(values.partsTotal || 0), target: expectedParts, unit: "COP", weight: 10, note: `${partsRate}% del monto de equipos (${money(Number(values.equipmentTotal || 0))})` },
    { key: "pilots", label: "Pilotos certificados DJI Academy", actual: Number(values.certificados_dji || 0), target: target("certificados_dji", 1), unit: "certificados", weight: 10 },
    { key: "letters", label: "Cartas firmadas", actual: Number(values.cartas_firmadas || 0), target: target("cartas_firmadas", 1), unit: "cartas", weight: 10 },
  ].map((item) => ({ ...item, percent: percent(item.actual, item.target) }));
}
function displayMetricValue(value, unit) { return unit === "COP" ? money(value) : `${Number(value).toLocaleString("es-CO")} ${unit}`; }
function renderIndicators(result) {
  const metrics = metricDefinitions(result.values);
  $("#salesResultInput").value = Number(result.values.resultado_ventas || 0);
  $("#calculatedRebateInput").value = Number(result.values.rebate_calculado || result.tier.rebate || 0);
  $("#appliedRebateInput").value = Number(result.values.rebate_aplicado || 0);
  $("#smallDemosInput").value = Number(result.values.demos_pequenas || 0);
  $("#largeDemosInput").value = Number(result.values.demos_grandes || 0);
  $("#djiCertifiedInput").value = Number(result.values.certificados_dji || 0);
  $("#evaluationJustification").value = result.values.justificacion || "";
  $("#indicatorGrid").innerHTML = metrics.map((metric) => `<article class="indicator"><label>${esc(metric.label)} <output>${displayMetricValue(metric.actual, metric.unit)} / ${displayMetricValue(metric.target, metric.unit)} <b>${metric.percent.toFixed(2)}%</b></output></label><small>${metric.note || (metric.key === "small" ? "Junto con las demostraciones grandes aporta" : `Aporta ${metric.weight}% al rebate cuando llega a 100%`)}</small><progress max="100" value="${metric.percent}"></progress></article>`).join("");
}
function renderRequirements(result) {
  const metrics = metricDefinitions(result.values);
  $("#requirementsProgress").innerHTML = metrics.map((item) => {
    const complete = item.percent >= 100;
    const deficit = Math.max(0, item.target - item.actual);
    const wording = complete ? "Cumplido" : `Faltan ${displayMetricValue(deficit, item.unit)}`;
    return `<article class="requirement ${complete ? "requirement--complete" : ""}"><span>${item.weight ? `Peso ${item.weight}%` : "Parte del peso demos 20%"}</span><b>${esc(item.label)}</b><strong>${item.percent.toFixed(2)}%</strong><small>${wording}</small></article>`;
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
function parameterRow(item = {}) {
  return `<div class="parameter-row"><input data-field="nombre" value="${esc(item.nombre)}" readonly><input data-field="clave" value="${esc(item.clave)}" readonly><input data-field="meta" type="number" min="0" step="0.01" value="${esc(item.meta)}" required><input data-field="unidad" value="${esc(item.unidad)}" readonly></div>`;
}
function renderParameters() {
  const partner = currentPartner();
  if (!partner) return alert("Seleccione primero un aliado.");
  const defaults = [
    ["ventas_equipos", "Meta de compra de equipos", 1, "unidades"], ["demos_pequenas", "Demostraciones pequeñas", 3, "unidades"], ["demos_grandes", "Demostraciones grandes", 1, "unidades"], ["porcentaje_refacciones", "Refacciones sobre monto equipos", 8, "%"], ["certificados_dji", "Pilotos certificados DJI Academy", 1, "certificados"], ["cartas_firmadas", "Cartas firmadas", 1, "cartas"],
  ];
  const items = defaults.map(([clave, nombre, meta, unidad]) => parameter(clave, partner.id) || ({ clave, nombre, meta, unidad }));
  $("#parametersList").innerHTML = items.map(parameterRow).join("");
}
$("#parametersButton").onclick = () => { if (currentPartner()) { renderParameters(); $("#parametersDialog").showModal(); } else alert("Abra la ficha de un aliado para configurar sus metas."); };
$("#parametersForm").onsubmit = (event) => {
  event.preventDefault();
  const items = [...document.querySelectorAll(".parameter-row")].map((row) => ({ aliado_id: currentPartner().id, periodo: q(), nombre: row.querySelector('[data-field="nombre"]').value.trim(), clave: row.querySelector('[data-field="clave"]').value.trim(), meta: row.querySelector('[data-field="meta"]').value, unidad: row.querySelector('[data-field="unidad"]').value }));
  persist("saveParameters", items).then((saved) => { if (saved) $("#parametersDialog").close(); });
};
function makePdf(lines) {
  const clean = (text) => String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
  const text = (value, x, y, size = 10, color = "0.12 0.16 0.14") => `${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${clean(value)}) Tj ET`;
  const content = ["0.04 0.12 0.07 rg 0 760 612 82 re f", text("DICOL  |  CONTROL COMERCIAL", 42, 812, 11, "0.55 0.95 0.66"), text(lines[0], 42, 785, 20, "1 1 1"), text(lines[1], 42, 768, 9, "0.8 0.9 0.83"), "0.93 0.96 0.94 rg 32 640 548 94 re f", text(lines[2], 48, 710, 12), text(lines[3], 48, 685, 12, "0.02 0.42 0.16"), text(lines[4], 48, 660, 11), "0.06 0.14 0.09 rg 32 604 548 25 re f", text("REQUISITOS Y FALTANTES", 45, 612, 10, "1 1 1"), ...lines.slice(5).map((line, index) => text(line, 45, 580 - index * 19, index === 5 ? 11 : 9, index === 7 ? "0.72 0.35 0.12" : "0.12 0.16 0.14"))].join("\n");
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
  const metrics = metricDefinitions(values, partner);
  const missing = metrics.filter((item) => item.percent < 100).map((item) => `faltan ${displayMetricValue(item.target - item.actual, item.unit)} de ${item.label}`);
  const lines = [
    `DICOL | Resumen de rebate - ${partner.name}`, `Periodo: ${q()} | Especialista: ${partnerSpecialistName(partner)}`,
    `Cumplimiento ponderado: ${result.score}% | Nivel: ${result.tier.name}`,
    `Categoría: ${result.tier.name} | Rebate ganado: ${Number(values.rebate_calculado || result.tier.rebate)}% | Rebate aplicado: ${Number(values.rebate_aplicado || 0)}%`,
    `Equipos comprados: ${Number(values.equipmentUnits || 0)} | Monto equipos: ${Number(values.equipmentTotal || 0).toLocaleString("es-CO")} COP`,
    ...metrics.map((item) => `${item.label}: ${displayMetricValue(item.actual, item.unit)} / ${displayMetricValue(item.target, item.unit)} (${item.percent.toFixed(2)}%)`),
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
  $("#policyFields").innerHTML = `<p class="dialog-help">El rebate se determina con cumplimiento binario: un indicador aporta su peso únicamente al llegar a 100%.</p><ul class="policy-rules"><li>Meta por compra: <b>50%</b></li><li>Demostraciones pequeñas y grandes: <b>20%</b> (ambas al 100%)</li><li>Compra de refacciones: <b>10%</b></li><li>Certificados DJI Academy: <b>10%</b></li><li>Cartas firmadas: <b>10%</b></li></ul><p class="dialog-help"><b>Categoría A:</b> ≥ 80% = 5% de rebate · <b>B:</b> ≥ 60% = 3% · <b>C:</b> &lt; 60% = 0%.</p>`;
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
$("#editEvaluationButton").onclick = () => {
  const partner = currentPartner();
  if (!partner) return;
  const values = partner.quarters[q()] || {};
  $("#evaluationDialogPartner").textContent = partner.name;
  $("#evaluationDialogQuarter").textContent = q();
  $("#editSmallDemos").value = Number(values.demos_pequenas || 0);
  $("#editLargeDemos").value = Number(values.demos_grandes || 0);
  $("#editDjiCertified").value = Number(values.certificados_dji || 0);
  $("#editEquipmentUnits").value = Number(values.resultado_ventas || 0);
  $("#editEquipmentAmount").value = Number(values.monto_equipos || 0);
  $("#editPartsAmount").value = Number(values.monto_refacciones || 0);
  $("#editLetters").value = Number(values.cartas_firmadas || 0);
  $("#editAppliedRebate").value = Number(values.rebate_aplicado || 0);
  $("#editJustification").value = values.justificacion || "";
  renderEvaluationPreview();
  $("#evaluationDialog").showModal();
};
function evaluationDraft() {
  const partner = currentPartner();
  return { ...partner, quarters: { ...partner.quarters, [q()]: { ...(partner.quarters[q()] || {}), resultado_ventas: Number($("#editEquipmentUnits").value || 0), monto_equipos: Number($("#editEquipmentAmount").value || 0), monto_refacciones: Number($("#editPartsAmount").value || 0), demos_pequenas: Number($("#editSmallDemos").value || 0), demos_grandes: Number($("#editLargeDemos").value || 0), certificados_dji: Number($("#editDjiCertified").value || 0), cartas_firmadas: Number($("#editLetters").value || 0), rebate_aplicado: Number($("#editAppliedRebate").value || 0), justificacion: $("#editJustification").value.trim() } } };
}
function renderEvaluationPreview() {
  const draft = evaluationDraft();
  const result = evaluation(draft);
  const values = result.values;
  $("#evaluationPreview").innerHTML = `<article><span>Cumplimiento previsto</span><strong>${result.score}%</strong><small>Categoría ${result.tier.name} · rebate ${result.tier.rebate}%</small></article><article><span>Compra de equipos</span><strong>${values.equipmentUnits || 0}</strong><small>${values.sales.toFixed(0)}% de la meta</small></article><article><span>Demostraciones</span><strong>${values.demos.toFixed(0)}%</strong><small>se cumplen pequeñas y grandes</small></article><article><span>DJI Academy</span><strong>${values.pilots.toFixed(0)}%</strong><small>certificados vs. meta</small></article><article><span>Refacciones</span><strong>${money(values.partsTotal)}</strong><small>${values.parts.toFixed(0)}% de cumplimiento</small></article><article><span>Rebate ganado</span><strong>${result.tier.rebate}%</strong><small>A ≥ 80%: 5% · B ≥ 60%: 3%</small></article>`;
}
["#editEquipmentUnits", "#editEquipmentAmount", "#editPartsAmount", "#editSmallDemos", "#editLargeDemos", "#editDjiCertified", "#editLetters", "#editAppliedRebate"].forEach((selector) => $(selector).oninput = renderEvaluationPreview);
$("#evaluationForm").onsubmit = (event) => {
  event.preventDefault();
  const partner = currentPartner();
  const draft = evaluationDraft();
  const result = evaluation(draft);
  persist("saveEvaluation", {
    aliado_id: partner.id,
    periodo: q(),
    resultado_ventas: $("#editEquipmentUnits").value,
    monto_equipos: $("#editEquipmentAmount").value,
    monto_refacciones: $("#editPartsAmount").value,
    rebate_calculado: result.tier.rebate,
    rebate_aplicado: $("#editAppliedRebate").value,
    demos_pequenas: $("#editSmallDemos").value,
    demos_grandes: $("#editLargeDemos").value,
    certificados_dji: $("#editDjiCertified").value,
    certificacion_dji_obligatoria: false,
    justificacion: $("#editJustification").value.trim(), cartas_firmadas: $("#editLetters").value,
    sales: result.values.sales, demos: result.values.demos, parts: result.values.parts, pilots: result.values.pilots, information: result.values.information,
  }).then((saved) => {
    if (!saved) return;
    $("#evaluationDialog").close();
  });
};
$("#deletePartnerButton").onclick = () => {
  const partner = currentPartner();
  if (partner && confirm(`¿Eliminar el aliado ${partner.name}?`)) {
    persist("deletePartner", undefined, partner.id);
  }
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
  render();
};
document
  .querySelectorAll("[data-close]")
  .forEach(
    (button) => (button.onclick = () => $(`#${button.dataset.close}`).close()),
  );
loadData();
