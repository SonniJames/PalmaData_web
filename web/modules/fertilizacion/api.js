// ============================================================
// PalmaData · Fertilización · Capa de API
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

const filtros = (anio, { empresaId, zona, sector, rangoEdad,
                         identificacion, uma } = {}) => {
  const q = new URLSearchParams({ anio });
  if (empresaId) q.append('empresa_id', empresaId);
  if (zona && zona !== 'Todas') q.append('zona', zona);
  if (sector && sector !== 'Todos') q.append('sector', sector);
  if (rangoEdad && rangoEdad !== 'Todas') q.append('rango_edad', rangoEdad);
  if (identificacion && identificacion.trim()) q.append('identificacion', identificacion.trim());
  if (uma) q.append('uma', uma);
  return q;
};

export const API = {
  // Empresas
  empresas: () => pedir(`${BASE}/empresas`),

  // Campañas
  campanas: (empresaId) =>
    pedir(`${BASE}/campanas${empresaId ? `?empresa_id=${empresaId}` : ''}`),
  crearCampana: (anio, nombre, copiarDe) =>
    pedir(`${BASE}/campanas`, json('POST', { anio, nombre, copiar_de: copiarDe || null })),
  borrarCampana: (anio) => pedir(`${BASE}/campanas/${anio}`, { method: 'DELETE' }),
  cerrarCampana: (anio, cerrada) =>
    pedir(`${BASE}/campanas/${anio}/estado`, json('PUT', { cerrada })),

  // Parámetros · son de una empresa y un año concretos
  parametros: (anio, empresaId) =>
    pedir(`${BASE}/parametros/${anio}?empresa_id=${empresaId}`),
  guardarParametros: (anio, empresaId, params) =>
    pedir(`${BASE}/parametros/${anio}`, json('PUT', { ...params, empresa_id: empresaId })),

  // Carga
  urlFormato: (empresaId, desde) => {
    const q = new URLSearchParams();
    if (empresaId) q.append('empresa_id', empresaId);
    if (desde) q.append('desde', desde);
    return `${BASE}/formato?${q}`;
  },
  cargar: (anio, empresaId, archivo, reemplazar = true) => {
    const fd = new FormData();
    fd.append('anio', anio);
    fd.append('empresa_id', empresaId);
    fd.append('archivo', archivo);
    fd.append('reemplazar', reemplazar);
    return pedir(`${BASE}/carga`, { method: 'POST', body: fd });
  },

  // Datos
  lotes: (anio, f = {}) => pedir(`${BASE}/lotes?${filtros(anio, f)}`),
  diagnostico: (anio, f = {}) => pedir(`${BASE}/diagnostico?${filtros(anio, f)}`),
  lote: (id, anio) => pedir(`${BASE}/lotes/${id}?anio=${anio}`),
  borrarLote: (id) => pedir(`${BASE}/lotes/${id}`, { method: 'DELETE' }),

  aplicaciones: (anio, f = {}) => pedir(`${BASE}/aplicaciones?${filtros(anio, f)}`),
  oxido: (anio, f = {}) => pedir(`${BASE}/oxido?${filtros(anio, f)}`),
  rendimiento: (anio, f = {}) => pedir(`${BASE}/rendimiento?${filtros(anio, f)}`),

  dashboard: (anio, empresaId) =>
    pedir(`${BASE}/dashboard?anio=${anio}&empresa_id=${empresaId}`),
  consolidado: (anio, empresaId, por = 'zona') =>
    pedir(`${BASE}/consolidado?anio=${anio}&empresa_id=${empresaId}&por=${por}`),
  comparativo: (anios, empresaId) =>
    pedir(`${BASE}/comparativo?anios=${anios.join(',')}&empresa_id=${empresaId}`),
};
