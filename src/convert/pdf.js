// PDF: a imágenes (una por página), a texto, separar páginas y unir varios.

import { baseName } from "./registry.js";

let pdfjs;
async function lib() {
  if (!pdfjs) {
    pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

async function open(file) {
  const { getDocument } = await lib();
  return getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
}

const pad = (n, total) => String(n).padStart(String(total).length, "0");

export async function convert(file, to, options = {}, onProgress = () => {}) {
  const base = baseName(file.name);

  if (to === "png" || to === "jpg") {
    const pdf = await open(file);
    const dpi = +options.dpi || 150;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await new Promise((r) => canvas.toBlob(r, to === "png" ? "image/png" : "image/jpeg", 0.9));
      out.push({ name: `${base} - página ${pad(i, pdf.numPages)}.${to}`, blob });
      page.cleanup();
      onProgress(i / pdf.numPages);
    }
    return out;
  }

  if (to === "txt") {
    const pdf = await open(file);
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Une los trozos respetando los saltos de línea que marca el PDF
      let text = "";
      for (const item of content.items) {
        text += item.str;
        if (item.hasEOL) text += "\n";
        else if (item.str && !item.str.endsWith(" ")) text += " ";
      }
      pages.push(text.replace(/[ \t]+\n/g, "\n").trim());
      onProgress(i / pdf.numPages);
    }
    const body = pages.join("\n\n\f\n\n");
    if (!body.replace(/\s/g, "")) throw new Error("Este PDF no tiene texto (seguramente es un escaneo). Para sacar el texto haría falta OCR.");
    return [{ name: `${base}.txt`, blob: new Blob([body], { type: "text/plain;charset=utf-8" }) }];
  }

  if (to === "pdf-paginas") {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const n = src.getPageCount();
    const out = [];
    for (let i = 0; i < n; i++) {
      const doc = await PDFDocument.create();
      const [p] = await doc.copyPages(src, [i]);
      doc.addPage(p);
      out.push({ name: `${base} - página ${pad(i + 1, n)}.pdf`, blob: new Blob([await doc.save()], { type: "application/pdf" }) });
      onProgress((i + 1) / n);
    }
    return out;
  }
  throw new Error(`No sé convertir PDF a ${to}.`);
}

/** Une varios PDF (y también imágenes) en uno, en el orden dado. */
export async function mergePdfs(files, onProgress = () => {}) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    const src = await PDFDocument.load(await files[i].arrayBuffer(), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    onProgress((i + 1) / files.length);
  }
  return new Blob([await out.save()], { type: "application/pdf" });
}
