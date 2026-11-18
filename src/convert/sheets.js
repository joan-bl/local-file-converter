// Hojas de cálculo con SheetJS: Excel, LibreOffice, CSV, TSV, JSON y HTML.

import { baseName, extOf } from "./registry.js";

export async function convert(file, to, options = {}, onProgress = () => {}) {
  const XLSX = await import("xlsx");
  const ext = extOf(file.name);
  let wb;
  if (ext === "json") {
    let data = JSON.parse(await file.text());
    if (!Array.isArray(data)) {
      // { hoja1: [...], hoja2: [...] } o un objeto suelto
      const arrays = Object.entries(data).filter(([, v]) => Array.isArray(v));
      wb = XLSX.utils.book_new();
      if (arrays.length) arrays.forEach(([k, v]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(v), k.slice(0, 31)));
      else XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([data]), "Hoja1");
    } else {
      wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Hoja1");
    }
  } else if (ext === "csv" || ext === "tsv") {
    // Leer como texto respeta las tildes (UTF-8) y detecta ; o , como separador
    const text = await file.text();
    const first = text.split("\n", 1)[0];
    const FS = ext === "tsv" ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
    // raw: todo como texto, y los números se interpretan aquí: con ";" se usa la coma decimal
    // española (1.234,50); con "," el punto decimal (1,234.50). Así "1,50" no se convierte en 150.
    wb = XLSX.read(text, { type: "string", FS, raw: true });
    for (const n of wb.SheetNames) fixNumbers(wb.Sheets[n], FS === ";" ? "," : ".");
  } else {
    wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
  }
  onProgress(0.5);
  const base = baseName(file.name);
  const names = wb.SheetNames;
  const out = [];

  const perSheet = (fn, outExt, mime) => {
    for (const n of names) {
      const fname = names.length > 1 ? `${base} - ${n}.${outExt}` : `${base}.${outExt}`;
      out.push({ name: fname, blob: new Blob([fn(wb.Sheets[n])], { type: mime }) });
    }
  };

  if (to === "csv") {
    // con BOM para que Excel lo abra con las tildes bien
    perSheet((s) => "﻿" + XLSX.utils.sheet_to_csv(s, { FS: options.csvSep || ",", blankrows: false }), "csv", "text/csv;charset=utf-8");
  } else if (to === "tsv") {
    perSheet((s) => XLSX.utils.sheet_to_csv(s, { FS: "\t", blankrows: false }), "tsv", "text/tab-separated-values;charset=utf-8");
  } else if (to === "json") {
    const rows = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null }).map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? localDate(v) : v])));
    const obj = names.length > 1 ? Object.fromEntries(names.map((n) => [n, rows(n)])) : rows(names[0]);
    out.push({ name: `${base}.json`, blob: new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }) });
  } else if (to === "html") {
    const body = names.map((n) => `<h2>${n.replace(/</g, "&lt;")}</h2>${XLSX.utils.sheet_to_html(wb.Sheets[n], { header: "", footer: "" })}`).join("\n");
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${base}</title><style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse}td{border:1px solid #ccc;padding:3px 6px}</style></head><body>${body}</body></html>`;
    out.push({ name: `${base}.html`, blob: new Blob([html], { type: "text/html;charset=utf-8" }) });
  } else if (["xlsx", "xls", "ods"].includes(to)) {
    const bookType = to === "xls" ? "biff8" : to;
    const data = XLSX.write(wb, { type: "array", bookType, compression: true });
    out.push({ name: `${base}.${to}`, blob: new Blob([data]) });
  } else {
    throw new Error(`No sé convertir hojas de cálculo a ${to}.`);
  }
  onProgress(1);
  return out;
}

/** Convierte a número un texto que lo es, según el separador decimal (null si no lo es). */
export function parseNumber(text, decimal) {
  const t = String(text).trim();
  if (!t) return null;
  const re = decimal === ","
    ? /^[-+]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/
    : /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
  if (!re.test(t)) return null;
  // 007, códigos postales, teléfonos con 0 delante: se quedan como texto
  if (/^[-+]?0\d/.test(t) && !t.includes(decimal)) return null;
  const norm = decimal === "," ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function fixNumbers(ws, decimal) {
  for (const addr of Object.keys(ws)) {
    if (addr[0] === "!") continue;
    const c = ws[addr];
    if (c.t !== "s") continue;
    const n = parseNumber(c.v, decimal);
    if (n !== null) ws[addr] = { t: "n", v: n };
  }
}

/** Fecha sin desplazarla a UTC: 2026-11-01 (con hora solo si la tiene). */
function localDate(d) {
  const p = (x) => String(x).padStart(2, "0");
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return d.getHours() || d.getMinutes() || d.getSeconds() ? `${day} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` : day;
}
