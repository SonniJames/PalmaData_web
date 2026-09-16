// ============================================================
// PalmaData · Sanidad · Medidas vegetativas · Capa de API
// ============================================================
const BASE = '/api/sanidad/medidas';

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
const json = (cuerpo) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(cuerpo) });

const q = ({ fechaDesde, fechaHasta, actualizaDesde, actualizaHasta, catLoteId,
             evaluador, nutUmaId, verAnulados, soloErroneos } = {}) => {
  const p = new URLSearchParams();
  if (fechaDesde) p.append('fecha_desde', fechaDesde);
  if (fechaHasta) p.append('fecha_hasta', fechaHasta);
  if (actualizaDesde) p.append('actualiza_desde', actualizaDesde);
  if (actualizaHasta) p.append('actualiza_hasta', actualizaHasta);
  if (catLoteId) p.append('cat_lote_id', catLoteId);
  if (evaluador) p.append('evaluador', evaluador);
  if (nutUmaId) p.append('nut_uma_id', nutUmaId);
  if (verAnulados) p.append('ver_anulados', 'true');
  if (soloErroneos) p.append('solo_erroneos', 'true');
  return p;
};

export const API = {
  catalogos: () => pedir(`${BASE}/catalogos`),
  lotes: (busqueda) => pedir(`${BASE}/lotes?${new URLSearchParams(busqueda ? { q: busqueda } : {})}`),
  umas:  (busqueda) => pedir(`${BASE}/umas?${new URLSearchParams(busqueda ? { q: busqueda } : {})}`),
  revision: (f = {}) => pedir(`${BASE}/revision?${q(f)}`),
  corregirLote: (ids, catLoteId) => pedir(`${BASE}/corregir-lote`, json({ ids, cat_lote_id: catLoteId })),
  corregir: (id, campos) => pedir(`${BASE}/corregir`, json({ id, ...campos })),
  anular: (ids, motivo) => pedir(`${BASE}/anular`, json({ ids, motivo })),
  reactivar: (ids) => pedir(`${BASE}/reactivar`, json({ ids })),
  urlExcel: (f = {}) => `${BASE}/excel?${q(f)}`,
};
