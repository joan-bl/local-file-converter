// Qué se puede convertir en qué. Cada conversor se carga solo cuando hace falta
// (import dinámico), para que la página abra rápido aunque ffmpeg pese 30 MB.

export const CATEGORIES = {
  image: {
    label: "Imagen",
    inputs: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg", "ico", "heic", "heif"],
    outputs: ["png", "jpg", "webp", "bmp", "ico", "pdf"],
    load: () => import("./images.js"),
  },
  pdf: {
    label: "PDF",
    inputs: ["pdf"],
    outputs: ["png", "jpg", "txt", "pdf-paginas"],
    load: () => import("./pdf.js"),
  },
  doc: {
    label: "Documento",
    inputs: ["docx", "md", "markdown", "html", "htm", "txt"],
    outputs: ["docx", "md", "html", "txt", "pdf"],
    load: () => import("./docs.js"),
  },
  sheet: {
    label: "Hoja de cálculo",
    inputs: ["xlsx", "xls", "xlsm", "ods", "csv", "tsv", "json", "numbers"],
    outputs: ["xlsx", "ods", "csv", "tsv", "json", "html", "xls"],
    load: () => import("./sheets.js"),
  },
  audio: {
    label: "Audio",
    inputs: ["mp3", "wav", "ogg", "oga", "opus", "m4a", "aac", "flac", "wma", "amr", "aiff", "aif"],
    outputs: ["mp3", "wav", "ogg", "opus", "m4a", "flac"],
    load: () => import("./media.js"),
  },
  video: {
    label: "Vídeo",
    inputs: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp", "flv", "wmv", "mpeg", "mpg", "ts"],
    outputs: ["mp4", "webm", "gif", "mp3", "wav", "m4a"],
    load: () => import("./media.js"),
  },
};

export const OUTPUT_LABEL = {
  "pdf-paginas": "PDF por páginas",
  jpg: "JPG",
  md: "Markdown",
  txt: "Texto",
};

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

export function baseName(name) {
  return (name || "archivo").replace(/\.[a-z0-9]+$/i, "");
}

export function categoryOf(file) {
  const ext = extOf(file.name);
  for (const [id, c] of Object.entries(CATEGORIES)) if (c.inputs.includes(ext)) return id;
  const t = file.type || "";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t === "application/pdf") return "pdf";
  return null;
}

/** Salidas posibles para un archivo (sin la de su propio formato, salvo que tenga sentido). */
export function outputsFor(file) {
  const cat = categoryOf(file);
  if (!cat) return [];
  const ext = extOf(file.name).replace("jpeg", "jpg").replace("htm", "html").replace("markdown", "md");
  return CATEGORIES[cat].outputs.filter((o) => o !== ext);
}

export function defaultOutput(file) {
  const cat = categoryOf(file);
  const outs = outputsFor(file);
  const prefer = { image: ["jpg", "png"], pdf: ["png"], doc: ["docx", "md"], sheet: ["xlsx", "csv"], audio: ["mp3", "wav"], video: ["mp4", "mp3"] }[cat] || [];
  return prefer.find((p) => outs.includes(p)) || outs[0];
}

/**
 * Convierte un archivo. Devuelve [{ name, blob }].
 * onProgress(0..1) es opcional.
 */
export async function convert(file, to, options = {}, onProgress = () => {}) {
  const cat = categoryOf(file);
  if (!cat) throw new Error("Formato no reconocido.");
  const mod = await CATEGORIES[cat].load();
  return mod.convert(file, to, { ...options, category: cat }, onProgress);
}

export function mimeFor(ext) {
  return {
    png: "image/png", jpg: "image/jpeg", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon", gif: "image/gif",
    pdf: "application/pdf", txt: "text/plain;charset=utf-8", md: "text/markdown;charset=utf-8", html: "text/html;charset=utf-8",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
    ods: "application/vnd.oasis.opendocument.spreadsheet", csv: "text/csv;charset=utf-8", tsv: "text/tab-separated-values;charset=utf-8",
    json: "application/json", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac",
    mp4: "video/mp4", webm: "video/webm", zip: "application/zip",
  }[ext] || "application/octet-stream";
}
