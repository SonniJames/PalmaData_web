// ============================================================
// PalmaData · Administración · Trampas
//
// Tabla maestra de trampas: una sola pantalla. Alta, corrección, baja
// (estado = 0) y reactivación.
//
// La baja NO borra: las lecturas de trampas que apuntan a ella siguen
// mostrando su código.
//
// Las coordenadas van con PUNTO decimal. Si se escribe coma se rechaza en
// vez de adivinar: en «1043210,5» la coma podría ser el decimal o el
// separador de miles, y la trampa quedaría a kilómetros de su sitio.
// ============================================================
import { API } from './api_trampas.js';

const S = {
  busqueda: '',
  catLoteId: '',
  verAnuladas: false,
  seleccion: new Set(),
  datos: null,
  mapa: null,
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fecha = f => f ? String(f).slice(0, 10) : '—';
// Las coordenadas se muestran tal cual llegan, con punto: son metros en
// MAGNA-SIRGAS y redondearlas movería la trampa.
const coord = v => (v == null) ? '—' : String(v);

const COMA = /,/;

// ============================================================
export async function montar(cont) {
  cont.innerHTML = `
    <div class="fbar" style="padding:6px 10px">
      <button class="btn btn-primary" id="tabLista" style="padding:7px 16px">Listado</button>
      <button class="btn btn-ghost"   id="tabMapa"  style="padding:7px 16px">Mapa</button>
      <div class="sp"></div>
      <span class="sub" id="tabNota" style="margin:0"></span>
    </div>
    <div id="panelLista"></div>
    <div id="panelMapa" style="display:none"></div>`;

  const ver = async (cual) => {
    const lista = cual === 'lista';
    $('#panelLista').style.display = lista ? '' : 'none';
    $('#panelMapa').style.display  = lista ? 'none' : '';
    $('#tabLista').className = lista ? 'btn btn-primary' : 'btn btn-ghost';
    $('#tabMapa').className  = lista ? 'btn btn-ghost'   : 'btn btn-primary';
    $('#tabNota').textContent = '';
    // El mapa se arma la primera vez que se abre: si no se usa, no se
    // descarga ni la librería ni los polígonos.
    if (!lista && !S.mapa) await montarMapa();
    if (!lista && S.mapa) setTimeout(() => S.mapa.invalidateSize(), 60);
  };
  $('#tabLista').onclick = () => ver('lista');
  $('#tabMapa').onclick  = () => ver('mapa');

  esqueleto($('#panelLista'));
  await cargar();
}

// ============================================================
//  PESTAÑA MAPA · lotes de fondo y trampas con su código
//
//  Las trampas y los lotes se guardan en metros proyectados (3116); la
//  base los entrega ya en lat/lon, que es lo que entiende el mapa.
// ============================================================
const LEAFLET_CSS = '/assets/leaflet/leaflet.css';
const LEAFLET_JS = '/assets/leaflet/leaflet.js';
const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function cargarLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((ok, mal) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS; document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.onload = () => window.L ? ok() : mal(new Error('Leaflet llegó vacío: revisa /assets/leaflet/leaflet.js'));
    js.onerror = () => mal(new Error('No se encontró /assets/leaflet/leaflet.js en el servidor.'));
    document.head.appendChild(js);
  });
}

async function montarMapa() {
  const caja = $('#panelMapa');
  caja.innerHTML = `<div class="cargando">Cargando mapa…</div>`;
  let datos;
  try {
    const res = await fetch('/api/administracion/trampas/mapa');
    const crudo = await res.text();
    let j = null;
    try { j = JSON.parse(crudo); } catch { /* no era JSON */ }
    if (!res.ok || !j) {
      throw new Error(j?.detail
        || (crudo || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 300) || '(respuesta vacía)');
    }
    datos = j;
  } catch (e) {
    caja.innerHTML = `<div class="msg msg-err">No se pudo cargar el mapa: ${esc(e.message)}</div>`;
    return;
  }

  const nTrampas = datos.trampas.features.length;
  const sinUbicar = (S.datos?.resumen?.total ?? 0) - nTrampas;
  caja.innerHTML = `
    <div class="card" style="padding:10px">
      <div id="tMapa"></div>
      <p class="sub" style="margin:8px 0 0">${n0(nTrampas)} trampas sobre
        ${n0(datos.lotes.features.length)} lotes. Las inactivas van en gris.
        ${sinUbicar > 0 ? `<strong>${n0(sinUbicar)} trampa(s) sin coordenadas</strong>
          no se pueden dibujar: ponles la ubicación desde el listado.` : ''}</p>
    </div>`;

  try {
    await cargarLeaflet();
    S.mapa = L.map($('#tMapa'), { zoomControl: true });
    L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.mapa);

    const lotes = L.geoJSON(datos.lotes, {
      style: { color: '#2f6b46', weight: 1, fillColor: '#79b48f', fillOpacity: .15 },
      onEachFeature: (f, capa) => capa.bindTooltip(f.properties.nombre,
                                  { sticky: true, direction: 'top', className: 'lote-etiqueta' }),
    }).addTo(S.mapa);

    // Cada trampa: un punto con su código al lado, siempre visible.
    const trampas = L.geoJSON(datos.trampas, {
      pointToLayer: (f, latlng) => {
        const act = f.properties.activa;
        const color = act ? '#b45309' : '#9a9a9a';
        const m = L.circleMarker(latlng, {
          radius: 5, color, weight: 2, fillColor: act ? '#f59e0b' : '#cfcfcf', fillOpacity: .9,
        });
        m.bindTooltip(String(f.properties.codigo ?? ''), {
          permanent: true, direction: 'right', offset: [7, 0], className: 'trampa-etiqueta',
        });
        m.bindPopup(`<strong>${esc(f.properties.codigo ?? '')}</strong><br>
          Lote ${esc(f.properties.lote ?? '—')}<br>
          Instalada ${esc(f.properties.instalacion ?? '—')}<br>
          ${act ? 'Activa' : 'Inactiva'}`);
        return m;
      },
    }).addTo(S.mapa);

    const b = nTrampas ? trampas.getBounds() : lotes.getBounds();
    if (b.isValid()) S.mapa.fitBounds(b, { padding: [20, 20] });
    setTimeout(() => S.mapa && S.mapa.invalidateSize(), 150);
  } catch (e) {
    $('#tMapa').innerHTML = `<div class="msg msg-err" style="margin:14px">
      No se pudo iniciar el mapa: ${esc(e.message)}</div>`;
  }
}

function esqueleto(cont) {
  const estilo = 'padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px';
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="tBus">Buscar trampa</label>
        <input id="tBus" list="tBusList" placeholder="Código…" autocomplete="off"
               style="min-width:200px;${estilo}">
        <datalist id="tBusList"></datalist>
        <button class="btn btn-ghost" id="tBusX" style="padding:8px 11px" title="Limpiar">✕</button></div>
      <div class="g"><label for="tLo">Lote</label>
        <input id="tLo" list="tLoList" placeholder="Buscar…" autocomplete="off"
               style="min-width:150px;${estilo}">
        <datalist id="tLoList"></datalist>
        <button class="btn btn-ghost" id="tLoX" style="padding:8px 11px" title="Limpiar">✕</button></div>
      <div class="sp"></div>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="tAnu"> Solo inactivas</label>
      <a class="btn btn-ghost" href="/api/administracion/trampas/excel" download
         title="Toda la tabla, activas e inactivas">Descargar Excel</a>
      <button class="btn btn-primary" id="tNueva">Ingresar trampa</button>
    </div>
    <div id="tC"></div>
    <div id="tModal"></div>`;

  let temp = null;
  $('#tBus').oninput = e => {
    clearTimeout(temp);
    const v = e.target.value;
    temp = setTimeout(async () => {
      if (v.trim().length >= 1) {
        try {
          const r = await API.buscar(v);
          $('#tBusList').innerHTML = (r.trampas || [])
            .map(t => `<option value="${esc(t.codigo)}">${esc(t.lote ?? '')}${t.activa ? '' : ' · inactiva'}</option>`)
            .join('');
        } catch { /* sin sugerencias */ }
      }
      S.busqueda = v;
      S.seleccion.clear();
      cargar();
    }, 350);
  };
  $('#tBusX').onclick = () => {
    $('#tBus').value = ''; S.busqueda = ''; S.seleccion.clear(); cargar();
  };

  let tempLo = null;
  $('#tLo').oninput = e => {
    clearTimeout(tempLo);
    const v = e.target.value;
    tempLo = setTimeout(async () => {
      if (!v.trim()) { S.catLoteId = ''; S.seleccion.clear(); cargar(); return; }
      try {
        const r = await API.lotes(v);
        const lotes = r.lotes || [];
        $('#tLoList').innerHTML = lotes.slice(0, 40)
          .map(l => `<option value="${esc(l.nombre)}"></option>`).join('');
        const exacto = lotes.find(l => l.nombre === v);
        if (exacto) { S.catLoteId = exacto.cat_lote_id; S.seleccion.clear(); cargar(); }
      } catch { /* sin resultados */ }
    }, 350);
  };
  $('#tLoX').onclick = () => {
    $('#tLo').value = ''; S.catLoteId = ''; S.seleccion.clear(); cargar();
  };

  $('#tAnu').onchange = e => {
    S.verAnuladas = e.target.checked; S.seleccion.clear(); cargar();
  };
  $('#tNueva').onclick = () => abrirModal(null);
}

async function cargar() {
  const c = $('#tC');
  if (!c) return;
  c.innerHTML = `<div class="cargando">Cargando trampas…</div>`;
  try {
    S.datos = await API.listar({
      q: S.busqueda, catLoteId: S.catLoteId, verAnuladas: S.verAnuladas,
    });
    vista(c);
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }
}

function vista(c) {
  const d = S.datos, r = d.resumen || {};
  const vacio = !d.registros.length;
  const motivoVacio = S.busqueda
    ? `<h3>Sin coincidencias</h3>
       <p>Ninguna trampa ${S.verAnuladas ? 'inactiva ' : ''}coincide con
          «${esc(S.busqueda)}».</p>`
    : S.catLoteId
    ? `<h3>Sin trampas en ese lote</h3>
       <p>El lote seleccionado no tiene trampas ${S.verAnuladas ? 'inactivas' : 'activas'}.</p>`
    : S.verAnuladas
    ? `<h3>Ninguna trampa inactiva</h3>
       <p>No hay bajas registradas. Desmarca <strong>Solo inactivas</strong>
          para ver las activas.</p>`
    : `<h3>Sin trampas</h3>
       <p>Usa <strong>Ingresar trampa</strong> para crear la primera.</p>`;

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Trampas activas</div>
        <div class="v">${n0(r.activas)}</div>
        <div class="s">de ${n0(r.total)} en total</div></div>
      <div class="kpi"><div class="l">Lotes con trampa</div>
        <div class="v">${n0(r.lotes)}</div>
        <div class="s">entre las activas</div></div>
      ${r.inactivas ? `<div class="kpi"><div class="l">Inactivas</div>
        <div class="v">${n0(r.inactivas)}</div></div>` : ''}
      ${r.sin_lote ? `<div class="kpi"><div class="l">Sin lote</div>
        <div class="v">${n0(r.sin_lote)}</div>
        <div class="s">activas, para completar</div></div>` : ''}
      <div class="kpi"><div class="l">Con lecturas</div>
        <div class="v">${n0(r.con_lecturas)}</div>
        <div class="s">ya tienen registros de campo</div></div>
    </div>

    ${S.verAnuladas ? `<div class="msg msg-warn">Estás viendo <strong>solo las
      trampas inactivas</strong>. Puedes reactivar las que se dieron de baja
      por error.</div>` : ''}

    ${d.truncado ? `<div class="msg msg-warn">Se muestran las primeras
      ${n0(d.limite)} trampas. Usa el buscador para acotar.</div>` : ''}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  gap:14px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h3 style="margin:0">Trampas</h3>
          <p class="sub" style="margin:6px 0 0">Selecciona una trampa para
            corregirla, o varias para darlas de baja. La baja
            <strong>no borra</strong>: las lecturas que la mencionan siguen
            intactas.</p>
        </div>
        <strong style="font-size:14px;color:var(--muted)">${n0(d.total)} en la tabla</strong>
      </div>

      <div class="fbar" id="tAcciones" style="margin-bottom:14px;display:none">
        <strong id="tSelN" style="font-size:14px"></strong>
        <div class="sp"></div>
        <button class="btn btn-primary" id="tEditar">Corregir trampa</button>
        <button class="btn btn-ghost" id="tAnular">Anular</button>
        <button class="btn btn-ghost" id="tReactivar">Reactivar</button>
        <button class="btn btn-ghost" id="tQuitar">Quitar selección</button>
      </div>

      ${vacio ? `<div class="vacio" style="padding:36px 20px">${motivoVacio}</div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th style="width:34px"><input type="checkbox" id="tTodos" title="Seleccionar todo"></th>
            <th class="num">Id</th>
            <th>Código</th><th>Instalación</th>
            <th class="num">X</th><th class="num">Y</th>
            <th>Estado</th><th>Lote</th>
            <th>Agregado por</th><th>Corregido</th>
          </tr></thead>
          <tbody>${d.registros.map(x => `<tr data-id="${x.santrampaid}"
              ${x.activa ? '' : 'style="opacity:.5"'}>
            <td><input type="checkbox" class="tSel" value="${x.santrampaid}"
                 ${S.seleccion.has(x.santrampaid) ? 'checked' : ''}></td>
            <td class="num">${x.santrampaid}</td>
            <td class="ln">${esc(x.codigo ?? '—')}</td>
            <td>${fecha(x.instalacion)}</td>
            <td class="num">${x.tiene_geom ? coord(x.x)
              : '<span class="sem" style="min-width:auto;background:#f6e3c8;color:#7a5a1e" title="Sin coordenadas: corrígela para ubicarla">Sin ubicar</span>'}</td>
            <td class="num">${x.tiene_geom ? coord(x.y) : ''}</td>
            <td>${x.activa
              ? '<span class="sem sem-optimo" style="min-width:auto">Activa</span>'
              : `<span class="sem sem-deficiente" style="min-width:auto"
                   title="${esc(x.anulado_motivo ?? '')}">Inactiva</span>`}</td>
            <td>${esc(x.lote ?? '—')}</td>
            <td style="font-size:12.5px">${x.agregado_por
              ? `${esc(x.agregado_por)}<br><span style="color:var(--muted)">${fecha(x.creado_at)}</span>`
              : '—'}</td>
            <td style="font-size:12.5px">${x.corregido_por
              ? `<span class="sem sem-optimo" title="${esc(String(x.corregido_at ?? ''))}">${esc(x.corregido_por)}</span>`
              : (x.anulado_por
                  ? `<span class="sem sem-deficiente" title="${esc(x.anulado_motivo ?? '')}">anuló ${esc(x.anulado_por)}</span>`
                  : '—')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`}
    </div>`;

  const refrescar = () => {
    const barra = $('#tAcciones');
    if (!barra) return;
    const n = S.seleccion.size;
    barra.style.display = n ? 'flex' : 'none';
    $('#tSelN').textContent = n === 1
      ? '1 trampa seleccionada' : `${n} trampas seleccionadas`;
    // La corrección es de a una: código y coordenadas son propios.
    const btn = $('#tEditar');
    btn.disabled = n !== 1;
    btn.title = n > 1 ? 'Selecciona una sola trampa para corregirla' : '';
  };

  c.querySelectorAll('.tSel').forEach(chk => {
    chk.onchange = () => {
      const id = Number(chk.value);
      chk.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
      refrescar();
    };
  });

  const todos = $('#tTodos');
  if (todos) todos.onchange = e => {
    c.querySelectorAll('.tSel').forEach(chk => {
      chk.checked = e.target.checked;
      const id = Number(chk.value);
      e.target.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
    });
    refrescar();
  };

  const quitar = $('#tQuitar');
  if (quitar) quitar.onclick = () => {
    S.seleccion.clear();
    c.querySelectorAll('.tSel').forEach(chk => { chk.checked = false; });
    if (todos) todos.checked = false;
    refrescar();
  };

  const editar = $('#tEditar');
  if (editar) editar.onclick = () => {
    if (S.seleccion.size === 1) abrirModal([...S.seleccion][0]);
  };
  const anular = $('#tAnular');
  if (anular) anular.onclick = () => accion('anular');
  const react = $('#tReactivar');
  if (react) react.onclick = () => accion('reactivar');

  refrescar();
}

async function accion(tipo) {
  const ids = [...S.seleccion];
  if (!ids.length) return;

  let motivo = null;
  if (tipo === 'anular') {
    motivo = prompt(`Vas a dar de baja ${ids.length} trampa(s).\n\n` +
                    `No se borra nada: sus lecturas quedan intactas y puedes ` +
                    `reactivarla cuando quieras.\n\nMotivo (opcional):`, '');
    if (motivo === null) return;
  } else if (!confirm(`Vas a reactivar ${ids.length} trampa(s). ¿Continuar?`)) {
    return;
  }

  try {
    await (tipo === 'anular' ? API.anular(ids, motivo) : API.reactivar(ids));
    S.seleccion.clear();
    await cargar();
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
//  VENTANA DE ALTA / CORRECCIÓN
//  id === null  ->  crear
// ============================================================
function abrirModal(id) {
  const nueva = id === null;
  const reg = nueva ? {}
    : (S.datos.registros.find(x => x.santrampaid === id) || {});
  const req = ' <span style="color:var(--danger)">*</span>';

  const caja = $('#tModal');
  caja.innerHTML = `
    <div class="modal-fondo" id="tFondo">
      <div class="modal">
        <h3>${nueva ? 'Ingresar trampa' : 'Corregir trampa'}</h3>
        <p class="sub">${nueva
          ? `El id lo asigna la base de datos. El tipo de trampa y la
             plantación se ponen solos; la ubicación se calcula con las
             coordenadas.`
          : `Id ${reg.santrampaid} · ${esc(reg.codigo ?? '')}.
             Deja en blanco lo que no quieras cambiar.`}</p>

        <div class="mcampo">
          <label for="mCod">Código${nueva ? req : ''}</label>
          <input id="mCod" maxlength="15" autocomplete="off"
                 ${nueva ? '' : `placeholder="${esc(reg.codigo ?? '')}"`}>
          <div class="ayuda">No puede repetirse: cada trampa tiene un código único.</div>
        </div>
        <div class="mcampo">
          <label for="mIns">Instalación</label>
          <input type="date" id="mIns" ${nueva ? '' : `value="${(reg.instalacion || '').slice(0, 10)}"`}>
          <div class="ayuda">${nueva
            ? 'Cuándo se puso la trampa en campo.'
            : 'Solo cambia si eliges otra fecha; corregir los demás campos no la mueve.'}</div>
        </div>
        <div class="mcampo">
          <label for="mX">Coordenada X</label>
          <input id="mX" inputmode="decimal" autocomplete="off"
                 ${nueva ? 'placeholder="1043210.5"' : `placeholder="${esc(reg.x ?? '')}"`}>
        </div>
        <div class="mcampo">
          <label for="mY">Coordenada Y</label>
          <input id="mY" inputmode="decimal" autocomplete="off"
                 ${nueva ? 'placeholder="1195432.8"' : `placeholder="${esc(reg.y ?? '')}"`}>
          <div class="ayuda">Opcionales: puedes crear la trampa sin ubicación y
            ponerla después. Si las pones, van las dos, con <strong>punto</strong>
            decimal, no coma.</div>
        </div>
        <div class="mcampo">
          <label for="mEst">Estado${nueva ? req : ''}</label>
          <select id="mEst">
            ${nueva
              ? `<option value="">— elige —</option>
                 <option value="1">Activa</option>
                 <option value="0">Inactiva</option>`
              : `<option value="">— sin cambio (${reg.activa ? 'Activa' : 'Inactiva'}) —</option>
                 <option value="1">Activa</option>
                 <option value="0">Inactiva</option>`}
          </select>
        </div>
        <div class="mcampo">
          <label for="mLote">Lote</label>
          <input id="mLote" list="mLoteList" autocomplete="off"
                 placeholder="${nueva ? 'Escribe el número o el nombre…' : esc(reg.lote ?? '')}">
          <datalist id="mLoteList"></datalist>
          <div class="ayuda" id="mLoteAyuda">Escribe <em>138</em> para encontrar
            <em>L138-C</em>.</div>
        </div>

        <div id="mMsg"></div>
        <div class="macciones">
          <button class="btn btn-ghost" id="mCancelar">Cancelar</button>
          <button class="btn btn-primary" id="mGuardar">
            ${nueva ? 'Crear trampa' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>`;

  let loteId = null;
  let temp = null;
  const inputLote = $('#mLote');

  inputLote.oninput = () => {
    clearTimeout(temp);
    loteId = null;
    const v = inputLote.value;
    if (!v.trim()) { $('#mLoteAyuda').textContent = ''; return; }
    temp = setTimeout(async () => {
      try {
        const r = await API.lotes(v);
        const lotes = r.lotes || [];
        $('#mLoteList').innerHTML = lotes.slice(0, 40)
          .map(l => `<option value="${esc(l.nombre)}"></option>`).join('');
        const exacto = lotes.find(l => l.nombre === v);
        if (exacto) {
          loteId = exacto.cat_lote_id;
          $('#mLoteAyuda').innerHTML =
            `<span style="color:var(--palm)">Lote «${esc(exacto.nombre)}» seleccionado.</span>`;
        } else {
          $('#mLoteAyuda').textContent = lotes.length
            ? `${lotes.length} coincidencias. Elige una de la lista.`
            : 'Ningún lote coincide.';
        }
      } catch { /* sin resultados */ }
    }, 300);
  };

  const cerrar = () => { caja.innerHTML = ''; };
  $('#mCancelar').onclick = cerrar;
  $('#tFondo').onclick = e => { if (e.target.id === 'tFondo') cerrar(); };
  $('#mCod').focus();

  $('#mGuardar').onclick = async () => {
    const btn = $('#mGuardar');
    const msg = $('#mMsg');
    const x = $('#mX').value.trim();
    const y = $('#mY').value.trim();

    // El punto decimal se exige aquí mismo, antes de mandar nada.
    if (COMA.test(x) || COMA.test(y)) {
      msg.innerHTML = `<div class="msg msg-err">Las coordenadas se escriben con
        <strong>punto</strong>, no con coma. Por ejemplo <em>1043210.5</em>.</div>`;
      return;
    }
    if ((x === '') !== (y === '')) {
      msg.innerHTML = `<div class="msg msg-err">Para mover la trampa hay que
        escribir las <strong>dos</strong> coordenadas.</div>`;
      return;
    }

    if (inputLote.value.trim() && !loteId) {
      msg.innerHTML = `<div class="msg msg-err">Elige un lote de la lista:
        el nombre escrito no coincide con ninguno.</div>`;
      return;
    }

    const campos = {
      codigo: $('#mCod').value.trim(),
      instalacion: $('#mIns').value || '',
      x, y,
      estado: $('#mEst').value,
      cat_lote_id: loteId || '',
    };

    if (nueva) {
      if (!campos.codigo) {
        msg.innerHTML = `<div class="msg msg-err">El código es obligatorio.</div>`;
        return;
      }
      if (campos.estado === '') {
        msg.innerHTML = `<div class="msg msg-err">Indica si la trampa está Activa o Inactiva.</div>`;
        return;
      }

    } else if (!campos.codigo && !campos.instalacion && !x && !y
               && campos.estado === '' && !loteId) {
      msg.innerHTML = `<div class="msg msg-err">No cambiaste ningún campo.</div>`;
      return;
    }

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (nueva) {
        const r = await API.crear(campos);
        msg.innerHTML = `<div class="msg msg-ok">Trampa creada con el
          id ${r.santrampaid}.</div>`;
      } else {
        await API.corregir(id, campos);
        msg.innerHTML = `<div class="msg msg-ok">Trampa corregida.</div>`;
      }
      S.seleccion.clear();
      setTimeout(async () => { cerrar(); await cargar(); }, 1000);
    } catch (e) {
      msg.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
      btn.disabled = false;
      btn.textContent = nueva ? 'Crear trampa' : 'Guardar cambios';
    }
  };
}
