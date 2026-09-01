// ============================================================
// PalmaData · Sanidad · Trampas · Capa de API
// Sobre /api/sanidad/trampas: sin erróneos ni duplicados, con
// filtro de trampa y corrección solo unitaria.
// ============================================================
const BASE = '/api/sanidad/trampas';

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
             catLoteId, evaluador, santrampaid, verAnulados } = {}) => {
  const p = new URLSearchParams();
  if (fechaDesde) p.append('fecha_desde', fechaDesde);
  if (fechaHasta) p.append('fecha_hasta', fechaHasta);
  if (actualizaDesde) p.append('actualiza_desde', actualizaDesde);
  if (actualizaHasta) p.append('actualiza_hasta', actualizaHasta);
  if (catLoteId) p.append('cat_lote_id', catLoteId);
  if (evaluador) p.append('evaluador', evaluador);
  if (santrampaid) p.append('santrampaid', santrampaid);
  if (verAnulados) p.append('ver_anulados', 'true');
  return p;
};

const qDescarga = (fd, fh, ad, ah) => {
  const p = new URLSearchParams();
  if (fd) p.append('fecha_desde', fd);
  if (fh) p.append('fecha_hasta', fh);
  if (ad) p.append('actualiza_desde', ad);
  if (ah) p.append('actualiza_hasta', ah);
  return p;
};

const buscar = (ruta, clave) => (busqueda) => {
  const p = new URLSearchParams();
  if (busqueda && busqueda.trim()) p.append('q', busqueda.trim());
  return pedir(`${BASE}/${ruta}?${p}`);
};

export const API = {
  catalogos: () => pedir(`${BASE}/catalogos`),
  lotes: buscar('lotes'),
  trampas: buscar('trampas'),

  revision: (f = {}) => pedir(`${BASE}/revision?${q(f)}`),
  urlRevisionExcel: (f = {}) => `${BASE}/revision/excel?${q(f)}`,

  corregir: (id, campos) => pedir(`${BASE}/corregir`, json({ id, ...campos })),
  anular: (ids, motivo) => pedir(`${BASE}/anular`, json({ ids, motivo })),
  reactivar: (ids) => pedir(`${BASE}/reactivar`, json({ ids })),

  consolidado: (fd, fh, ad, ah) =>
    pedir(`${BASE}/consolidado?${qDescarga(fd, fh, ad, ah)}`),
  urlConsolidadoExcel: (fd, fh, ad, ah) =>
    `${BASE}/consolidado/excel?${qDescarga(fd, fh, ad, ah)}`,
};
