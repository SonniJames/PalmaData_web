// ============================================================
// PalmaData · Mapas · Censo
//
// Las palmas del censo de UN mes (todos los eventos), sobre los lotes. Cada palma sale
// una sola vez: con su última clasificación del mes (eso lo resuelve la
// base, plantacion.mapa_censo_mes). La ubicación es la de la palma en
// cat_palma, no la del celular.
//
// Se pide el mes completo una vez y los filtros (eventos y trabajadores)
// se aplican aquí, en el navegador: marcar o desmarcar es instantáneo.
// Sin eventos marcados no se dibuja nada; sin trabajadores marcados, todos.
// ============================================================
import { API } from './api.js';
import { $, n0, esc, MESES, crearMapa, botonEncuadrar, leyenda, multiselect, selectorMes,
         botonExcel, textoFiltro } from './comun.js';

const S = {
  anio: null, mes: null,
  eventos: [],              // [{id, codigo, enfermedad, color}] · todos los del catálogo
  datos: null,              // respuesta del mes
  filas: [],                // palmas del mes como objetos
  selEv: new Set(), selTr: new Set(),
  msEv: null, msTr: null,
  mapa: null, lienzo: null, capa: null, ley: null,
};

// Colores para los eventos sin color fijo en mapa_evento_color. Se saltan
// los que ya usa algún evento fijo, para que no se confundan.
const PALETA = ['#2ca02c', '#e377c2', '#7f7f7f', '#bcbd22', '#393b79', '#ad494a',
  '#5254a3', '#8c6d31', '#843c39', '#7b4173', '#3182bd', '#e6550d', '#31a354',
  '#756bb1', '#636363', '#fd8d3c', '#9e9ac8', '#6baed6', '#74c476', '#a55194'];

function asignarColores() {
  const usados = new Set(S.eventos.filter(e => e.color).map(e => e.color.toLowerCase()));
  const libres = PALETA.filter(c => !usados.has(c));
  let i = 0;
  for (const e of S.eventos) if (!e.color) e.color = libres[i++ % libres.length];
}

const colorDe = id => (S.eventos.find(e => e.id === id) || {}).color || '#555';
const nombreEv = id => (S.eventos.find(e => e.id === id) || {}).codigo || `Evento ${id}`;

// ============================================================
export async function montar(cont) {
  cont.innerHTML = `<div class="cargando">Cargando…</div>`;
  let cat;
  try {
    cat = await API.censoCatalogos();
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  S.eventos = cat.eventos || [];
  asignarColores();
  esqueleto(cont);

  const r = cat.rango || {};
  const m = selectorMes($('#cAnio'), $('#cMes'), r.censo_desde, r.censo_hasta);
  if (S.anio == null) { S.anio = m.anio; S.mes = m.mes; }
  else { $('#cAnio').value = S.anio; $('#cMes').value = S.mes; }

  S.msEv = multiselect($('#cEv'), {
    vacio: 'Elige uno o varios…', buscador: true,
    onChange: v => { S.selEv = v; pintar(); },
  });
  S.msEv.opciones(opcionesEventos(new Map()));
  S.msTr = multiselect($('#cTr'), {
    vacio: 'Todos', buscador: true,
    onChange: v => { S.selTr = v; pintar(); },
  });

  const cambioMes = () => {
    S.anio = Number($('#cAnio').value); S.mes = Number($('#cMes').value);
    cargarMes();
  };

  // Excel: las palmas que pasan los filtros (también las que no tienen
  // ubicación y por eso no se dibujan), con las columnas del consolidado.
  botonExcel($('#cExcel'), 'censo', () => ({ anio: S.anio, mes: S.mes }), () => {
    const lista = filtradas();
    const trab = S.datos?.trabajadores || {};
    return {
      ids: lista.map(f => f.id),
      filtros: [
        textoFiltro('Eventos', S.eventos.filter(e => S.selEv.has(e.id)).map(e => e.codigo), 'ninguno'),
        textoFiltro('Trabajador', [...S.selTr].map(id => trab[id] || `(${id})`), 'todos'),
      ],
    };
  }, t => { $('#cAviso').innerHTML = `<div class="msg msg-err">${esc(t)}</div>`; });
  $('#cAnio').onchange = cambioMes;
  $('#cMes').onchange = cambioMes;

  try {
    const m2 = await crearMapa($('#cMapa'), t => { $('#cAviso').innerHTML = `<div class="msg msg-warn">${esc(t)}</div>`; });
    S.mapa = m2.mapa; S.lienzo = m2.lienzo;
    S.capa = L.featureGroup().addTo(S.mapa);
    S.capa.bindTooltip(capa => tooltip(capa.options.fila), { sticky: true, direction: 'top', className: 'mp-tip' });
    S.ley = leyenda(S.mapa);
    botonEncuadrar(S.mapa, () => S.capa.getBounds());
  } catch (e) {
    $('#cMapa').innerHTML = `<div class="msg msg-err" style="margin:14px">No se pudo iniciar el mapa: ${esc(e.message)}</div>`;
  }
  await cargarMes();
}

function esqueleto(cont) {
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="cAnio">Año</label><select id="cAnio"></select></div>
      <div class="g"><label for="cMes">Mes</label><select id="cMes"></select></div>
      <div class="g"><label>Eventos</label><div id="cEv" style="min-width:230px"></div></div>
      <div class="g"><label>Trabajador</label><div id="cTr" style="min-width:230px"></div></div>
      <div class="sp"></div>
      <span class="sub" id="cEstado" style="margin:0"></span>
      <button class="btn btn-ghost" id="cExcel" title="El consolidado del censo, solo con lo que se ve en el mapa">⬇ Excel</button>
    </div>
    <div id="cAviso"></div>
    <div class="kpis" id="cKpis"></div>
    <div class="card" style="padding:10px">
      <div id="cMapa" class="mp-mapa"></div>
      <p class="sub" style="margin:8px 0 0">Cada punto es una palma en su ubicación de
        cat_palma. Si la palma tuvo varios registros en el mes, se muestra solo el
        último. Pasa el mouse sobre un punto para ver su detalle; el botón ⤢
        encuadra las palmas que se están viendo.</p>
    </div>`;
}

async function cargarMes() {
  const estado = $('#cEstado');
  estado.textContent = 'Cargando el mes…';
  $('#cAviso').innerHTML = '';
  try {
    const d = await API.censoPuntos(S.anio, S.mes);
    S.datos = d;
    // De lista de valores a objeto, una sola vez por mes
    const c = d.campos;
    S.filas = d.filas.map(f => Object.fromEntries(c.map((k, i) => [k, f[i]])));
  } catch (e) {
    S.datos = null; S.filas = [];
    estado.textContent = '';
    $('#cAviso').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    pintar();
    return;
  }

  // Trabajadores del mes, con cuántas palmas tiene cada uno
  const porTr = new Map();
  for (const f of S.filas) porTr.set(f.trabajador, (porTr.get(f.trabajador) || 0) + 1);
  const nombres = S.datos.trabajadores || {};
  S.msTr.opciones([...porTr.entries()]
    .map(([id, n]) => ({ id, texto: nombres[id] || (id == null ? 'Sin trabajador' : `Sin nombre (${id})`), n }))
    .sort((a, b) => a.texto.localeCompare(b.texto, 'es')));
  S.selTr = S.msTr.valores();

  // Cuántas palmas tiene cada evento en el mes, junto al nombre
  const porEv = new Map();
  for (const f of S.filas) porEv.set(f.evento, (porEv.get(f.evento) || 0) + 1);
  S.msEv.opciones(opcionesEventos(porEv));

  estado.textContent = `${MESES[S.mes - 1]} ${S.anio}: ${n0(S.filas.length)} palmas censadas`;
  if (!S.filas.length) {
    $('#cAviso').innerHTML = `<div class="msg msg-warn">No hay registros de censo en
      ${MESES[S.mes - 1]} de ${S.anio}. Prueba con otro mes.</div>`;
  }
  pintar();
}

// Todos los eventos del catálogo; primero los que tienen palmas en el mes.
// La enfermedad va al lado porque hay eventos de varias.
function opcionesEventos(porEv) {
  const lista = S.eventos.map(e => ({ id: e.id, texto: e.codigo, color: e.color,
    nota: e.enfermedad || '', n: porEv.get(e.id) || 0 }));
  return [...lista.filter(o => o.n), ...lista.filter(o => !o.n)];
}

function filtradas() {
  if (!S.selEv.size) return [];
  return S.filas.filter(f => S.selEv.has(f.evento) && (!S.selTr.size || S.selTr.has(f.trabajador)));
}

function pintar() {
  const lista = filtradas();
  const conPunto = lista.filter(f => f.lon != null && f.lat != null);
  const sinPunto = lista.length - conPunto.length;

  // ── Tarjetas: total y una por evento elegido ──
  const porEv = new Map();
  for (const f of conPunto) porEv.set(f.evento, (porEv.get(f.evento) || 0) + 1);
  // Tarjetas y leyenda solo para los eventos marcados que tienen palmas:
  // con «Marcar todos» no se llena la pantalla de ceros.
  const elegidos = S.eventos.filter(e => S.selEv.has(e.id) && porEv.get(e.id));
  $('#cKpis').innerHTML = !S.selEv.size
    ? `<div class="kpi"><div class="l">Palmas en el mapa</div><div class="v">0</div>
         <div class="s">Elige uno o varios eventos</div></div>`
    : `<div class="kpi"><div class="l">Palmas en el mapa</div><div class="v">${n0(conPunto.length)}</div>
         <div class="s">${MESES[S.mes - 1]} ${S.anio}</div></div>
       ${elegidos.map(e => `<div class="kpi mp-kpi" style="border-top:4px solid ${e.color}">
         <div class="l"><i style="background:${e.color}"></i>${esc(e.codigo)}</div>
         <div class="v">${n0(porEv.get(e.id) || 0)}</div></div>`).join('')}
       ${sinPunto ? `<div class="kpi"><div class="l">Sin ubicación</div><div class="v">${n0(sinPunto)}</div>
         <div class="s">la palma no está en cat_palma</div></div>` : ''}`;

  if (!S.capa) return;
  S.capa.clearLayers();
  // Se dibujan en el orden de la lista de eventos, para que los primeros
  // (los más graves arriba si así se ordenan) no queden tapados al azar.
  const orden = new Map(S.eventos.map((e, i) => [e.id, i]));
  conPunto.sort((a, b) => (orden.get(b.evento) ?? 99) - (orden.get(a.evento) ?? 99));
  for (const f of conPunto) {
    const color = colorDe(f.evento);
    S.capa.addLayer(L.circleMarker([f.lat, f.lon], {
      renderer: S.lienzo, radius: 5, weight: 1, color: '#ffffff',
      fillColor: color, fillOpacity: .92, fila: f,
    }));
  }
  S.ley.pintar(elegidos.map(e => ({ color: e.color, texto: e.codigo, n: porEv.get(e.id) || 0 })));
}

function tooltip(f) {
  if (!f) return '';
  const nombres = S.datos?.enfermedades || {};
  const trab = S.datos?.trabajadores || {};
  return `<div class="mp-tip-t"><i style="background:${colorDe(f.evento)}"></i>${esc(nombreEv(f.evento))}</div>
    <table>
      <tr><th>Palma</th><td>${f.palma ?? '—'}</td></tr>
      <tr><th>Línea</th><td>${f.linea ?? '—'}</td></tr>
      <tr><th>Lote</th><td>${esc(f.lote ?? '—')}</td></tr>
      <tr><th>Enfermedad</th><td>${esc(nombres[f.enfermedad] ?? '—')}</td></tr>
      <tr><th>Evento</th><td>${esc(nombreEv(f.evento))}</td></tr>
      <tr><th>Fecha</th><td>${esc(f.fecha)}${f.hora ? ' · ' + esc(f.hora) : ''}</td></tr>
      <tr><th>Trabajador</th><td>${esc(trab[f.trabajador] ?? '—')}</td></tr>
    </table>
    ${f.registros_mes > 1 ? `<div class="mp-tip-n">${f.registros_mes} registros en el mes: se muestra el último.</div>` : ''}`;
}
