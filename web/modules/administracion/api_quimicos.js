// ============================================================
// PalmaData · Administración · Tratamientos · Químicos · API
// ============================================================
const BASE = '/api/administracion/quimicos';

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

export const API = {
  todo: () => pedir(BASE),
  categoriaCrear: (categoria) => pedir(`${BASE}/categorias`, json({ categoria })),
  categoriaDesactivar: (id) => pedir(`${BASE}/categorias/desactivar`, json({ id })),
  categoriaReactivar: (id) => pedir(`${BASE}/categorias/reactivar`, json({ id })),
  productoCrear: (producto, categoria_producto_id) =>
    pedir(`${BASE}/productos`, json({ producto, categoria_producto_id })),
  productoDesactivar: (id) => pedir(`${BASE}/productos/desactivar`, json({ id })),
  productoReactivar: (id) => pedir(`${BASE}/productos/reactivar`, json({ id })),
};
