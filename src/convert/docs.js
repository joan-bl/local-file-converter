// Documentos: Word (.docx), Markdown, HTML y texto.
// Todo pasa por HTML como formato intermedio: entrada → HTML → salida.

import { baseName, extOf } from "./registry.js";

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- entrada → HTML ----------
async function toHtml(file) {
  const ext = extOf(file.name);
  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default;
    const res = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return { html: res.value, warnings: res.messages.filter((m) => m.type === "warning").map((m) => m.message) };
  }
  const text = await file.text();
  if (ext === "md" || ext === "markdown") {
    const { marked } = await import("marked");
    return { html: await marked.parse(text, { gfm: true }) };
  }
  if (ext === "html" || ext === "htm") {
    const doc = new DOMParser().parseFromString(text, "text/html");
    doc.querySelectorAll("script, style, noscript, iframe").forEach((n) => n.remove());
    return { html: doc.body.innerHTML, title: doc.title };
  }
  // texto: cada bloque separado por una línea en blanco es un párrafo
  return { html: text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n") };
}

// ---------- HTML → salidas ----------
async function htmlToMd(html) {
  const TurndownService = (await import("turndown")).default;
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
  // tablas sencillas a formato GFM
  td.addRule("table", {
    filter: "table",
    replacement: (_c, node) => {
      const rows = [...node.querySelectorAll("tr")].map((tr) => [...tr.children].map((td2) => td2.textContent.trim().replace(/\|/g, "\\|").replace(/\n+/g, " ")));
      if (!rows.length) return "";
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
      return `\n\n${line(rows[0])}\n| ${Array(width).fill("---").join(" | ")} |\n${rows.slice(1).map(line).join("\n")}\n\n`;
    },
  });
  return td.turndown(html);
}

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out = [];
  const walk = (node, prefix = "") => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        out.push(n.textContent.replace(/\s+/g, " "));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") { out.push("\n"); continue; }
      if (tag === "li") {
        const ol = n.parentElement?.tagName === "OL";
        const num = ol ? [...n.parentElement.children].filter((c) => c.tagName === "LI").indexOf(n) + 1 : 0;
        out.push(`\n${prefix}${ol ? `${num}. ` : "• "}`);
        walk(n, prefix + "   ");
        continue;
      }
      if (tag === "pre") { out.push(`\n\n${n.textContent}\n\n`); continue; }
      if (tag === "td" || tag === "th") { walk(n, prefix); out.push("\t"); continue; }
      const block = /^(p|div|h[1-6]|ul|ol|table|tr|blockquote|section|article|header|footer|hr)$/.test(tag);
      const nested = (tag === "ul" || tag === "ol") && n.parentElement?.tagName === "LI";
      if (block && !nested) out.push("\n\n");
      walk(n, prefix);
      if (block && !nested) out.push("\n\n");
    }
  };
  walk(doc.body);
  return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function standaloneHtml(body, title) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>body{max-width:760px;margin:40px auto;padding:0 16px;font:17px/1.6 Georgia,serif;color:#222}
img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}
pre{background:#f4f4f4;padding:12px;overflow:auto}code{font-family:Consolas,monospace}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:16px;color:#555}</style>
</head><body>
${body}
</body></html>`;
}

// ---------- HTML → DOCX ----------
async function htmlToDocx(html, title) {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType } = d;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const HEAD = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6 };

  function runs(node, style = {}) {
    const out = [];
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.replace(/\s+/g, " ");
        if (t) out.push(new TextRun({ text: t, bold: style.b, italics: style.i, underline: style.u ? {} : undefined, font: style.code ? "Consolas" : undefined, strike: style.s }));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "br") { out.push(new TextRun({ text: "", break: 1 })); continue; }
      if (tag === "img") {
        const img = imageRun(n);
        if (img) out.push(img);
        continue;
      }
      const s = { ...style };
      if (tag === "strong" || tag === "b") s.b = true;
      if (tag === "em" || tag === "i") s.i = true;
      if (tag === "u") s.u = true;
      if (tag === "s" || tag === "del") s.s = true;
      if (tag === "code") s.code = true;
      if (tag === "a" && /^https?:/.test(n.getAttribute("href") || "")) {
        out.push(new ExternalHyperlink({ link: n.getAttribute("href"), children: runs(n, { ...s, u: true }) }));
        continue;
      }
      out.push(...runs(n, s));
    }
    return out;
  }

  function imageRun(img) {
    const src = img.getAttribute("src") || "";
    const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src);
    if (!m) return null;
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const w = Math.min(+img.getAttribute("width") || 400, 600);
    const h = +img.getAttribute("height") || Math.round(w * 0.66);
    return new ImageRun({ data: bytes, type: m[1].toLowerCase().replace("jpeg", "jpg"), transformation: { width: w, height: h } });
  }

  const blocks = [];
  function walk(node, ctx = {}) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        if (n.textContent.trim()) blocks.push(new Paragraph({ children: [new TextRun(n.textContent.trim())] }));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (HEAD[tag]) blocks.push(new Paragraph({ heading: HEAD[tag], children: runs(n) }));
      else if (tag === "p") blocks.push(new Paragraph({ children: runs(n), indent: ctx.quote ? { left: 720 } : undefined }));
      else if (tag === "ul" || tag === "ol") {
        for (const li of n.children) {
          if (li.tagName.toLowerCase() !== "li") continue;
          const nested = [...li.children].filter((c) => /^(ul|ol)$/i.test(c.tagName));
          nested.forEach((c) => c.remove());
          blocks.push(new Paragraph({
            children: runs(li),
            ...(tag === "ol" ? { numbering: { reference: "num", level: Math.min(ctx.level || 0, 8) } } : { bullet: { level: Math.min(ctx.level || 0, 8) } }),
          }));
          nested.forEach((c) => walk({ childNodes: [c] }, { ...ctx, level: (ctx.level || 0) + 1 }));
        }
      } else if (tag === "pre") {
        for (const line of n.textContent.replace(/\n$/, "").split("\n")) {
          blocks.push(new Paragraph({ children: [new TextRun({ text: line || " ", font: "Consolas", size: 20 })], spacing: { after: 0 } }));
        }
      } else if (tag === "blockquote") walk(n, { ...ctx, quote: true });
      else if (tag === "hr") blocks.push(new Paragraph({ text: "", border: { bottom: { color: "999999", space: 1, style: "single", size: 6 } } }));
      else if (tag === "table") {
        const rows = [...n.querySelectorAll("tr")].map((tr) => new TableRow({
          children: [...tr.children].map((cell) => new TableCell({ children: [new Paragraph({ children: runs(cell, { b: cell.tagName === "TH" }) })] })),
        }));
        if (rows.length) blocks.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      } else if (tag === "img") {
        const img = imageRun(n);
        if (img) blocks.push(new Paragraph({ children: [img], alignment: AlignmentType.CENTER }));
      } else walk(n, ctx);
    }
  }
  walk(doc.body);
  if (!blocks.length) blocks.push(new Paragraph(""));

  const document = new Document({
    title,
    numbering: { config: [{ reference: "num", levels: Array.from({ length: 9 }, (_, level) => ({ level, format: "decimal", text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) }] },
    sections: [{ children: blocks }],
  });
  return Packer.toBlob(document);
}

// ---------- HTML → PDF (texto con títulos, listas y párrafos) ----------
async function htmlToPdf(html, title) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
  // Las fuentes estándar de PDF solo tienen los caracteres de Europa occidental
  const clean = (s) => [...s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...")]
    .map((ch) => { try { fonts.regular.encodeText(ch); return ch; } catch { return "?"; } }).join("");

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const blocks = [];
  const SIZES = { h1: 22, h2: 18, h3: 15, h4: 13, h5: 12, h6: 12 };
  (function walk(node, indent = 0) {
    for (const n of node.children) {
      const tag = n.tagName.toLowerCase();
      if (SIZES[tag]) blocks.push({ text: n.textContent, font: "bold", size: SIZES[tag], before: 14, indent });
      else if (tag === "p") blocks.push({ text: n.textContent, font: "regular", size: 11.5, before: 6, indent });
      else if (tag === "li") {
        const nested = [...n.children].filter((c) => /^(ul|ol)$/i.test(c.tagName));
        const own = n.cloneNode(true);
        own.querySelectorAll("ul,ol").forEach((x) => x.remove());
        const marker = n.parentElement?.tagName === "OL" ? `${[...n.parentElement.children].indexOf(n) + 1}. ` : "• ";
        blocks.push({ text: marker + own.textContent.trim(), font: "regular", size: 11.5, before: 2, indent: indent + 14 });
        nested.forEach((c) => walk(c, indent + 14));
      } else if (tag === "pre") n.textContent.split("\n").forEach((l) => blocks.push({ text: l, font: "mono", size: 9.5, before: 0, indent: indent + 8, keep: true }));
      else if (tag === "hr") blocks.push({ rule: true, before: 8 });
      else if (tag === "tr") blocks.push({ text: [...n.children].map((c) => c.textContent.trim()).join("   |   "), font: "regular", size: 10.5, before: 2, indent });
      else walk(n, tag === "blockquote" ? indent + 18 : indent);
    }
  })(doc.body);

  const W = 595.28, H = 841.89, M = 56;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  for (const b of blocks) {
    if (b.rule) {
      y -= b.before;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
      y -= 6;
      continue;
    }
    const font = fonts[b.font];
    const maxW = W - 2 * M - b.indent;
    const words = clean(b.text.replace(/\s+/g, b.keep ? " " : " ")).split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, b.size) > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    lines.push(line);
    y -= b.before;
    for (const l of lines) {
      if (y < M + b.size) { page = pdf.addPage([W, H]); y = H - M; }
      y -= b.size * 1.35;
      page.drawText(l, { x: M + b.indent, y, size: b.size, font, color: rgb(0.1, 0.1, 0.1) });
    }
  }
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

export async function convert(file, to, options = {}, onProgress = () => {}) {
  const base = baseName(file.name);
  const { html, title } = await toHtml(file);
  onProgress(0.4);
  const name = `${base}.${to}`;
  const t = title || base;
  let blob;
  if (to === "html") blob = new Blob([standaloneHtml(html, t)], { type: "text/html;charset=utf-8" });
  else if (to === "md") blob = new Blob([await htmlToMd(html)], { type: "text/markdown;charset=utf-8" });
  else if (to === "txt") blob = new Blob([htmlToText(html)], { type: "text/plain;charset=utf-8" });
  else if (to === "docx") blob = await htmlToDocx(html, t);
  else if (to === "pdf") blob = await htmlToPdf(html, t);
  else throw new Error(`No sé convertir documentos a ${to}.`);
  onProgress(1);
  return [{ name, blob }];
}
