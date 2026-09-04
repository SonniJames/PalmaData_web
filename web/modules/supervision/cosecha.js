// ============================================================
// PalmaData · Supervisión · Cosecha lote
//
// Solo consulta y descarga: la tabla que se ve es exactamente la que se
// baja en Excel. Sin corrección, sin anulación, sin erróneos.
//
// Los filtros de cortador, recolector y alistador traen los registros
// donde esa persona aparece, sola o acompañada: en la tabla esas columnas
// guardan varios códigos separados por coma.
// ============================================================
import { API } from './api_cosecha.js';

const S = {
  fechaDesde: '', fechaHasta: '',
  actualizaDesde: '', actualizaHasta: '',
  catLoteId: '', supervisor: '', cortador: '', recolector: '', alistador: '',
  catalogos: null, datos: null,
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const n1 = v => (v == null || isNaN(v)) ? '—'
  : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 });
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoy = () => new Date().toISOString().slice(0, 10);
const hora = h => h ? String(h).slice(0, 5) : '—';

const filtros = () => ({
  fechaDesde: S.fechaDesde, fechaHasta: S.fechaHasta,
  actualizaDesde: S.actualizaDesde, actualizaHasta: S.actualizaHasta,
  catLoteId: S.catLoteId, supervisor: S.supervisor,
  cortador: S.cortador, recolector: S.recolector, alistador: S.alistador,
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
  // Por defecto, el mes en curso: este apartado se usa para consolidados
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

function esqueleto(cont) {
  const p = S.catalogos.personas || {};
  const estilo = 'padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px;max-width:200px';
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="cFd">Fecha evento · desde</label>
        <input type="date" id="cFd" value="${S.fechaDesde}"></div>
      <div class="g"><label for="cFh">hasta</label>
        <input type="date" id="cFh" value="${S.fechaHasta}"></div>
      <div class="g"><label for="cAd">Actualización · desde</label>
        <input type="date" id="cAd" value="${S.actualizaDesde}"></div>
      <div class="g"><label for="cAh">hasta</label>
        <input type="date" id="cAh" value="${S.actualizaHasta}"></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="cLimpiar">Limpiar</button>
    </div>

    <div class="fbar" style="margin-top:-8px">
      <div class="g"><label for="cLo">Lote</label>
        <select id="cLo" style="${estilo}"><option value="">Todos</option>
          ${opciones(S.catalogos.lotes || [], S.catLoteId, 'cat_lote_id', 'nombre')}</select></div>
      <div class="g"><label for="cSup">Supervisor</label>
        <select id="cSup" style="${estilo}"><option value="">Todos</option>
          ${opciones(p.supervisor || [], S.supervisor, 'codigo', 'nombre')}</select></div>
      <div class="g"><label for="cCor">Cortador</label>
        <select id="cCor" style="${estilo}"><option value="">Todos</option>
          ${opciones(p.cortador || [], S.cortador, 'codigo', 'nombre')}</select></div>
      <div class="g"><label for="cRec">Recolector</label>
        <select id="cRec" style="${estilo}"><option value="">Todos</option>
          ${opciones(p.recolector || [], S.recolector, 'codigo', 'nombre')}</select></div>
      <div class="g"><label for="cAli">Alistador</label>
        <select id="cAli" style="${estilo}"><option value="">Todos</option>
          ${opciones(p.alistador || [], S.alistador, 'codigo', 'nombre')}</select></div>
      <div class="sp"></div>
      <a class="btn btn-primary" id="cExcel" href="#" download>Descargar Excel</a>
    </div>

    <div id="cC"></div>`;

  const rec = () => {
    S.fechaDesde = $('#cFd').value; S.fechaHasta = $('#cFh').value;
    S.actualizaDesde = $('#cAd').value; S.actualizaHasta = $('#cAh').value;
    S.catLoteId = $('#cLo').value; S.supervisor = $('#cSup').value;
    S.cortador = $('#cCor').value; S.recolector = $('#cRec').value;
    S.alistador = $('#cAli').value;
    cargar();
  };
  ['#cFd', '#cFh', '#cAd', '#cAh', '#cLo', '#cSup', '#cCor', '#cRec', '#cAli']
    .forEach(s => { $(s).onchange = rec; });

  $('#cLimpiar').onclick = () => {
    S.fechaDesde = S.fechaHasta = S.actualizaDesde = S.actualizaHasta = '';
    S.catLoteId = S.supervisor = S.cortador = S.recolector = S.alistador = '';
    ['#cFd', '#cFh', '#cAd', '#cAh'].forEach(s => { $(s).value = ''; });
    ['#cLo', '#cSup', '#cCor', '#cRec', '#cAli'].forEach(s => { $(s).value = ''; });
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
  const c = $('#cC');
  if (!c) return;
  $('#cExcel').href = API.urlExcel(filtros());

  if (!hayFecha()) {
    c.innerHTML = `<div class="vacio"><h3>Selecciona un rango de fechas</h3>
      <p>Puedes filtrar por <strong>fecha del evento</strong> —cuándo se hizo la
         supervisión en campo— o por <strong>fecha de actualización</strong>, el
         día en que los registros bajaron del celular.</p>
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

  // Tarjetas: el ciclo es promedio, el resto sumas del período filtrado
  const tarjetas = [
    ['Registros', n0(r.registros), esc(periodoTexto())],
    ['Ciclo promedio', n1(r.ciclo_promedio), 'días'],
    ['Racimos sin recoger', n0(r.racimos_sin_recoger)],
    ['Racimos sin cortar', n0(r.racimos_sin_cortar)],
    ['Racimo robado', n0(r.racimo_robado)],
    ['Hojas mal acomodadas', n0(r.hojas_mal_acomodadas)],
    ['Hoja colgando', n0(r.hoja_colgando)],
    ['Fruto plato', n0(r.fruto_plato)],
    ['Racimos recogidos', n0(r.racimos_recogidos)],
    ['Racimos verdes', n0(r.racimos_verdes)],
    ['Racimos sobremaduros', n0(r.racimos_sobremaduros)],
    ['Racimos podridos', n0(r.racimos_podridos)],
  ];

  c.innerHTML = `
    ${vacio ? '' : `<div class="kpis">
      ${tarjetas.map(([l, v, s]) => `<div class="kpi">
        <div class="l">${l}</div><div class="v">${v}</div>
        ${s ? `<div class="s">${s}</div>` : ''}</div>`).join('')}
    </div>`}

    ${d.truncado ? `<div class="msg msg-warn">Se muestran los primeros
      ${n0(d.limite)} registros. El Excel sí trae todos los del período
      (hasta 50.000); para ver menos en pantalla, acota las fechas.</div>` : ''}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  gap:14px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h3 style="margin:0">Supervisión de cosecha por lote</h3>
          <p class="sub" style="margin:6px 0 0">Esta es la misma tabla que se
            descarga en Excel. Los filtros de cortador, recolector y alistador
            traen los registros donde la persona aparece, sola o acompañada.</p>
        </div>
        <strong style="font-size:14px;color:var(--ink-soft)">${n0(d.total)} registros</strong>
      </div>

      ${vacio ? `<div class="vacio" style="padding:36px 20px">
        <h3>Sin registros</h3>
        <p>${esc(periodoTexto())} con los filtros aplicados. Prueba con otro
           rango o quita algún filtro.</p></div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr>${d.columnas.map(x => `<th${
            ['LINEA','PALMA','CICLO'].includes(x) || x.startsWith('RACIMO') || x.startsWith('HOJA') || x === 'FRUTO PLATO'
              ? ' class="num"' : ''}>${esc(x)}</th>`).join('')}</tr></thead>
          <tbody>${d.registros.map(x => `<tr>
            <td>${esc(x.fecha)}</td>
            <td>${hora(x.hora)}</td>
            <td>${esc(x.supervisor ?? '—')}</td>
            <td>${esc(x.cortador ?? '—')}</td>
            <td>${esc(x.recolector ?? '—')}</td>
            <td>${esc(x.alistador ?? '—')}</td>
            <td class="num">${x.linea ?? '—'}</td>
            <td class="num">${x.palma ?? '—'}</td>
            <td class="ln">${esc(x.lote ?? '—')}</td>
            <td class="num">${x.ciclo ?? '—'}</td>
            <td class="num">${n0(x.racimos_sin_recoger)}</td>
            <td class="num">${n0(x.racimos_sin_cortar)}</td>
            <td class="num">${n0(x.racimo_robado)}</td>
            <td class="num">${n0(x.hojas_mal_acomodadas)}</td>
            <td class="num">${n0(x.hoja_colgando)}</td>
            <td class="num">${n0(x.fruto_plato)}</td>
            <td style="max-width:220px">${esc(x.observaciones ?? '')}</td>
            <td class="num">${n0(x.racimos_recogidos)}</td>
            <td class="num">${n0(x.racimos_verdes)}</td>
            <td class="num">${n0(x.racimos_sobremaduros)}</td>
            <td class="num">${n0(x.racimos_podridos)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`}
    </div>`;
}
