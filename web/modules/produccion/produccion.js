// ============================================================
// PalmaData · Módulo Producción · Punto de entrada
//
// El shell carga /modules/produccion/produccion.js y llama a
// montar(contenedor, sub). Cada apartado vive en su propio
// archivo; por ahora el único es Polinización.
// ============================================================

export async function montar(cont, sub = 'poli-revision') {
  const s = String(sub || '');
  if (s.startsWith('poli')) {
    const m = await import('./polinizacion.js');
    return m.montar(cont, s === 'poli-descargas' ? 'descargas' : 'revision');
  }
  cont.innerHTML = `<div class="vacio"><h3>Apartado en construcción</h3>
    <p>El apartado «${s}» del módulo Producción todavía no existe.</p></div>`;
}
