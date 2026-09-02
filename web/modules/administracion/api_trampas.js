// ============================================================
// PalmaData · Administración · Trampas · Capa de API
// Tabla maestra: alta, corrección, baja y reactivación.
// ============================================================
const BASE = '/api/administracion/trampas';

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

export const API = {
  listar: ({ q, catLoteId, verAnuladas } = {}) => {
    const p = new URLSearchParams();
    if (q && q.trim()) p.append('q', q.trim());
    if (catLoteId) p.append('cat_lote_id', catLoteId);
    if (verAnuladas) p.append('ver_anuladas', 'true');
    return pedir(`${BASE}?${p}`);
  },
  buscar: (q) => pedir(`${BASE}/buscar?q=${encodeURIComponent(q)}`),
  lotes: (q) => {
    const p = new URLSearchParams();
    if (q && q.trim()) p.append('q', q.trim());
    return pedir(`${BASE}/lotes?${p}`);
  },

  crear: (campos) => pedir(BASE, json(campos)),
  corregir: (id, campos) => pedir(`${BASE}/corregir`, json({ id, ...campos })),
  anular: (ids, motivo) => pedir(`${BASE}/anular`, json({ ids, motivo })),
  reactivar: (ids) => pedir(`${BASE}/reactivar`, json({ ids })),
};
