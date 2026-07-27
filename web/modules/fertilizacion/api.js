// ============================================================
// PalmaData · Fertilización · Capa de API
// Único punto de contacto con el backend.
// ============================================================
const BASE = '/api/fertilizacion';

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

const json = (metodo, cuerpo) => ({
  method: metodo,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
});

export const API = {
  // Campañas
  campanas: () => pedir(`${BASE}/campanas`),
  crearCampana: (anio, nombre, copiarDe) =>
    pedir(`${BASE}/campanas`, json('POST', { anio, nombre, copiar_de: copiarDe || null })),
  borrarCampana: (anio) => pedir(`${BASE}/campanas/${anio}`, { method: 'DELETE' }),
  cerrarCampana: (anio, cerrada) =>
    pedir(`${BASE}/campanas/${anio}/estado`, json('PUT', { cerrada })),

  // Parámetros
  parametros: (anio) => pedir(`${BASE}/parametros/${anio}`),
  parametrosDefault: () => pedir(`${BASE}/parametros/default`),
  guardarParametros: (anio, params) =>
    pedir(`${BASE}/parametros/${anio}`, json('PUT', params)),

  // Carga
  urlFormato: () => `${BASE}/formato`,
  cargar: (anio, archivo, reemplazar = false) => {
    const fd = new FormData();
    fd.append('anio', anio);
    fd.append('archivo', archivo);
    fd.append('reemplazar', reemplazar);
    return pedir(`${BASE}/carga`, { method: 'POST', body: fd });
  },

  // Datos
  lotes: (anio, { zona, rangoEdad } = {}) => {
    const q = new URLSearchParams({ anio });
    if (zona && zona !== 'Todas') q.append('zona', zona);
    if (rangoEdad && rangoEdad !== 'Todas') q.append('rango_edad', rangoEdad);
    return pedir(`${BASE}/lotes?${q}`);
  },
  lote: (id, anio) => pedir(`${BASE}/lotes/${id}?anio=${anio}`),
  borrarLote: (id) => pedir(`${BASE}/lotes/${id}`, { method: 'DELETE' }),

  dashboard: (anio) => pedir(`${BASE}/dashboard?anio=${anio}`),
  consolidado: (anio, por = 'zona') =>
    pedir(`${BASE}/consolidado?anio=${anio}&por=${por}`),
  comparativo: (anios) => pedir(`${BASE}/comparativo?anios=${anios.join(',')}`),
};
