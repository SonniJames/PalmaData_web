// ============================================================
// PalmaData · Sanidad · Capa de API
// ============================================================
const BASE = '/api/sanidad';

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

// Los filtros de fecha van juntos a todas las consultas de revisión
const q = ({ fechaDesde, fechaHasta, actualizaDesde, actualizaHasta,
             catLoteId, evaluador, incluirAnulados, soloErroneos } = {}) => {
  const p = new URLSearchParams();
  if (fechaDesde) p.append('fecha_desde', fechaDesde);
  if (fechaHasta) p.append('fecha_hasta', fechaHasta);
  if (actualizaDesde) p.append('actualiza_desde', actualizaDesde);
  if (actualizaHasta) p.append('actualiza_hasta', actualizaHasta);
  if (catLoteId) p.append('cat_lote_id', catLoteId);
  if (evaluador) p.append('evaluador', evaluador);
  if (incluirAnulados) p.append('incluir_anulados', 'true');
  if (soloErroneos) p.append('solo_erroneos', 'true');
  return p;
};

export const API = {
  catalogos: () => pedir(`${BASE}/catalogos`),

  lotes: (busqueda) => {
    const p = new URLSearchParams();
    if (busqueda && busqueda.trim()) p.append('q', busqueda.trim());
    return pedir(`${BASE}/lotes?${p}`);
  },

  revision: (f = {}) => pedir(`${BASE}/revision?${q(f)}`),
  distribucion: (campo, f = {}) => {
    const p = q(f);
    p.append('campo', campo);
    return pedir(`${BASE}/distribucion?${p}`);
  },
  duplicados: (f = {}) => pedir(`${BASE}/duplicados?${q(f)}`),

  // --- Correcciones ---
  corregirLote: (ids, catLoteId) =>
    pedir(`${BASE}/corregir-lote`, json({ ids, cat_lote_id: catLoteId })),
  corregir: (id, campos) => pedir(`${BASE}/corregir`, json({ id, ...campos })),
  anular: (ids, motivo) => pedir(`${BASE}/anular`, json({ ids, motivo })),
  reactivar: (ids) => pedir(`${BASE}/reactivar`, json({ ids })),

  // --- Descargas ---
  consolidado: (desde, hasta) => {
    const p = new URLSearchParams();
    if (desde) p.append('fecha_desde', desde);
    if (hasta) p.append('fecha_hasta', hasta);
    return pedir(`${BASE}/consolidado?${p}`);
  },
  urlConsolidadoExcel: (desde, hasta) => {
    const p = new URLSearchParams();
    if (desde) p.append('fecha_desde', desde);
    if (hasta) p.append('fecha_hasta', hasta);
    return `${BASE}/consolidado/excel?${p}`;
  },
  urlRevisionExcel: (f = {}) => `${BASE}/revision/excel?${q(f)}`,
};
