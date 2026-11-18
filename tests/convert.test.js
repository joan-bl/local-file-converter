import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryOf, outputsFor, defaultOutput, extOf, baseName } from "../src/convert/registry.js";
import { parseNumber } from "../src/convert/sheets.js";
import { encodeBmp, buildIco } from "../src/convert/images.js";

const f = (name, type = "") => ({ name, type });

test("detecta la categoría por extensión o por tipo", () => {
  assert.equal(categoryOf(f("Foto.HEIC")), "image");
  assert.equal(categoryOf(f("informe.docx")), "doc");
  assert.equal(categoryOf(f("datos.csv")), "sheet");
  assert.equal(categoryOf(f("voz.m4a")), "audio");
  assert.equal(categoryOf(f("clip.MOV")), "video");
  assert.equal(categoryOf(f("sin-extension", "image/png")), "image");
  assert.equal(categoryOf(f("programa.exe")), null);
});

test("no ofrece convertir a su propio formato", () => {
  assert.ok(!outputsFor(f("a.jpeg")).includes("jpg"));
  assert.ok(!outputsFor(f("a.md")).includes("md"));
  assert.ok(outputsFor(f("a.md")).includes("docx"));
  assert.ok(!outputsFor(f("a.html")).includes("html"));
  assert.ok(!outputsFor(f("a.htm")).includes("html"));
  assert.ok(!outputsFor(f("a.markdown")).includes("md"));
  assert.equal(defaultOutput(f("a.wav")), "mp3");
  assert.equal(defaultOutput(f("a.mp4")), "mp3");
  assert.equal(extOf("x.tar.GZ"), "gz");
  assert.equal(baseName("mi.foto.png"), "mi.foto");
});

test("números con coma decimal (CSV español)", () => {
  assert.equal(parseNumber("1,50", ","), 1.5);
  assert.equal(parseNumber("1.234,56", ","), 1234.56);
  assert.equal(parseNumber("-12", ","), -12);
  assert.equal(parseNumber("1,234.56", "."), 1234.56);
  assert.equal(parseNumber("3.5", "."), 3.5);
  assert.equal(parseNumber("08001", ","), null, "código postal: texto");
  assert.equal(parseNumber("0,5", ","), 0.5);
  assert.equal(parseNumber("2026-11-01", ","), null);
  assert.equal(parseNumber("12 €", ","), null);
  assert.equal(parseNumber("1.5", ","), null, "con coma decimal, 1.5 no es un número válido");
});

test("BMP de 24 bits", async () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]); // 3x1: rojo, verde, azul
  const b = new Uint8Array(await encodeBmp({ width: 3, height: 1, data }).arrayBuffer());
  assert.equal(String.fromCharCode(b[0], b[1]), "BM");
  assert.equal(b.length, 54 + 12); // fila de 9 bytes rellenada a 12
  assert.deepEqual([...b.slice(54, 63)], [0, 0, 255, 0, 255, 0, 255, 0, 0]); // BGR
});

test("ICO con varias resoluciones", async () => {
  const fake = (n) => ({ size: n, bytes: new Uint8Array(n).fill(7) });
  const b = new Uint8Array(await buildIco([fake(16), fake(32), fake(256)]).arrayBuffer());
  const v = new DataView(b.buffer);
  assert.equal(v.getUint16(2, true), 1);
  assert.equal(v.getUint16(4, true), 3);
  assert.equal(b[6], 16);
  assert.equal(b[6 + 32], 0, "256 se escribe como 0");
  assert.equal(v.getUint32(6 + 12, true), 6 + 16 * 3, "el primer PNG va justo tras la cabecera");
  assert.equal(b.length, 54 + 16 + 32 + 256);
});
