// ============================================================
// PalmaData · Administración · Tratamientos · Químicos
//
// Dos maestros en una pantalla: categorías y productos. Crear, desactivar
// y reactivar. Nada se borra: los tratamientos ya registrados siguen
// apuntando a su producto aunque se desactive.
//
// Un producto necesita categoría, y solo se ofrecen las categorías
// activas. Una categoría con productos activos no se puede desactivar.
// ============================================================
import { API } from './api_quimicos.js';

const S = { datos: null, verInactivos: false };

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const activo = '<span class="sem sem-optimo" style="min-width:auto">Activo</span>';
const inactivo = '<span class="sem sem-deficiente" style="min-width:auto">Desactivado</span>';

export async function montar(cont) {
  cont.innerHTML = `
    <div class="fbar">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="qInact"> Mostrar desactivados</label>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="qNuevaCat">Nueva categoría</button>
      <button class="btn btn-primary" id="qNuevoProd">Nuevo producto</button>
    </div>
    <div id="qC"></div>
    <div id="qModal"></div>`;
  $('#qInact').onchange = e => { S.verInactivos = e.target.checked; pintar(); };
  $('#qNuevaCat').onclick = () => modalCategoria();
  $('#qNuevoProd').onclick = () => modalProducto();
  await cargar();
}

async function cargar() {
  const c = $('#qC');
  if (!c) return;
  c.innerHTML = `<div class="cargando">Cargando…</div>`;
  try {
    S.datos = await API.todo();
    pintar();
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }
}

function pintar() {
  const c = $('#qC');
  if (!c || !S.datos) return;
  const cats = S.datos.categorias.filter(x => S.verInactivos || x.activa);
  const prods = S.datos.productos.filter(x => S.verInactivos || x.activo);
  const nCat = S.datos.categorias.filter(x => x.activa).length;
  const nProd = S.datos.productos.filter(x => x.activo).length;

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Categorías activas</div><div class="v">${n0(nCat)}</div>
        <div class="s">de ${n0(S.datos.categorias.length)}</div></div>
      <div class="kpi"><div class="l">Productos activos</div><div class="v">${n0(nProd)}</div>
        <div class="s">de ${n0(S.datos.productos.length)}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:minmax(280px,1fr) minmax(320px,2fr);gap:16px;align-items:start">
      <div class="card">
        <h3 style="margin:0 0 4px">Categorías</h3>
        <p class="sub" style="margin:0 0 12px">Una categoría con productos activos no se
          puede desactivar: desactiva primero sus productos.</p>
        <div class="twrap">
          <table class="ft">
            <thead><tr><th>Categoría</th><th class="num">Productos</th><th>Estado</th><th></th></tr></thead>
            <tbody>${cats.map(x => `<tr ${x.activa ? '' : 'style="opacity:.55"'}>
              <td class="ln">${esc(x.categoria)}</td>
              <td class="num" title="${n0(x.productos_total)} en total">${n0(x.productos_activos)}</td>
              <td>${x.activa ? activo : inactivo}</td>
              <td style="text-align:right">${x.activa
                ? `<button class="btn btn-ghost qCatOff" data-id="${x.categoria_producto_id}" style="padding:3px 10px" ${x.productos_activos ? 'disabled title="Tiene productos activos"' : ''}>Desactivar</button>`
                : `<button class="btn btn-ghost qCatOn" data-id="${x.categoria_producto_id}" style="padding:3px 10px">Reactivar</button>`}</td>
            </tr>`).join('') || `<tr><td colspan="4" class="sub">Sin categorías.</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3 style="margin:0 0 4px">Productos</h3>
        <p class="sub" style="margin:0 0 12px">Desactivar un producto lo quita de la app;
          los tratamientos ya registrados con él no cambian.</p>
        <div class="twrap">
          <table class="ft">
            <thead><tr><th>Producto</th><th>Categoría</th><th class="num">Usado en</th><th>Estado</th><th></th></tr></thead>
            <tbody>${prods.map(x => `<tr ${x.activo ? '' : 'style="opacity:.55"'}>
              <td class="ln">${esc(x.producto)}</td>
              <td>${esc(x.categoria ?? '—')}${x.categoria_activa === false
                ? ' <span class="sem sem-deficiente" style="min-width:auto;font-size:11px" title="La categoría está desactivada">cat. inactiva</span>' : ''}</td>
              <td class="num" title="tratamientos registrados con este producto">${n0(x.usos)}</td>
              <td>${x.activo ? activo : inactivo}</td>
              <td style="text-align:right">${x.activo
                ? `<button class="btn btn-ghost qProdOff" data-id="${x.producto_id}" style="padding:3px 10px">Desactivar</button>`
                : `<button class="btn btn-ghost qProdOn" data-id="${x.producto_id}" style="padding:3px 10px" ${x.categoria_activa === false ? 'disabled title="Reactiva primero su categoría"' : ''}>Reactivar</button>`}</td>
            </tr>`).join('') || `<tr><td colspan="5" class="sub">Sin productos.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  const accion = (sel, fn, pregunta) => c.querySelectorAll(sel).forEach(b => {
    b.onclick = async () => {
      if (pregunta && !confirm(pregunta)) return;
      try { await fn(Number(b.dataset.id)); await cargar(); }
      catch (e) { alert(e.message); }
    };
  });
  accion('.qCatOff', API.categoriaDesactivar, '¿Desactivar esta categoría? Dejará de aparecer en la app.');
  accion('.qCatOn', API.categoriaReactivar);
  accion('.qProdOff', API.productoDesactivar, '¿Desactivar este producto? Dejará de aparecer en la app; los tratamientos ya registrados no cambian.');
  accion('.qProdOn', API.productoReactivar);
}

// ── Modales ──────────────────────────────────────────────────
function modalBase(titulo, sub, cuerpo, onGuardar) {
  const caja = $('#qModal');
  caja.innerHTML = `
    <div class="modal-fondo" id="qFondo"><div class="modal">
      <h3>${titulo}</h3><p class="sub">${sub}</p>
      ${cuerpo}
      <div id="qMsg"></div>
      <div class="macciones">
        <button class="btn btn-ghost" id="qCancelar">Cancelar</button>
        <button class="btn btn-primary" id="qGuardar">Guardar</button>
      </div>
    </div></div>`;
  const cerrar = () => { caja.innerHTML = ''; };
  $('#qCancelar').onclick = cerrar;
  $('#qFondo').onclick = e => { if (e.target.id === 'qFondo') cerrar(); };
  $('#qGuardar').onclick = async () => {
    const btn = $('#qGuardar'), msg = $('#qMsg');
    const error = await onGuardar(msg);
    if (error) { msg.innerHTML = `<div class="msg msg-err">${esc(error)}</div>`; return; }
    btn.disabled = true;
    setTimeout(async () => { cerrar(); await cargar(); }, 700);
  };
  const primero = caja.querySelector('input, select');
  if (primero) primero.focus();
}

function modalCategoria() {
  modalBase('Nueva categoría', 'Solo el nombre. El id lo asigna la base y queda activa.', `
    <div class="mcampo"><label for="mCat">Nombre de la categoría <span style="color:var(--danger)">*</span></label>
      <input id="mCat" maxlength="80" autocomplete="off" placeholder="Ej.: Acaricidas"></div>`,
    async (msg) => {
      const nombre = $('#mCat').value.trim();
      if (!nombre) return 'Escribe el nombre de la categoría.';
      try { await API.categoriaCrear(nombre); msg.innerHTML = `<div class="msg msg-ok">Categoría creada.</div>`; }
      catch (e) { return e.message; }
    });
}

function modalProducto() {
  const cats = (S.datos?.categorias || []).filter(x => x.activa);
  if (!cats.length) { alert('No hay categorías activas. Crea una primero.'); return; }
  modalBase('Nuevo producto', 'Nombre y categoría, las dos obligatorias. Solo se ofrecen las categorías activas.', `
    <div class="mcampo"><label for="mProd">Nombre del producto <span style="color:var(--danger)">*</span></label>
      <input id="mProd" maxlength="120" autocomplete="off" placeholder="Ej.: Abamectina"></div>
    <div class="mcampo"><label for="mProdCat">Categoría <span style="color:var(--danger)">*</span></label>
      <select id="mProdCat"><option value="">— elige —</option>
        ${cats.map(x => `<option value="${x.categoria_producto_id}">${esc(x.categoria)}</option>`).join('')}
      </select>
      <div class="ayuda">Sin categoría no se puede guardar el producto.</div></div>`,
    async (msg) => {
      const nombre = $('#mProd').value.trim(), cat = $('#mProdCat').value;
      if (!nombre) return 'Escribe el nombre del producto.';
      if (!cat) return 'Elige la categoría a la que pertenece.';
      try { await API.productoCrear(nombre, Number(cat)); msg.innerHTML = `<div class="msg msg-ok">Producto creado.</div>`; }
      catch (e) { return e.message; }
    });
}
