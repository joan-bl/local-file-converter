# Conversor local

**Convert files without uploading them anywhere.** Images, PDFs, Word, Markdown, spreadsheets, audio and video, all processed inside your browser tab. There is no server: the page downloads the conversion engines (pdf.js, SheetJS, ffmpeg compiled to WebAssembly…) and runs them on your own computer.

**▶ Live: [joan-bl.github.io/local-file-converter](https://joan-bl.github.io/local-file-converter/)** · Interface in Spanish.

## Why
Most online converters upload your file to their server, convert it there and send it back. That's a bad deal for a contract, a payslip or a family photo. Here the file never leaves the tab, and you don't have to take that on trust:

- **Network meter.** The page lists every network request it has made (via `PerformanceObserver`), grouped by host. They are all downloads of the app itself.
- **Airplane-mode test.** Once loaded, disconnect from the internet and keep converting. A service worker caches the app, so it even opens offline next time.

## Formats

| | Reads | Writes |
|---|---|---|
| **Images** | PNG, JPG, WebP, GIF, BMP, AVIF, SVG, ICO, **HEIC/HEIF** (iPhone photos) | PNG, JPG, WebP, BMP, ICO (multi-size), PDF |
| **PDF** | PDF | PNG/JPG (one per page, 72–300 dpi), text, one PDF per page |
| **Documents** | DOCX, Markdown, HTML, TXT | DOCX, Markdown, HTML, TXT, PDF |
| **Spreadsheets** | XLSX, XLS, ODS, CSV, TSV, JSON, Numbers | XLSX, ODS, XLS, CSV, TSV, JSON, HTML |
| **Audio** | MP3, WAV, OGG, Opus, M4A, AAC, FLAC, WMA, AMR, AIFF | MP3, WAV, OGG, Opus, M4A, FLAC |
| **Video** | MP4, MOV, WebM, MKV, AVI, M4V, 3GP, FLV, WMV, MPEG, TS | MP4 (H.264), WebM, GIF, MP3/WAV/M4A (audio track) |

Plus batch tools: **merge images into one PDF**, **merge several PDFs**, convert many files at once, and download everything as a ZIP.

Details that matter:
- **Spanish CSVs work.** `;`-separated files with decimal commas (`1.234,50`) become real numbers instead of `123450`; leading-zero codes such as postcodes stay as text; dates aren't shifted by time zones; CSV output carries a BOM so Excel shows accents correctly.
- **Word round-trips.** Headings, bold/italic/underline, links, nested and numbered lists, tables, code blocks and embedded images survive DOCX → Markdown → DOCX.
- **Transparent images to JPG** get a white background instead of black.
- **Lazy loading.** The first page is ~13 KB of JS. Each engine loads only when you convert that kind of file; ffmpeg (~31 MB) is fetched once and then cached.

## Limits
- Video encoding runs single-threaded in WebAssembly: fine for clips, slow for long films.
- PDF → text needs a text layer; scanned PDFs would need OCR (not included).
- DOCX/HTML → PDF produces a clean text document (headings, paragraphs, lists, tables as text), not a pixel-perfect layout.

## Tech
Vanilla JavaScript + [Vite](https://vite.dev). Engines: [pdf.js](https://mozilla.github.io/pdf.js/), [pdf-lib](https://pdf-lib.js.org), [mammoth](https://github.com/mwilliamson/mammoth.js), [docx](https://docx.js.org), [marked](https://marked.js.org), [turndown](https://github.com/mixmark-io/turndown), [SheetJS](https://sheetjs.com), [heic2any](https://github.com/alexcorvi/heic2any), [ffmpeg.wasm](https://ffmpegwasm.netlify.app), [fflate](https://github.com/101arrowz/fflate). Fonts are self-hosted.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # format detection, Spanish number parsing, BMP and ICO encoders
npm run build    # static site in dist/
```

Every push to `main` runs the tests and deploys to GitHub Pages.

```
src/
├── convert/
│   ├── registry.js   formats, detection, lazy loading of each engine
│   ├── images.js     canvas re-encoding, BMP and ICO encoders, images → PDF
│   ├── pdf.js        render pages, extract text, split, merge
│   ├── docs.js       DOCX / Markdown / HTML / TXT via HTML; DOCX and PDF writers
│   ├── sheets.js     SheetJS with locale-aware CSV parsing
│   └── media.js      ffmpeg.wasm: audio/video presets, GIF with palette
├── network.js        the network-request meter
└── main.js           UI: drop zone, job tickets, batch actions, ZIP
public/sw.js          offline cache
```

## Related
Other projects share the "convert locally" idea, such as [VERT](https://vert.sh) (browser) and [ConvertX](https://github.com/C4illin/ConvertX) (self-hosted server). This one focuses on everyday office formats, including Spanish-locale CSVs and Word round-trips, and on making the privacy claim checkable from the page itself.

## License
MIT © joan-bl. Bundled libraries keep their own licenses (ffmpeg.wasm core: GPL-2.0-or-later).
