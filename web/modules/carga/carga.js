// ============================================================
// PalmaData · Módulo Cargar datos · Punto de entrada
// ============================================================
export async function montar(cont, sub = 'archivos') {
  const m = await import('./archivos.js');
  return m.montar(cont);
}
