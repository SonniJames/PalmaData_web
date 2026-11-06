// ============================================================
// PalmaData · Mapas · Capa de mapa de calor (interpolación IDW)
//
// Hace en el navegador lo mismo que la interpolación de QGIS: a partir de
// las palmas evaluadas (punto + cantidad) estima un valor en cada lugar del
// mapa y lo pinta con la escala de colores, recortado a los polígonos de
// los lotes.
//
// Cómo calcula
//   · Inverso de la distancia (IDW) con radio de búsqueda: cada palma
//     influye solo dentro de `radio` metros, y más cuanto más cerca
//     (pesos de Shepard modificado: ((R − d) / (R·d))², que bajan a cero
//     suavemente en el borde del radio, sin cortes bruscos).
//   · El radio se ajusta solo a la densidad del muestreo: 4 veces la
//     distancia típica entre palmas evaluadas vecinas (entre 80 y 600 m).
//     Donde no hay ninguna palma evaluada a esa distancia, no se pinta.
//   · Se calcula en una rejilla de pocos píxeles y se amplía suavizada: así
//     se recalcula rápido al mover o acercar el mapa.
// ============================================================

// La escala del mapa de referencia (QGIS): de verde a rojo.
export const ESCALA = [
  { v: 0,   color: '#1a9641', texto: '0' },
  { v: 0.5, color: '#a6d96a', texto: '0,5' },
  { v: 10,  color: '#ffffbf', texto: '10' },
  { v: 20,  color: '#fdae61', texto: '20' },
  { v: 25,  color: '#d7191c', texto: '25 o más' },
];

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const PARADAS = ESCALA.map(e => ({ v: e.v, c: rgb(e.color) }));
const TOPE = PARADAS[PARADAS.length - 1].v;

// Tabla de colores precalculada: 0 a 25 en pasos de 0,025
const PASOS = 1000;
const TABLA = new Uint8ClampedArray((PASOS + 1) * 3);
for (let i = 0; i <= PASOS; i++) {
  const v = (i / PASOS) * TOPE;
  let j = 0;
  while (j < PARADAS.length - 2 && v > PARADAS[j + 1].v) j++;
  const a = PARADAS[j], b = PARADAS[j + 1];
  const t = Math.min(1, Math.max(0, (v - a.v) / (b.v - a.v)));
  for (let k = 0; k < 3; k++) TABLA[i * 3 + k] = a.c[k] + (b.c[k] - a.c[k]) * t;
}

/** Color (#rrggbb) de una cantidad, con la misma escala del mapa. */
export function colorCantidad(v) {
  const i = Math.round(Math.min(TOPE, Math.max(0, v || 0)) / TOPE * PASOS) * 3;
  return '#' + [TABLA[i], TABLA[i + 1], TABLA[i + 2]]
    .map(x => x.toString(16).padStart(2, '0')).join('');
}

// Metros aproximados entre dos puntos cercanos (suficiente para el radio)
function metros(a, b) {
  const dy = (a.lat - b.lat) * 110540;
  const dx = (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot(dx, dy);
}

/** Distancia típica (mediana) entre cada palma evaluada y su vecina más cercana. */
function separacionTipica(puntos) {
  if (puntos.length < 2) return 100;
  const celda = 0.001;                         // ~110 m
  const cubetas = new Map();
  puntos.forEach((p, i) => {
    const k = `${Math.floor(p.lat / celda)},${Math.floor(p.lon / celda)}`;
    (cubetas.get(k) || cubetas.set(k, []).get(k)).push(i);
  });
  // con una muestra basta: hasta 1.500 palmas
  const paso = Math.max(1, Math.floor(puntos.length / 1500));
  const dist = [];
  for (let i = 0; i < puntos.length; i += paso) {
    const p = puntos[i];
    const gy = Math.floor(p.lat / celda), gx = Math.floor(p.lon / celda);
    let min = Infinity;
    for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) {
      for (const j of cubetas.get(`${y},${x}`) || []) {
        if (j === i) continue;
        const d = metros(p, puntos[j]);
        if (d > 0.5 && d < min) min = d;
      }
    }
    if (min < Infinity) dist.push(min);
  }
  if (!dist.length) return 100;
  dist.sort((a, b) => a - b);
  return dist[Math.floor(dist.length / 2)];
}

// La clase se arma al primer uso: Leaflet (L) se carga después de este
// archivo, cuando se abre el mapa.
const DEFINICION = {
  options: { opacidad: 0.85, paso: 4 },

  initialize(lotes, opciones) {
    L.setOptions(this, opciones);
    this._puntos = [];
    this._radio = 150;
    // Anillos de los lotes en lat/lon, para recortar
    this._anillos = [];
    for (const f of (lotes && lotes.features) || []) {
      const g = f.geometry;
      if (!g) continue;
      const polis = g.type === 'Polygon' ? [g.coordinates]
        : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const poli of polis) for (const anillo of poli) {
        this._anillos.push(anillo.map(([lon, lat]) => L.latLng(lat, lon)));
      }
    }
  },

  /** puntos: [{lat, lon, v}] */
  datos(puntos) {
    this._puntos = puntos;
    this._radio = Math.min(600, Math.max(80, 4 * separacionTipica(puntos)));
    this._pedir();
    return this;
  },

  radio() { return this._radio; },

  onAdd(mapa) {
    this._mapa = mapa;
    const panel = mapa.getPane('calor') || mapa.createPane('calor');
    panel.style.zIndex = 350;            // encima del fondo, debajo de los lotes
    panel.style.pointerEvents = 'none';
    this._lienzo = L.DomUtil.create('canvas', 'mp-calor', panel);
    mapa.on('moveend resize', this._pedir, this);
    mapa.on('zoomstart', this._ocultar, this);
    this._pedir();
  },

  onRemove(mapa) {
    mapa.off('moveend resize', this._pedir, this);
    mapa.off('zoomstart', this._ocultar, this);
    L.DomUtil.remove(this._lienzo);
  },

  _ocultar() { if (this._lienzo) this._lienzo.style.visibility = 'hidden'; },

  _pedir() {
    if (this._cuadro) return;
    this._cuadro = requestAnimationFrame(() => { this._cuadro = null; this._dibujar(); });
  },

  _dibujar() {
    const mapa = this._mapa;
    if (!mapa) return;
    const tam = mapa.getSize();
    const lz = this._lienzo;
    lz.width = tam.x; lz.height = tam.y;
    L.DomUtil.setPosition(lz, mapa.containerPointToLayerPoint([0, 0]));
    lz.style.visibility = 'visible';
    const ctx = lz.getContext('2d');
    ctx.clearRect(0, 0, tam.x, tam.y);
    if (!this._puntos.length) return;

    // Radio en píxeles a este acercamiento (nunca menor que 3 celdas)
    const paso = this.options.paso;
    const c = mapa.getCenter();
    const p1 = mapa.latLngToContainerPoint(c);
    const p2 = mapa.latLngToContainerPoint([c.lat + this._radio / 110540, c.lng]);
    const R = Math.max(Math.abs(p1.y - p2.y), paso * 3);
    const R2 = R * R;

    // Palmas en pantalla (con margen de un radio), en cubetas de lado R
    const xs = [], ys = [], vs = [];
    const cub = new Map();
    for (const p of this._puntos) {
      const q = mapa.latLngToContainerPoint([p.lat, p.lon]);
      if (q.x < -R || q.y < -R || q.x > tam.x + R || q.y > tam.y + R) continue;
      const i = xs.length;
      xs.push(q.x); ys.push(q.y); vs.push(p.v);
      const k = Math.floor(q.x / R) + ',' + Math.floor(q.y / R);
      (cub.get(k) || cub.set(k, []).get(k)).push(i);
    }
    if (!xs.length) return;

    // Rejilla
    const W = Math.ceil(tam.x / paso), H = Math.ceil(tam.y / paso);
    const fuera = document.createElement('canvas');
    fuera.width = W; fuera.height = H;
    const fctx = fuera.getContext('2d');
    const img = fctx.createImageData(W, H);
    const px = img.data;
    const alfa = Math.round(255 * this.options.opacidad);

    for (let gy = 0; gy < H; gy++) {
      const cy = (gy + 0.5) * paso;
      const by = Math.floor(cy / R);
      for (let gx = 0; gx < W; gx++) {
        const cx = (gx + 0.5) * paso;
        const bx = Math.floor(cx / R);
        let suma = 0, pesos = 0, exacto = -1;
        for (let yy = by - 1; yy <= by + 1 && exacto < 0; yy++) {
          for (let xx = bx - 1; xx <= bx + 1 && exacto < 0; xx++) {
            const lista = cub.get(xx + ',' + yy);
            if (!lista) continue;
            for (const i of lista) {
              const dx = xs[i] - cx, dy = ys[i] - cy;
              const d2 = dx * dx + dy * dy;
              if (d2 >= R2) continue;
              if (d2 < 0.25) { exacto = vs[i]; break; }
              const d = Math.sqrt(d2);
              const w = ((R - d) / (R * d)) ** 2;
              suma += w * vs[i]; pesos += w;
            }
          }
        }
        if (exacto < 0 && pesos === 0) continue;          // sin datos cerca
        const v = exacto >= 0 ? exacto : suma / pesos;
        const t = Math.round(Math.min(TOPE, Math.max(0, v)) / TOPE * PASOS) * 3;
        const o = (gy * W + gx) * 4;
        px[o] = TABLA[t]; px[o + 1] = TABLA[t + 1]; px[o + 2] = TABLA[t + 2]; px[o + 3] = alfa;
      }
    }
    fctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuera, 0, 0, W, H, 0, 0, W * paso, H * paso);

    // Recorte a los lotes: queda solo lo que cae dentro de algún polígono
    if (this._anillos.length) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      for (const anillo of this._anillos) {
        anillo.forEach((ll, i) => {
          const q = mapa.latLngToContainerPoint(ll);
          i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
        });
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.globalCompositeOperation = 'source-over';
    }
  },
};

let Clase = null;
/** Crea la capa de calor recortada a `lotes` (FeatureCollection lat/lon). */
export function capaCalor(lotes, opciones) {
  if (!Clase) Clase = L.Layer.extend(DEFINICION);
  return new Clase(lotes, opciones);
}

/** Leyenda de la escala, como la «convención» del mapa de QGIS. */
export function leyendaCalor(mapa) {
  const Ley = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'mp-leyenda');
      div.innerHTML = `<div style="font-weight:700;margin-bottom:2px">Cantidad</div>`
        + ESCALA.map(e => `<div><i style="background:${e.color};border-radius:3px"></i>${e.texto}</div>`).join('');
      return div;
    },
  });
  mapa.addControl(new Ley());
}
