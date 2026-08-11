// ============================================================
// PalmaData · Asistencia · Capa de API
// ============================================================
const BASE = '/api/asistencia';

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
  empresas: () => pedir(`${BASE}/empresas`),

  periodos: (empresaId) =>
    pedir(`${BASE}/periodos${empresaId ? `?empresa_id=${empresaId}` : ''}`),

  filtros: (empresaId, anio, mes) => {
    const q = new URLSearchParams();
    if (empresaId) q.append('empresa_id', empresaId);
    if (anio) q.append('anio', anio);
    if (mes) q.append('mes', mes);
    return pedir(`${BASE}/filtros?${q}`);
  },

  analisis: ({ empresaId, anio, mes, dia, trabajador } = {}) => {
    const q = new URLSearchParams();
    if (empresaId) q.append('empresa_id', empresaId);
    if (anio) q.append('anio', anio);
    if (mes) q.append('mes', mes);
    if (dia) q.append('dia', dia);
    if (trabajador && trabajador.trim()) q.append('trabajador', trabajador.trim());
    return pedir(`${BASE}/analisis?${q}`);
  },

  trabajador: (id, anio, mes) => {
    const q = new URLSearchParams();
    if (anio) q.append('anio', anio);
    if (mes) q.append('mes', mes);
    return pedir(`${BASE}/trabajadores/${id}?${q}`);
  },

  urlFormato: (empresaId, anio, mes) => {
    const q = new URLSearchParams({ anio, mes });
    if (empresaId) q.append('empresa_id', empresaId);
    return `${BASE}/formato?${q}`;
  },

  cargar: (anio, mes, empresaId, archivo, reemplazar = true) => {
    const fd = new FormData();
    fd.append('anio', anio);
    fd.append('mes', mes);
    fd.append('empresa_id', empresaId);
    fd.append('archivo', archivo);
    fd.append('reemplazar', reemplazar);
    return pedir(`${BASE}/carga`, { method: 'POST', body: fd });
  },

  borrarPeriodo: (anio, mes, empresaId) =>
    pedir(`${BASE}/periodos/${anio}/${mes}?empresa_id=${empresaId}`,
          { method: 'DELETE' }),
};
