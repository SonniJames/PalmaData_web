// ============================================================
// PalmaData · Recorridos · Capa de API
// ============================================================
const BASE = '/api/recorridos';

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

const fechaQ = (modo, fecha) => {
  const p = new URLSearchParams();
  p.append(modo === 'actualiza' ? 'actualiza' : 'fecha', fecha);
  return p;
};

export const API = {
  fechas: () => pedir(`${BASE}/fechas`),
  trabajadores: (modo, fecha) => pedir(`${BASE}/trabajadores?${fechaQ(modo, fecha)}`),
  lotes: () => pedir(`${BASE}/lotes`),
  recorrido: (trabajador, modo, fecha) => {
    const p = fechaQ(modo, fecha);
    p.append('trabajador', trabajador);
    return pedir(`${BASE}/recorrido?${p}`);
  },
};
