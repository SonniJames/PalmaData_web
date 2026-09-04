// ============================================================
// PalmaData · Supervisión · Polinización · Capa de API
// Solo consulta y descarga.
// ============================================================
const BASE = '/api/supervision/poli';

async function pedir(url) {
  const res = await fetch(url);
  let datos = null;
  try { datos = await res.json(); } catch { /* sin cuerpo JSON */ }
  if (!res.ok) {
    const d = datos?.detail ?? datos?.mensaje ?? `Error ${res.status}`;
    throw new Error(typeof d === 'string' ? d : (d.mensaje || JSON.stringify(d)));
  }
  return datos;
}

const q = ({ fechaDesde, fechaHasta, actualizaDesde, actualizaHasta,
             catLoteId, supervisor, polinizador, cumple,
             hoja, espataSin, cobertura, espataAbierta, espataParcial } = {}) => {
  const p = new URLSearchParams();
  if (fechaDesde) p.append('fecha_desde', fechaDesde);
  if (fechaHasta) p.append('fecha_hasta', fechaHasta);
  if (actualizaDesde) p.append('actualiza_desde', actualizaDesde);
  if (actualizaHasta) p.append('actualiza_hasta', actualizaHasta);
  if (catLoteId) p.append('cat_lote_id', catLoteId);
  if (supervisor) p.append('supervisor', supervisor);
  if (polinizador) p.append('polinizador', polinizador);
  if (cumple) p.append('cumple', cumple);
  if (hoja) p.append('hoja', 'true');
  if (espataSin) p.append('espata_sin', 'true');
  if (cobertura) p.append('cobertura', 'true');
  if (espataAbierta) p.append('espata_abierta', 'true');
  if (espataParcial) p.append('espata_parcial', 'true');
  return p;
};

export const API = {
  catalogos: () => pedir(`${BASE}/catalogos`),
  listar: (f = {}) => pedir(`${BASE}?${q(f)}`),
  urlExcel: (f = {}) => `${BASE}/excel?${q(f)}`,
};
