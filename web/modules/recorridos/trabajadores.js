// ============================================================
// PalmaData · Recorridos · Recorrido trabajadores
//
// Flujo: elegir el tipo de fecha (del recorrido o de actualización),
// la fecha, luego el trabajador — la lista solo trae los que tienen
// recorrido ese día — y solo con los dos elegidos se habilita
// «Consultar recorrido». Nunca se cargan todas las líneas: una a la vez.
//
// El mapa es Leaflet (se carga desde CDN la primera vez que entras) con
// los polígonos de cat_lote de fondo, que se piden una sola vez.
// ============================================================
import { API } from './api.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const S = {
  modo: 'fecha',          // 'fecha' (del recorrido) | 'actualiza'
  fecha: '',
  trabajador: '',
  fechas: null,
  trabajadores: [],
  mapa: null, capaLotes: null, capaRuta: null,
  lotesGeo: null,
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const km = m => (m == null) ? '—' : (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m');
const COLORES = ['#d97706', '#2563eb', '#dc2626', '#7c3aed', '#059669', '#db2777'];

// ── Leaflet bajo demanda ──────────────────────────────────────
function cargarLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((ok, mal) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS;
      document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.onload = () => ok();
    js.onerror = () => mal(new Error('No se pudo cargar el mapa (Leaflet). Revisa la conexión a internet.'));
    document.head.appendChild(js);
  });
}

// ============================================================
export async function montar(cont) {
  cont.innerHTML = `<div class="cargando">Cargando…</div>`;
  try {
    S.fechas = await API.fechas();
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  esqueleto(cont);
}

function esqueleto(cont) {
  const estilo = 'padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px';
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="rModo">Buscar por</label>
        <select id="rModo" style="${estilo}">
          <option value="fecha">Fecha del recorrido</option>
          <option value="actualiza">Fecha de actualización</option>
        </select></div>
      <div class="g"><label for="rFecha" id="rFechaLbl">Fecha del recorrido</label>
        <input type="date" id="rFecha" list="rFechaList" style="${estilo}">
        <datalist id="rFechaList"></datalist></div>
      <div class="g"><label for="rTr">Trabajador</label>
        <input id="rTr" list="rTrList" placeholder="Elige la fecha primero…" autocomplete="off"
               disabled style="min-width:220px;${estilo}">
        <datalist id="rTrList"></datalist></div>
      <div class="sp"></div>
      <button class="btn btn-primary" id="rConsultar" disabled>Consultar recorrido</button>
    </div>

    <div id="rInfo"></div>
    <div id="rTarjetas"></div>
    <div class="card" style="padding:10px">
      <div id="rMapa"></div>
      <p class="sub" style="margin:8px 0 0">Los polígonos verdes son los lotes activos.
        El recorrido se dibuja con los puntos que cayeron dentro de los lotes,
        en orden de hora; el círculo marca el inicio y el cuadrado el final.</p>
    </div>
    <div class="card">
      <h3>Días con recorridos</h3>
      <p class="sub">Haz clic en una fecha para elegirla.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
        <div>
          <strong style="font-size:13px">Por fecha del recorrido</strong>
          <div class="twrap" style="max-height:260px;margin-top:6px">
            <table class="ft"><thead><tr><th>Fecha</th><th class="num">Trabajadores</th></tr></thead>
            <tbody>${(S.fechas.fechas || []).map(f => `<tr class="rF" data-modo="fecha" data-f="${f.fecha}" style="cursor:pointer">
              <td class="ln">${esc(f.fecha)}</td><td class="num">${n0(f.trabajadores)}</td></tr>`).join('')}</tbody></table>
          </div>
        </div>
        <div>
          <strong style="font-size:13px">Por fecha de actualización (descarga)</strong>
          <div class="twrap" style="max-height:260px;margin-top:6px">
            <table class="ft"><thead><tr><th>Fecha</th><th class="num">Trabajadores</th></tr></thead>
            <tbody>${(S.fechas.actualizaciones || []).map(f => `<tr class="rF" data-modo="actualiza" data-f="${f.fecha}" style="cursor:pointer">
              <td class="ln">${esc(f.fecha)}</td><td class="num">${n0(f.trabajadores)}</td></tr>`).join('')}</tbody></table>
          </div>
        </div>
      </div>
    </div>`;

  llenarFechas();

  $('#rModo').onchange = e => {
    S.modo = e.target.value;
    $('#rFechaLbl').textContent = S.modo === 'fecha' ? 'Fecha del recorrido' : 'Fecha de actualización';
    llenarFechas();
    S.fecha = ''; $('#rFecha').value = '';
    resetTrabajador();
  };
  $('#rFecha').onchange = async e => {
    S.fecha = e.target.value;
    await cargarTrabajadores();
  };
  cont.querySelectorAll('.rF').forEach(tr => {
    tr.onclick = async () => {
      S.modo = tr.dataset.modo; $('#rModo').value = S.modo;
      $('#rFechaLbl').textContent = S.modo === 'fecha' ? 'Fecha del recorrido' : 'Fecha de actualización';
      llenarFechas();
      S.fecha = tr.dataset.f; $('#rFecha').value = S.fecha;
      await cargarTrabajadores();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  // Trabajador: se elige de los que tienen recorrido ese día
  let temp = null;
  const elegirTr = () => {
    const texto = $('#rTr').value.trim().toLowerCase();
    S.trabajador = '';
    if (texto) {
      const exacto = S.trabajadores.find(t => (t.trabajador || '').toLowerCase() === texto);
      const parcial = S.trabajadores.filter(t => (t.trabajador || '').toLowerCase().includes(texto));
      const elegido = exacto || (parcial.length === 1 ? parcial[0] : null);
      if (elegido) S.trabajador = elegido.trabajador_codigo;
    }
    $('#rConsultar').disabled = !(S.fecha && S.trabajador);
  };
  $('#rTr').oninput = () => { clearTimeout(temp); temp = setTimeout(elegirTr, 250); };
  $('#rTr').onchange = () => { clearTimeout(temp); elegirTr(); };

  $('#rConsultar').onclick = consultar;

  iniciarMapa();
}

function llenarFechas() {
  const lista = S.modo === 'fecha' ? (S.fechas.fechas || []) : (S.fechas.actualizaciones || []);
  $('#rFechaList').innerHTML = lista.map(f => `<option value="${f.fecha}"></option>`).join('');
}

function resetTrabajador() {
  S.trabajador = ''; S.trabajadores = [];
  const tr = $('#rTr');
  tr.value = ''; tr.disabled = true; tr.placeholder = 'Elige la fecha primero…';
  $('#rTrList').innerHTML = '';
  $('#rConsultar').disabled = true;
}

async function cargarTrabajadores() {
  resetTrabajador();
  if (!S.fecha) return;
  const tr = $('#rTr');
  tr.placeholder = 'Buscando…';
  try {
    const r = await API.trabajadores(S.modo, S.fecha);
    S.trabajadores = r.trabajadores || [];
    if (!S.trabajadores.length) {
      tr.placeholder = 'Nadie tiene recorrido ese día';
      $('#rInfo').innerHTML = `<div class="msg msg-warn">No hay recorridos para esa fecha.
        Si los puntos ya bajaron del celular, espera a que corra el proceso
        (cada 20 minutos) o revisa la otra fecha.</div>`;
      return;
    }
    $('#rInfo').innerHTML = '';
    tr.disabled = false;
    tr.placeholder = `${S.trabajadores.length} con recorrido — escribe el nombre…`;
    $('#rTrList').innerHTML = S.trabajadores.map(t =>
      `<option value="${esc(t.trabajador || `Sin nombre (${t.trabajador_codigo})`)}">${esc(t.labores || '')} · ${n0(t.puntos)} puntos</option>`).join('');
    tr.focus();
  } catch (e) {
    $('#rInfo').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }
}

// ── Mapa ─────────────────────────────────────────────────────
async function iniciarMapa() {
  const caja = $('#rMapa');
  try {
    await cargarLeaflet();
  } catch (e) {
    caja.innerHTML = `<div class="msg msg-err" style="margin:14px">${esc(e.message)}</div>`;
    return;
  }
  if (S.mapa) { S.mapa.remove(); S.mapa = null; }
  S.mapa = L.map(caja, { zoomControl: true });
  L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(S.mapa);
  S.mapa.setView([6.9, -73.5], 12);   // se recentra al cargar los lotes

  try {
    if (!S.lotesGeo) S.lotesGeo = await API.lotes();
    S.capaLotes = L.geoJSON(S.lotesGeo, {
      style: { color: '#2f6b46', weight: 1.2, fillColor: '#79b48f', fillOpacity: .18 },
      onEachFeature: (f, capa) => {
        capa.bindTooltip(f.properties.nombre, { permanent: false, direction: 'center', className: 'lote-etiqueta' });
      },
    }).addTo(S.mapa);
    const b = S.capaLotes.getBounds();
    if (b.isValid()) S.mapa.fitBounds(b, { padding: [10, 10] });
  } catch (e) {
    $('#rInfo').innerHTML = `<div class="msg msg-warn">No se pudieron cargar los lotes: ${esc(e.message)}</div>`;
  }
}

async function consultar() {
  if (!(S.fecha && S.trabajador)) return;
  const btn = $('#rConsultar');
  btn.disabled = true; btn.textContent = 'Consultando…';
  $('#rInfo').innerHTML = '';
  try {
    const r = await API.recorrido(S.trabajador, S.modo, S.fecha);
    pintar(r.recorridos);
  } catch (e) {
    $('#rInfo').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    $('#rTarjetas').innerHTML = '';
    if (S.capaRuta) { S.capaRuta.remove(); S.capaRuta = null; }
  } finally {
    btn.disabled = false; btn.textContent = 'Consultar recorrido';
  }
}

function pintar(fc) {
  if (!S.mapa) return;
  if (S.capaRuta) { S.capaRuta.remove(); S.capaRuta = null; }

  S.capaRuta = L.featureGroup().addTo(S.mapa);
  const tarjetas = [];

  fc.features.forEach((f, i) => {
    const p = f.properties;
    const color = COLORES[i % COLORES.length];
    const linea = L.geoJSON(f, { style: { color, weight: 3.5, opacity: .9 } });
    linea.bindPopup(`<strong>${esc(p.trabajador ?? '')}</strong><br>${esc(p.fecha)} ·
      ${esc(p.horaini ?? '')}–${esc(p.horafin ?? '')}<br>${esc(p.labores ?? '—')}`);
    S.capaRuta.addLayer(linea);

    // inicio y fin
    const coords = f.geometry.coordinates;
    if (coords && coords.length) {
      const ini = coords[0], fin = coords[coords.length - 1];
      S.capaRuta.addLayer(L.circleMarker([ini[1], ini[0]], { radius: 6, color, fillColor: '#fff', fillOpacity: 1, weight: 3 })
        .bindTooltip(`Inicio ${esc(p.horaini ?? '')}`));
      S.capaRuta.addLayer(L.marker([fin[1], fin[0]], {
        icon: L.divIcon({ className: '', html: `<div style="width:12px;height:12px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px ${color}"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] }),
      }).bindTooltip(`Fin ${esc(p.horafin ?? '')}`));
    }

    tarjetas.push(`
      <div class="card" style="border-left:5px solid ${color}">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">
          <h3 style="margin:0">${esc(p.trabajador ?? `Trabajador ${p.trabajador_codigo}`)}</h3>
          <span class="sub" style="margin:0">Recorrido del ${esc(p.fecha)} · descargado el ${esc(p.fecha_actualizacion ?? '—')}</span>
        </div>
        <div class="rTarjetas">
          <div class="rTarjeta"><div class="l">Labor</div>
            <div class="v">${esc(p.labores ?? '—')}</div></div>
          <div class="rTarjeta"><div class="l">Fertilizante</div>
            <div class="v">${esc(p.fertilizantes ?? '—')}</div></div>
          <div class="rTarjeta"><div class="l">Horario</div>
            <div class="v">${esc(p.horaini ?? '—')} – ${esc(p.horafin ?? '—')}</div></div>
          <div class="rTarjeta"><div class="l">Puntos en lotes</div>
            <div class="v">${n0(p.puntos)}</div></div>
          <div class="rTarjeta"><div class="l">Distancia recorrida</div>
            <div class="v">${km(p.distancia_m)}</div></div>
        </div>
      </div>`);
  });

  $('#rTarjetas').innerHTML = tarjetas.join('');
  const b = S.capaRuta.getBounds();
  if (b.isValid()) S.mapa.fitBounds(b, { padding: [30, 30], maxZoom: 17 });
  $('#rMapa').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
