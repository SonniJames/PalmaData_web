// ============================================================
// PalmaData · Módulo Supervisión · Punto de entrada
//
// Apartados de solo consulta y descarga. Por ahora: Cosecha lote.
// Cosecha vagón y Polinización entran cuando estén sus tablas.
// ============================================================
export async function montar(cont, sub = 'cosecha') {
  const s = String(sub || 'cosecha');
  if (s === 'cosecha' || s.startsWith('cosecha')) {
    const m = await import('./cosecha.js');
    return m.montar(cont);
  }
  if (s === 'vagon' || s.startsWith('vagon')) {
    const m = await import('./vagon.js');
    return m.montar(cont);
  }
  cont.innerHTML = `<div class="vacio"><h3>Apartado en construcción</h3>
    <p>El apartado «${s}» del módulo Supervisión todavía no existe.</p></div>`;
}
