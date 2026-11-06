// ============================================================
// PalmaData · Mapas · Plagas
//
// Mapa de calor de las cantidades de plagas de UN mes, como la
// interpolación que se hacía en QGIS, recortado a los lotes.
//
// De la base llegan las lecturas del mes (plantacion.mapa_plagas_mes): una
// fila por insecto en cada palma, solo del último día en que se evaluó la
// palma. Aquí se suma por palma:
//   · sin insectos marcados  → la cantidad de TODOS los insectos
//   · con insectos marcados  → solo la de esos; las palmas evaluadas que no
//     los tienen cuentan con 0 (también son dato: ahí no hubo)
// Con esos valores se interpola el mapa de calor (calor.js).
//
// Trabajador: sin ninguno marcado, todos.
// ============================================================
import { API } from './api.js';
import { $, n0, n1, esc, MESES, crearMapa, botonEncuadrar, multiselect, selectorMes,
         botonExcel, textoFiltro } from './comun.js';
import { capaCalor, leyendaCalor, colorCantidad } from './calor.js';

const S = {
  anio: null, mes: null,
  insectos: [],                 // catálogo [{id, insecto}]
  datos: null, filas: [],
  selIns: new Set(), selTr: new Set(),
  msIns: null, msTr: null,
  mapa: null, lienzo: null, calor: null, puntos: null, verPuntos: true,
  palmas: [],                   // lo que se está viendo, ya sumado por palma
};

const nIns = id => (S.insectos.find(i => i.id === id) || {}).insecto ?? (id == null ? 'Sin insecto' : `Insecto ${id}`);

// ============================================================
export async function montar(cont) {
  cont.innerHTML = `<div class="cargando">Cargando…</div>`;
  let cat;
  try {
    cat = await API.plagasCatalogos();
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  S.insectos = cat.insectos || [];
  esqueleto(cont);

  const r = cat.rango || {};
  const m = selectorMes($('#pAnio'), $('#pMes'), r.plagas_desde, r.plagas_hasta);
  if (S.anio == null) { S.anio = m.anio; S.mes = m.mes; }
  else { $('#pAnio').value = S.anio; $('#pMes').value = S.mes; }

  S.msIns = multiselect($('#pIns'), { vacio: 'Todos', buscador: true,
    onChange: v => { S.selIns = v; pintar(); } });
  S.msTr = multiselect($('#pTr'), { vacio: 'Todos', buscador: true,
    onChange: v => { S.selTr = v; pintar(); } });

  const cambioMes = () => {
    S.anio = Number($('#pAnio').value); S.mes = Number($('#pMes').value);
    cargarMes();
  };
  $('#pAnio').onchange = cambioMes;
  $('#pMes').onchange = cambioMes;
  $('#pPuntos').checked = S.verPuntos;
  $('#pPuntos').onchange = () => { S.verPuntos = $('#pPuntos').checked; dibujarPuntos(); };

  // Excel: las lecturas que suman en el mapa (de las palmas que se ven y,
  // si hay insectos marcados, solo las de esos insectos)
  botonExcel($('#pExcel'), 'plagas', () => ({ anio: S.anio, mes: S.mes }), () => {
    const trab = S.datos?.trabajadores || {};
    return {
      ids: S.palmas.flatMap(p => p.ids),
      filtros: [
        textoFiltro('Insecto', [...S.selIns].map(nIns), 'todos'),
        textoFiltro('Trabajador', [...S.selTr].map(id => trab[id] || `(${id})`), 'todos'),
      ],
    };
  }, t => { $('#pAviso').innerHTML = `<div class="msg msg-err">${esc(t)}</div>`; });

  try {
    const m2 = await crearMapa($('#pMapa'),
      t => { $('#pAviso').innerHTML = `<div class="msg msg-warn">${esc(t)}</div>`; },
      { relleno: 0 });
    S.mapa = m2.mapa; S.lienzo = m2.lienzo;
    S.calor = capaCalor(m2.lotes).addTo(S.mapa);
    S.puntos = L.featureGroup().addTo(S.mapa);
    S.puntos.bindTooltip(capa => tooltip(capa.options.palma), { sticky: true, direction: 'top', className: 'mp-tip' });
    leyendaCalor(S.mapa);
    botonEncuadrar(S.mapa, () => S.puntos.getLayers().length
      ? S.puntos.getBounds()
      : L.latLngBounds(S.palmas.filter(p => p.lat != null).map(p => [p.lat, p.lon])));
  } catch (e) {
    $('#pMapa').innerHTML = `<div class="msg msg-err" style="margin:14px">No se pudo iniciar el mapa: ${esc(e.message)}</div>`;
  }
  await cargarMes();
}

function esqueleto(cont) {
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="pAnio">Año</label><select id="pAnio"></select></div>
      <div class="g"><label for="pMes">Mes</label><select id="pMes"></select></div>
      <div class="g"><label>Insecto</label><div id="pIns" style="min-width:230px"></div></div>
      <div class="g"><label>Trabajador</label><div id="pTr" style="min-width:230px"></div></div>
      <label class="mp-check"><input type="checkbox" id="pPuntos"> Palmas evaluadas</label>
      <div class="sp"></div>
      <span class="sub" id="pEstado" style="margin:0"></span>
      <button class="btn btn-ghost" id="pExcel" title="El consolidado de plagas, solo con lo que suma en el mapa">⬇ Excel</button>
    </div>
    <div id="pAviso"></div>
    <div class="kpis" id="pKpis"></div>
    <div class="card" style="padding:10px">
      <div id="pMapa" class="mp-mapa"></div>
      <p class="sub" style="margin:8px 0 0" id="pNota">Mapa de calor de la cantidad de
        insectos por palma, interpolado entre las palmas evaluadas y recortado a los
        lotes. Sin insectos marcados suma todos; con insectos marcados, solo esos. Si una
        palma se evaluó varios días del mes, cuenta el último. Pasa el mouse por una
        palma evaluada para ver su detalle.</p>
    </div>`;
}

async function cargarMes() {
  const estado = $('#pEstado');
  estado.textContent = 'Cargando el mes…';
  $('#pAviso').innerHTML = '';
  try {
    const d = await API.plagasPuntos(S.anio, S.mes);
    S.datos = d;
    const c = d.campos;
    S.filas = d.filas.map(f => Object.fromEntries(c.map((k, i) => [k, f[i]])));
  } catch (e) {
    S.datos = null; S.filas = [];
    estado.textContent = '';
    $('#pAviso').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }

  // Insectos: todo el catálogo, con la cantidad del mes; primero los que tienen
  const porIns = new Map();
  for (const f of S.filas) porIns.set(f.insecto, (porIns.get(f.insecto) || 0) + (Number(f.cantidad) || 0));
  const ops = S.insectos.map(i => ({ id: i.id, texto: i.insecto, n: porIns.get(i.id) || 0 }));
  S.msIns.opciones([...ops.filter(o => o.n), ...ops.filter(o => !o.n)]);
  S.selIns = S.msIns.valores();

  // Trabajadores: cuántas palmas evaluó cada uno
  const palmasTr = new Map();
  for (const f of S.filas) {
    if (!palmasTr.has(f.trabajador)) palmasTr.set(f.trabajador, new Set());
    palmasTr.get(f.trabajador).add(clave(f));
  }
  const nombres = S.datos?.trabajadores || {};
  S.msTr.opciones([...palmasTr.entries()]
    .map(([id, set]) => ({ id, texto: nombres[id] || (id == null ? 'Sin trabajador' : `Sin nombre (${id})`), n: set.size }))
    .sort((a, b) => a.texto.localeCompare(b.texto, 'es')));
  S.selTr = S.msTr.valores();

  if (S.datos) {
    const palmas = new Set(S.filas.map(clave)).size;
    estado.textContent = `${MESES[S.mes - 1]} ${S.anio}: ${n0(palmas)} palmas evaluadas`;
    if (!S.filas.length) {
      $('#pAviso').innerHTML = `<div class="msg msg-warn">No hay lecturas de plagas en
        ${MESES[S.mes - 1]} de ${S.anio}. Prueba con otro mes.</div>`;
    }
  }
  pintar();
}

const clave = f => f.palma_id ?? -f.id;

// Suma por palma con los filtros puestos
function sumarPorPalma() {
  const porPalma = new Map();
  for (const f of S.filas) {
    if (S.selTr.size && !S.selTr.has(f.trabajador)) continue;
    const k = clave(f);
    let p = porPalma.get(k);
    if (!p) {
      p = { lat: f.lat, lon: f.lon, lote: f.lote, linea: f.linea, palma: f.palma,
            fecha: f.fecha, dias: f.dias_mes, trabajador: f.trabajador,
            valor: 0, ids: [], insectos: new Map() };
      porPalma.set(k, p);
    }
    const cant = Number(f.cantidad) || 0;
    p.insectos.set(f.insecto, (p.insectos.get(f.insecto) || 0) + cant);
    if (!S.selIns.size || S.selIns.has(f.insecto)) {
      p.valor += cant;
      p.ids.push(f.id);
    }
  }
  return [...porPalma.values()];
}

function pintar() {
  S.palmas = sumarPorPalma();
  const conPunto = S.palmas.filter(p => p.lat != null && p.lon != null);
  const sinPunto = S.palmas.length - conPunto.length;

  // ── Tarjetas ──
  const total = conPunto.reduce((a, p) => a + p.valor, 0);
  const sinInsecto = conPunto.filter(p => p.valor === 0).length;
  const porIns = new Map(), palmasIns = new Map();
  for (const p of conPunto) {
    for (const [id, cant] of p.insectos) {
      if (S.selIns.size && !S.selIns.has(id)) continue;
      if (!cant) continue;
      porIns.set(id, (porIns.get(id) || 0) + cant);
      palmasIns.set(id, (palmasIns.get(id) || 0) + 1);
    }
  }
  const tarjetasIns = [...porIns.entries()].sort((a, b) => b[1] - a[1]);
  const filtro = S.selIns.size ? 'de los insectos elegidos' : 'de ningún insecto';
  $('#pKpis').innerHTML = `
    <div class="kpi acc"><div class="l">Cantidad total</div><div class="v">${n1(total)}</div>
      <div class="s">${n0(conPunto.length)} palmas evaluadas en el mapa</div></div>
    <div class="kpi"><div class="l">Palmas sin insecto</div><div class="v">${n0(sinInsecto)}</div>
      <div class="s">con cantidad 0 ${filtro}</div></div>
    ${tarjetasIns.map(([id, cant]) => `<div class="kpi"><div class="l">${esc(nIns(id))}</div>
      <div class="v">${n1(cant)}</div><div class="s">en ${n0(palmasIns.get(id))} palmas</div></div>`).join('')}
    ${sinPunto ? `<div class="kpi"><div class="l">Sin ubicación</div><div class="v">${n0(sinPunto)}</div>
      <div class="s">la palma no está en cat_palma</div></div>` : ''}`;

  if (!S.calor) return;
  S.calor.datos(conPunto.map(p => ({ lat: p.lat, lon: p.lon, v: p.valor })));
  dibujarPuntos();
}

function dibujarPuntos() {
  if (!S.puntos) return;
  S.puntos.clearLayers();
  if (!S.verPuntos) return;
  for (const p of S.palmas) {
    if (p.lat == null || p.lon == null) continue;
    S.puntos.addLayer(L.circleMarker([p.lat, p.lon], {
      // Puntos claros y pequeños, como en el mapa de QGIS: marcan dónde se
      // evaluó sin tapar el calor. El color del valor va en el recuadro.
      renderer: S.lienzo, radius: 2.5, weight: .8, color: '#ffffff', opacity: .7,
      fillColor: '#ffffff', fillOpacity: .45, palma: p,
    }));
  }
}

function tooltip(p) {
  if (!p) return '';
  const trab = S.datos?.trabajadores || {};
  const filas = [...p.insectos.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, cant]) => {
      const cuenta = !S.selIns.size || S.selIns.has(id);
      return `<tr${cuenta ? '' : ' style="opacity:.5"'}><th>${esc(nIns(id))}</th><td>${n1(cant)}</td></tr>`;
    }).join('');
  return `<div class="mp-tip-t"><i style="background:${colorCantidad(p.valor)}"></i>Cantidad: ${n1(p.valor)}</div>
    <table>
      <tr><th>Palma</th><td>${p.palma ?? '—'}</td></tr>
      <tr><th>Línea</th><td>${p.linea ?? '—'}</td></tr>
      <tr><th>Lote</th><td>${esc(p.lote ?? '—')}</td></tr>
      <tr><th>Fecha</th><td>${esc(p.fecha)}</td></tr>
      <tr><th>Trabajador</th><td>${esc(trab[p.trabajador] ?? '—')}</td></tr>
    </table>
    <table style="margin-top:4px;border-top:1px solid #e5e5e5">${filas}</table>
    ${p.dias > 1 ? `<div class="mp-tip-n">Evaluada ${p.dias} días en el mes: cuenta el último.</div>` : ''}`;
}
