// ============================================================
// PalmaData · Módulo Recorridos · Punto de entrada
// ============================================================
export async function montar(cont, sub = 'trabajadores') {
  const m = await import('./trabajadores.js');
  return m.montar(cont);
}
