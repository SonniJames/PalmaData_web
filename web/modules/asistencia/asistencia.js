// ============================================================
// PalmaData · Asistencia
//
// Los análisis se hacen SOLO sobre trabajadores activos: los que
// están en la tabla de nómina al momento de cargar cada archivo.
//
// Dos pantallas con propósitos distintos:
//   Análisis    -> quienes marcaron entrada Y salida. Jornadas.
//   A revisar   -> solo entrada, solo salida o ninguna marca.
//
// No hay filtro de zona: una persona marca hoy en una y mañana en
// otra, y sigue siendo la misma jornada.
// ============================================================
import { API } from './api.js';

const S = {
  empresaId: null, empresa: null, empresas: [],
  anio: '', mes: '', dia: '', trabajador: '', supervisor: '',
  anios: [], meses: [], dias: [], supervisores: [],
  tab: 'analisis', datos: null,
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const n2 = (v, d = 2) => (v == null || isNaN(v)) ? '—'
  : Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;

const COLORES = ['#16412b', '#2f7d4f', '#e6a817', '#e0651a', '#5c8d6f',
  '#b8890f', '#8ab19a', '#c9560f'];

const filtros = () => ({
  empresaId: S.empresaId, anio: S.anio, mes: S.mes, dia: S.dia,
  trabajador: S.trabajador, supervisor: S.supervisor,
});

// ============================================================
export async function montar(cont, sub = 'analisis') {
  S.tab = sub || 'analisis';
  cont.innerHTML = `<div class="cargando">Cargando…</div>`;
  try {
    S.empresas = (await API.empresas()).empresas || [];
    if (!S.empresas.length) {
      cont.innerHTML = `<div class="msg msg-err">No hay empresas registradas.</div>`;
      return;
    }
    if (!S.empresaId) S.empresaId = S.empresas[0].id;
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  esqueleto(cont);
  await cargar();
}

function esqueleto(cont) {
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="aEm">Empresa</label>
        <select id="aEm" style="min-width:170px">${S.empresas.map(e =>
          `<option value="${e.id}" ${e.id === S.empresaId ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></div>
      <div class="g"><label for="aAn">Año</label>
        <select id="aAn" style="min-width:105px"><option value="">Todos</option></select></div>
      <div class="g"><label for="aMe">Mes</label>
        <select id="aMe" style="min-width:125px"><option value="">Todos</option></select></div>
      <div class="g"><label for="aDi">Día</label>
        <select id="aDi" style="min-width:85px"><option value="">Todos</option></select></div>
      <div class="g"><label for="aSu">Supervisor</label>
        <select id="aSu" style="min-width:155px"><option value="">Todos</option></select></div>
      <div class="g"><label for="aTr">Trabajador</label>
        <input id="aTr" placeholder="Buscar…" autocomplete="off" value="${esc(S.trabajador)}"
               style="min-width:180px;padding:8px 11px;border:1.5px solid var(--line);
                      border-radius:var(--radius-sm);font-size:14px">
        <button class="btn btn-ghost" id="aTx" style="padding:8px 11px" title="Limpiar">✕</button></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="aR">Actualizar</button>
    </div>
    <div class="ftabs">
      <button class="ftab" data-tab="analisis">Análisis</button>
      <button class="ftab" data-tab="revisar">A revisar</button>
      <button class="ftab" data-tab="datos">Cargar datos</button>
      <button class="ftab" data-tab="personal">Trabajadores activos</button>
    </div>
    <div id="aC"></div>`;

  $('#aEm').onchange = e => {
    S.empresaId = +e.target.value;
    S.anio = ''; S.mes = ''; S.dia = ''; S.supervisor = '';
    cargar();
  };
  $('#aAn').onchange = e => { S.anio = e.target.value; S.mes = ''; S.dia = ''; cargar(); };
  $('#aMe').onchange = e => { S.mes = e.target.value; S.dia = ''; cargar(); };
  $('#aDi').onchange = e => { S.dia = e.target.value; cargar(); };
  $('#aSu').onchange = e => { S.supervisor = e.target.value; cargar(); };
  $('#aR').onclick = cargar;

  let temporizador = null;
  $('#aTr').oninput = e => {
    clearTimeout(temporizador);
    const v = e.target.value;
    temporizador = setTimeout(() => { S.trabajador = v; cargar(); }, 400);
  };
  $('#aTx').onclick = () => { $('#aTr').value = ''; S.trabajador = ''; cargar(); };

  cont.querySelectorAll('.ftab').forEach(b =>
    b.onclick = () => { S.tab = b.dataset.tab; cargar(); });
}

async function cargar() {
  document.querySelectorAll('.ftab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === S.tab));
  const c = $('#aC');
  if (!c) return;

  if (S.tab === 'datos') return vistaCarga(c);
  if (S.tab === 'personal') return vistaPersonal(c);

  c.innerHTML = `<div class="cargando">Calculando…</div>`;
  try {
    S.datos = await (S.tab === 'revisar' ? API.revisar : API.analisis)(filtros());
    S.anios = S.datos.anios || [];
    S.meses = S.datos.meses || [];
    S.dias = S.datos.dias || [];
    S.supervisores = S.datos.supervisores_lista || S.datos.supervisores || [];
    S.empresa = S.datos.empresa;
    pintarFiltros(S.datos);
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }

  S.tab === 'revisar' ? vistaRevisar(c) : vistaAnalisis(c);
}

function pintarFiltros(d) {
  const an = $('#aAn');
  if (an) an.innerHTML = `<option value="">Todos</option>` + S.anios.map(a =>
    `<option value="${a}" ${String(a) === String(S.anio) ? 'selected' : ''}>${a}</option>`).join('');

  const me = $('#aMe');
  if (me) me.innerHTML = `<option value="">Todos</option>` + S.meses.map(m =>
    `<option value="${m.mes}" ${String(m.mes) === String(S.mes) ? 'selected' : ''}>${cap(m.nombre)}</option>`).join('');

  const di = $('#aDi');
  if (di) di.innerHTML = `<option value="">Todos</option>` + S.dias.map(x =>
    `<option value="${x}" ${String(x) === String(S.dia) ? 'selected' : ''}>${x}</option>`).join('');

  const lista = (d && d.supervisores && Array.isArray(d.supervisores)
    && typeof d.supervisores[0] === 'string') ? d.supervisores : (d?.supervisores_lista || []);
  const su = $('#aSu');
  if (su) {
    const nombres = lista.length ? lista
      : [...new Set((d?.supervisores || []).map(x => x.supervisor).filter(x => x && x !== 'Sin asignar'))];
    su.innerHTML = `<option value="">Todos</option>`
      + nombres.map(x => `<option value="${esc(x)}" ${x === S.supervisor ? 'selected' : ''}>${esc(x)}</option>`).join('')
      + `<option value="Sin asignar" ${S.supervisor === 'Sin asignar' ? 'selected' : ''}>Sin asignar</option>`;
  }
}

function periodoTexto() {
  const s = S.supervisor ? `${S.supervisor} · ` : '';
  if (S.dia && S.mes && S.anio) return `${s}${S.dia} de ${MESES[+S.mes - 1]} de ${S.anio}`;
  if (S.mes && S.anio) return `${s}${cap(MESES[+S.mes - 1])} de ${S.anio}`;
  if (S.anio) return `${s}Año ${S.anio}`;
  return s ? `${S.supervisor} · todo el histórico` : 'Todo el histórico';
}

function botonExcel(url, etiqueta) {
  return `<a class="btn btn-primary" href="${url}" download
     style="text-decoration:none">${esc(etiqueta)}</a>`;
}

// ============================================================
//  ANÁLISIS · solo quienes marcaron entrada y salida
// ============================================================
function vistaAnalisis(c) {
  const d = S.datos, t = d.total;
  const unDia = !!S.dia;

  if (!t.trabajadores_activos && !t.registros_completos) {
    c.innerHTML = `<div class="vacio"><h3>Sin datos</h3>
      <p>Carga primero la tabla de <strong>Trabajadores activos</strong> y luego
         los archivos del huellero en <strong>Cargar datos</strong>.</p></div>`;
    return;
  }

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Trabajadores activos</div>
        <div class="v">${n0(t.trabajadores_activos)}</div>
        <div class="s">${esc(periodoTexto())}</div></div>
      <div class="kpi acc"><div class="l">Marcación</div>
        <div class="v">${n2(t.pct_marcacion, 1)}%</div>
        <div class="s">${n0(t.registros_completos)} de ${n0(t.esperados)} esperados</div></div>
      <div class="kpi"><div class="l">${unDia ? 'Entrada' : 'Entrada promedio'}</div>
        <div class="v">${t.entrada || '—'}</div></div>
      <div class="kpi"><div class="l">${unDia ? 'Salida' : 'Salida promedio'}</div>
        <div class="v">${t.salida || '—'}</div></div>
      <div class="kpi"><div class="l">${unDia ? 'Jornada' : 'Jornada promedio'}</div>
        <div class="v">${t.duracion || '—'}</div>
        <div class="s">${n2(t.horas_promedio, 2)} horas</div></div>
      <div class="kpi"><div class="l">Horas totales</div>
        <div class="v">${n0(t.horas_total)}</div></div>
    </div>

    <div class="card" style="padding:14px 18px">
      <p class="sub" style="margin:0">Aquí solo aparecen los días con
        <strong>entrada y salida</strong>, que son los únicos donde se puede medir
        la jornada. Los que marcaron una sola vez o no marcaron están en
        <strong>A revisar</strong>.</p>
      <p class="sub" style="margin:10px 0 0">El <strong>porcentaje de marcación</strong>
        compara los registros completos contra lo esperado: los trabajadores activos
        multiplicados por los días con actividad.</p>
    </div>

    ${(d.serie || []).length > 1 ? `
    <div class="card">
      <h3>Marcación en el tiempo</h3>
      <p class="sub">Porcentaje de trabajadores activos que marcaron completo cada día.</p>
      ${barras(d.serie.map(x => ({ etiqueta: x.fecha, valor: x.pct,
        extra: `${n2(x.pct, 0)}% · ${x.marcaron}/${x.esperados}` })), '%')}
    </div>` : ''}

    ${seccionSupervisores(d)}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  gap:14px;flex-wrap:wrap;margin-bottom:6px">
        <div>
          <h3 style="margin:0">Trabajadores con jornada</h3>
          <p class="sub" style="margin:6px 0 0">${unDia
            ? 'Hora de entrada, salida y duración del día seleccionado.'
            : 'Promedios sobre los días en que marcaron entrada y salida.'}</p>
        </div>
        ${botonExcel(API.urlAnalisisExcel(filtros()), 'Descargar Excel')}
      </div>
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th class="num">Código</th><th>Nombre</th><th>Supervisor</th>
            <th class="num">${unDia ? 'Entrada' : 'Entrada prom.'}</th>
            <th class="num">${unDia ? 'Salida' : 'Salida prom.'}</th>
            <th class="num">${unDia ? 'Jornada' : 'Jornada prom.'}</th>
            <th class="num">Horas</th><th class="num">Días</th>
          </tr></thead>
          <tbody>${d.trabajadores.map(x => `<tr>
            <td class="num">${esc(x.codigo ?? '—')}</td>
            <td class="ln">${esc(x.nombre)}</td>
            <td>${esc(x.supervisor || '—')}</td>
            <td class="num">${x.entrada || '—'}</td>
            <td class="num">${x.salida || '—'}</td>
            <td class="num">${x.duracion || '—'}</td>
            <td class="num">${x.horas_promedio ? n2(x.horas_promedio, 2) : '—'}</td>
            <td class="num">${n0(x.dias_calculables)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Mayor jornada promedio</h3>
        ${tablaRanking(d.mayor_duracion)}
      </div>
      <div class="card">
        <h3>Menor jornada promedio</h3>
        ${tablaRanking(d.menor_duracion)}
      </div>
    </div>`;
}

function seccionSupervisores(d) {
  const sup = (d.supervisores || []).filter(x => typeof x === 'object');
  if (!sup.length) return '';
  const conNombre = sup.filter(x => x.supervisor !== 'Sin asignar');

  if (!conNombre.length) return `
    <div class="card" style="padding:14px 18px">
      <p class="sub" style="margin:0">La tabla de trabajadores todavía no tiene
        <strong>supervisor</strong>. Cuando llenes esa columna, aquí aparecerán
        la comparación entre equipos y sus porcentajes de marcación.</p>
    </div>`;

  return `
    <div class="card">
      <h3>Marcación por supervisor</h3>
      <p class="sub">Cada equipo tiene distinta cantidad de gente, así que el
        porcentaje compara mejor que el número absoluto.</p>
      ${barras(sup.map(x => ({ etiqueta: x.supervisor, valor: x.pct_marcacion,
        extra: `${n2(x.pct_marcacion, 0)}% · ${x.trabajadores} trab.` })), '%')}
      <div class="twrap" style="max-height:none;margin-top:18px">
        <table class="ft">
          <thead><tr><th>Supervisor</th><th class="num">Trabajadores</th>
            <th class="num">Marcación</th><th class="num">Registros</th>
            <th class="num">Entrada prom.</th><th class="num">Jornada prom.</th>
            <th class="num">Horas totales</th></tr></thead>
          <tbody>${sup.map(x => `<tr>
            <td class="ln">${esc(x.supervisor)}</td>
            <td class="num">${n0(x.trabajadores)}</td>
            <td class="num"><span class="sem ${x.pct_marcacion >= 80 ? 'sem-optimo'
              : x.pct_marcacion >= 50 ? 'sem-bajo' : 'sem-deficiente'}">${n2(x.pct_marcacion, 1)}%</span></td>
            <td class="num">${n0(x.registros_completos)}</td>
            <td class="num">${x.entrada || '—'}</td>
            <td class="num">${x.duracion || '—'}</td>
            <td class="num">${x.horas_total ? n2(x.horas_total, 1) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    ${(d.sup_mayor_jornada || []).length > 1 ? `
    <div class="grid2">
      <div class="card">
        <h3>Supervisores · mejor marcación</h3>
        <p class="sub">Equipos donde más gente marca completo.</p>
        ${tablaSup(d.sup_mejor_marcacion, 'pct')}
      </div>
      <div class="card">
        <h3>Supervisores · mayor jornada</h3>
        <p class="sub">Equipos con las jornadas promedio más largas.</p>
        ${tablaSup(d.sup_mayor_jornada, 'jornada')}
      </div>
    </div>` : ''}`;
}

function tablaSup(lista, campo) {
  if (!lista || !lista.length)
    return `<p style="color:var(--ink-soft);font-size:13px">Sin datos.</p>`;
  return `<div class="twrap" style="max-height:330px">
      <table class="ft">
        <thead><tr><th>Supervisor</th>
          <th class="num">${campo === 'pct' ? 'Marcación' : 'Jornada'}</th>
          <th class="num">Trabajadores</th></tr></thead>
        <tbody>${lista.map(x => `<tr>
          <td class="ln">${esc(x.supervisor)}</td>
          <td class="num">${campo === 'pct' ? n2(x.pct_marcacion, 1) + '%' : (x.duracion || '—')}</td>
          <td class="num">${n0(x.trabajadores)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function tablaRanking(lista) {
  if (!lista || !lista.length)
    return `<p style="color:var(--ink-soft);font-size:13px">Sin datos.</p>`;
  return `<div class="twrap" style="max-height:330px">
      <table class="ft">
        <thead><tr><th>Nombre</th><th class="num">Jornada</th>
          <th class="num">Días</th></tr></thead>
        <tbody>${lista.map(x => `<tr>
          <td class="ln">${esc(x.nombre)}</td>
          <td class="num">${x.duracion || '—'}</td>
          <td class="num">${n0(x.dias_calculables)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function barras(datos, sufijo = '') {
  const validos = (datos || []).filter(d => d.valor > 0);
  if (!validos.length) return `<p style="color:var(--ink-soft);font-size:13px">Sin datos.</p>`;
  const max = Math.max(...validos.map(d => d.valor));
  return `<div class="bars">${validos.map((d, i) => {
    const pct = Math.max(1.5, (d.valor / max) * 100);
    return `<div class="barrow">
        <div class="bl" title="${esc(d.etiqueta)}">${esc(String(d.etiqueta))}</div>
        <div class="btrack"><div class="bfill" style="width:${pct}%;background:${COLORES[i % COLORES.length]}"></div></div>
        <div class="bv">${esc(d.extra || (n2(d.valor, 1) + sufijo))}</div>
      </div>`;
  }).join('')}</div>`;
}

// ============================================================
//  A REVISAR · incompletos y ausencias
// ============================================================
function vistaRevisar(c) {
  const d = S.datos, t = d.total;

  if (d.vacio) {
    c.innerHTML = `<div class="vacio"><h3>Nada que revisar</h3>
      <p>Todos los trabajadores activos del período marcaron entrada y salida.</p></div>`;
    return;
  }

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi acc"><div class="l">Casos a revisar</div>
        <div class="v" style="color:var(--danger)">${n0(t.casos)}</div>
        <div class="s">${esc(periodoTexto())}</div></div>
      <div class="kpi"><div class="l">Sin marcar</div>
        <div class="v">${n0(t.sin_marcar)}</div>
        <div class="s">no registraron nada</div></div>
      <div class="kpi"><div class="l">Marcación incompleta</div>
        <div class="v">${n0(t.incompletos)}</div>
        <div class="s">falta entrada o salida</div></div>
      <div class="kpi"><div class="l">Trabajadores activos</div>
        <div class="v">${n0(t.trabajadores_activos)}</div></div>
      <div class="kpi"><div class="l">Con jornada completa</div>
        <div class="v">${n0(t.registros_completos)}</div></div>
    </div>

    <div class="card" style="padding:14px 18px">
      <p class="sub" style="margin:0">Aquí están los casos que no se pueden medir:
        quien marcó solo la entrada, solo la salida, o no marcó nada. Las ausencias
        no existen como registro —las celdas vacías del Excel no se guardan— así que
        se deducen comparando la lista de activos con quienes sí marcaron.</p>
    </div>

    ${(d.por_motivo || []).length ? `
    <div class="card">
      <h3>Casos por situación</h3>
      ${barras(d.por_motivo.map(x => ({ etiqueta: x.motivo, valor: x.casos })), '')}
    </div>` : ''}

    ${seccionSupRevisar(d)}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  gap:14px;flex-wrap:wrap;margin-bottom:6px">
        <div>
          <h3 style="margin:0">Detalle</h3>
          <p class="sub" style="margin:6px 0 0">${d.revisar.length < d.total_revisar
            ? `Mostrando ${n0(d.revisar.length)} de ${n0(d.total_revisar)}. El Excel trae todos.`
            : 'Ordenados por fecha y nombre.'}</p>
        </div>
        ${botonExcel(API.urlRevisarExcel(filtros()), 'Descargar Excel')}
      </div>
      <div class="twrap">
        <table class="ft">
          <thead><tr><th class="num">Código</th><th>Nombre</th><th>Supervisor</th>
            <th>Fecha</th><th class="num">Hora inicio</th><th class="num">Hora fin</th>
            <th>Situación</th></tr></thead>
          <tbody>${d.revisar.map(x => `<tr${x.sin_registro ? ' style="opacity:.7"' : ''}>
            <td class="num">${esc(x.codigo ?? '—')}</td>
            <td class="ln">${esc(x.nombre)}</td>
            <td>${esc(x.supervisor || '—')}</td>
            <td>${esc(x.fecha || '—')}</td>
            <td class="num">${x.entrada || '—'}</td>
            <td class="num">${x.salida || '—'}</td>
            <td><span class="sem ${x.sin_registro ? 'sem-deficiente' : 'sem-bajo'}">${esc(x.motivo)}</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

function seccionSupRevisar(d) {
  const sup = (d.supervisores || []).filter(x => typeof x === 'object');
  const conNombre = sup.filter(x => x.supervisor !== 'Sin asignar');
  if (!conNombre.length) return '';

  return `
    <div class="card">
      <h3>Supervisores con más casos</h3>
      <p class="sub">Casos por trabajador, para comparar equipos de distinto tamaño.</p>
      ${barras(sup.map(x => ({ etiqueta: x.supervisor, valor: x.casos_por_trabajador,
        extra: `${n2(x.casos_por_trabajador, 1)} · ${x.casos} casos` })), '')}
      <div class="twrap" style="max-height:none;margin-top:18px">
        <table class="ft">
          <thead><tr><th>Supervisor</th><th class="num">Trabajadores</th>
            <th class="num">Casos</th><th class="num">Sin marcar</th>
            <th class="num">Incompletos</th>
            <th class="num">Casos por trabajador</th></tr></thead>
          <tbody>${sup.map(x => `<tr>
            <td class="ln">${esc(x.supervisor)}</td>
            <td class="num">${n0(x.trabajadores)}</td>
            <td class="num">${n0(x.casos)}</td>
            <td class="num">${n0(x.sin_marcar)}</td>
            <td class="num">${n0(x.incompletos)}</td>
            <td class="num">${n2(x.casos_por_trabajador, 2)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================
//  TRABAJADORES ACTIVOS
// ============================================================
async function vistaPersonal(c) {
  c.innerHTML = `<div class="cargando">Cargando…</div>`;
  let nom, pend = { pendientes: [] };
  try {
    nom = await API.nomina();
    try { pend = await API.sinCruzar(S.empresaId); } catch { /* sin datos aún */ }
  } catch (e) { c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; return; }

  const resumen = nom.resumen || [];
  const total = resumen.reduce((a, x) => a + Number(x.total || 0), 0);
  const sinCruzar = pend.pendientes || [];

  c.innerHTML = `
    <div class="card">
      <h3>Trabajadores activos</h3>
      <p class="sub">La lista de quienes trabajan hoy, de <strong>todas las empresas
        en un solo archivo</strong>. La empresa viene en la columna del Excel, así que
        no hay que elegirla aquí. Cada carga reemplaza por completo la anterior.</p>

      <div class="msg msg-warn" style="margin:0 0 16px">
        <strong>Esta tabla va primero.</strong> Sin ella no se pueden cargar
        asistencias: el sistema no tendría contra qué cruzar y todos los registros
        quedarían como inactivos.
      </div>

      <div class="fbar" style="margin-bottom:14px">
        <div class="sp"></div>
        <a class="btn btn-ghost" href="${API.urlFormatoNomina()}" download>
          Descargar formato en blanco</a>
      </div>

      <div class="card" style="padding:14px 18px;margin:0 0 16px;background:var(--cream)">
        <p class="sub" style="margin:0"><strong>Columnas del archivo:</strong>
          Codigo · Nombre Del Trabajador · Employee ID · estado · id · supervisor · empresa</p>
        <p class="sub" style="margin:10px 0 0">La columna <strong>id</strong> es la
          llave del cruce: <em>EmployeeID_Nombre</em>, con el nombre tal como viene
          del huellero. El Employee ID por sí solo no basta porque se repite entre
          personas distintas.</p>
        <p class="sub" style="margin:10px 0 0">En <strong>empresa</strong>:
          1 = Palmeras de Yarima · 2 = Villa Claudia · 3 = CUCÚ.</p>
      </div>

      <div class="dz" id="nZ" style="padding:22px">
        <div class="m">Arrastra el Excel de trabajadores o haz clic</div>
        <div class="s">.xlsx con las siete columnas</div>
        <input type="file" id="nF" accept=".xlsx,.xlsm" hidden>
      </div>
      <div id="nCh"></div>
      <div style="margin-top:14px">
        <button class="btn btn-primary" id="nS" disabled>Cargar trabajadores</button>
      </div>
      <div id="nM"></div>
    </div>

    ${resumen.length ? `
    <div class="card">
      <h3>Lo que hay cargado</h3>
      <div class="twrap" style="max-height:none">
        <table class="ft">
          <thead><tr><th>Empresa</th><th class="num">Trabajadores</th>
            <th class="num">Con id de cruce</th><th class="num">Con supervisor</th>
            <th>Última carga</th></tr></thead>
          <tbody>${resumen.map(x => `<tr>
            <td class="ln">${esc(x.empresa)}</td>
            <td class="num">${n0(x.total)}</td>
            <td class="num">${n0(x.con_id)}</td>
            <td class="num">${x.con_supervisor ? n0(x.con_supervisor)
              : `<span class="sem sem-bajo">0</span>`}</td>
            <td>${String(x.ultima_carga || '').slice(0, 16).replace('T', ' ')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      ${resumen.some(x => !x.con_supervisor) ? `
      <p class="sub" style="margin:14px 0 0">Todavía no hay supervisores cargados.
        Cuando llenes esa columna, los análisis por equipo aparecen solos: no hay
        que volver a subir las asistencias.</p>` : ''}
    </div>` : `<div class="msg msg-warn">Aún no hay trabajadores cargados.</div>`}

    ${sinCruzar.length ? `
    <div class="card">
      <h3>Gente del huellero que no cruzó</h3>
      <p class="sub">Estos ${n0(sinCruzar.length)} tienen marcaciones pero su
        <strong>id compuesto</strong> no está en la tabla de trabajadores, así que
        no aparecen en los análisis. Copia el id tal cual a la columna <em>id</em>
        del Excel si son gente activa.</p>
      <div class="twrap">
        <table class="ft">
          <thead><tr><th class="num">Employee ID</th><th>Nombre en el huellero</th>
            <th>id compuesto</th><th class="num">Marcaciones</th></tr></thead>
          <tbody>${sinCruzar.slice(0, 200).map(x => `<tr>
            <td class="num">${esc(x.codigo)}</td>
            <td class="ln">${esc(x.nombre)}</td>
            <td><code style="font-size:12.5px">${esc(x.id_compuesto)}</code></td>
            <td class="num">${n0(x.marcaciones)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : ''}`;

  let archivo = null;
  const z = $('#nZ'), inp = $('#nF'), btn = $('#nS');
  z.onclick = () => inp.click();
  inp.onchange = e => {
    archivo = e.target.files[0];
    if (archivo) {
      $('#nCh').innerHTML = `<div class="chip">📄 ${esc(archivo.name)}</div>`;
      btn.disabled = false;
    }
  };
  ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => {
    e.preventDefault(); z.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => {
    e.preventDefault(); z.classList.remove('over');
  }));
  z.addEventListener('drop', e => {
    archivo = e.dataTransfer.files[0];
    if (archivo) {
      $('#nCh').innerHTML = `<div class="chip">📄 ${esc(archivo.name)}</div>`;
      btn.disabled = false;
    }
  });

  btn.onclick = async () => {
    if (!confirm('Vas a reemplazar la tabla de trabajadores activos de TODAS ' +
                 'las empresas.\n\nLa anterior se borra. ¿Continuar?')) return;
    btn.disabled = true; btn.textContent = 'Cargando…';
    try {
      const r = await API.cargarNomina(archivo);
      const av = (r.advertencias || []).length
        ? `<ul>${r.advertencias.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
      $('#nM').innerHTML = `<div class="msg ${av ? 'msg-warn' : 'msg-ok'}">
        ${r.insertados} trabajadores cargados
        (${r.borrados} de la carga anterior reemplazados).${av}</div>`;
      setTimeout(() => vistaPersonal(c), 1400);
    } catch (e) {
      $('#nM').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    } finally { btn.disabled = false; btn.textContent = 'Cargar trabajadores'; }
  };
}
// ============================================================
//  CARGAR DATOS
// ============================================================
function vistaCarga(c) {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();

  c.innerHTML = `
    <div class="card">
      <h3>Cargar el Excel proveniente del huellero</h3>
      <p class="sub">Los reportes de asistencia son mensuales. Elige la empresa y
        el período: el formato se genera con los días que tenga ese mes.</p>

      <div class="fbar" style="margin-bottom:10px">
        <div class="g"><label for="cEm">Empresa</label>
          <select id="cEm" style="min-width:180px">${S.empresas.map(e =>
            `<option value="${e.id}" ${e.id === S.empresaId ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></div>
        <div class="g"><label for="cZo">Zona</label>
          <select id="cZo" style="min-width:160px">
            <option value="">— Seleccionar —</option></select></div>
        <div class="g"><label for="cFo">Formato</label>
          <select id="cFo" style="min-width:150px">
            <option value="1">Formato 1 · matriz</option>
            <option value="2">Formato 2 · lista</option>
          </select></div>
      </div>
      <div class="fbar" style="margin-bottom:10px">
        <div class="g"><label for="cAn">Año</label>
          <input type="number" id="cAn" min="1990" max="2100" step="1"
                 value="${anioActual}" style="width:110px"></div>
        <div class="g"><label for="cMe">Mes</label>
          <select id="cMe" style="min-width:140px">
            <option value="">— Seleccionar —</option>
            ${MESES.map((m, i) => `<option value="${i + 1}">${cap(m)}</option>`).join('')}
          </select></div>
        <div class="sp"></div>
        <span style="font-size:12.5px;color:var(--ink-soft)">
          Cada zona tiene su propio huellero y se carga por separado.</span>
      </div>

      <div id="cPer"></div>

      <div class="fbar" style="margin-bottom:16px">
        <div class="g"><label style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" id="cRe" checked> Reemplazar los datos de esa empresa, zona, año y mes</label></div>
        <div class="sp"></div>
        <span style="font-size:12.5px;color:var(--ink-soft)">
          Solo se reemplaza esa zona: las demás no se tocan.</span>
      </div>

      <div class="dz" id="cZ">
        <div class="ic"><svg width="36" height="36" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/>
          <path d="M12 5v12"/></svg></div>
        <div class="m">Arrastra el archivo aquí o haz clic para elegirlo</div>
        <div class="s" id="cHint">.xlsx con Employee ID, Name, Department y un día por columna</div>
        <input type="file" id="cF" accept=".xlsx,.xlsm" hidden>
      </div>
      <div id="cCh"></div>
      <div style="margin-top:16px">
        <button class="btn btn-primary" id="cS" disabled>Cargar a la base de datos</button>
      </div>
      <div id="cM"></div>
    </div>

    <div class="card">
      <h3>Los dos formatos</h3>
      <p class="sub">Los huelleros no son todos de la misma marca, así que exportan
        distinto. Elige arriba el que corresponda al aparato de esa zona.</p>
      <div class="twrap" style="max-height:none;margin-bottom:18px">
        <table class="ft">
          <thead><tr><th>Formato</th><th>Estructura</th><th>Columnas</th></tr></thead>
          <tbody>
            <tr><td class="ln">1 · matriz</td>
              <td>Una fila por trabajador, una columna por día del mes</td>
              <td>Employee ID · Name · Department · 1 · 2 · 3 …</td></tr>
            <tr><td class="ln">2 · lista</td>
              <td>Una fila por trabajador y fecha, con las horas separadas</td>
              <td>ID · Nombre · Departamento · Fecha · Entrada · Salida</td></tr>
          </tbody>
        </table>
      </div>
      <p class="sub">La columna <strong>Department</strong> es el supervisor a cargo
        de cada trabajador. Con ella el módulo compara equipos: qué supervisor tiene
        las jornadas más largas, cuál las más cortas y cuánta gente lleva. Si el
        archivo no la trae, los datos se cargan igual y el sistema avisa.</p>
      <p class="sub">En el <strong>formato 2</strong> las horas ya vienen separadas:
        si falta la entrada o la salida, el día va a revisar. Solo se cargan las filas
        cuya fecha esté dentro del mes elegido.</p>
      <h3 style="margin-top:22px">Formato 1 · cómo se leen las marcaciones</h3>
      <p class="sub">El huellero registra cada paso por el lector, y suele repetir
        la misma marca varias veces. El sistema toma la <strong>primera</strong> y la
        <strong>última hora distintas</strong> del día.</p>
      <div class="twrap" style="max-height:none">
        <table class="ft">
          <thead><tr><th>La celda trae</th><th>Se interpreta</th></tr></thead>
          <tbody>
            <tr><td class="ln">06:07 · 06:07 · 13:15 · 13:15</td>
              <td>Entrada 06:07, salida 13:15 → jornada 7h 08m</td></tr>
            <tr><td class="ln">06:08 · 13:19</td>
              <td>Entrada 06:08, salida 13:19 → jornada 7h 11m</td></tr>
            <tr><td class="ln">06:04 · 12:59 · 13:00</td>
              <td>Entrada 06:04, salida 13:00 → jornada 6h 56m</td></tr>
            <tr><td class="ln">13:19</td>
              <td>Una sola marcación: falta entrada o salida → a revisar</td></tr>
            <tr><td class="ln">06:07 · 06:07</td>
              <td>La misma hora repetida: es una sola marcación → a revisar</td></tr>
            <tr><td class="ln">(vacía)</td>
              <td>Sin registro. No entra en los promedios</td></tr>
          </tbody>
        </table>
      </div>
      <p class="sub" style="margin:16px 0 0">No importa cuántas marcas tenga una celda:
        2, 4 o 10, el resultado es el mismo. Los días a revisar quedan guardados y se
        listan en su pestaña, para corregirlos en el huellero si hace falta.</p>
    </div>`;

  const z = $('#cZ'), inp = $('#cF'), btn = $('#cS');
  let archivo = null;
  let zonasCarga = [];

  const pintarZonas = async () => {
    const eid = +$('#cEm').value;
    try {
      zonasCarga = (await API.zonas(eid)).zonas || [];
    } catch { zonasCarga = []; }
    const sel = $('#cZo');
    sel.innerHTML = zonasCarga.length
      ? `<option value="">— Seleccionar —</option>` + zonasCarga.map(x =>
          `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')
      : `<option value="">Sin zonas registradas</option>`;
    refrescarPeriodo();
  };

  const refrescarPeriodo = () => {
    const eid = +$('#cEm').value;
    const zid = $('#cZo').value;
    const fmt = +$('#cFo').value;
    const anio = +$('#cAn').value;
    const mes = $('#cMe').value;
    const caja = $('#cPer');

    const hint = $('#cHint');
    if (hint) hint.textContent = fmt === 2
      ? '.xlsx con las columnas ID, Nombre, Departamento, Fecha, Entrada, Salida'
      : '.xlsx con Employee ID, Name, Department y un día por columna';

    if (!zid) {
      caja.innerHTML = `<div class="msg msg-warn" style="margin:0 0 16px">
        <strong>Selecciona la zona.</strong> Cada zona tiene su propio huellero,
        y el archivo que cargues reemplaza solo los datos de esa zona.
      </div>`;
      btn.disabled = true;
      return;
    }

    if (!mes || !anio) {
      caja.innerHTML = `<div class="msg msg-warn" style="margin:0 0 16px">
        <strong>Selecciona el período para cargar datos.</strong> El formato depende
        del mes: febrero trae 28 días (29 si el año es bisiesto), abril 30, enero 31.
      </div>`;
      btn.disabled = true;
      return;
    }

    const dias = new Date(anio, +mes, 0).getDate();
    const nz = (zonasCarga.find(x => String(x.id) === String(zid)) || {}).nombre || '';
    caja.innerHTML = `<div class="msg msg-ok" style="margin:0 0 16px">
        <strong>${esc(nz)}</strong> · ${cap(MESES[+mes - 1])} de ${anio} ·
        ${dias} días · Formato ${fmt}.
        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn btn-ghost" href="${API.urlFormato(eid, zid, anio, mes, fmt)}" download>
            Descargar formato ${fmt}${fmt === 1 ? ` de ${dias} días` : ''}</a>
        </div>
      </div>`;
    btn.disabled = !archivo;
  };

  $('#cEm').onchange = pintarZonas;
  $('#cZo').onchange = refrescarPeriodo;
  $('#cFo').onchange = refrescarPeriodo;
  $('#cAn').oninput = refrescarPeriodo;
  $('#cMe').onchange = refrescarPeriodo;
  pintarZonas();

  const elegir = f => {
    if (!f) return;
    archivo = f;
    $('#cCh').innerHTML = `<div class="chip">📄 ${esc(f.name)}</div>`;
    refrescarPeriodo();
  };
  z.onclick = () => inp.click();
  inp.onchange = e => elegir(e.target.files[0]);
  ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => {
    e.preventDefault(); z.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => {
    e.preventDefault(); z.classList.remove('over');
  }));
  z.addEventListener('drop', e => elegir(e.dataTransfer.files[0]));

  btn.onclick = async () => {
    const eid = +$('#cEm').value, zid = $('#cZo').value;
    const fmt = +$('#cFo').value;
    const anio = +$('#cAn').value, mes = +$('#cMe').value;
    const m = $('#cM');
    if (!zid) {
      m.innerHTML = `<div class="msg msg-err">Selecciona la zona antes de cargar.</div>`;
      return;
    }
    if (!mes) {
      m.innerHTML = `<div class="msg msg-err">Selecciona el mes antes de cargar.</div>`;
      return;
    }
    const nom = (S.empresas.find(x => x.id === eid) || {}).nombre || '';
    const nz = (zonasCarga.find(x => String(x.id) === String(zid)) || {}).nombre || '';
    if (!confirm(`Vas a cargar este archivo como:\n\n` +
                 `Empresa: ${nom}\nZona: ${nz}\n` +
                 `Período: ${cap(MESES[mes - 1])} ${anio}\nFormato: ${fmt}\n\n¿Es correcto?`)) return;

    btn.disabled = true; btn.textContent = 'Cargando…'; m.innerHTML = '';
    try {
      const r = await API.cargar(anio, mes, eid, zid, fmt, archivo, $('#cRe').checked);
      const av = (r.advertencias || []).length
        ? `<ul>${r.advertencias.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
      const res = r.resumen || {};
      m.innerHTML = `<div class="msg ${av ? 'msg-warn' : 'msg-ok'}">
        <strong>${esc(r.empresa)} · ${esc(r.zona)}</strong> ·
        ${cap(r.mes_nombre)} ${r.anio} · formato ${r.formato}.<br>
        ${r.trabajadores} trabajadores · ${r.marcaciones} días con registro
        (${res.dias_completos || 0} calculables, ${res.dias_incompletos || 0} a revisar)
        ${r.reemplazadas ? ` · ${r.reemplazadas} registros reemplazados` : ''}.
        ${av}</div>`;
      S.empresaId = eid;
      S.anio = String(anio); S.mes = String(mes); S.dia = '';
      $('#aEm').value = eid;
    } catch (e) {
      m.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Cargar a la base de datos';
    }
  };
}
