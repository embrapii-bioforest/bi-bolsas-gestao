// ============================================================
//  Dashboard — estado, filtros, gráficos e atualização automática
// ============================================================
(function () {
  "use strict";
  const CFG = window.DASHBOARD_CONFIG;
  const D = window.SheetData;
  const $ = (s) => document.querySelector(s);
  const REFRESH_MS = (CFG.REFRESH_MINUTES || 5) * 60 * 1000;
  const DEMO = new URLSearchParams(location.search).has("demo");

  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const BRL0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const PCT = (n) => `${Math.round(n)}%`;
  const ALL = "__all__";

  const state = {
    records: [],
    months: [],
    colors: new Map(),
    pessoas: new Set(),
    aba: ALL, cargo: ALL, projeto: ALL, status: ALL,
    from: null, to: null, ref: null,
    search: "",
    sort: { key: "titular", dir: 1 },
    lastUpdate: null, nextUpdate: null, loading: false,
  };
  const charts = {};
  let firstRender = true;

  // ---------------- utilidades ----------------
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const palette = () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css(`--s${i}`));
  const uniq = (arr) => [...new Set(arr)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const currentMonthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const inRange = (m) => m >= state.from && m <= state.to;
  const statusClass = (s) => (D.norm(s).includes("exec") ? "badge--exec" : D.norm(s).includes("tram") ? "badge--tram" : "");

  // Cor fixa por pessoa: a cor acompanha a pessoa, não a posição no filtro.
  function assignColors() {
    const totals = new Map();
    state.records.forEach((r) => totals.set(r.titular, (totals.get(r.titular) || 0) + Object.values(r.meses).reduce((a, m) => a + m.valor, 0)));
    const ordered = [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a));
    state.colors = new Map(ordered.map((p, i) => [p, i < 8 ? i : -1]));
  }
  // Cores para um conjunto visível de entidades. Pessoas mantêm o slot global;
  // se houver espaço, quem não tem slot recebe um livre. Excedente vira "Outros".
  function colorSlots(keys, global) {
    const slots = new Map(), used = new Set();
    keys.forEach((k) => { const s = global ? global.get(k) : -1; if (s >= 0) { slots.set(k, s); used.add(s); } });
    const free = [0, 1, 2, 3, 4, 5, 6, 7].filter((s) => !used.has(s));
    keys.forEach((k) => { if (!slots.has(k) && free.length) slots.set(k, free.shift()); });
    return slots;
  }
  const personColor = (p) => { const s = state.colors.get(p); return s >= 0 ? palette()[s] : css("--other"); };

  // ---------------- filtros ----------------
  function matches(r, ignore = {}) {
    if (!ignore.pessoa && state.pessoas.size && !state.pessoas.has(r.titular)) return false;
    if (!ignore.aba && state.aba !== ALL && r.aba !== state.aba) return false;
    if (!ignore.cargo && state.cargo !== ALL && r.cargo !== state.cargo) return false;
    if (!ignore.projeto && state.projeto !== ALL && r.projeto !== state.projeto) return false;
    if (!ignore.status && state.status !== ALL && r.status !== state.status) return false;
    return true;
  }
  const filtered = () => state.records.filter((r) => matches(r));

  function fillSelect(el, values, current, allLabel) {
    const opts = [`<option value="${ALL}">${allLabel}</option>`].concat(values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`));
    el.innerHTML = opts.join("");
    el.value = values.includes(current) ? current : ALL;
    return el.value;
  }
  function fillMonthSelect(el, current) {
    el.innerHTML = state.months.map((m) => `<option value="${m}">${D.monthLabel(m)}</option>`).join("");
    el.value = current;
  }

  function renderFilters() {
    const sorted = (a) => a.sort((x, y) => x.localeCompare(y, "pt-BR"));
    state.aba = fillSelect($("#f-aba"), sorted(uniq(state.records.map((r) => r.aba))), state.aba, "Todas");
    state.cargo = fillSelect($("#f-cargo"), sorted(uniq(state.records.filter((r) => matches(r, { cargo: 1, projeto: 1, status: 1 })).map((r) => r.cargo))), state.cargo, "Todos");
    state.projeto = fillSelect($("#f-projeto"), sorted(uniq(state.records.filter((r) => matches(r, { projeto: 1, status: 1 })).map((r) => r.projeto))), state.projeto, "Todos");
    state.status = fillSelect($("#f-status"), sorted(uniq(state.records.filter((r) => matches(r, { status: 1 })).map((r) => r.status))), state.status, "Todos");
    fillMonthSelect($("#f-from"), state.from);
    fillMonthSelect($("#f-to"), state.to);
    fillMonthSelect($("#f-ref"), state.ref);
  }

  function renderChips() {
    const base = state.records.filter((r) => matches(r, { pessoa: 1 }));
    const counts = new Map();
    base.forEach((r) => counts.set(r.titular, (counts.get(r.titular) || 0) + 1));
    const all = uniq(state.records.map((r) => r.titular)).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const q = D.norm(state.search);
    const shown = all.filter((p) => !q || D.norm(p).includes(q) || state.pessoas.has(p));
    const chip = (p) => `<button class="chip" type="button" data-p="${esc(p)}" aria-pressed="${state.pessoas.has(p)}">
        <span class="chip__sw" style="background:${personColor(p)}"></span>${esc(p)}<span class="chip__n">${counts.get(p) || 0}</span></button>`;
    $("#people-chips").innerHTML =
      `<button class="chip chip--all" type="button" data-p="${ALL}" aria-pressed="${state.pessoas.size === 0}">Todas<span class="chip__n">${uniq(base.map((r) => r.titular)).length}</span></button>` +
      shown.map(chip).join("");
  }

  // ---------------- KPIs ----------------
  function renderKPIs(rows) {
    const ref = state.ref;
    const refRows = rows.filter((r) => r.meses[ref]);
    const totalRef = refRows.reduce((a, r) => a + r.meses[ref].valor, 0);
    const periodo = state.months.filter(inRange);
    const totalPeriodo = rows.reduce((a, r) => a + periodo.reduce((b, m) => b + (r.meses[m]?.valor || 0), 0), 0);
    const pctByPerson = new Map();
    refRows.forEach((r) => pctByPerson.set(r.titular, (pctByPerson.get(r.titular) || 0) + r.meses[ref].pct));
    const pessoasAtivas = pctByPerson.size;

    let pctKpi;
    if (pctByPerson.size === 1) {
      const [[p, v]] = [...pctByPerson];
      pctKpi = { label: "% do salário bruto comprometido", value: PCT(v), sub: p };
    } else if (pctByPerson.size) {
      const [p, v] = [...pctByPerson].sort((a, b) => b[1] - a[1])[0];
      pctKpi = { label: "Maior % do salário bruto", value: PCT(v), sub: p };
    } else pctKpi = { label: "% do salário bruto", value: "—", sub: "sem bolsas no mês" };

    const kpis = [
      { label: `Total em ${D.monthLabel(ref)}`, value: BRL.format(totalRef), sub: `${refRows.length} bolsa${refRows.length === 1 ? "" : "s"} ativa${refRows.length === 1 ? "" : "s"}` },
      { label: "Total no período", value: BRL0.format(totalPeriodo), sub: `${D.monthLabel(state.from)} a ${D.monthLabel(state.to)} · ${periodo.length} meses` },
      { label: `Pessoas com bolsa em ${D.monthLabel(ref)}`, value: String(pessoasAtivas), sub: `${uniq(refRows.map((r) => r.projeto)).length} projetos` },
      pctKpi,
    ];
    $("#kpis").innerHTML = kpis.map((k) => `<div class="kpi"><div class="kpi__label">${esc(k.label)}</div><div class="kpi__value">${esc(k.value)}</div><div class="kpi__sub">${esc(k.sub)}</div></div>`).join("");
  }

  // ---------------- gráficos ----------------
  const valueLabels = {
    id: "valueLabels",
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.format) return;
      const { ctx } = chart;
      ctx.save();
      ctx.font = `600 12px ${css("--font-display")}`;
      ctx.fillStyle = css("--text-2");
      ctx.textBaseline = "middle";
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const v = chart.data.datasets[0].data[i];
        if (v == null) return;
        ctx.fillText(opts.format(v), bar.x + 6, bar.y);
      });
      ctx.restore();
    },
  };

  function baseOptions() {
    const text2 = css("--text-2"), muted = css("--muted"), grid = css("--grid");
    Chart.defaults.font.family = css("--font");
    Chart.defaults.color = muted;
    return {
      responsive: true, maintainAspectRatio: false,
      animation: firstRender ? { duration: 400 } : false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: text2, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3, padding: 14 } },
        tooltip: {
          backgroundColor: css("--surface"), titleColor: css("--text"), bodyColor: text2,
          borderColor: css("--axis"), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: css("--axis") }, ticks: { color: muted } },
        y: { grid: { color: grid }, border: { display: false }, ticks: { color: muted } },
      },
    };
  }

  function draw(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  function renderMonthly(rows) {
    const months = state.months.filter(inRange);
    const onePerson = state.pessoas.size === 1;
    const keyOf = (r) => (onePerson ? r.projeto : r.titular);
    $("#chart-monthly-title").textContent = onePerson ? `Desembolso mensal por projeto — ${[...state.pessoas][0]}` : "Desembolso mensal por pessoa";

    const totals = new Map();
    rows.forEach((r) => totals.set(keyOf(r), (totals.get(keyOf(r)) || 0) + months.reduce((a, m) => a + (r.meses[m]?.valor || 0), 0)));
    let keys = [...totals.keys()].filter((k) => totals.get(k) > 0).sort((a, b) => totals.get(b) - totals.get(a));
    const slots = colorSlots(keys, onePerson ? null : state.colors);
    const named = keys.filter((k) => slots.has(k));
    const others = keys.filter((k) => !slots.has(k));
    const pal = palette(), surface = css("--surface");

    const series = (filterFn) => months.map((m) => rows.filter(filterFn).reduce((a, r) => a + (r.meses[m]?.valor || 0), 0) || null);
    const datasets = named.map((k) => ({ label: k, data: series((r) => keyOf(r) === k), backgroundColor: pal[slots.get(k)] }));
    if (others.length) datasets.push({ label: `Outros (${others.length})`, data: series((r) => others.includes(keyOf(r))), backgroundColor: css("--other") });
    datasets.forEach((d) => Object.assign(d, { borderColor: surface, borderWidth: 1, borderRadius: 3, borderSkipped: false, maxBarThickness: 44, stack: "s" }));

    const refIdx = months.indexOf(state.ref);
    const opts = baseOptions();
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;
    opts.scales.y.ticks.callback = (v) => BRL0.format(v);
    opts.scales.x.ticks.font = (ctx) => (ctx.index === refIdx ? { weight: "700" } : {});
    opts.scales.x.ticks.color = (ctx) => (ctx.index === refIdx ? css("--text") : css("--muted"));
    opts.plugins.legend.position = "bottom";
    opts.plugins.tooltip.callbacks = {
      label: (c) => (c.raw ? ` ${c.dataset.label}: ${BRL.format(c.raw)}` : null),
      footer: (items) => `Total: ${BRL.format(items.reduce((a, i) => a + (i.raw || 0), 0))}`,
    };
    opts.plugins.tooltip.itemSort = (a, b) => (b.raw || 0) - (a.raw || 0);
    draw("chart-monthly", { type: "bar", data: { labels: months.map(D.monthLabel), datasets }, options: opts });
  }

  function horizontalBar(id, boxId, labels, values, colors, fmt, max) {
    $(boxId).style.height = `${Math.max(140, labels.length * 34 + 30)}px`;
    const opts = baseOptions();
    opts.indexAxis = "y";
    opts.interaction = { mode: "nearest", axis: "y", intersect: false };
    opts.plugins.legend.display = false;
    opts.plugins.valueLabels = { format: fmt };
    opts.plugins.tooltip.callbacks = { label: (c) => ` ${fmt(c.raw)}` };
    opts.layout = { padding: { right: 70 } };
    opts.scales.x = { grid: { color: css("--grid") }, border: { display: false }, ticks: { color: css("--muted"), callback: fmt, maxTicksLimit: 5 }, beginAtZero: true, suggestedMax: max };
    opts.scales.y = { grid: { display: false }, border: { color: css("--axis") }, ticks: { color: css("--text-2") } };
    draw(id, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, borderSkipped: "start", maxBarThickness: 20 }] },
      options: opts, plugins: [valueLabels],
    });
  }

  function renderPct(rows) {
    const ref = state.ref;
    $("#chart-pct-sub").textContent = `Soma dos % por pessoa em ${D.monthLabel(ref)}`;
    const m = new Map();
    rows.forEach((r) => { if (r.meses[ref]) m.set(r.titular, (m.get(r.titular) || 0) + r.meses[ref].pct); });
    const entries = [...m].sort((a, b) => b[1] - a[1]);
    horizontalBar("chart-pct", "#pct-box", entries.map((e) => e[0]), entries.map((e) => e[1]), entries.map((e) => personColor(e[0])), PCT, 100);
  }

  function renderProjects(rows) {
    const ref = state.ref;
    const m = new Map();
    rows.forEach((r) => { if (r.meses[ref]) m.set(r.projeto, (m.get(r.projeto) || 0) + r.meses[ref].valor); });
    const entries = [...m].sort((a, b) => b[1] - a[1]);
    horizontalBar("chart-proj", "#proj-box", entries.map((e) => e[0]), entries.map((e) => e[1]), css("--s1"), (v) => BRL0.format(v));
  }

  // ---------------- tabela ----------------
  const COLS = [
    { key: "titular", label: "Pessoa" },
    { key: "cargo", label: "Cargo" },
    { key: "projeto", label: "Projeto" },
    { key: "aba", label: "Aba" },
    { key: "status", label: "Status" },
    { key: "valorRef", label: "Valor no mês", num: true },
    { key: "valorOriginal", label: "Valor original", num: true },
    { key: "inicio", label: "Início" },
    { key: "fim", label: "Fim" },
    { key: "restantes", label: "Meses restantes", num: true },
    { key: "timeline", label: "Linha do tempo", nosort: true },
  ];

  function tableRows(rows) {
    return rows.map((r) => {
      const ms = Object.keys(r.meses).sort();
      return {
        ...r,
        valorRef: r.meses[state.ref]?.valor || 0,
        pctRef: r.meses[state.ref]?.pct || 0,
        inicio: ms[0] || "", fim: ms[ms.length - 1] || "",
        restantes: ms.filter((m) => m > state.ref).length,
      };
    });
  }

  function renderTable(rows) {
    const data = tableRows(rows);
    const { key, dir } = state.sort;
    data.sort((a, b) => {
      const x = a[key], y = b[key];
      const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
      return c * dir || a.titular.localeCompare(b.titular, "pt-BR") || a.projeto.localeCompare(b.projeto, "pt-BR");
    });
    const months = state.months.filter(inRange);
    $("#table thead").innerHTML = "<tr>" + COLS.map((c) =>
      `<th data-k="${c.key}" class="${c.num ? "num" : ""}" ${c.nosort ? "" : `aria-sort="${c.key === key ? (dir > 0 ? "ascending" : "descending") : "none"}"`}>${c.label}</th>`).join("") + "</tr>";
    $("#table tbody").innerHTML = data.map((r) => `<tr>
      <td><span class="person-cell"><span class="chip__sw" style="background:${personColor(r.titular)}"></span>${esc(r.titular)}</span></td>
      <td>${esc(r.cargo)}</td>
      <td>${esc(r.projeto)}</td>
      <td>${esc(r.aba)}</td>
      <td><span class="badge ${statusClass(r.status)}">${esc(r.status)}</span></td>
      <td class="num">${r.valorRef ? BRL.format(r.valorRef) + ` <span class="muted">(${PCT(r.pctRef)})</span>` : "—"}</td>
      <td class="num">${r.valorOriginal ? BRL.format(r.valorOriginal) : "—"}</td>
      <td>${r.inicio ? D.monthLabel(r.inicio) : "—"}</td>
      <td>${r.fim ? D.monthLabel(r.fim) : "—"}</td>
      <td class="num">${r.restantes}</td>
      <td><span class="timeline" title="${months.map((m) => `${D.monthLabel(m)}: ${r.meses[m] ? BRL.format(r.meses[m].valor) : "—"}`).join("\n")}">${months.map((m) => `<span class="${r.meses[m] ? "on" : ""} ${m === state.ref ? "ref" : ""}"></span>`).join("")}</span></td>
    </tr>`).join("") || `<tr><td colspan="${COLS.length}" class="muted">Nenhuma bolsa com esses filtros.</td></tr>`;
    const total = data.reduce((a, r) => a + r.valorRef, 0);
    $("#table-sub").textContent = `${data.length} bolsa${data.length === 1 ? "" : "s"} · ${BRL.format(total)} em ${D.monthLabel(state.ref)}`;
  }

  function downloadCSV() {
    const rows = tableRows(filtered());
    const months = state.months.filter(inRange);
    const head = ["Pessoa", "Cargo", "Projeto", "Aba", "Status", "Tempo (meses)", "Valor original", ...months.map(D.monthLabel)];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const num = (n) => (n == null ? "" : String(n).replace(".", ","));
    const lines = [head.map(q).join(";")].concat(rows.map((r) =>
      [r.titular, r.cargo, r.projeto, r.aba, r.status, r.tempo ?? "", num(r.valorOriginal), ...months.map((m) => num(r.meses[m]?.valor))].map(q).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `bolsas_${state.ref}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------- URL (filtros compartilháveis) ----------------
  function writeHash() {
    const p = new URLSearchParams();
    if (state.pessoas.size) p.set("pessoa", [...state.pessoas].join("|"));
    ["aba", "cargo", "projeto", "status"].forEach((k) => state[k] !== ALL && p.set(k, state[k]));
    if (state.ref !== defaultRef()) p.set("ref", state.ref);
    if (state.from !== state.months[0]) p.set("de", state.from);
    if (state.to !== state.months[state.months.length - 1]) p.set("ate", state.to);
    const h = p.toString();
    history.replaceState(null, "", location.pathname + location.search + (h ? "#" + h : ""));
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get("pessoa")) state.pessoas = new Set(p.get("pessoa").split("|"));
    ["aba", "cargo", "projeto", "status"].forEach((k) => p.get(k) && (state[k] = p.get(k)));
    state._hash = { ref: p.get("ref"), from: p.get("de"), to: p.get("ate") };
  }
  function defaultRef() {
    const now = currentMonthKey();
    if (state.months.includes(now)) return now;
    const past = state.months.filter((m) => m <= now);
    return past.length ? past[past.length - 1] : state.months[0];
  }

  // ---------------- render geral ----------------
  function render() {
    if (!state.records.length) return;
    renderFilters();
    renderChips();
    const rows = filtered();
    renderKPIs(rows);
    renderMonthly(rows);
    renderPct(rows);
    renderProjects(rows);
    renderTable(rows);
    writeHash();
    firstRender = false;
  }

  // ---------------- carga e atualização ----------------
  async function loadData() {
    if (DEMO) {
      const txt = await (await fetch("data/exemplo.csv", { cache: "no-store" })).text();
      return { records: D.parseSheet(D.parseCSV(txt), "Gestão"), errors: [] };
    }
    return D.loadAll(CFG);
  }

  function setStatus() {
    const el = $("#refresh-status");
    if (state.loading) { el.innerHTML = `<span class="dot dot--busy"></span>Atualizando dados…`; return; }
    if (!state.lastUpdate) return;
    const left = Math.max(0, state.nextUpdate - Date.now());
    const mm = Math.floor(left / 60000), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
    const hora = state.lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `<span class="dot ${state.error ? "dot--err" : ""}"></span>${state.error ? "Falha na última tentativa · dados de" : "Atualizado às"} ${hora} · próxima em ${mm}:${ss}`;
  }

  let timer = null;
  async function refresh() {
    clearTimeout(timer);
    state.loading = true; setStatus();
    $("#btn-refresh").disabled = true;
    try {
      const { records, errors } = await loadData();
      const hadData = state.records.length > 0;
      state.records = records;
      state.months = uniq(records.flatMap((r) => Object.keys(r.meses))).sort();
      assignColors();
      if (!hadData) {
        const h = state._hash || {};
        state.ref = state.months.includes(h.ref) ? h.ref : defaultRef();
        state.from = state.months.includes(h.from) ? h.from : state.months[0];
        state.to = state.months.includes(h.to) ? h.to : state.months[state.months.length - 1];
      } else {
        if (!state.months.includes(state.ref)) state.ref = defaultRef();
        if (!state.months.includes(state.from)) state.from = state.months[0];
        if (!state.months.includes(state.to)) state.to = state.months[state.months.length - 1];
      }
      state.lastUpdate = new Date(); state.error = null;
      showError(errors.length ? errors.join(" ") : "");
      render();
    } catch (e) {
      state.error = e.message;
      showError(e.message);
      if (!state.lastUpdate) $("#refresh-status").innerHTML = `<span class="dot dot--err"></span>Não foi possível carregar os dados`;
    } finally {
      state.loading = false;
      $("#btn-refresh").disabled = false;
      state.nextUpdate = Date.now() + REFRESH_MS;
      timer = setTimeout(refresh, REFRESH_MS);
      setStatus();
    }
  }
  function showError(msg) { const el = $("#error"); el.hidden = !msg; el.textContent = msg; }

  // ---------------- eventos ----------------
  function bind() {
    $("#people-chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      const p = b.dataset.p;
      if (p === ALL) state.pessoas.clear();
      else if (e.ctrlKey || e.metaKey || e.shiftKey) state.pessoas.has(p) ? state.pessoas.delete(p) : state.pessoas.add(p);
      else state.pessoas = state.pessoas.size === 1 && state.pessoas.has(p) ? new Set() : new Set([p]);
      render();
    });
    $("#people-search").addEventListener("input", (e) => { state.search = e.target.value; renderChips(); });
    const sel = { "#f-aba": "aba", "#f-cargo": "cargo", "#f-projeto": "projeto", "#f-status": "status", "#f-ref": "ref" };
    Object.entries(sel).forEach(([id, k]) => $(id).addEventListener("change", (e) => { state[k] = e.target.value; render(); }));
    $("#f-from").addEventListener("change", (e) => { state.from = e.target.value; if (state.from > state.to) state.to = state.from; render(); });
    $("#f-to").addEventListener("change", (e) => { state.to = e.target.value; if (state.to < state.from) state.from = state.to; render(); });
    $("#btn-clear").addEventListener("click", () => {
      Object.assign(state, { pessoas: new Set(), aba: ALL, cargo: ALL, projeto: ALL, status: ALL, search: "",
        ref: defaultRef(), from: state.months[0], to: state.months[state.months.length - 1] });
      $("#people-search").value = "";
      render();
    });
    $("#btn-refresh").addEventListener("click", refresh);
    $("#btn-csv").addEventListener("click", downloadCSV);
    $("#table thead").addEventListener("click", (e) => {
      const th = e.target.closest("th[aria-sort]"); if (!th) return;
      const k = th.dataset.k;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (COLS.find((c) => c.key === k).num ? -1 : 1) };
      renderTable(filtered());
    });
    $("#btn-theme").addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === "dark"
        : matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch (_) {}
      render();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
    // Volta para a aba depois de muito tempo: atualiza na hora se estiver vencido.
    document.addEventListener("visibilitychange", () => { if (!document.hidden && state.nextUpdate && Date.now() >= state.nextUpdate) refresh(); });
    setInterval(setStatus, 1000);
  }

  // ---------------- início ----------------
  try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (_) {}
  $("#title").textContent = CFG.TITLE || "Dashboard";
  if (CFG.SUBTITLE != null) $("#eyebrow").textContent = CFG.SUBTITLE;
  document.title = `${CFG.TITLE || "Dashboard"} · ${CFG.SUBTITLE || ""}`.replace(/ · $/, "");
  $("#foot-min").textContent = CFG.REFRESH_MINUTES || 5;
  $("#demo-banner").hidden = !DEMO;
  readHash();
  bind();
  refresh();
  // Redesenha os gráficos quando as fontes da marca terminam de carregar.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => state.records.length && render());
})();
