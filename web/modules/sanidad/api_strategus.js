// ============================================================
// PalmaData · Sanidad · Strategus · Capa de API
// Espejo de api.js sobre /api/sanidad/strategus: con erróneos,
// sin duplicados.
// ============================================================
const BASE = '/api/sanidad/strategus';

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
             catLoteId, evaluador, verAnulados, soloErroneos } = {}) => {
  const p = new URLSearchParams();
  if (fechaDesde) p.append('fecha_desde', fechaDesde);
  if (fechaHasta) p.append('fecha_hasta', fechaHasta);
  if (actualizaDesde) p.append('actualiza_desde', actualizaDesde);
  if (actualizaHasta) p.append('actualiza_hasta', actualizaHasta);
  if (catLoteId) p.append('cat_lote_id', catLoteId);
  if (evaluador) p.append('evaluador', evaluador);
  if (verAnulados) p.append('ver_anulados', 'true');
  if (soloErroneos) p.append('solo_erroneos', 'true');
  return p;
};

// La descarga acepta las dos fechas: evento y actualización.
const qDescarga = (fd, fh, ad, ah) => {
  const p = new URLSearchParams();
  if (fd) p.append('fecha_desde', fd);
  if (fh) p.append('fecha_hasta', fh);
  if (ad) p.append('actualiza_desde', ad);
  if (ah) p.append('actualiza_hasta', ah);
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
  urlRevisionExcel: (f = {}) => `${BASE}/revision/excel?${q(f)}`,

  // --- Correcciones ---
  corregirLote: (ids, catLoteId) =>
    pedir(`${BASE}/corregir-lote`, json({ ids, cat_lote_id: catLoteId })),
  corregir: (id, campos) => pedir(`${BASE}/corregir`, json({ id, ...campos })),
  anular: (ids, motivo) => pedir(`${BASE}/anular`, json({ ids, motivo })),
  reactivar: (ids) => pedir(`${BASE}/reactivar`, json({ ids })),

  // --- Descargas ---
  consolidado: (fd, fh, ad, ah) =>
    pedir(`${BASE}/consolidado?${qDescarga(fd, fh, ad, ah)}`),
  urlConsolidadoExcel: (fd, fh, ad, ah) =>
    `${BASE}/consolidado/excel?${qDescarga(fd, fh, ad, ah)}`,
};
