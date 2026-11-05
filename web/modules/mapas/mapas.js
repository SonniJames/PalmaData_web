// ============================================================
// PalmaData · Módulo Mapas · Punto de entrada
//
//   lotes         Lotes · Descarga (antes en Administración)
//   censo         palmas del censo de PC del mes, por evento
//   tratamientos  palmas tratadas en el mes, con los días desde el censo
// ============================================================
export async function montar(cont, sub = 'lotes') {
  const s = String(sub || 'lotes');
  if (s === 'lotes' || s.startsWith('lotes')) {
    const m = await import('./lotes.js');
    return m.montar(cont);
  }
  if (s === 'censo' || s.startsWith('censo')) {
    const m = await import('./censo.js');
    return m.montar(cont);
  }
  if (s === 'tratamientos' || s.startsWith('trat')) {
    const m = await import('./tratamientos.js');
    return m.montar(cont);
  }
  cont.innerHTML = `<div class="vacio"><h3>Apartado en construcción</h3>
    <p>El apartado «${s}» del módulo Mapas todavía no existe.</p></div>`;
}
