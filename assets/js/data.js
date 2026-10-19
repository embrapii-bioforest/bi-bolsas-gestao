// ============================================================
//  Leitura e normalização da planilha
//  Formato esperado (uma linha por bolsa):
//  Cargo | Titular | Projeto | Tempo (meses) | Status | Valor Original |
//  <mês> | % Sal. Bruto | <mês> | % Sal. Bruto | ...
//  - Cargo/Titular podem vir só na primeira linha de cada pessoa
//  - Linhas com Status "Total" são ignoradas (os totais são recalculados)
// ============================================================
(function (root) {
  "use strict";

  const MESES = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
    janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
    // inglês, caso a planilha esteja com localidade EUA
    feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12,
  };
  const ABREV = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", i = 0, inQuotes = false;
    text = text.replace(/^﻿/, "");
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
      i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // ---------- números ----------
  // aceita "1.600,00", "R$ 1.600,00", "1600.5", "19%", "0,19"
  function parseNumber(v) {
    if (v == null) return null;
    let s = String(v).trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
    if (!s || s === "-") return null;
    const isPct = s.endsWith("%");
    s = s.replace("%", "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    if (!isFinite(n)) return null;
    return isPct ? n : n;
  }

  function parsePct(v) {
    if (v == null || String(v).trim() === "") return null;
    const hasSign = String(v).includes("%");
    const n = parseNumber(v);
    if (n == null) return null;
    // valor bruto de fração (0,19) sem o símbolo %
    return !hasSign && Math.abs(n) <= 1.5 ? n * 100 : n;
  }

  // ---------- cabeçalho de mês -> "AAAA-MM" ----------
  function parseMonthHeader(h) {
    if (!h) return null;
    const s = String(h).trim().toLowerCase();
    let m = s.match(/^([a-zç]+)\.?\s*(?:[-\/ ]|de)\s*\.?\s*(\d{2}|\d{4})$/);
    if (m && MESES[m[1]]) {
      let y = Number(m[2]); if (y < 100) y += 2000;
      return `${y}-${String(MESES[m[1]]).padStart(2, "0")}`;
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/mm/aaaa
    if (m) return `${m[3]}-${String(Number(m[2])).padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})\/(\d{4})$/); // mm/aaaa
    if (m) return `${m[2]}-${String(Number(m[1])).padStart(2, "0")}`;
    m = s.match(/^(\d{4})-(\d{2})(-\d{2})?/); // aaaa-mm(-dd)
    if (m) return `${m[1]}-${m[2]}`;
    return null;
  }

  function monthLabel(key) {
    const [y, mo] = key.split("-");
    return `${ABREV[Number(mo)]}/${y.slice(2)}`;
  }

  const norm = (s) => String(s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

  function normStatus(s) {
    const t = String(s || "").trim().replace(/\s+/g, " ");
    if (!t) return "Sem status";
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  // ---------- linhas da aba -> registros ----------
  function parseSheet(rows, sheetName) {
    const hIdx = rows.slice(0, 15).findIndex((r) => r.some((c) => norm(c) === "titular" || norm(c).endsWith(" titular")));
    if (hIdx < 0) return [];
    const header = rows[hIdx];
    const col = (name) => header.findIndex((c) => norm(c).includes(name));
    const cCargo = col("cargo"), cTit = col("titular"), cProj = col("projeto"),
      cTempo = col("tempo"), cStatus = col("status"), cOrig = col("valor original");

    const monthCols = [];
    header.forEach((h, i) => {
      const key = parseMonthHeader(h);
      if (!key) return;
      const next = header[i + 1];
      monthCols.push({ key, i, pctIdx: next != null && norm(next).includes("%") ? i + 1 : -1 });
    });

    const out = [];
    let cargo = "", titular = "";
    for (const r of rows.slice(hIdx + 1)) {
      const get = (i) => (i >= 0 && i < r.length ? String(r[i]).trim() : "");
      if (get(cCargo)) cargo = get(cCargo);
      if (get(cTit)) titular = get(cTit);
      const status = get(cStatus);
      const projeto = get(cProj);
      if (norm(status) === "total" || norm(projeto) === "total") continue;
      if (!projeto || !titular) continue;

      const meses = {};
      for (const m of monthCols) {
        const valor = parseNumber(get(m.i));
        const pct = m.pctIdx >= 0 ? parsePct(get(m.pctIdx)) : null;
        if (valor) meses[m.key] = { valor, pct: pct || 0 };
      }
      out.push({
        aba: sheetName.replace(/_/g, " "),
        cargo: cargo || "—",
        titular,
        projeto: projeto.replace(/\s+/g, " "),
        tempo: parseNumber(get(cTempo)),
        status: normStatus(status),
        valorOriginal: parseNumber(get(cOrig)),
        meses,
      });
    }
    return out;
  }

  // ---------- busca ----------
  function sheetUrl(cfg, sheet) {
    if (sheet.csvUrl) return sheet.csvUrl + (sheet.csvUrl.includes("?") ? "&" : "?") + "_=" + Date.now();
    const p = new URLSearchParams({ tqx: "out:csv", headers: "1", sheet: sheet.name, _: String(Date.now()) });
    if (sheet.range) p.set("range", sheet.range);
    return `https://docs.google.com/spreadsheets/d/${cfg.SHEET_ID}/gviz/tq?${p}`;
  }

  async function fetchSheet(cfg, sheet) {
    let res;
    try {
      res = await fetch(sheetUrl(cfg, sheet), { cache: "no-store" });
    } catch (_) {
      throw new Error(`Sem conexão com o Google Planilhas ao ler a aba "${sheet.name}". Verifique a internet e se a planilha está compartilhada como "Qualquer pessoa com o link: Leitor".`);
    }
    const text = await res.text();
    if (!res.ok || /^\s*</.test(text) || text.includes("google.visualization.Query.setResponse")) {
      throw new Error(`Não foi possível ler a aba "${sheet.name}". Confira se a planilha é uma Planilha Google nativa e está compartilhada como "Qualquer pessoa com o link: Leitor".`);
    }
    return parseSheet(parseCSV(text), sheet.name);
  }

  async function loadAll(cfg) {
    const results = await Promise.allSettled(cfg.SHEETS.map((s) => fetchSheet(cfg, s)));
    const records = [], errors = [];
    results.forEach((r) => (r.status === "fulfilled" ? records.push(...r.value) : errors.push(r.reason.message)));
    if (!records.length && errors.length) throw new Error(errors[0]);
    return { records, errors };
  }

  const api = { parseCSV, parseNumber, parsePct, parseMonthHeader, monthLabel, parseSheet, loadAll, norm };
  if (typeof module !== "undefined") module.exports = api;
  else root.SheetData = api;
})(typeof window !== "undefined" ? window : globalThis);
