import "@fontsource/archivo/400.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "./styles.css";

import { CATEGORIES, OUTPUT_LABEL, categoryOf, outputsFor, defaultOutput, convert, extOf } from "./convert/registry.js";
import { startNetworkMeter } from "./network.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const size = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const label = (ext) => OUTPUT_LABEL[ext] || ext.toUpperCase();

let items = [];
let nextId = 1;
const urls = new Set();

const opts = {
  quality: 0.9, maxSide: 0, dpi: 150, maxWidth: 0, audioBitrate: 192,
};

// ---------- añadir archivos ----------
function addFiles(list) {
  for (const file of list) {
    const cat = categoryOf(file);
    items.push({ id: nextId++, file, cat, to: cat ? defaultOutput(file) : null, status: cat ? "ready" : "unsupported", progress: 0, results: [], error: "" });
  }
  render();
}

const drop = $("#drop");
const input = $("#file");
input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
// también se puede soltar en cualquier parte de la página o pegar con Ctrl+V
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });
window.addEventListener("paste", (e) => { if (e.clipboardData?.files?.length) addFiles(e.clipboardData.files); });

// ---------- convertir ----------
async function run(item) {
  if (item.status === "working") return;
  for (const r of item.results) URL.revokeObjectURL(r.url);
  Object.assign(item, { status: "working", progress: 0, results: [], error: "", note: "" });
  render();
  const t0 = performance.now();
  try {
    const out = await convert(item.file, item.to, { ...opts, onStatus: (s) => { item.note = s; renderItem(item); } }, (p) => { item.progress = p; renderItem(item); });
    item.results = out.map((r) => { const url = URL.createObjectURL(r.blob); urls.add(url); return { ...r, url }; });
    item.status = "done";
    item.ms = performance.now() - t0;
  } catch (err) {
    item.status = "error";
    item.error = err?.message || String(err);
    console.error(err);
  }
  render();
}

async function runAll() {
  for (const it of items) if (it.status === "ready" || it.status === "error") await run(it);
}

async function batch(kind) {
  const btn = $(`[data-batch="${kind}"]`);
  btn.disabled = true;
  btn.textContent = "Uniendo…";
  try {
    let blob, name;
    if (kind === "images-pdf") {
      const { imagesToPdf } = await import("./convert/images.js");
      blob = await imagesToPdf(items.filter((i) => i.cat === "image").map((i) => i.file), opts);
      name = "imágenes.pdf";
    } else {
      const { mergePdfs } = await import("./convert/pdf.js");
      blob = await mergePdfs(items.filter((i) => i.cat === "pdf").map((i) => i.file));
      name = "unido.pdf";
    }
    download(blob, name);
  } catch (err) {
    alertBox(err.message);
  }
  render();
}

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

async function zipAll() {
  const { zipSync } = await import("fflate");
  const files = {};
  const used = new Set();
  for (const it of items) for (const r of it.results) {
    let n = r.name, k = 2;
    while (used.has(n.toLowerCase())) n = r.name.replace(/(\.[^.]+)?$/, ` (${k++})$1`);
    used.add(n.toLowerCase());
    files[n] = [new Uint8Array(await r.blob.arrayBuffer()), { level: 0 }];
  }
  download(new Blob([zipSync(files)], { type: "application/zip" }), "convertidos.zip");
}

function alertBox(msg) {
  const el = $("#flash");
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 6000);
}

// ---------- pintar ----------
const list = $("#list");

function itemHtml(it) {
  const ext = extOf(it.file.name) || "?";
  const outs = it.cat ? outputsFor(it.file) : [];
  const pct = Math.round(it.progress * 100);
  return `
    <div class="ticket-head">
      <span class="stamp cat-${it.cat || "none"}">${esc(ext.toUpperCase())}</span>
      <div class="fname"><b title="${esc(it.file.name)}">${esc(it.file.name)}</b><small>${size(it.file.size)} · ${it.cat ? CATEGORIES[it.cat].label : "formato no compatible"}</small></div>
      <button class="x" data-remove="${it.id}" aria-label="Quitar">×</button>
    </div>
    ${it.cat ? `
    <div class="ticket-body">
      <label class="to">a
        <select data-to="${it.id}" ${it.status === "working" ? "disabled" : ""}>
          ${outs.map((o) => `<option value="${o}" ${o === it.to ? "selected" : ""}>${label(o)}</option>`).join("")}
        </select>
      </label>
      ${it.status === "working"
        ? `<div class="progress"><i style="width:${pct}%"></i><span>${it.note ? esc(it.note) : `${pct} %`}</span></div>`
        : `<button class="btn" data-run="${it.id}">${it.status === "done" ? "Otra vez" : "Convertir"}</button>`}
    </div>` : `<p class="err small">No sé convertir este tipo de archivo. Mira la lista de formatos más abajo.</p>`}
    ${it.status === "error" ? `<p class="err">✗ ${esc(it.error)}</p>` : ""}
    ${it.results.length ? `
    <ul class="results">
      ${it.results.map((r) => `<li><a href="${r.url}" download="${esc(r.name)}">⤓ ${esc(r.name)}</a><small>${size(r.blob.size)}</small></li>`).join("")}
    </ul>
    <p class="small muted">Hecho en ${(it.ms / 1000).toFixed(1)} s, en tu ordenador.</p>` : ""}`;
}

function renderItem(it) {
  const el = list.querySelector(`[data-id="${it.id}"]`);
  if (el) el.innerHTML = itemHtml(it);
}

function render() {
  list.innerHTML = items.map((it) => `<li class="ticket status-${it.status}" data-id="${it.id}">${itemHtml(it)}</li>`).join("");
  const imgs = items.filter((i) => i.cat === "image").length;
  const pdfs = items.filter((i) => i.cat === "pdf").length;
  const done = items.some((i) => i.results.length);
  const pending = items.filter((i) => i.status === "ready" || i.status === "error").length;
  $("#toolbar").hidden = !items.length;
  $("#toolbar").innerHTML = `
    ${pending > 1 ? `<button class="btn" data-all>Convertir todo (${pending})</button>` : ""}
    ${sameCategory() ? `<label class="to">Todo a <select data-allto>${outputsFor(items[0].file).map((o) => `<option value="${o}">${label(o)}</option>`).join("")}</select></label>` : ""}
    ${imgs > 1 ? `<button class="btn-ghost" data-batch="images-pdf">Unir las ${imgs} imágenes en un PDF</button>` : ""}
    ${pdfs > 1 ? `<button class="btn-ghost" data-batch="merge-pdf">Unir los ${pdfs} PDF</button>` : ""}
    ${done ? `<button class="btn-ghost" data-zip>Descargar todo (.zip)</button>` : ""}
    <button class="btn-ghost" data-clear>Vaciar</button>`;
  const sel = $("[data-allto]");
  if (sel) sel.value = items[0].to;
  document.body.classList.toggle("has-items", items.length > 0);
}

function sameCategory() {
  if (items.length < 2) return false;
  const c = items[0].cat;
  const e = extOf(items[0].file.name);
  return c && items.every((i) => i.cat === c && extOf(i.file.name) === e);
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.run) run(items.find((i) => i.id === +t.dataset.run));
  if (t.dataset.remove) { items = items.filter((i) => i.id !== +t.dataset.remove); render(); }
  if ("all" in t.dataset) runAll();
  if (t.dataset.batch) batch(t.dataset.batch);
  if ("zip" in t.dataset) zipAll();
  if ("clear" in t.dataset) { items = []; urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); render(); }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.to) {
    const it = items.find((i) => i.id === +t.dataset.to);
    it.to = t.value;
    if (it.status === "done") it.status = "ready";
  }
  if ("allto" in t.dataset) { items.forEach((i) => { i.to = t.value; if (i.status === "done") i.status = "ready"; }); render(); }
  if (t.dataset.opt) {
    opts[t.dataset.opt] = t.type === "range" ? +t.value / 100 : +t.value;
    const out = $(`[data-out="${t.dataset.opt}"]`);
    if (out) out.textContent = t.value;
  }
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.opt && t.type === "range") $(`[data-out="${t.dataset.opt}"]`).textContent = t.value;
});

// ---------- tabla de formatos ----------
$("#formats").innerHTML = Object.values(CATEGORIES).map((c) => `
  <tr><th>${c.label}</th><td>${c.inputs.map((x) => `<code>${x}</code>`).join(" ")}</td><td>${c.outputs.map((x) => `<code>${label(x)}</code>`).join(" ")}</td></tr>`).join("");

startNetworkMeter($("#meter"));
render();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").then(() => $("#offline").hidden = false).catch(() => {});
}
