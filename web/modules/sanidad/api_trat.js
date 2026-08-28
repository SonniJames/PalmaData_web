// ============================================================
// PalmaData · Sanidad · Tratamientos · Capa de API
// Espejo de api.js sobre /api/sanidad/trat.
// ============================================================
const BASE = '/api/sanidad/trat';

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
             catLoteId, evaluador, verAnulados } = {}) => {
  const p = new URLSearchParams();
  if (fechaDesde) p.append('fecha_desde', fechaDesde);
  if (fechaHasta) p.append('fecha_hasta', fechaHasta);
  if (actualizaDesde) p.append('actualiza_desde', actualizaDesde);
  if (actualizaHasta) p.append('actualiza_hasta', actualizaHasta);
  if (catLoteId) p.append('cat_lote_id', catLoteId);
  if (evaluador) p.append('evaluador', evaluador);
  if (verAnulados) p.append('ver_anulados', 'true');
  return p;
};

// La descarga del consolidado acepta las dos fechas: tratamiento y
// actualización.
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

  // Los lotes son los mismos del censo: se reutiliza su endpoint.
  lotes: (busqueda) => {
    const p = new URLSearchParams();
    if (busqueda && busqueda.trim()) p.append('q', busqueda.trim());
    return pedir(`/api/sanidad/lotes?${p}`);
  },

  revision: (f = {}) => pedir(`${BASE}/revision?${q(f)}`),
  distribucion: (campo, f = {}) => {
    const p = q(f);
    p.append('campo', campo);
    return pedir(`${BASE}/distribucion?${p}`);
  },
  duplicados: (f = {}) => pedir(`${BASE}/duplicados?${q(f)}`),
  urlDuplicadosExcel: (f = {}) => `${BASE}/duplicados/excel?${q(f)}`,

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
  urlRevisionExcel: (f = {}) => `${BASE}/revision/excel?${q(f)}`,
};
