// Audio y vídeo con ffmpeg compilado a WebAssembly: el mismo programa que usan los
// profesionales, pero ejecutándose dentro de la pestaña. Se descarga (≈ 31 MB) la
// primera vez que hace falta y luego queda en la caché del navegador.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { baseName, extOf, mimeFor } from "./registry.js";

let ffmpeg;
let loading;
let queue = Promise.resolve(); // ffmpeg hace una cosa cada vez

export function isLoaded() {
  return !!ffmpeg?.loaded;
}

async function getFFmpeg(onStatus) {
  if (ffmpeg?.loaded) return ffmpeg;
  if (!loading) {
    loading = (async () => {
      onStatus?.("Cargando el motor de audio y vídeo (≈ 31 MB, solo la primera vez)…");
      const f = new FFmpeg();
      await f.load({ coreURL: new URL(coreURL, location.href).href, wasmURL: new URL(wasmURL, location.href).href });
      ffmpeg = f;
      return f;
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

const VIDEO_WIDTH = (o) => (+o.maxWidth ? `scale='min(${+o.maxWidth},iw)':-2` : "scale=trunc(iw/2)*2:trunc(ih/2)*2");

/** Argumentos de ffmpeg para cada salida. */
export function argsFor(to, input, output, o = {}) {
  const ab = `${+o.audioBitrate || 192}k`;
  switch (to) {
    case "mp3": return ["-i", input, "-vn", "-c:a", "libmp3lame", "-b:a", ab, output];
    case "wav": return ["-i", input, "-vn", "-c:a", "pcm_s16le", output];
    case "ogg": return ["-i", input, "-vn", "-c:a", "libvorbis", "-q:a", "5", output];
    case "opus": return ["-i", input, "-vn", "-c:a", "libopus", "-b:a", "128k", output];
    case "m4a": return ["-i", input, "-vn", "-c:a", "aac", "-b:a", ab, output];
    case "flac": return ["-i", input, "-vn", "-c:a", "flac", output];
    case "mp4": return ["-i", input, "-vf", VIDEO_WIDTH(o), "-c:v", "libx264", "-preset", "veryfast", "-crf", String(+o.crf || 23), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output];
    case "webm": return ["-i", input, "-vf", VIDEO_WIDTH(o), "-c:v", "libvpx", "-b:v", "1.5M", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libvorbis", output];
    case "gif": {
      const fps = +o.fps || 10;
      const w = +o.maxWidth || 480;
      return ["-i", input, "-vf", `fps=${fps},scale='min(${w},iw)':-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, "-loop", "0", output];
    }
    default: throw new Error(`No sé convertir a ${to}.`);
  }
}

export async function convert(file, to, options = {}, onProgress = () => {}) {
  const run = async () => {
    const f = await getFFmpeg(options.onStatus);
    options.onStatus?.("");
    const input = `entrada.${extOf(file.name) || "bin"}`;
    const output = `salida.${to}`;
    const progress = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress)));
    const logs = [];
    const logger = ({ message }) => { logs.push(message); if (logs.length > 40) logs.shift(); };
    f.on("progress", progress);
    f.on("log", logger);
    try {
      await f.writeFile(input, new Uint8Array(await file.arrayBuffer()));
      const code = await f.exec(argsFor(to, input, output, options));
      if (code !== 0) {
        const hint = logs.filter((l) => /error|invalid|not found|does not contain/i.test(l)).slice(-2).join(" · ");
        throw new Error(hint ? `ffmpeg: ${hint}` : "ffmpeg no ha podido convertir este archivo.");
      }
      const data = await f.readFile(output);
      return [{ name: `${baseName(file.name)}.${to}`, blob: new Blob([data], { type: mimeFor(to) }) }];
    } finally {
      f.off("progress", progress);
      f.off("log", logger);
      try { await f.deleteFile(input); } catch { /* */ }
      try { await f.deleteFile(output); } catch { /* */ }
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
