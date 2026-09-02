// ============================================================
// PalmaData · Administración · Personal · Capa de API
// Tabla maestra: alta, corrección, baja y reactivación.
// ============================================================
const BASE = '/api/administracion/personal';

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
  listar: ({ q, verAnulados, soloSupervisores } = {}) => {
    const p = new URLSearchParams();
    if (q && q.trim()) p.append('q', q.trim());
    if (verAnulados) p.append('ver_anulados', 'true');
    if (soloSupervisores) p.append('solo_supervisores', 'true');
    return pedir(`${BASE}?${p}`);
  },
  buscar: (q) => pedir(`${BASE}/buscar?q=${encodeURIComponent(q)}`),

  crear: (campos) => pedir(BASE, json(campos)),
  corregir: (id, campos) => pedir(`${BASE}/corregir`, json({ id, ...campos })),
  anular: (ids, motivo) => pedir(`${BASE}/anular`, json({ ids, motivo })),
  reactivar: (ids) => pedir(`${BASE}/reactivar`, json({ ids })),
};
