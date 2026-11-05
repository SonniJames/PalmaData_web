// ============================================================
// PalmaData · Mapas · Piezas compartidas de Censo y Tratamientos
//
//   cargarLeaflet()   la librería del mapa, servida desde este servidor
//   crearMapa()       mapa con la plantación y los lotes de fondo
//   multiselect()     lista desplegable con casillas (uno o varios)
//   selectorMes()     año y mes: estos mapas se analizan mes a mes
// ============================================================
import { API } from './api.js';

export const $ = (s, c = document) => c.querySelector(s);
export const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
export const n1 = v => (v == null || isNaN(v)) ? '—'
  : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 });
export const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const LEAFLET_CSS = '/assets/leaflet/leaflet.css';
const LEAFLET_JS = '/assets/leaflet/leaflet.js';
// El fondo de calles viene de internet; si no carga, los lotes y las
// palmas se dibujan igual.
const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export function cargarLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((ok, mal) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS;
      document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.onload = () => window.L ? ok()
      : mal(new Error('Leaflet llegó vacío: revisa /assets/leaflet/leaflet.js en el servidor.'));
    js.onerror = () => mal(new Error('No se encontró /assets/leaflet/leaflet.js en el servidor.'));
    document.head.appendChild(js);
  });
}

// Las capas de fondo se piden una sola vez por sesión y las comparten
// Censo y Tratamientos.
let capasFondo = null;

/**
 * Crea el mapa en `caja` con la plantación y los lotes de fondo.
 * Lotes y palmas se dibujan sobre el MISMO lienzo: así, al pasar el mouse,
 * la palma que está encima gana y, fuera de las palmas, sale el lote.
 * Devuelve { mapa, lienzo, encuadre } o lanza un error con el motivo.
 */
export async function crearMapa(caja, avisar = () => {}) {
  await cargarLeaflet();
  if (!capasFondo) capasFondo = await API.capas();

  const mapa = L.map(caja, { zoomControl: true, preferCanvas: true });
  const lienzo = L.canvas({ padding: .3, tolerance: 3 });

  const tiles = L.tileLayer(TILES, { maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
  let avisado = false;
  tiles.on('tileerror', () => {
    if (avisado) return;
    avisado = true;
    avisar('No se pudo cargar el fondo de calles (necesita internet). Los lotes y las palmas se ven igual.');
  });
  tiles.addTo(mapa);
  mapa.setView([6.9, -73.5], 12);
  setTimeout(() => mapa.invalidateSize(), 200);

  let encuadre = null;
  const plant = capasFondo.plantacion;
  if (plant && plant.features && plant.features.length) {
    const capa = L.geoJSON(plant, {
      renderer: lienzo, interactive: false,
      style: { color: '#2f6b46', weight: 1, opacity: .45, dashArray: '4 4',
               fillColor: '#79b48f', fillOpacity: .05 },
    }).addTo(mapa);
    encuadre = capa.getBounds();
  }
  const lotes = capasFondo.lotes;
  if (lotes && lotes.features && lotes.features.length) {
    const capa = L.geoJSON(lotes, {
      renderer: lienzo,
      style: { color: '#2f6b46', weight: 1, fillColor: '#79b48f', fillOpacity: .12 },
      onEachFeature: (f, c) => c.bindTooltip(esc(f.properties.nombre),
        { sticky: true, direction: 'top', className: 'mp-lote', offset: [0, -6] }),
    }).addTo(mapa);
    if (!encuadre || !encuadre.isValid()) encuadre = capa.getBounds();
  } else {
    avisar('No hay lotes activos con polígono en cat_lote: el mapa sale sin el fondo de lotes.');
  }
  if (encuadre && encuadre.isValid()) mapa.fitBounds(encuadre, { padding: [10, 10] });

  return { mapa, lienzo, encuadre };
}

/** Botón del mapa para encuadrar lo que se está viendo. */
export function botonEncuadrar(mapa, obtenerLimites) {
  const Boton = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const a = L.DomUtil.create('a', 'leaflet-bar mp-boton');
      a.href = '#'; a.title = 'Encuadrar las palmas del mapa'; a.setAttribute('role', 'button');
      a.innerHTML = '⤢';
      L.DomEvent.on(a, 'click', L.DomEvent.stop).on(a, 'click', () => {
        const b = obtenerLimites();
        if (b && b.isValid()) mapa.fitBounds(b, { padding: [24, 24], maxZoom: 17 });
      });
      return a;
    },
  });
  mapa.addControl(new Boton());
}

/** Leyenda abajo a la derecha. `pintar(items)` la actualiza: [{color, texto, n}]. */
export function leyenda(mapa) {
  let div = null;
  const Ley = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() { div = L.DomUtil.create('div', 'mp-leyenda'); div.hidden = true; return div; },
  });
  mapa.addControl(new Ley());
  return {
    pintar(items) {
      if (!div) return;
      div.hidden = !items.length;
      div.innerHTML = items.map(x => `<div><i style="background:${x.color}"></i>${esc(x.texto)}
        <b>${n0(x.n)}</b></div>`).join('');
    },
  };
}

// ============================================================
//  LISTA CON CASILLAS
//
//  Uno o varios. «vacio» es el texto cuando no hay nada marcado (cada
//  pantalla decide si eso significa «todos» o «ninguno»). Las opciones son
//  [{id, texto, color?, n?, nota?}]; `n` sale a la derecha (registros).
// ============================================================
let cierreGlobal = false;
function cerrarAbiertos(excepto) {
  document.querySelectorAll('.ms.abierto').forEach(ms => {
    if (ms !== excepto) ms.classList.remove('abierto');
  });
}

export function multiselect(raiz, { vacio = 'Todos', buscador = false, onChange = () => {} } = {}) {
  if (!cierreGlobal) {
    document.addEventListener('click', e => {
      if (!e.target.closest('.ms')) cerrarAbiertos(null);
    });
    cierreGlobal = true;
  }

  let opciones = [];
  const sel = new Set();
  let habilitado = true;
  let filtro = '';

  raiz.classList.add('ms');
  raiz.innerHTML = `
    <button type="button" class="ms-btn"><span class="ms-txt"></span><span class="ms-ar">▾</span></button>
    <div class="ms-panel">
      ${buscador ? '<input class="ms-bus" placeholder="Buscar…" autocomplete="off">' : ''}
      <div class="ms-acc"><a href="#" data-a="todos">Marcar todos</a><a href="#" data-a="ninguno">Quitar todos</a></div>
      <div class="ms-lista"></div>
    </div>`;
  const btn = raiz.querySelector('.ms-btn');
  const lista = raiz.querySelector('.ms-lista');
  const bus = raiz.querySelector('.ms-bus');

  const texto = () => {
    const t = raiz.querySelector('.ms-txt');
    if (!sel.size) { t.textContent = vacio; t.classList.add('ms-vacio'); return; }
    t.classList.remove('ms-vacio');
    if (sel.size === 1) {
      const o = opciones.find(x => sel.has(x.id));
      t.textContent = o ? o.texto : '1 seleccionado';
    } else {
      t.textContent = `${sel.size} seleccionados`;
    }
  };

  const pintar = () => {
    const f = filtro.toLowerCase();
    const visibles = opciones.filter(o => !f || String(o.texto).toLowerCase().includes(f));
    // Cada casilla apunta a su opción por posición: los ids pueden ser
    // números, textos o null («sin trabajador») y así no se confunden.
    lista.innerHTML = visibles.map((o, i) => `
      <label class="ms-op">
        <input type="checkbox" data-i="${i}" ${sel.has(o.id) ? 'checked' : ''}>
        ${o.color ? `<i style="background:${o.color}"></i>` : ''}
        <span class="ms-t">${esc(o.texto)}${o.nota ? ` <em>${esc(o.nota)}</em>` : ''}</span>
        ${o.n != null ? `<span class="ms-n">${n0(o.n)}</span>` : ''}
      </label>`).join('') || `<div class="ms-nada">${opciones.length ? 'Nada coincide.' : 'Sin opciones para este mes.'}</div>`;
    lista.querySelectorAll('input').forEach(chk => {
      chk.onchange = () => {
        const o = visibles[Number(chk.dataset.i)];
        if (!o) return;
        chk.checked ? sel.add(o.id) : sel.delete(o.id);
        texto(); onChange(new Set(sel));
      };
    });
  };

  btn.onclick = e => {
    e.stopPropagation();
    if (!habilitado) return;
    const abrir = !raiz.classList.contains('abierto');
    cerrarAbiertos(raiz);
    raiz.classList.toggle('abierto', abrir);
    if (abrir && bus) { bus.value = ''; filtro = ''; pintar(); bus.focus(); }
  };
  if (bus) bus.oninput = () => { filtro = bus.value.trim(); pintar(); };
  raiz.querySelectorAll('.ms-acc a').forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      if (a.dataset.a === 'todos') {
        const f = filtro.toLowerCase();
        opciones.filter(o => !f || String(o.texto).toLowerCase().includes(f)).forEach(o => sel.add(o.id));
      } else {
        sel.clear();
      }
      pintar(); texto(); onChange(new Set(sel));
    };
  });

  texto();
  return {
    /** Cambia las opciones. Se conservan marcadas las que sigan existiendo. */
    opciones(nuevas) {
      opciones = nuevas;
      const ids = new Set(nuevas.map(o => o.id));
      let cambio = false;
      for (const id of [...sel]) if (!ids.has(id)) { sel.delete(id); cambio = true; }
      pintar(); texto();
      return cambio;
    },
    valores: () => new Set(sel),
    limpiar() { sel.clear(); pintar(); texto(); },
    habilitar(si, motivo = '') {
      habilitado = si;
      raiz.classList.toggle('ms-off', !si);
      btn.disabled = !si;
      btn.title = si ? '' : motivo;
      if (!si) raiz.classList.remove('abierto');
    },
  };
}

// ============================================================
//  AÑO Y MES
// ============================================================
/**
 * Llena los selectores de año y mes. Los años van del primero al último con
 * datos; por defecto, el mes del último registro.
 */
export function selectorMes(selAnio, selMes, desde, hasta) {
  const hoy = new Date();
  const fin = hasta ? new Date(hasta + 'T00:00:00') : hoy;
  const ini = desde ? new Date(desde + 'T00:00:00') : fin;
  const anios = [];
  for (let a = fin.getFullYear(); a >= ini.getFullYear(); a--) anios.push(a);
  selAnio.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join('');
  selMes.innerHTML = MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  selAnio.value = String(fin.getFullYear());
  selMes.value = String(fin.getMonth() + 1);
  return { anio: fin.getFullYear(), mes: fin.getMonth() + 1 };
}

