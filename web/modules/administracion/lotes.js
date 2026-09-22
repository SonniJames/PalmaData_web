// ============================================================
// PalmaData · Administración · Lotes
//
// Solo consulta: la tabla de cat_lote (estado = 1) con su sector, y el
// mapa de polígonos. Sin etiquetas. Al marcar lotes en la tabla o elegir
// sectores, los polígonos correspondientes se resaltan.
//
// El mapa es el mismo Leaflet de Recorridos, servido desde este servidor.
// ============================================================

const LEAFLET_CSS = '/assets/leaflet/leaflet.css';
const LEAFLET_JS = '/assets/leaflet/leaflet.js';
const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const S = {
  lotes: [], mapaGeo: null,
  sectores: new Set(),     // ids de sector elegidos
  marcados: new Set(),     // ids de lote marcados en la tabla
  busqueda: '',
  mapa: null, capa: null, capas: {},   // capas por cat_lote_id
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Un color por sector, para que al elegir varios se distingan
const PALETA = ['#d97706', '#2563eb', '#dc2626', '#7c3aed', '#059669', '#db2777', '#0891b2', '#65a30d'];
const ESTILO_BASE = { color: '#2f6b46', weight: 1, fillColor: '#79b48f', fillOpacity: .15 };

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

export async function montar(cont) {
  cont.innerHTML = `<div class="cargando">Cargando lotes…</div>`;
  try {
    const res = await fetch('/api/administracion/lotes');
    const j = await res.json();
    if (!res.ok) throw new Error(j.detail || `Error ${res.status}`);
    S.lotes = j.lotes; S.mapaGeo = j.mapa;
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  esqueleto(cont);
  pintarTabla();
  await iniciarMapa();
}

function sectoresUnicos() {
  const m = new Map();
  for (const l of S.lotes) if (l.cat_sector_id != null) m.set(l.cat_sector_id, l.sector || `Sector ${l.cat_sector_id}`);
  return [...m.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
}

function esqueleto(cont) {
  const sectores = sectoresUnicos();
  const estilo = 'padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px';
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="lBus">Buscar lote</label>
        <input id="lBus" placeholder="Nombre…" autocomplete="off" style="min-width:180px;${estilo}"></div>
      <div class="g" style="flex:1;min-width:260px"><label>Sectores</label>
        <div id="lSec" style="display:flex;flex-wrap:wrap;gap:6px">
          ${sectores.map(([id, nom], i) => `
            <label class="sec-chip" data-id="${id}" style="display:flex;align-items:center;gap:5px;cursor:pointer;
                   font-size:12.5px;padding:4px 10px;border:1.5px solid var(--line);border-radius:99px;background:var(--paper)">
              <span style="width:10px;height:10px;border-radius:50%;background:${PALETA[i % PALETA.length]}"></span>
              <input type="checkbox" value="${id}" hidden> ${esc(nom)}</label>`).join('')}
        </div></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="lLimpiar">Quitar selección</button>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="l">Lotes activos</div><div class="v">${n0(S.lotes.length)}</div></div>
      <div class="kpi"><div class="l">Palmas</div><div class="v">${n0(S.lotes.reduce((a, l) => a + (l.palmas || 0), 0))}</div></div>
      <div class="kpi"><div class="l">Sectores</div><div class="v">${n0(sectores.length)}</div></div>
      <div class="kpi"><div class="l">Resaltados</div><div class="v" id="lResaltados">0</div>
        <div class="s">marca lotes o elige sectores</div></div>
    </div>

    <div style="display:grid;grid-template-columns:minmax(300px,2fr) minmax(320px,3fr);gap:16px;align-items:start">
      <div class="card" style="padding:12px">
        <div class="twrap" style="max-height:62vh">
          <table class="ft">
            <thead><tr>
              <th style="width:30px"><input type="checkbox" id="lTodos" title="Marcar los visibles"></th>
              <th class="num">Id</th><th>Lote</th><th>Sector</th><th>Siembra</th>
              <th class="num">Palmas</th><th>Material</th>
            </tr></thead>
            <tbody id="lCuerpo"></tbody>
          </table>
        </div>
      </div>
      <div class="card" style="padding:10px">
        <div id="lMapa"></div>
        <p class="sub" style="margin:8px 0 0">Los lotes se dibujan sin etiquetas; el nombre sale
          al pasar el mouse. Los marcados en la tabla y los de los sectores elegidos se resaltan.
          Clic en un polígono lo marca o desmarca.</p>
      </div>
    </div>`;

  $('#lBus').oninput = e => { S.busqueda = e.target.value.trim().toLowerCase(); pintarTabla(); };
  $('#lSec').querySelectorAll('.sec-chip').forEach(chip => {
    const id = Number(chip.dataset.id);
    chip.onclick = e => {
      e.preventDefault();
      S.sectores.has(id) ? S.sectores.delete(id) : S.sectores.add(id);
      chip.style.background = S.sectores.has(id) ? 'var(--palm-soft)' : 'var(--paper)';
      chip.style.borderColor = S.sectores.has(id) ? 'var(--palm)' : 'var(--line)';
      pintarTabla(); resaltar();
    };
  });
  $('#lLimpiar').onclick = () => {
    S.sectores.clear(); S.marcados.clear();
    $('#lSec').querySelectorAll('.sec-chip').forEach(c => { c.style.background = 'var(--paper)'; c.style.borderColor = 'var(--line)'; });
    pintarTabla(); resaltar();
  };
  $('#lTodos').onchange = e => {
    visibles().forEach(l => e.target.checked ? S.marcados.add(l.cat_lote_id) : S.marcados.delete(l.cat_lote_id));
    pintarTabla(); resaltar();
  };
}

function visibles() {
  return S.lotes.filter(l =>
    (!S.busqueda || (l.nombre || '').toLowerCase().includes(S.busqueda))
    && (!S.sectores.size || S.sectores.has(l.cat_sector_id)));
}

function pintarTabla() {
  const cuerpo = $('#lCuerpo');
  if (!cuerpo) return;
  const lista = visibles();
  cuerpo.innerHTML = lista.map(l => `<tr data-id="${l.cat_lote_id}"
      ${S.marcados.has(l.cat_lote_id) ? 'style="background:var(--palm-soft)"' : ''}>
    <td><input type="checkbox" class="lSel" value="${l.cat_lote_id}" ${S.marcados.has(l.cat_lote_id) ? 'checked' : ''}></td>
    <td class="num">${l.cat_lote_id}</td>
    <td class="ln">${esc(l.nombre)}${l.tiene_geom ? '' : ' <span class="sub" title="Sin geometría: no sale en el mapa">◌</span>'}</td>
    <td>${esc(l.sector ?? '—')}</td>
    <td>${esc(l.siembra ?? '—')}</td>
    <td class="num">${n0(l.palmas)}</td>
    <td>${esc(l.material ?? '—')}</td>
  </tr>`).join('') || `<tr><td colspan="7" class="sub">Ningún lote coincide.</td></tr>`;

  cuerpo.querySelectorAll('.lSel').forEach(chk => {
    chk.onchange = () => {
      const id = Number(chk.value);
      chk.checked ? S.marcados.add(id) : S.marcados.delete(id);
      chk.closest('tr').style.background = chk.checked ? 'var(--palm-soft)' : '';
      resaltar();
    };
  });
}

// ── Mapa ─────────────────────────────────────────────────────
async function iniciarMapa() {
  const caja = $('#lMapa');
  try {
    await cargarLeaflet();
    if (S.mapa) { S.mapa.remove(); S.mapa = null; }
    S.mapa = L.map(caja, { zoomControl: true });
    L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.mapa);
    setTimeout(() => S.mapa && S.mapa.invalidateSize(), 200);

    S.capas = {};
    S.capa = L.geoJSON(S.mapaGeo, {
      style: ESTILO_BASE,
      onEachFeature: (f, capa) => {
        const id = f.properties.cat_lote_id;
        S.capas[id] = capa;
        capa.bindTooltip(`${f.properties.nombre}${f.properties.sector ? ' · ' + f.properties.sector : ''}`,
                         { sticky: true, direction: 'top' });
        capa.on('click', () => {
          S.marcados.has(id) ? S.marcados.delete(id) : S.marcados.add(id);
          pintarTabla(); resaltar();
        });
      },
    }).addTo(S.mapa);
    const b = S.capa.getBounds();
    if (b.isValid()) S.mapa.fitBounds(b, { padding: [10, 10] });
    resaltar();
  } catch (e) {
    caja.innerHTML = `<div class="msg msg-err" style="margin:14px">No se pudo iniciar el mapa: ${esc(e.message)}</div>`;
  }
}

// Qué se resalta y con qué color: los lotes marcados a mano en naranja;
// los de un sector elegido, con el color de ese sector.
function resaltar() {
  const sectores = sectoresUnicos();
  const colorSector = new Map(sectores.map(([id], i) => [id, PALETA[i % PALETA.length]]));
  let n = 0;
  for (const l of S.lotes) {
    const capa = S.capas[l.cat_lote_id];
    const porSector = S.sectores.has(l.cat_sector_id);
    const marcado = S.marcados.has(l.cat_lote_id);
    if (marcado || porSector) n++;
    if (!capa) continue;
    if (marcado) {
      capa.setStyle({ color: '#b45309', weight: 2.5, fillColor: '#f59e0b', fillOpacity: .55 });
      capa.bringToFront();
    } else if (porSector) {
      const c = colorSector.get(l.cat_sector_id) || '#2563eb';
      capa.setStyle({ color: c, weight: 2, fillColor: c, fillOpacity: .40 });
      capa.bringToFront();
    } else {
      capa.setStyle(ESTILO_BASE);
    }
  }
  const r = $('#lResaltados'); if (r) r.textContent = n0(n);
}
