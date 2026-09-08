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
  $("#indicatorGrid").innerHTML = metrics.map((metric) => `<article class="indicator indicator--circular"><div class="indicator-copy"><label>${esc(metric.label)}</label><output>${displayMetricValue(metric.actual, metric.unit)} / ${displayMetricValue(metric.target, metric.unit)}</output><small>${metric.note || (metric.key === "small" ? "Junto con las demostraciones grandes aporta" : `Aporta ${metric.weight}% al rebate cuando llega a 100%`)}</small></div><div class="indicator-ring" style="--progress:${metric.percent}%" aria-label="${metric.percent.toFixed(2)}% de cumplimiento"><b>${metric.percent.toFixed(2)}%</b></div></article>`).join("");
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
function reportCircle(percent, label) {
  return `<div class="report-circle" style="--progress:${Math.min(100, percent)}%"><b>${percent.toFixed(0)}%</b><span>${esc(label)}</span></div>`;
}
function reportBarChart(metrics) {
  return `<div class="report-bars">${metrics.map((metric) => `<div class="report-bar"><span>${esc(metric.label)}</span><div><i style="height:${Math.max(3, metric.percent)}%"></i></div><b>${metric.percent.toFixed(0)}%</b></div>`).join("")}</div>`;
}
function reportTrend(partner) {
  return `<div class="report-trend">${["Q1", "Q2", "Q3", "Q4"].map((period) => { const score = evaluation(partner, period).score; return `<div><i style="height:${Math.max(5, score)}%"></i><b>${score}%</b><span>${period}</span></div>`; }).join("")}</div>`;
}
function reportHtml(partner, result, metrics) {
  const values = result.values;
  const completed = metrics.filter((item) => item.percent >= 100).length;
  const pending = metrics.filter((item) => item.percent < 100);
  const recommendations = pending.length ? pending.map((item) => `Completar ${item.label}: faltan ${displayMetricValue(item.target - item.actual, item.unit)}.`) : ["Todos los indicadores alcanzaron el 100 %. Conserve y valide los soportes antes de liquidar el rebate."];
  const cards = metrics.map((item) => `<article class="metric-card"><div><h3>${esc(item.label)}</h3><strong>${displayMetricValue(item.actual, item.unit)}</strong><p>Meta: ${displayMetricValue(item.target, item.unit)}</p><small>${esc(item.note || (item.weight ? `Peso de rebate: ${item.weight}%` : "Parte del bloque de demostraciones"))}</small></div>${reportCircle(item.percent, item.percent >= 100 ? "Cumple" : "En progreso")}</article>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Resumen rebate ${esc(partner.name)}</title><style>
    *{box-sizing:border-box} @page{size:A4 landscape;margin:10mm} body{margin:0;background:#edf2ee;color:#102016;font-family:Arial,Helvetica,sans-serif}.report{width:1120px;margin:24px auto;background:#fff;padding:34px 38px;box-shadow:0 12px 34px #0002}.top{display:flex;justify-content:space-between;gap:30px;padding-bottom:22px;border-bottom:3px solid #29dc75}.brand{display:flex;gap:17px;align-items:flex-start}.mark{display:grid;place-items:center;width:48px;height:48px;border-radius:12px;background:#07150c;color:#29dc75;font-size:21px;font-weight:900}.eyebrow{margin:0;color:#438255;font-size:10px;font-weight:800;letter-spacing:1.2px}.top h1{margin:4px 0;font-size:29px;letter-spacing:-.7px}.top p{margin:0;color:#617066;font-size:12px}.period{min-width:195px;padding:13px 15px;border:1px solid #dce6de;border-radius:11px;background:#f6faf7}.period b{display:block;font-size:13px}.period span{display:block;margin-top:5px;color:#617066;font-size:10px}.overview{display:grid;grid-template-columns:1.2fr repeat(3,1fr);gap:12px;margin:20px 0}.overview article{padding:15px;border:1px solid #dce6de;border-radius:12px;background:#fbfdfb}.overview span{display:block;color:#617066;font-size:10px;text-transform:uppercase;letter-spacing:.6px}.overview strong{display:block;margin:8px 0 3px;font-size:25px}.overview small{color:#438255;font-size:11px;font-weight:700}.section-title{margin:22px 0 10px;font-size:15px;letter-spacing:.2px}.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.metric-card{display:flex;justify-content:space-between;gap:10px;min-height:137px;padding:14px;border:1px solid #dce6de;border-radius:12px;background:#fff}.metric-card h3{max-width:185px;margin:0 0 10px;font-size:13px}.metric-card strong{font-size:16px;color:#092d17}.metric-card p,.metric-card small{display:block;margin:5px 0;color:#617066;font-size:10px;line-height:1.35}.report-circle{--progress:0%;position:relative;display:grid;place-content:center;flex:0 0 72px;width:72px;height:72px;border-radius:50%;background:conic-gradient(#29dc75 var(--progress),#dce6de 0);text-align:center}.report-circle:before{position:absolute;inset:7px;border-radius:50%;background:#fff;content:""}.report-circle b,.report-circle span{position:relative;z-index:1}.report-circle b{font-size:14px}.report-circle span{margin-top:2px;color:#438255;font-size:8px;font-weight:700}.charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.chart{min-height:214px;padding:15px;border:1px solid #dce6de;border-radius:12px}.chart h3{margin:0;font-size:13px}.chart p{margin:4px 0 12px;color:#617066;font-size:10px}.report-bars{display:flex;align-items:end;height:142px;gap:10px;border-bottom:1px solid #cfdbd1}.report-bar{display:grid;grid-template-columns:1fr 28px;grid-template-rows:20px 1fr;gap:2px;flex:1;min-width:0}.report-bar span{grid-column:1/3;overflow:hidden;color:#617066;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.report-bar div{position:relative;overflow:hidden;border-radius:5px 5px 0 0;background:#edf3ee}.report-bar i{position:absolute;right:0;bottom:0;left:0;border-radius:5px 5px 0 0;background:linear-gradient(#38e781,#119952)}.report-bar b{align-self:end;color:#119952;font-size:10px}.report-trend{display:flex;align-items:end;justify-content:space-around;height:142px;border-bottom:1px solid #cfdbd1}.report-trend div{display:grid;grid-template-rows:1fr auto auto;height:100%;min-width:42px;text-align:center}.report-trend i{align-self:end;display:block;border-radius:6px 6px 0 0;background:#163b23}.report-trend b{margin-top:5px;color:#163b23;font-size:10px}.report-trend span{margin-top:2px;color:#617066;font-size:9px}.recommendations{margin-top:18px;padding:17px 18px;border-radius:12px;background:#07150c;color:#fff}.recommendations h3{margin:0 0 9px;color:#79f2a8;font-size:13px}.recommendations ul{display:grid;grid-template-columns:1fr 1fr;gap:7px 22px;margin:0;padding-left:17px}.recommendations li{color:#e3eee5;font-size:10px;line-height:1.4}.footer{display:flex;justify-content:space-between;margin-top:17px;padding-top:11px;border-top:1px solid #dce6de;color:#758277;font-size:9px}@media print{body{background:#fff}.report{width:auto;margin:0;padding:0;box-shadow:none}}
  </style></head><body><main class="report"><header class="top"><div class="brand"><div class="mark">D</div><div><p class="eyebrow">DICOL · CONTROL COMERCIAL</p><h1>Resumen de rebate</h1><p>${esc(partner.name)} · Especialista responsable: ${esc(partnerSpecialistName(partner))}</p></div></div><div class="period"><b>PERIODO ${q()}</b><span>Informe generado para seguimiento del aliado</span></div></header><section class="overview"><article><span>Cumplimiento ponderado</span><strong>${result.score}%</strong><small>${completed}/${metrics.length} indicadores al 100%</small></article><article><span>Categoría</span><strong>${esc(result.tier.name)}</strong><small>Clasificación del trimestre</small></article><article><span>Rebate ganado</span><strong>${result.tier.rebate}%</strong><small>Según cumplimiento binario</small></article><article><span>Compra de equipos</span><strong>${displayMetricValue(values.equipmentTotal, "COP")}</strong><small>${Number(values.equipmentUnits || 0)} unidades registradas</small></article></section><h2 class="section-title">Indicadores del trimestre</h2><section class="metric-grid">${cards}</section><section class="charts"><article class="chart"><h3>Cumplimiento por indicador</h3><p>Avance actual frente a la meta de cada compromiso.</p>${reportBarChart(metrics)}</article><article class="chart"><h3>Avance anual</h3><p>Cumplimiento ponderado por trimestre.</p>${reportTrend(partner)}</article></section><section class="recommendations"><h3>Próximos compromisos</h3><ul>${recommendations.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section><footer class="footer"><span>DICOL · Informe de seguimiento</span><span>Este documento no aprueba pagos; valide soportes y condiciones comerciales.</span><span>${new Date().toLocaleDateString("es-CO")}</span></footer></main></body></html>`;
}
$("#downloadSummaryButton").onclick = () => {
  const partner = currentPartner();
  if (!partner) return;
  const result = evaluation(partner);
  const report = window.open("", "_blank");
  if (!report) return alert("Permita las ventanas emergentes para generar el PDF.");
  report.document.open();
  report.document.write(reportHtml(partner, result, metricDefinitions(result.values, partner)));
  report.document.close();
  report.onload = () => { report.focus(); report.print(); };
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
