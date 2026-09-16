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
  // De a un archivo por petición. Con internet flojo, mandar diez o quince
  // en una sola petición significa que una caída tira todo el lote; así,
  // cada archivo que llega queda confirmado por su cuenta.
  subir: (archivo) => {
    const cuerpo = new FormData();
    cuerpo.append('archivos', archivo, archivo.name);
    return pedir(`${BASE}/subir`, { method: 'POST', body: cuerpo });
  },
};
