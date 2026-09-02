// ============================================================
// PalmaData · Módulo Administración · Punto de entrada
//
// Tablas maestras. Cada apartado vive en su propio archivo.
// Por ahora: Personal. Trampas viene después.
// ============================================================

export async function montar(cont, sub = 'personal') {
  const s = String(sub || 'personal');
  if (s === 'personal' || s.startsWith('personal')) {
    const m = await import('./personal.js');
    return m.montar(cont);
  }
  if (s === 'trampas' || s.startsWith('trampas')) {
    const m = await import('./trampas.js');
    return m.montar(cont);
  }
  cont.innerHTML = `<div class="vacio"><h3>Apartado en construcción</h3>
    <p>El apartado «${s}» del módulo Administración todavía no existe.</p></div>`;
}
