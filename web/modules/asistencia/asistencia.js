// ============================================================
// PalmaData · Asistencia
// Los promedios se calculan sobre los días CON REGISTRO:
// domingos, festivos y ausencias no bajan los promedios.
// ============================================================
import { API } from './api.js';

const S = {
  empresaId: null, empresa: null, empresas: [],
  zonaId: '', zona: null, zonas: [],
  anio: '', mes: '', dia: '', trabajador: '', departamento: '',
  anios: [], meses: [], dias: [], departamentos: [],
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
      <div class="g"><label for="aZo">Zona</label>
        <select id="aZo" style="min-width:150px"><option value="">Todas</option></select></div>
      <div class="g"><label for="aAn">Año</label>
        <select id="aAn" style="min-width:110px"><option value="">Todos</option></select></div>
      <div class="g"><label for="aMe">Mes</label>
        <select id="aMe" style="min-width:130px"><option value="">Todos</option></select></div>
      <div class="g"><label for="aDi">Día</label>
        <select id="aDi" style="min-width:90px"><option value="">Todos</option></select></div>
      <div class="g"><label for="aDe">Supervisor</label>
        <select id="aDe" style="min-width:160px"><option value="">Todos</option></select></div>
      <div class="g"><label for="aTr">Trabajador</label>
        <input id="aTr" placeholder="Buscar…" autocomplete="off" value="${esc(S.trabajador)}"
               style="min-width:190px;padding:8px 11px;border:1.5px solid var(--line);
                      border-radius:var(--radius-sm);font-size:14px">
        <button class="btn btn-ghost" id="aTx" style="padding:8px 11px" title="Limpiar">✕</button></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="aR">Actualizar</button>
    </div>
    <div class="ftabs">
      <button class="ftab" data-tab="analisis">Análisis</button>
      <button class="ftab" data-tab="revisar">Días a revisar</button>
      <button class="ftab" data-tab="datos">Cargar datos</button>
    </div>
    <div id="aC"></div>`;

  $('#aEm').onchange = e => {
    S.empresaId = +e.target.value;
    S.zonaId = ''; S.anio = ''; S.mes = ''; S.dia = '';
    cargar();
  };
  $('#aZo').onchange = e => { S.zonaId = e.target.value; S.anio = ''; S.mes = ''; S.dia = ''; cargar(); };
  $('#aAn').onchange = e => { S.anio = e.target.value; S.mes = ''; S.dia = ''; cargar(); };
  $('#aMe').onchange = e => { S.mes = e.target.value; S.dia = ''; cargar(); };
  $('#aDi').onchange = e => { S.dia = e.target.value; cargar(); };
  $('#aDe').onchange = e => { S.departamento = e.target.value; cargar(); };
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

  c.innerHTML = `<div class="cargando">Calculando…</div>`;
  try {
    S.datos = await API.analisis({
      empresaId: S.empresaId, zonaId: S.zonaId, anio: S.anio, mes: S.mes,
      dia: S.dia, trabajador: S.trabajador, departamento: S.departamento,
    });
    S.departamentos = S.datos.departamentos || [];
    S.zonas = S.datos.zonas || [];
    S.zona = S.datos.zona;
    S.anios = S.datos.anios || [];
    S.meses = S.datos.meses || [];
    S.dias = S.datos.dias || [];
    S.empresa = S.datos.empresa;
    pintarFiltros();
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }

  if (S.datos.vacio) {
    c.innerHTML = `<div class="vacio">
      <h3>Sin datos${S.trabajador ? ' para esa búsqueda' : ''}</h3>
      <p>${S.trabajador
        ? 'Prueba con otro nombre o limpia el filtro.'
        : 'Carga el Excel del huellero en la pestaña <strong>Cargar datos</strong>.'}</p>
      </div>`;
    return;
  }

  S.tab === 'revisar' ? vistaRevisar(c) : vistaAnalisis(c);
}

function pintarFiltros() {
  const zo = $('#aZo');
  if (zo) zo.innerHTML = `<option value="">Todas</option>` + S.zonas.map(z =>
    `<option value="${z.id}" ${String(z.id) === String(S.zonaId) ? 'selected' : ''}>${esc(z.nombre)}</option>`).join('');

  const de = $('#aDe');
  if (de) de.innerHTML = `<option value="">Todos</option>`
    + S.departamentos.map(d =>
        `<option value="${esc(d)}" ${d === S.departamento ? 'selected' : ''}>${esc(d)}</option>`).join('')
    + ((S.datos?.supervisores || []).some(x => x.departamento === 'Sin asignar')
        || S.departamento === 'Sin asignar'
        ? `<option value="Sin asignar" ${S.departamento === 'Sin asignar' ? 'selected' : ''}>Sin asignar</option>`
        : '');

  const an = $('#aAn');
  if (an) an.innerHTML = `<option value="">Todos</option>` + S.anios.map(a =>
    `<option value="${a}" ${String(a) === String(S.anio) ? 'selected' : ''}>${a}</option>`).join('');

  const me = $('#aMe');
  if (me) me.innerHTML = `<option value="">Todos</option>` + S.meses.map(m =>
    `<option value="${m.mes}" ${String(m.mes) === String(S.mes) ? 'selected' : ''}>${cap(m.nombre)}</option>`).join('');

  const di = $('#aDi');
  if (di) di.innerHTML = `<option value="">Todos</option>` + S.dias.map(d =>
    `<option value="${d}" ${String(d) === String(S.dia) ? 'selected' : ''}>${d}</option>`).join('');
}

function periodoTexto() {
  const z = (S.zona ? `${S.zona} · ` : '')
          + (S.departamento ? `${S.departamento} · ` : '');
  if (S.dia && S.mes && S.anio) return `${z}${S.dia} de ${MESES[+S.mes - 1]} de ${S.anio}`;
  if (S.mes && S.anio) return `${z}${cap(MESES[+S.mes - 1])} de ${S.anio}`;
  if (S.anio) return `${z}Año ${S.anio}`;
  return z ? `${S.zona} · todo el histórico` : 'Todo el histórico';
}

// ============================================================
//  ANÁLISIS
// ============================================================
function vistaAnalisis(c) {
  const d = S.datos, t = d.total;
  const unDia = !!S.dia;

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Trabajadores</div><div class="v">${n0(t.trabajadores)}</div>
        <div class="s">${esc(periodoTexto())}</div></div>
      <div class="kpi"><div class="l">${unDia ? 'Entrada' : 'Entrada promedio'}</div>
        <div class="v">${t.entrada || '—'}</div></div>
      <div class="kpi"><div class="l">${unDia ? 'Salida' : 'Salida promedio'}</div>
        <div class="v">${t.salida || '—'}</div></div>
      <div class="kpi acc"><div class="l">${unDia ? 'Jornada' : 'Jornada promedio'}</div>
        <div class="v">${t.duracion || '—'}</div>
        <div class="s">${n2(t.horas_promedio, 2)} horas</div></div>
      <div class="kpi"><div class="l">Registros</div><div class="v">${n0(t.dias_registrados)}</div>
        <div class="s">${n0(t.dias_calculables)} con jornada · ${n0(t.dias_incompletos)} a revisar</div></div>
      ${t.dias_incompletos ? `<div class="kpi"><div class="l">A revisar</div>
        <div class="v" style="color:var(--danger)">${n0(t.dias_incompletos)}</div>
        <div class="s">marcación incompleta</div></div>` : ''}
    </div>

    <div class="card" style="padding:14px 18px">
      <p class="sub" style="margin:0">Los promedios se calculan sobre los días
        <strong>con registro</strong>, no sobre los días del calendario: los domingos,
        festivos y ausencias no bajan el promedio de nadie.</p>
    </div>

    <div class="card">
      <h3>Trabajadores</h3>
      <p class="sub">${unDia
        ? 'Hora de entrada, salida y jornada del día seleccionado.'
        : 'Hora promedio de entrada y salida, y duración promedio de la jornada.'}</p>
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th class="num">Código</th><th>Nombre</th><th>Supervisor</th>
            <th class="num">${unDia ? 'Entrada' : 'Entrada prom.'}</th>
            <th class="num">${unDia ? 'Salida' : 'Salida prom.'}</th>
            <th class="num">${unDia ? 'Jornada' : 'Jornada prom.'}</th>
            <th class="num">Horas</th>
            <th class="num">Días</th><th class="num">Revisar</th>
          </tr></thead>
          <tbody>${d.trabajadores.map(x => `<tr>
            <td class="num">${esc(x.codigo)}</td>
            <td class="ln">${esc(x.nombre)}</td>
            <td>${esc(x.departamento || '—')}</td>
            <td class="num">${x.entrada || '—'}</td>
            <td class="num">${x.salida || '—'}</td>
            <td class="num">${x.duracion || '—'}</td>
            <td class="num">${x.horas_promedio ? n2(x.horas_promedio, 2) : '—'}</td>
            <td class="num">${n0(x.dias_calculables)}</td>
            <td class="num">${x.dias_incompletos
              ? `<span class="sem sem-bajo">${x.dias_incompletos}</span>` : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Mayor jornada promedio</h3>
        <p class="sub">Quienes registran jornadas más largas.</p>
        ${tablaRanking(d.mayor_duracion)}
      </div>
      <div class="card">
        <h3>Menor jornada promedio</h3>
        <p class="sub">Quienes registran jornadas más cortas.</p>
        ${tablaRanking(d.menor_duracion)}
      </div>
    </div>

    ${seccionSupervisores(d)}

    <div class="grid2">
      <div class="card">
        <h3>Entradas más tempranas</h3>
        <p class="sub">Promedio de hora de entrada más temprano.</p>
        ${tablaRanking(d.madrugadores, 'entrada')}
      </div>
      <div class="card">
        <h3>Días de menor jornada</h3>
        <p class="sub">Fechas con la jornada promedio más corta.</p>
        ${tablaDias(d.dias_menos_horas)}
      </div>
    </div>

    ${(d.por_dia || []).length > 1 ? `
    <div class="card">
      <h3>Jornada promedio por día</h3>
      <p class="sub">Cómo varía la duración a lo largo del período.</p>
      ${barras(d.por_dia.map(x => ({
        etiqueta: x.fecha, valor: x.horas_promedio, extra: x.duracion })), ' h')}
    </div>` : ''}`;
}

function seccionSupervisores(d) {
  const sup = d.supervisores || [];
  if (!sup.length) return '';

  const conJornada = sup.filter(x => x.dias_calculables > 0);
  const soloSinAsignar = sup.length === 1 && sup[0].departamento === 'Sin asignar';

  if (soloSinAsignar) return `
    <div class="card" style="padding:14px 18px">
      <p class="sub" style="margin:0">Los datos cargados no traen el supervisor
        (columna <strong>Department</strong> del huellero). Cuando el archivo la
        incluya, aquí aparecerá la comparación entre equipos.</p>
    </div>`;

  return `
    <div class="card">
      <h3>Jornada promedio por supervisor</h3>
      <p class="sub">Compara los equipos. Cada barra es la duración promedio de
        las jornadas del personal a cargo de ese supervisor.</p>
      ${barras(conJornada.map(x => ({
        etiqueta: x.departamento, valor: x.horas_promedio, extra: x.duracion })), ' h')}
      <div class="twrap" style="max-height:none;margin-top:18px">
        <table class="ft">
          <thead><tr><th>Supervisor</th><th class="num">Trabajadores</th>
            <th class="num">Entrada prom.</th><th class="num">Salida prom.</th>
            <th class="num">Jornada prom.</th><th class="num">Horas totales</th>
            <th class="num">Registros</th><th class="num">Revisar</th></tr></thead>
          <tbody>${sup.map(x => `<tr>
            <td class="ln">${esc(x.departamento)}</td>
            <td class="num">${n0(x.trabajadores)}</td>
            <td class="num">${x.entrada || '—'}</td>
            <td class="num">${x.salida || '—'}</td>
            <td class="num">${x.duracion || '—'}</td>
            <td class="num">${x.horas_total ? n2(x.horas_total, 1) : '—'}</td>
            <td class="num">${n0(x.dias_registrados)}</td>
            <td class="num">${x.dias_incompletos
              ? `<span class="sem sem-bajo">${x.dias_incompletos}</span>` : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    ${conJornada.length > 1 ? `
    <div class="grid2">
      <div class="card">
        <h3>Supervisores · mayor jornada</h3>
        <p class="sub">Equipos con las jornadas promedio más largas.</p>
        ${tablaSupervisor(d.supervisores_mayor)}
      </div>
      <div class="card">
        <h3>Supervisores · menor jornada</h3>
        <p class="sub">Equipos con las jornadas promedio más cortas.</p>
        ${tablaSupervisor(d.supervisores_menor)}
      </div>
    </div>` : ''}`;
}

function tablaSupervisor(lista) {
  if (!lista || !lista.length)
    return `<p style="color:var(--ink-soft);font-size:13px">Sin datos.</p>`;
  return `<div class="twrap" style="max-height:330px">
      <table class="ft">
        <thead><tr><th>Supervisor</th><th class="num">Jornada</th>
          <th class="num">Trabajadores</th></tr></thead>
        <tbody>${lista.map(x => `<tr>
          <td class="ln">${esc(x.departamento)}</td>
          <td class="num">${x.duracion || '—'}</td>
          <td class="num">${n0(x.trabajadores)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function tablaRanking(lista, campo = 'duracion') {
  if (!lista || !lista.length)
    return `<p style="color:var(--ink-soft);font-size:13px">Sin datos.</p>`;
  return `<div class="twrap" style="max-height:330px">
      <table class="ft">
        <thead><tr><th>Nombre</th>
          <th class="num">${campo === 'entrada' ? 'Entrada' : 'Jornada'}</th>
          <th class="num">Días</th></tr></thead>
        <tbody>${lista.map(x => `<tr>
          <td class="ln">${esc(x.nombre)}</td>
          <td class="num">${(campo === 'entrada' ? x.entrada : x.duracion) || '—'}</td>
          <td class="num">${n0(x.dias_calculables)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function tablaDias(lista) {
  if (!lista || !lista.length)
    return `<p style="color:var(--ink-soft);font-size:13px">Sin datos.</p>`;
  return `<div class="twrap" style="max-height:330px">
      <table class="ft">
        <thead><tr><th>Fecha</th><th class="num">Jornada prom.</th>
          <th class="num">Trabajadores</th></tr></thead>
        <tbody>${lista.map(x => `<tr>
          <td class="ln">${esc(x.fecha)}</td>
          <td class="num">${x.duracion || '—'}</td>
          <td class="num">${n0(x.trabajadores)}</td>
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
//  DÍAS A REVISAR
// ============================================================
function vistaRevisar(c) {
  const d = S.datos;
  const lista = d.revisar || [];

  if (!lista.length) {
    c.innerHTML = `<div class="vacio"><h3>Nada que revisar</h3>
      <p>Todos los días del período tienen entrada y salida bien marcadas.</p></div>`;
    return;
  }

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Registros a revisar</div>
        <div class="v" style="color:var(--danger)">${n0(d.total_revisar)}</div>
        <div class="s">${esc(periodoTexto())}</div></div>
      <div class="kpi"><div class="l">Con jornada calculable</div>
        <div class="v">${n0(d.total.dias_calculables)}</div></div>
      <div class="kpi"><div class="l">Total de registros</div>
        <div class="v">${n0(d.total.dias_registrados)}</div>
        <div class="s">trabajador × día</div></div>
    </div>

    <div class="card" style="padding:14px 18px">
      <p class="sub" style="margin:0">Días sin jornada calculable: falta la entrada
        o la salida, o las dos marcas quedaron a menos de 30 minutos (suele ser
        alguien que marcó dos veces al entrar). No entran en los promedios.</p>
    </div>

    <div class="card">
      <h3>Detalle</h3>
      <p class="sub">${lista.length < d.total_revisar
        ? `Mostrando los primeros ${lista.length} de ${d.total_revisar}. Filtra por mes o trabajador para acotar.`
        : 'Ordenados por fecha.'}</p>
      <div class="twrap">
        <table class="ft">
          <thead><tr><th>Fecha</th><th class="num">Código</th><th>Nombre</th>
            <th>Supervisor</th>
            <th class="num">Entrada</th><th class="num">Salida</th>
            <th class="num">Marcas</th><th>Motivo</th></tr></thead>
          <tbody>${lista.map(x => `<tr>
            <td>${esc(x.fecha)}</td>
            <td class="num">${esc(x.codigo)}</td>
            <td class="ln">${esc(x.nombre)}</td>
            <td>${esc(x.departamento || '—')}</td>
            <td class="num">${x.entrada || '—'}</td>
            <td class="num">${x.salida || '—'}</td>
            <td class="num">${x.n_marcas}</td>
            <td><span class="sem sem-bajo">${esc(x.motivo)}</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
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
      S.empresaId = eid; S.zonaId = String(zid);
      S.anio = String(anio); S.mes = String(mes); S.dia = '';
      $('#aEm').value = eid;
    } catch (e) {
      m.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Cargar a la base de datos';
    }
  };
}
