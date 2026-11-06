// ============================================================
// PalmaData · Mapas · Tratamientos
//
// Las palmas tratadas en UN mes, sobre los lotes, con un color por
// tratamiento. Cada palma sale una sola vez: con su último tratamiento del
// mes. Para cada una la base trae su último censo hasta el día del
// tratamiento y los días entre los dos (plantacion.mapa_tratamientos_mes).
//
// Filtros en secuencia:
//   1. Tratamiento   hay que elegir al menos uno para ver puntos
//   2. Enfermedad    se habilita al elegir tratamiento; muestra todas
//   3. Evento        se habilita al elegir enfermedad; solo los eventos de
//                    las enfermedades elegidas (san_evento_enf.san_enfermedades_id)
//   Trabajador y Días desde el censo, siempre opcionales.
// Sin nada marcado en 2, 3, trabajador o días = no se filtra por eso.
//
// El mes se pide completo una vez; los filtros se aplican aquí.
// ============================================================
import { API } from './api.js';
import { $, n0, n1, esc, MESES, crearMapa, botonEncuadrar, leyenda, multiselect, selectorMes,
         botonExcel, textoFiltro } from './comun.js';

const PALETA = ['#d62728', '#1f77b4', '#ff7f0e', '#9467bd', '#17becf', '#8c564b',
                '#e377c2', '#f2c500', '#111111', '#7f7f7f', '#bcbd22', '#393b79'];

const RANGOS = [
  { id: 'r0', texto: '0 a 5 días', ok: d => d != null && d <= 5 },
  { id: 'r1', texto: '6 a 10 días', ok: d => d != null && d >= 6 && d <= 10 },
  { id: 'r2', texto: '11 a 15 días', ok: d => d != null && d >= 11 && d <= 15 },
  { id: 'r3', texto: 'Más de 15 días', ok: d => d != null && d > 15 },
  { id: 'sin', texto: 'Sin censo previo', ok: d => d == null },
];

const S = {
  anio: null, mes: null,
  cat: { tratamientos: [], enfermedades: [], eventos: [] },
  datos: null, filas: [],
  sel: { trat: new Set(), enf: new Set(), ev: new Set(), tr: new Set(), dias: new Set() },
  ms: {},
  mapa: null, lienzo: null, capa: null, ley: null,
};

const color = id => {
  const i = S.cat.tratamientos.findIndex(t => t.id === id);
  return i < 0 ? '#555' : PALETA[i % PALETA.length];
};
const nTrat = id => (S.cat.tratamientos.find(t => t.id === id) || {}).codigo ?? (id == null ? '—' : `Tratamiento ${id}`);
const nEnf = id => (S.cat.enfermedades.find(t => t.id === id) || {}).nombre ?? '—';
const nEv = id => (S.cat.eventos.find(t => t.id === id) || {}).codigo ?? '—';

const contar = (lista, clave) => {
  const m = new Map();
  for (const f of lista) m.set(f[clave], (m.get(f[clave]) || 0) + 1);
  return m;
};

// ============================================================
export async function montar(cont) {
  cont.innerHTML = `<div class="cargando">Cargando…</div>`;
  let cat;
  try {
    cat = await API.tratCatalogos();
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  S.cat = { tratamientos: cat.tratamientos || [], enfermedades: cat.enfermedades || [],
            eventos: cat.eventos || [] };
  esqueleto(cont);

  const r = cat.rango || {};
  const m = selectorMes($('#tAnio'), $('#tMes'), r.trat_desde, r.trat_hasta);
  if (S.anio == null) { S.anio = m.anio; S.mes = m.mes; }
  else { $('#tAnio').value = S.anio; $('#tMes').value = S.mes; }

  S.ms.trat = multiselect($('#tTrat'), { vacio: 'Elige uno o varios…', onChange: v => { S.sel.trat = v; secuencia(); pintar(); } });
  S.ms.enf = multiselect($('#tEnf'), { vacio: 'Todas', onChange: v => { S.sel.enf = v; secuencia(); pintar(); } });
  S.ms.ev = multiselect($('#tEv'), { vacio: 'Todos', buscador: true, onChange: v => { S.sel.ev = v; pintar(); } });
  S.ms.tr = multiselect($('#tTr'), { vacio: 'Todos', buscador: true, onChange: v => { S.sel.tr = v; pintar(); } });
  S.ms.dias = multiselect($('#tDias'), { vacio: 'Todos', onChange: v => { S.sel.dias = v; pintar(); } });

  const cambioMes = () => {
    S.anio = Number($('#tAnio').value); S.mes = Number($('#tMes').value);
    cargarMes();
  };

  botonExcel($('#tExcel'), 'tratamientos', () => ({ anio: S.anio, mes: S.mes }), () => {
    const trab = S.datos?.trabajadores || {};
    const nombres = (sel, cat, campo) => cat.filter(x => sel.has(x.id)).map(x => x[campo]);
    return {
      ids: filtradas().map(f => f.id),
      filtros: [
        textoFiltro('Tratamiento', nombres(S.sel.trat, S.cat.tratamientos, 'codigo'), 'ninguno'),
        textoFiltro('Enfermedad', nombres(S.sel.enf, S.cat.enfermedades, 'nombre'), 'todas'),
        textoFiltro('Evento', nombres(S.sel.ev, S.cat.eventos, 'codigo'), 'todos'),
        textoFiltro('Trabajador', [...S.sel.tr].map(id => trab[id] || `(${id})`), 'todos'),
        textoFiltro('Días del censo al tratamiento',
                    RANGOS.filter(r => S.sel.dias.has(r.id)).map(r => r.texto), 'todos'),
      ],
    };
  }, t => { $('#tAviso').innerHTML = `<div class="msg msg-err">${esc(t)}</div>`; });
  $('#tAnio').onchange = cambioMes;
  $('#tMes').onchange = cambioMes;

  try {
    const m2 = await crearMapa($('#tMapa'), t => { $('#tAviso').innerHTML = `<div class="msg msg-warn">${esc(t)}</div>`; });
    S.mapa = m2.mapa; S.lienzo = m2.lienzo;
    S.capa = L.featureGroup().addTo(S.mapa);
    S.capa.bindTooltip(capa => tooltip(capa.options.fila), { sticky: true, direction: 'top', className: 'mp-tip' });
    S.ley = leyenda(S.mapa);
    botonEncuadrar(S.mapa, () => S.capa.getBounds());
  } catch (e) {
    $('#tMapa').innerHTML = `<div class="msg msg-err" style="margin:14px">No se pudo iniciar el mapa: ${esc(e.message)}</div>`;
  }
  await cargarMes();
}

function esqueleto(cont) {
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="tAnio">Año</label><select id="tAnio"></select></div>
      <div class="g"><label for="tMes">Mes</label><select id="tMes"></select></div>
      <div class="g"><label>1 · Tratamiento</label><div id="tTrat" style="min-width:210px"></div></div>
      <div class="g"><label>2 · Enfermedad</label><div id="tEnf" style="min-width:200px"></div></div>
      <div class="g"><label>3 · Evento</label><div id="tEv" style="min-width:200px"></div></div>
    </div>
    <div class="fbar" style="margin-top:-8px">
      <div class="g"><label>Trabajador</label><div id="tTr" style="min-width:230px"></div></div>
      <div class="g"><label>Días del censo al tratamiento</label><div id="tDias" style="min-width:190px"></div></div>
      <div class="sp"></div>
      <span class="sub" id="tEstado" style="margin:0"></span>
      <button class="btn btn-ghost" id="tExcel" title="El consolidado de tratamientos, solo con lo que se ve en el mapa">⬇ Excel</button>
    </div>
    <div id="tAviso"></div>
    <div class="kpis" id="tKpis"></div>
    <div class="card" style="padding:10px">
      <div id="tMapa" class="mp-mapa"></div>
      <p class="sub" style="margin:8px 0 0">Cada punto es una palma tratada, en su ubicación de
        cat_palma, con el color de su tratamiento. Si la palma tuvo varios tratamientos en
        el mes, se muestra el último. Los días se cuentan desde el último censo de la palma
        hasta el día del tratamiento (un censo posterior al tratamiento no cuenta).</p>
    </div>`;
}

// Habilita los filtros 2 y 3 según lo elegido antes, y arma las opciones
// del 3 con los eventos de las enfermedades elegidas.
function secuencia() {
  const hayTrat = S.sel.trat.size > 0;
  if (!hayTrat && S.sel.enf.size) { S.ms.enf.limpiar(); S.sel.enf = new Set(); }
  S.ms.enf.habilitar(hayTrat, 'Primero elige un tratamiento');

  const hayEnf = hayTrat && S.sel.enf.size > 0;
  const porEv = contar(S.filas, 'evento');
  const varias = S.sel.enf.size > 1;
  S.ms.ev.opciones(!hayEnf ? [] : S.cat.eventos
    .filter(e => S.sel.enf.has(e.san_enfermedades_id))
    .map(e => ({ id: e.id, texto: e.codigo, n: porEv.get(e.id) || 0,
                 nota: varias ? nEnf(e.san_enfermedades_id) : '' })));
  S.sel.ev = S.ms.ev.valores();     // quita los de enfermedades que ya no están
  S.ms.ev.habilitar(hayEnf, 'Primero elige una enfermedad');

  S.ms.dias.habilitar(hayTrat, 'Primero elige un tratamiento');
}

async function cargarMes() {
  const estado = $('#tEstado');
  estado.textContent = 'Cargando el mes…';
  $('#tAviso').innerHTML = '';
  try {
    const d = await API.tratPuntos(S.anio, S.mes);
    S.datos = d;
    const c = d.campos;
    S.filas = d.filas.map(f => Object.fromEntries(c.map((k, i) => [k, f[i]])));
  } catch (e) {
    S.datos = null; S.filas = [];
    estado.textContent = '';
    $('#tAviso').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }

  // Opciones con lo que hay en el mes (los catálogos completos, con su cuenta)
  const porTrat = contar(S.filas, 'tratamiento');
  S.ms.trat.opciones(S.cat.tratamientos.map(t => ({
    id: t.id, texto: t.codigo, color: color(t.id), n: porTrat.get(t.id) || 0 })));
  S.sel.trat = S.ms.trat.valores();
  const porEnf = contar(S.filas, 'enfermedad');
  S.ms.enf.opciones(S.cat.enfermedades.map(e => ({ id: e.id, texto: e.nombre, n: porEnf.get(e.id) || 0 })));
  S.sel.enf = S.ms.enf.valores();
  const nombres = S.datos?.trabajadores || {};
  S.ms.tr.opciones([...contar(S.filas, 'trabajador').entries()]
    .map(([id, n]) => ({ id, texto: nombres[id] || (id == null ? 'Sin trabajador' : `Sin nombre (${id})`), n }))
    .sort((a, b) => a.texto.localeCompare(b.texto, 'es')));
  S.sel.tr = S.ms.tr.valores();
  secuencia();

  if (S.datos) {
    estado.textContent = `${MESES[S.mes - 1]} ${S.anio}: ${n0(S.filas.length)} palmas tratadas`;
    if (!S.filas.length) {
      $('#tAviso').innerHTML = `<div class="msg msg-warn">No hay tratamientos en
        ${MESES[S.mes - 1]} de ${S.anio}. Prueba con otro mes.</div>`;
    }
  }
  pintar();
}

// Todos los filtros menos el de días: con esto se cuentan las palmas de
// cada rango, para que la lista de días diga cuántas hay en cada uno.
// Lo que pasa TODOS los filtros, días incluidos (lo que se ve en el mapa,
// más las palmas sin ubicación que no se pueden dibujar).
function filtradas() {
  const base = sinFiltroDias();
  const rangos = RANGOS.filter(r => S.sel.dias.has(r.id));
  return rangos.length ? base.filter(f => rangos.some(r => r.ok(f.dias))) : base;
}

function sinFiltroDias() {
  if (!S.sel.trat.size) return [];
  return S.filas.filter(f =>
    S.sel.trat.has(f.tratamiento)
    && (!S.sel.enf.size || S.sel.enf.has(f.enfermedad))
    && (!S.sel.ev.size || S.sel.ev.has(f.evento))
    && (!S.sel.tr.size || S.sel.tr.has(f.trabajador)));
}

function pintar() {
  const base = sinFiltroDias();
  S.ms.dias.opciones(RANGOS.map(r => ({ id: r.id, texto: r.texto,
    n: base.filter(f => r.ok(f.dias)).length })));
  S.sel.dias = S.ms.dias.valores();
  const rangos = RANGOS.filter(r => S.sel.dias.has(r.id));
  const lista = rangos.length ? base.filter(f => rangos.some(r => r.ok(f.dias))) : base;

  const conPunto = lista.filter(f => f.lon != null && f.lat != null);
  const sinPunto = lista.length - conPunto.length;

  // ── Tarjetas ──
  const porTrat = contar(conPunto, 'tratamiento');
  const elegidos = S.cat.tratamientos.filter(t => S.sel.trat.has(t.id));
  const dias = conPunto.map(f => f.dias).filter(d => d != null);
  const sinCenso = conPunto.length - dias.length;
  const prom = dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : null;
  // reduce y no Math.max(...dias): con decenas de miles de palmas, el
  // operador ... revienta la pila del navegador.
  const max = dias.length ? dias.reduce((a, b) => (b > a ? b : a)) : null;
  const min = dias.length ? dias.reduce((a, b) => (b < a ? b : a)) : null;
  const kpiDias = (l, v, s) => `<div class="kpi acc"><div class="l">${l}</div>
    <div class="v">${v}</div><div class="s">${s}</div></div>`;

  $('#tKpis').innerHTML = !S.sel.trat.size
    ? `<div class="kpi"><div class="l">Palmas en el mapa</div><div class="v">0</div>
         <div class="s">Elige uno o varios tratamientos</div></div>`
    : `<div class="kpi"><div class="l">Palmas en el mapa</div><div class="v">${n0(conPunto.length)}</div>
         <div class="s">${MESES[S.mes - 1]} ${S.anio}</div></div>
       ${elegidos.map(t => `<div class="kpi mp-kpi" style="border-top:4px solid ${color(t.id)}">
         <div class="l"><i style="background:${color(t.id)}"></i>${esc(t.codigo)}</div>
         <div class="v">${n0(porTrat.get(t.id) || 0)}</div></div>`).join('')}
       ${kpiDias('Promedio censo → tratamiento', prom == null ? '—' : n1(prom),
                 prom == null ? 'sin censos previos' : `días · ${n0(dias.length)} palmas con censo`)}
       ${kpiDias('Diferencia más alta', max == null ? '—' : n0(max), 'días')}
       ${kpiDias('Diferencia más baja', min == null ? '—' : n0(min), 'días')}
       ${sinCenso ? `<div class="kpi"><div class="l">Sin censo previo</div><div class="v">${n0(sinCenso)}</div>
         <div class="s">no tienen censo hasta el día del tratamiento</div></div>` : ''}
       ${sinPunto ? `<div class="kpi"><div class="l">Sin ubicación</div><div class="v">${n0(sinPunto)}</div>
         <div class="s">la palma no está en cat_palma</div></div>` : ''}`;

  if (!S.capa) return;
  S.capa.clearLayers();
  for (const f of conPunto) {
    S.capa.addLayer(L.circleMarker([f.lat, f.lon], {
      renderer: S.lienzo, radius: 5, weight: 1, color: '#ffffff',
      fillColor: color(f.tratamiento), fillOpacity: .92, fila: f,
    }));
  }
  S.ley.pintar(elegidos.map(t => ({ color: color(t.id), texto: t.codigo, n: porTrat.get(t.id) || 0 })));
}

function tooltip(f) {
  if (!f) return '';
  const trab = S.datos?.trabajadores || {};
  const censo = f.ultimo_censo
    ? `${esc(f.ultimo_censo)} <span class="mp-dias">${n0(f.dias)} día${f.dias === 1 ? '' : 's'}</span>`
    : '<em>Sin censo previo</em>';
  return `<div class="mp-tip-t"><i style="background:${color(f.tratamiento)}"></i>${esc(nTrat(f.tratamiento))}</div>
    <table>
      <tr><th>Último censo</th><td>${censo}</td></tr>
      <tr><th>Palma</th><td>${f.palma ?? '—'}</td></tr>
      <tr><th>Línea</th><td>${f.linea ?? '—'}</td></tr>
      <tr><th>Lote</th><td>${esc(f.lote ?? '—')}</td></tr>
      <tr><th>Tratamiento</th><td>${esc(nTrat(f.tratamiento))}</td></tr>
      <tr><th>Enfermedad</th><td>${esc(nEnf(f.enfermedad))}</td></tr>
      <tr><th>Evento</th><td>${esc(nEv(f.evento))}</td></tr>
      <tr><th>Tratada el</th><td>${esc(f.fecha)}${f.hora ? ' · ' + esc(f.hora) : ''}</td></tr>
      <tr><th>Trabajador</th><td>${esc(trab[f.trabajador] ?? '—')}</td></tr>
    </table>
    ${f.registros_mes > 1 ? `<div class="mp-tip-n">${f.registros_mes} tratamientos en el mes: se muestra el último.</div>` : ''}`;
}
