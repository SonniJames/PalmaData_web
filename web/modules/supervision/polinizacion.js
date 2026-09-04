// ============================================================
// PalmaData · Supervisión · Polinización
//
// Solo consulta y descarga. La tabla que se ve es la que se baja.
//
// Lo central: al lado de lo que encontró el supervisor va lo que reportó
// la trabajadora, y la diferencia. «Sin comparar» NO es un incumplimiento:
// es que no se pudo emparejar su registro, y el motivo se muestra.
// ============================================================
import { API } from './api_poli.js';

const S = {
  fechaDesde: '', fechaHasta: '',
  actualizaDesde: '', actualizaHasta: '',
  catLoteId: '', supervisor: '', polinizador: '', cumple: '',
  hoja: false, espataSin: false, cobertura: false,
  espataAbierta: false, espataParcial: false,
  catalogos: null, datos: null,
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const n1 = v => (v == null || isNaN(v)) ? '—'
  : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 });
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoy = () => new Date().toISOString().slice(0, 10);
// Vacío cuando no hay comparación: un 0 diría "coincidió".
const num = v => (v == null) ? '' : n0(v);

// La diferencia se pinta: cero es correcto, distinto de cero llama la atención.
function dif(v) {
  if (v == null) return '<span style="color:var(--ink-soft)">—</span>';
  if (v === 0) return '0';
  const signo = v > 0 ? '+' : '';
  return `<strong style="color:var(--danger)">${signo}${v}</strong>`;
}

function veredicto(v) {
  if (v === 'Sí') return '<span class="sem sem-optimo" style="min-width:auto">Sí</span>';
  if (v === 'No') return '<span class="sem sem-deficiente" style="min-width:auto">No</span>';
  return '<span class="sem" style="min-width:auto;background:#e8e6e1;color:#6b6560">Sin comparar</span>';
}

const filtros = () => ({
  fechaDesde: S.fechaDesde, fechaHasta: S.fechaHasta,
  actualizaDesde: S.actualizaDesde, actualizaHasta: S.actualizaHasta,
  catLoteId: S.catLoteId, supervisor: S.supervisor,
  polinizador: S.polinizador, cumple: S.cumple,
  hoja: S.hoja, espataSin: S.espataSin, cobertura: S.cobertura,
  espataAbierta: S.espataAbierta, espataParcial: S.espataParcial,
});

const hayFecha = () => !!(S.fechaDesde || S.fechaHasta
  || S.actualizaDesde || S.actualizaHasta);

// ============================================================
export async function montar(cont) {
  cont.innerHTML = `<div class="cargando">Cargando…</div>`;
  try {
    S.catalogos = await API.catalogos();
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  if (!hayFecha()) {
    const f = (S.catalogos.fechas || [])[0];
    const ref = f ? f.fecha : hoy();
    S.fechaDesde = ref.slice(0, 8) + '01';
    S.fechaHasta = ref;
  }
  esqueleto(cont);
  await cargar();
}

function opciones(lista, valor, claveId, claveNombre) {
  return lista.map(x => {
    const id = x[claveId];
    const nom = x[claveNombre] || `Sin nombre (${id})`;
    return `<option value="${id}" ${String(valor) === String(id) ? 'selected' : ''}>${esc(nom)} · ${n0(x.registros)}</option>`;
  }).join('');
}

function casilla(id, etiqueta, marcado) {
  return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
    <input type="checkbox" id="${id}" ${marcado ? 'checked' : ''}> ${etiqueta}</label>`;
}

function esqueleto(cont) {
  const p = S.catalogos.personas || {};
  const estilo = 'padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px;max-width:200px';
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="qFd">Fecha evento · desde</label>
        <input type="date" id="qFd" value="${S.fechaDesde}"></div>
      <div class="g"><label for="qFh">hasta</label>
        <input type="date" id="qFh" value="${S.fechaHasta}"></div>
      <div class="g"><label for="qAd">Actualización · desde</label>
        <input type="date" id="qAd" value="${S.actualizaDesde}"></div>
      <div class="g"><label for="qAh">hasta</label>
        <input type="date" id="qAh" value="${S.actualizaHasta}"></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="qLimpiar">Limpiar</button>
    </div>

    <div class="fbar" style="margin-top:-8px">
      <div class="g"><label for="qLo">Lote</label>
        <select id="qLo" style="${estilo}"><option value="">Todos</option>
          ${opciones(S.catalogos.lotes || [], S.catLoteId, 'cat_lote_id', 'nombre')}</select></div>
      <div class="g"><label for="qPol">Trabajador</label>
        <select id="qPol" style="${estilo}"><option value="">Todos</option>
          ${opciones(p.polinizador || [], S.polinizador, 'codigo', 'nombre')}</select></div>
      <div class="g"><label for="qSup">Supervisor</label>
        <select id="qSup" style="${estilo}"><option value="">Todos</option>
          ${opciones(p.supervisor || [], S.supervisor, 'codigo', 'nombre')}</select></div>
      <div class="g"><label for="qCum">Cumple</label>
        <select id="qCum" style="${estilo}"><option value="">Todos</option>
          ${(S.catalogos.cumple || []).map(x =>
            `<option value="${esc(x)}" ${S.cumple === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="sp"></div>
      <a class="btn btn-primary" id="qExcel" href="#" download>Descargar Excel</a>
    </div>

    <div class="fbar" style="margin-top:-8px">
      <strong style="font-size:13px;color:var(--ink-soft)">Mostrar solo donde hubo:</strong>
      ${casilla('qHoja', 'Hoja sin marcar', S.hoja)}
      ${casilla('qEspSin', 'Espata sin abrir', S.espataSin)}
      ${casilla('qCob', 'Mala cobertura', S.cobertura)}
      ${casilla('qEspAb', 'Espata abierta', S.espataAbierta)}
      ${casilla('qEspPar', 'Espata parcial', S.espataParcial)}
    </div>

    <div id="qC"></div>`;

  const rec = () => {
    S.fechaDesde = $('#qFd').value; S.fechaHasta = $('#qFh').value;
    S.actualizaDesde = $('#qAd').value; S.actualizaHasta = $('#qAh').value;
    S.catLoteId = $('#qLo').value; S.polinizador = $('#qPol').value;
    S.supervisor = $('#qSup').value; S.cumple = $('#qCum').value;
    S.hoja = $('#qHoja').checked; S.espataSin = $('#qEspSin').checked;
    S.cobertura = $('#qCob').checked; S.espataAbierta = $('#qEspAb').checked;
    S.espataParcial = $('#qEspPar').checked;
    cargar();
  };
  ['#qFd', '#qFh', '#qAd', '#qAh', '#qLo', '#qPol', '#qSup', '#qCum',
   '#qHoja', '#qEspSin', '#qCob', '#qEspAb', '#qEspPar']
    .forEach(s => { $(s).onchange = rec; });

  $('#qLimpiar').onclick = () => {
    S.fechaDesde = S.fechaHasta = S.actualizaDesde = S.actualizaHasta = '';
    S.catLoteId = S.supervisor = S.polinizador = S.cumple = '';
    S.hoja = S.espataSin = S.cobertura = S.espataAbierta = S.espataParcial = false;
    ['#qFd', '#qFh', '#qAd', '#qAh'].forEach(s => { $(s).value = ''; });
    ['#qLo', '#qPol', '#qSup', '#qCum'].forEach(s => { $(s).value = ''; });
    ['#qHoja', '#qEspSin', '#qCob', '#qEspAb', '#qEspPar']
      .forEach(s => { $(s).checked = false; });
    cargar();
  };
}

function periodoTexto() {
  if (S.fechaDesde || S.fechaHasta)
    return `Del ${S.fechaDesde || '…'} al ${S.fechaHasta || '…'}`;
  if (S.actualizaDesde === S.actualizaHasta && S.actualizaDesde)
    return `Descargado el ${S.actualizaDesde}`;
  return `Descargado del ${S.actualizaDesde || '…'} al ${S.actualizaHasta || '…'}`;
}

async function cargar() {
  const c = $('#qC');
  if (!c) return;
  $('#qExcel').href = API.urlExcel(filtros());

  if (!hayFecha()) {
    c.innerHTML = `<div class="vacio"><h3>Selecciona un rango de fechas</h3>
      <p>Puedes filtrar por <strong>fecha del evento</strong> —cuándo el
         supervisor hizo la revisión— o por <strong>fecha de
         actualización</strong>, el día en que los registros bajaron del
         celular.</p>
      <p>Para un consolidado mensual, pon el primero y el último día del mes.</p></div>`;
    return;
  }

  c.innerHTML = `<div class="cargando">Cargando registros…</div>`;
  try {
    S.datos = await API.listar(filtros());
    vista(c);
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }
}

function vista(c) {
  const d = S.datos, r = d.resumen || {};
  const vacio = !d.registros.length;

  const tarjetas = [
    ['Registros', n0(r.registros), esc(periodoTexto())],
    ['Cumple', n0(r.cumple_si), r.pct_cumple != null ? `${n1(r.pct_cumple)}% de lo comparable` : ''],
    ['No cumple', n0(r.cumple_no)],
    ['Sin comparar', n0(r.sin_comparar), 'no es incumplimiento'],
    ['Hoja sin marcar', n1(r.hoja_sin_marcar)],
    ['Espata sin abrir', n1(r.espata_sin_abrir)],
    ['Mala cobertura', n1(r.mala_cobertura)],
    ['Espata abierta', n1(r.espata_abierta)],
    ['Espata parcial', n1(r.espata_parcial)],
  ];

  c.innerHTML = `
    ${vacio ? '' : `<div class="kpis">
      ${tarjetas.map(([l, v, s]) => `<div class="kpi">
        <div class="l">${l}</div><div class="v">${v}</div>
        ${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}
    </div>`}

    <div class="msg msg-ok" style="background:var(--paper)">
      <strong>Cómo leer la tabla.</strong> <em>Reportada</em> es lo que registró
      la trabajadora; <em>encontrada</em>, lo que halló el supervisor; la
      <em>diferencia</em> es encontrada menos reportada, así que un valor
      negativo significa que ella reportó más de lo que había.
      <strong>«Sin comparar» no es un incumplimiento</strong>: es que no se pudo
      emparejar su registro, y el motivo aparece en su columna.
    </div>

    ${d.truncado ? `<div class="msg msg-warn">Se muestran los primeros
      ${n0(d.limite)} registros. El Excel sí trae todos los del período
      (hasta 50.000); para ver menos en pantalla, acota las fechas.</div>` : ''}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  gap:14px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h3 style="margin:0">Supervisión de polinización</h3>
          <p class="sub" style="margin:6px 0 0">Esta es la misma tabla que se
            descarga en Excel.</p>
        </div>
        <strong style="font-size:14px;color:var(--ink-soft)">${n0(d.total)} registros</strong>
      </div>

      ${vacio ? `<div class="vacio" style="padding:36px 20px">
        <h3>Sin registros</h3>
        <p>${esc(periodoTexto())} con los filtros aplicados. Prueba con otro
           rango o quita algún filtro.</p></div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th>Fecha</th><th>Lote</th>
            <th class="num">Línea</th><th class="num">Palma</th>
            <th>Polinizador</th><th>Supervisor</th>
            <th class="num">Rep. 1</th><th class="num">Enc. 1</th><th class="num">Dif. 1</th>
            <th class="num">Rep. 2</th><th class="num">Enc. 2</th><th class="num">Dif. 2</th>
            <th class="num">Rep. 3</th><th class="num">Enc. 3</th><th class="num">Dif. 3</th>
            <th>Cumple</th><th>Origen</th>
            <th class="num">Hoja sin marcar</th><th class="num">Espata sin abrir</th>
            <th class="num">Mala cobertura</th><th class="num">Espata abierta</th>
            <th class="num">Espata parcial</th><th>Observaciones</th>
          </tr></thead>
          <tbody>${d.registros.map(x => `<tr>
            <td>${esc(x.fecha)}</td>
            <td class="ln">${esc(x.lote ?? '—')}</td>
            <td class="num">${x.linea ?? '—'}</td>
            <td class="num">${x.palma ?? '—'}</td>
            <td>${esc(x.polinizador ?? '—')}</td>
            <td>${esc(x.supervisor ?? '—')}</td>
            <td class="num">${num(x.reportada_ap1)}</td>
            <td class="num">${n0(x.encontrada_ap1)}</td>
            <td class="num">${dif(x.diferencia_ap1)}</td>
            <td class="num">${num(x.reportada_ap2)}</td>
            <td class="num">${n0(x.encontrada_ap2)}</td>
            <td class="num">${dif(x.diferencia_ap2)}</td>
            <td class="num">${num(x.reportada_ap3)}</td>
            <td class="num">${n0(x.encontrada_ap3)}</td>
            <td class="num">${dif(x.diferencia_ap3)}</td>
            <td>${veredicto(x.cumple)}</td>
            <td style="font-size:12.5px" title="${esc(x.motivo_sin_comparar ?? '')}">
              ${esc(x.origen_comparacion ?? '—')}${x.motivo_sin_comparar
                ? `<br><span style="color:var(--ink-soft)">${esc(x.motivo_sin_comparar)}</span>` : ''}</td>
            <td class="num">${n1(x.hoja_sin_marcar)}</td>
            <td class="num">${n1(x.espata_sin_abrir)}</td>
            <td class="num">${n1(x.mala_cobertura_aplicacion)}</td>
            <td class="num">${n1(x.espata_abierta)}</td>
            <td class="num">${n1(x.espata_parcial)}</td>
            <td style="max-width:200px">${esc(x.observaciones ?? '')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`}
    </div>`;
}
