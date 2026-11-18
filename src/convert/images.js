// Imágenes: se decodifican con el propio navegador y se vuelven a codificar con <canvas>.

import { baseName, extOf, mimeFor } from "./registry.js";

async function decode(file) {
  const ext = extOf(file.name);
  let blob = file;
  if (ext === "heic" || ext === "heif") {
    // Las fotos de iPhone: el navegador no las lee, así que se pasan antes a PNG
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/png" });
    blob = Array.isArray(out) ? out[0] : out;
  }
  if (ext === "svg") {
    // sin el tipo correcto el navegador no interpreta el SVG como imagen
    const url = URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      const w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
      return { source: img, width: w, height: h };
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const bmp = await createImageBitmap(blob);
  return { source: bmp, width: bmp.width, height: bmp.height };
}

function draw(img, { maxSide = 0, background = null } = {}) {
  let { width, height } = img;
  if (maxSide > 0 && Math.max(width, height) > maxSide) {
    const k = maxSide / Math.max(width, height);
    width = Math.round(width * k);
    height = Math.round(height * k);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img.source, 0, 0, width, height);
  return canvas;
}

const toBlob = (canvas, type, quality) =>
  new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error(`El navegador no sabe crear ${type}.`))), type, quality));

/** BMP de 24 bits (sin transparencia). */
export function encodeBmp(imageData) {
  const { width: w, height: h, data } = imageData;
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + rowSize * h;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  v.setUint8(0, 0x42); v.setUint8(1, 0x4d);
  v.setUint32(2, size, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, rowSize * h, true);
  v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  const out = new Uint8Array(buf);
  for (let y = 0; y < h; y++) {
    const row = 54 + (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[row + x * 3] = data[i + 2];
      out[row + x * 3 + 1] = data[i + 1];
      out[row + x * 3 + 2] = data[i];
    }
  }
  return new Blob([buf], { type: "image/bmp" });
}

/** ICO con varias resoluciones (cada una guardada como PNG, como hacen los .ico modernos). */
export function buildIco(pngs) {
  // pngs: [{ size, bytes: Uint8Array }]
  const header = 6 + 16 * pngs.length;
  const total = header + pngs.reduce((s, p) => s + p.bytes.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(0, 0, true); v.setUint16(2, 1, true); v.setUint16(4, pngs.length, true);
  let offset = header;
  pngs.forEach((p, i) => {
    const e = 6 + i * 16;
    v.setUint8(e, p.size >= 256 ? 0 : p.size);
    v.setUint8(e + 1, p.size >= 256 ? 0 : p.size);
    v.setUint16(e + 4, 1, true);
    v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, p.bytes.length, true);
    v.setUint32(e + 12, offset, true);
    out.set(p.bytes, offset);
    offset += p.bytes.length;
  });
  return new Blob([out], { type: "image/x-icon" });
}

async function squareCanvas(img, size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const k = Math.min(size / img.width, size / img.height);
  const w = img.width * k, h = img.height * k;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img.source, (size - w) / 2, (size - h) / 2, w, h);
  return c;
}

/** Varias imágenes → un PDF, una por página, a su tamaño. */
export async function imagesToPdf(files, options = {}, onProgress = () => {}) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    const img = await decode(files[i]);
    const canvas = draw(img, { maxSide: options.maxSide || 0, background: "#ffffff" });
    const jpg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", options.quality ?? 0.9)).arrayBuffer());
    const embedded = await doc.embedJpg(jpg);
    // 72 puntos por pulgada: a 150 ppp para que la página tenga un tamaño razonable
    const scale = 72 / 150;
    const page = doc.addPage([canvas.width * scale, canvas.height * scale]);
    page.drawImage(embedded, { x: 0, y: 0, width: canvas.width * scale, height: canvas.height * scale });
    onProgress((i + 1) / files.length);
  }
  return new Blob([await doc.save()], { type: "application/pdf" });
}

export async function convert(file, to, options = {}, onProgress = () => {}) {
  const img = await decode(file);
  onProgress(0.3);
  const name = `${baseName(file.name)}.${to}`;
  const q = options.quality ?? 0.9;
  const maxSide = +options.maxSide || 0;
  let blob;
  if (to === "png" || to === "webp") {
    blob = await toBlob(draw(img, { maxSide }), mimeFor(to), q);
  } else if (to === "jpg") {
    // JPG no admite transparencia: se pone fondo blanco
    blob = await toBlob(draw(img, { maxSide, background: options.background || "#ffffff" }), "image/jpeg", q);
  } else if (to === "bmp") {
    const c = draw(img, { maxSide, background: "#ffffff" });
    blob = encodeBmp(c.getContext("2d").getImageData(0, 0, c.width, c.height));
  } else if (to === "ico") {
    const sizes = [16, 32, 48, 64, 128, 256].filter((s) => s <= Math.max(img.width, img.height) || s <= 48);
    const pngs = [];
    for (const s of sizes) {
      const c = await squareCanvas(img, s);
      pngs.push({ size: s, bytes: new Uint8Array(await (await toBlob(c, "image/png")).arrayBuffer()) });
    }
    blob = buildIco(pngs);
  } else if (to === "pdf") {
    blob = await imagesToPdf([file], options);
  } else {
    throw new Error(`No sé convertir imágenes a ${to}.`);
  }
  onProgress(1);
  return [{ name, blob }];
}
