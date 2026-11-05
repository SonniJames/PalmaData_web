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
};
