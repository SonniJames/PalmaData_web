// ============================================================
// PalmaData · Cargar datos · Capa de API
// ============================================================
const BASE = '/api/carga';

async function pedir(url, opciones = {}) {
  const res = await fetch(url, opciones);
  let datos = null;
  try { datos = await res.json(); } catch { /* sin cuerpo JSON */ }
  if (!res.ok) {
    const d = datos?.detail ?? datos?.mensaje ?? `Error ${res.status}`;
    throw new Error(typeof d === 'string' ? d : (d.mensaje || JSON.stringify(d)));
  }
  return datos;
}

export const API = {
  tablas: () => pedir(`${BASE}/tablas`),
  historial: (limite = 100) => pedir(`${BASE}/historial?limite=${limite}`),
  subir: (archivos) => {
    const cuerpo = new FormData();
    for (const f of archivos) cuerpo.append('archivos', f, f.name);
    return pedir(`${BASE}/subir`, { method: 'POST', body: cuerpo });
  },
};
