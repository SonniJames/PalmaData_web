// ============================================================
// PalmaData · Mapas · Capa de API
// (Lotes · Descarga hace sus propias peticiones en lotes.js)
// ============================================================
const BASE = '/api/mapas';

async function pedir(url) {
  const res = await fetch(url);
  let datos = null;
  try { datos = await res.json(); } catch { /* sin cuerpo JSON */ }
  if (!res.ok) {
    const d = datos?.detail ?? datos?.mensaje ?? `Error ${res.status}`;
    throw new Error(typeof d === 'string' ? d : (d.mensaje || JSON.stringify(d)));
  }
  if (!datos) throw new Error('El servidor respondió sin datos.');
  return datos;
}

const mesQ = (anio, mes) => new URLSearchParams({ anio, mes });

export const API = {
  capas: () => pedir(`${BASE}/capas`),
  censoCatalogos: () => pedir(`${BASE}/censo/catalogos`),
  censoPuntos: (anio, mes) => pedir(`${BASE}/censo/puntos?${mesQ(anio, mes)}`),
  tratCatalogos: () => pedir(`${BASE}/tratamientos/catalogos`),
  tratPuntos: (anio, mes) => pedir(`${BASE}/tratamientos/puntos?${mesQ(anio, mes)}`),
  plagasCatalogos: () => pedir(`${BASE}/plagas/catalogos`),
  plagasPuntos: (anio, mes) => pedir(`${BASE}/plagas/puntos?${mesQ(anio, mes)}`),
};

/**
 * Pide un Excel por POST (la lista de registros del mapa puede ser larga
 * para ir en la URL) y lo baja con el nombre que manda el servidor.
 * `que` es 'censo', 'tratamientos' o 'plagas'.
 */
export async function bajarExcel(que, cuerpo) {
  const res = await fetch(`${BASE}/${que}/excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const d = await res.json(); msg = d.detail || msg; } catch { /* sin JSON */ }
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  const disp = res.headers.get('Content-Disposition') || '';
  const nombre = (disp.match(/filename="([^"]+)"/) || [])[1] || `mapa_${que}.xlsx`;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
