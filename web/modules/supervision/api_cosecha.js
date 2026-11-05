// ============================================================
// PalmaData · Supervisión · Cosecha lote · Capa de API
// Consulta, descarga y corrección de un registro a la vez.
// ============================================================
const BASE = '/api/supervision/cosecha';

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

const json = (cuerpo) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
});

const q = ({ fechaDesde, fechaHasta, actualizaDesde, actualizaHasta,
             catLoteId, supervisor, cortador, recolector, alistador } = {}) => {
  const p = new URLSearchParams();
  if (fechaDesde) p.append('fecha_desde', fechaDesde);
  if (fechaHasta) p.append('fecha_hasta', fechaHasta);
  if (actualizaDesde) p.append('actualiza_desde', actualizaDesde);
  if (actualizaHasta) p.append('actualiza_hasta', actualizaHasta);
  if (catLoteId) p.append('cat_lote_id', catLoteId);
  if (supervisor) p.append('supervisor', supervisor);
  if (cortador) p.append('cortador', cortador);
  if (recolector) p.append('recolector', recolector);
  if (alistador) p.append('alistador', alistador);
  return p;
};

export const API = {
  catalogos: () => pedir(`${BASE}/catalogos`),
  listar: (f = {}) => pedir(`${BASE}?${q(f)}`),
  urlExcel: (f = {}) => `${BASE}/excel?${q(f)}`,

  // Corrección de un registro
  registro: (id) => pedir(`${BASE}/registro/${encodeURIComponent(id)}`),
  trabajadores: (texto) =>
    pedir(`${BASE}/trabajadores?${new URLSearchParams({ q: texto })}`),
  lotes: (texto) =>
    pedir(`${BASE}/buscar-lotes?${new URLSearchParams({ q: texto || '' })}`),
  corregir: (id, campos) => pedir(`${BASE}/corregir`, json({ id, ...campos })),
};
