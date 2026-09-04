// ============================================================
// PalmaData · Supervisión · Cosecha vagón
//
// Solo consulta y descarga: la tabla que se ve es exactamente la que se
// baja en Excel. Sin corrección, sin anulación, sin erróneos.
//
// El filtro de trabajador trae los registros donde esa persona aparece,
// sola o acompañada: esa columna guarda varios códigos separados por coma.
// ============================================================
import { API } from './api_vagon.js';

const S = {
  fechaDesde: '', fechaHasta: '',
  actualizaDesde: '', actualizaHasta: '',
  catLoteId: '', supervisor: '', trabajador: '',
  catalogos: null, datos: null,
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoy = () => new Date().toISOString().slice(0, 10);
const hora = h => h ? String(h).slice(0, 5) : '—';

const filtros = () => ({
  fechaDesde: S.fechaDesde, fechaHasta: S.fechaHasta,
  actualizaDesde: S.actualizaDesde, actualizaHasta: S.actualizaHasta,
  catLoteId: S.catLoteId, supervisor: S.supervisor, trabajador: S.trabajador,
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
      <div class="g"><label for="vFd">Fecha evento · desde</label>
        <input type="date" id="vFd" value="${S.fechaDesde}"></div>
      <div class="g"><label for="vFh">hasta</label>
        <input type="date" id="vFh" value="${S.fechaHasta}"></div>
      <div class="g"><label for="vAd">Actualización · desde</label>
        <input type="date" id="vAd" value="${S.actualizaDesde}"></div>
      <div class="g"><label for="vAh">hasta</label>
        <input type="date" id="vAh" value="${S.actualizaHasta}"></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="vLimpiar">Limpiar</button>
    </div>

    <div class="fbar" style="margin-top:-8px">
      <div class="g"><label for="vLo">Lote</label>
        <select id="vLo" style="${estilo}"><option value="">Todos</option>
          ${opciones(S.catalogos.lotes || [], S.catLoteId, 'cat_lote_id', 'nombre')}</select></div>
      <div class="g"><label for="vSup">Supervisor</label>
        <select id="vSup" style="${estilo}"><option value="">Todos</option>
          ${opciones(p.supervisor || [], S.supervisor, 'codigo', 'nombre')}</select></div>
      <div class="g"><label for="vTra">Trabajador</label>
        <select id="vTra" style="${estilo}"><option value="">Todos</option>
          ${opciones(p.trabajador || [], S.trabajador, 'codigo', 'nombre')}</select></div>
      <div class="sp"></div>
      <a class="btn btn-primary" id="vExcel" href="#" download>Descargar Excel</a>
    </div>

    <div id="vC"></div>`;

  const rec = () => {
    S.fechaDesde = $('#vFd').value; S.fechaHasta = $('#vFh').value;
    S.actualizaDesde = $('#vAd').value; S.actualizaHasta = $('#vAh').value;
    S.catLoteId = $('#vLo').value; S.supervisor = $('#vSup').value;
    S.trabajador = $('#vTra').value;
    cargar();
  };
  ['#vFd', '#vFh', '#vAd', '#vAh', '#vLo', '#vSup', '#vTra']
    .forEach(s => { $(s).onchange = rec; });

  $('#vLimpiar').onclick = () => {
    S.fechaDesde = S.fechaHasta = S.actualizaDesde = S.actualizaHasta = '';
    S.catLoteId = S.supervisor = S.trabajador = '';
    ['#vFd', '#vFh', '#vAd', '#vAh'].forEach(s => { $(s).value = ''; });
    ['#vLo', '#vSup', '#vTra'].forEach(s => { $(s).value = ''; });
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
  const c = $('#vC');
  if (!c) return;
  $('#vExcel').href = API.urlExcel(filtros());

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

  // Racimos muestra no lleva tarjeta, pero sí va en la tabla y el Excel
  const tarjetas = [
    ['Registros', n0(r.registros), esc(periodoTexto())],
    ['Racimos verdes', n0(r.racimos_verdes)],
    ['Racimos sobremaduros', n0(r.racimos_sobremaduros)],
    ['Racimos podridos', n0(r.racimos_podridos)],
    ['Pedúnculo largo', n0(r.pedunculo_largo)],
    ['Racimos mal formados', n0(r.racimos_malformados)],
    ['Racimos enfermos', n0(r.racimos_enfermos)],
    ['Racimos eupalamides', n0(r.racimos_eupalamides)],
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
          <h3 style="margin:0">Supervisión de cosecha en vagón</h3>
          <p class="sub" style="margin:6px 0 0">Esta es la misma tabla que se
            descarga en Excel. El filtro de trabajador trae los registros donde
            la persona aparece, sola o acompañada.</p>
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
            x.startsWith('RACIMO') || x === 'PEDUNCULO LARGO' ? ' class="num"' : ''
          }>${esc(x)}</th>`).join('')}</tr></thead>
          <tbody>${d.registros.map(x => `<tr>
            <td>${esc(x.fecha)}</td>
            <td>${hora(x.hora)}</td>
            <td>${esc(x.supervisor ?? '—')}</td>
            <td class="ln">${esc(x.lote ?? '—')}</td>
            <td class="num">${n0(x.racimos_verdes)}</td>
            <td class="num">${n0(x.racimos_sobremaduros)}</td>
            <td class="num">${n0(x.racimos_podridos)}</td>
            <td class="num">${n0(x.pedunculo_largo)}</td>
            <td class="num">${n0(x.racimos_muestra)}</td>
            <td class="num">${n0(x.racimos_malformados)}</td>
            <td class="num">${n0(x.racimos_enfermos)}</td>
            <td class="num">${n0(x.racimos_eupalamides)}</td>
            <td style="max-width:220px">${esc(x.observaciones ?? '')}</td>
            <td>${esc(x.trabajador ?? '—')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`}
    </div>`;
}
