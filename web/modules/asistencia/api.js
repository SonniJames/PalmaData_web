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
  zonas: (empresaId) =>
    pedir(`${BASE}/zonas${empresaId ? `?empresa_id=${empresaId}` : ''}`),
  periodos: (empresaId) =>
    pedir(`${BASE}/periodos${empresaId ? `?empresa_id=${empresaId}` : ''}`),

  // --- Filtros del análisis ---
  _q: ({ empresaId, anio, mes, dia, trabajador, supervisor } = {}) => {
    const q = new URLSearchParams();
    if (empresaId) q.append('empresa_id', empresaId);
    if (anio) q.append('anio', anio);
    if (mes) q.append('mes', mes);
    if (dia) q.append('dia', dia);
    if (trabajador && trabajador.trim()) q.append('trabajador', trabajador.trim());
    if (supervisor) q.append('supervisor', supervisor);
    return q;
  },

  analisis: (f = {}) => pedir(`${BASE}/analisis?${API._q(f)}`),
  revisar: (f = {}) => pedir(`${BASE}/revisar?${API._q(f)}`),

  urlAnalisisExcel: (f = {}) => `${BASE}/analisis/excel?${API._q(f)}`,
  urlRevisarExcel: (f = {}) => `${BASE}/revisar/excel?${API._q(f)}`,

  procesar: (empresaId) =>
    pedir(`${BASE}/procesar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empresaId ? { empresa_id: empresaId } : {}),
    }),

  // --- Trabajadores activos ---
  nomina: () => pedir(`${BASE}/nomina`),
  urlFormatoNomina: () => `${BASE}/nomina/formato`,
  cargarNomina: (archivo) => {
    const fd = new FormData();
    fd.append('archivo', archivo);
    return pedir(`${BASE}/nomina/carga`, { method: 'POST', body: fd });
  },
  sinCruzar: (empresaId) =>
    pedir(`${BASE}/nomina/sin-cruzar?empresa_id=${empresaId}`),

  // --- Carga de asistencia ---
  urlFormato: (empresaId, zonaId, anio, mes, formato = 1) => {
    const q = new URLSearchParams({ anio, mes, zona_id: zonaId, formato });
    if (empresaId) q.append('empresa_id', empresaId);
    return `${BASE}/formato?${q}`;
  },
  cargar: (anio, mes, empresaId, zonaId, formato, archivo, reemplazar = true) => {
    const fd = new FormData();
    fd.append('anio', anio);
    fd.append('mes', mes);
    fd.append('empresa_id', empresaId);
    fd.append('zona_id', zonaId);
    fd.append('formato', formato);
    fd.append('archivo', archivo);
    fd.append('reemplazar', reemplazar);
    return pedir(`${BASE}/carga`, { method: 'POST', body: fd });
  },

  borrarPeriodo: (anio, mes, empresaId, zonaId) =>
    pedir(`${BASE}/periodos/${anio}/${mes}?empresa_id=${empresaId}&zona_id=${zonaId}`,
          { method: 'DELETE' }),
};
