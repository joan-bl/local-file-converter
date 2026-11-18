// "¿Cómo sé que no se sube nada?": un contador de todo lo que la página pide a la red.
// El navegador registra cada petición (PerformanceObserver); aquí se muestran todas,
// agrupadas por servidor. Ninguna lleva tus archivos: solo descargan la propia app.

export function startNetworkMeter(el) {
  const seen = [];
  const draw = () => {
    const hosts = new Map();
    let bytes = 0;
    for (const e of seen) {
      const host = new URL(e.name, location.href).host || "esta página";
      const h = hosts.get(host) || { n: 0, bytes: 0 };
      h.n++;
      h.bytes += e.transferSize || 0;
      bytes += e.transferSize || 0;
      hosts.set(host, h);
    }
    const own = location.host;
    const others = [...hosts.keys()].filter((h) => h !== own);
    el.innerHTML = `
      <div class="meter-num"><b>${seen.length}</b><span>peticiones de red desde que abriste la página</span></div>
      <ul>${[...hosts.entries()].map(([h, v]) => `<li><code>${h}</code>${h === own ? " <small>(esta misma web)</small>" : ""} — ${v.n}</li>`).join("")}</ul>
      <p class="${others.length ? "err" : "ok"}">${others.length ? `Hay peticiones a otros servidores: ${others.join(", ")}` : "Todas van a esta misma web y son descargas de la propia app (código, tipos de letra, motor de vídeo). Ninguna envía datos."}</p>`;
  };
  try {
    for (const e of performance.getEntriesByType("resource")) seen.push(e);
    new PerformanceObserver((list) => { seen.push(...list.getEntries()); draw(); }).observe({ type: "resource", buffered: false });
  } catch { /* navegador antiguo */ }
  draw();
}
