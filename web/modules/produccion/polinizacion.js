// ============================================================
// PalmaData · Producción · Polinización
//
// Dos pantallas sobre plantacion.propolinizacion:
//   Revisión   -> el informe AGRUPADO por polinizador + fecha
//                 (solo lectura: aquí no se edita nada)
//   Descargas  -> el detalle registro a registro, con erróneos,
//                 corrección, anulación y la descarga del consolidado
//
// Diferencias con censo/tratamientos: sin filtro de lote (los lotes se
// ven agrupados por trabajador), sin duplicados, y la edición vive en
// descargas porque el informe agrupado no tiene registros que marcar.
// ============================================================
import { API } from './api_poli.js';

const S = {
  fechaDesde: '', fechaHasta: '',
  actualizaDesde: '', actualizaHasta: '',
  evaluador: '',
  verAnulados: false, soloErroneos: false,
  seleccion: new Set(),
  catalogos: null, datos: null,
  tab: 'revision',
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
  evaluador: S.evaluador,
  verAnulados: S.verAnulados, soloErroneos: S.soloErroneos,
});

const hayFecha = () => !!(S.fechaDesde || S.fechaHasta
  || S.actualizaDesde || S.actualizaHasta);

function nombreEvaluador() {
  if (!S.evaluador || !S.catalogos) return '';
  const x = (S.catalogos.evaluadores || [])
    .find(e => String(e.evaluador_codigo) === String(S.evaluador));
  return x ? (x.nombre || `Sin nombre (${x.evaluador_codigo})`) : '';
}

// ============================================================
export async function montar(cont, sub = 'revision') {
  S.tab = sub || 'revision';
  cont.innerHTML = `<div class="cargando">Cargando…</div>`;
  try {
    S.catalogos = await API.catalogos();
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  // Por defecto, lo descargado el último día: es lo que hay que revisar
  if (!hayFecha()) {
    const ult = (S.catalogos.actualizaciones || [])[0];
    S.actualizaDesde = S.actualizaHasta = ult ? ult.fecha : hoy();
  }
  esqueleto(cont);
  await cargar();
}

function esqueleto(cont) {
  const ev = S.catalogos.evaluadores || [];
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="pFd">Fecha evento · desde</label>
        <input type="date" id="pFd" value="${S.fechaDesde}"></div>
      <div class="g"><label for="pFh">hasta</label>
        <input type="date" id="pFh" value="${S.fechaHasta}"></div>
      <div class="g"><label for="pAd">Actualización · desde</label>
        <input type="date" id="pAd" value="${S.actualizaDesde}"></div>
      <div class="g"><label for="pAh">hasta</label>
        <input type="date" id="pAh" value="${S.actualizaHasta}"></div>
      <div class="g"><label for="pEv">Trabajador</label>
        <input id="pEv" list="pEvList" placeholder="Buscar…" autocomplete="off"
               value="${esc(nombreEvaluador())}"
               style="min-width:180px;padding:8px 11px;border:1.5px solid var(--line);
                      border-radius:var(--radius-sm);font-size:14px">
        <datalist id="pEvList">${ev.map(x =>
          `<option value="${esc(x.nombre || `Sin nombre (${x.evaluador_codigo})`)}">${n0(x.lecturas)} registros</option>`).join('')}</datalist>
        <button class="btn btn-ghost" id="pEvX" style="padding:8px 11px" title="Limpiar">✕</button></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="pLimpiar">Limpiar</button>
      <button class="btn btn-ghost" id="pR">Actualizar</button>
    </div>
    <div class="ftabs">
      <button class="ftab" data-tab="revision">Revisión</button>
      <button class="ftab" data-tab="descargas">Descargas</button>
    </div>
    <div id="pC"></div>`;

  const rec = () => {
    S.fechaDesde = $('#pFd').value; S.fechaHasta = $('#pFh').value;
    S.actualizaDesde = $('#pAd').value; S.actualizaHasta = $('#pAh').value;
    S.seleccion.clear();
    cargar();
  };
  ['#pFd', '#pFh', '#pAd', '#pAh'].forEach(s => { $(s).onchange = rec; });

  // El trabajador se busca escribiendo: son muchos para un desplegable.
  let tempEv = null;
  const buscarEv = () => {
    const texto = $('#pEv').value.trim().toLowerCase();
    if (!texto) { S.evaluador = ''; cargar(); return; }
    const lista = S.catalogos.evaluadores || [];
    const exacto = lista.find(x => (x.nombre || '').toLowerCase() === texto);
    const parcial = lista.filter(x => (x.nombre || '').toLowerCase().includes(texto));
    const elegido = exacto || (parcial.length === 1 ? parcial[0] : null);
    if (elegido) {
      S.evaluador = elegido.evaluador_codigo;
      cargar();
    }
  };
  $('#pEv').oninput = () => { clearTimeout(tempEv); tempEv = setTimeout(buscarEv, 400); };
  $('#pEv').onchange = () => { clearTimeout(tempEv); buscarEv(); };
  $('#pEvX').onclick = () => { $('#pEv').value = ''; S.evaluador = ''; cargar(); };
  $('#pR').onclick = cargar;
  $('#pLimpiar').onclick = () => {
    S.fechaDesde = S.fechaHasta = S.actualizaDesde = S.actualizaHasta = '';
    S.evaluador = '';
    $('#pFd').value = ''; $('#pFh').value = '';
    $('#pAd').value = ''; $('#pAh').value = '';
    $('#pEv').value = '';
    cargar();
  };

  cont.querySelectorAll('.ftab').forEach(b =>
    b.onclick = () => { S.tab = b.dataset.tab; S.seleccion.clear(); cargar(); });
}

function periodoTexto() {
  if (S.fechaDesde || S.fechaHasta)
    return `Eventos del ${S.fechaDesde || '…'} al ${S.fechaHasta || '…'}`;
  if (S.actualizaDesde === S.actualizaHasta && S.actualizaDesde)
    return `Descargado el ${S.actualizaDesde}`;
  return `Descargado del ${S.actualizaDesde || '…'} al ${S.actualizaHasta || '…'}`;
}

function sinFecha(c, que) {
  c.innerHTML = `<div class="vacio"><h3>Selecciona un rango de fechas</h3>
    <p>Puedes filtrar por <strong>fecha del evento</strong> —cuándo se hizo la
       polinización en campo— o por <strong>fecha de actualización</strong>,
       que es el día en que los registros se descargaron del celular.</p>
    <p>Sin filtro la consulta recorrería toda la tabla de ${que}.</p></div>`;
}

async function cargar() {
  document.querySelectorAll('.ftab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === S.tab));
  const c = $('#pC');
  if (!c) return;
  if (!hayFecha()) return sinFecha(c, 'polinización');

  c.innerHTML = `<div class="cargando">Cargando registros…</div>`;
  try {
    if (S.tab === 'revision') {
      S.datos = await API.informe(filtros());
      vistaInforme(c);
    } else {
      S.datos = await API.detalle(filtros());
      vistaDescargas(c);
    }
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }
}

// ============================================================
//  REVISIÓN · el informe agrupado (solo lectura)
// ============================================================
function vistaInforme(c) {
  const d = S.datos;
  const filas = d.registros || [];

  // Totales del período para el pie de la tabla
  const tot = filas.reduce((a, x) => ({
    a1: a.a1 + (x.aplicacion1 || 0), a2: a.a2 + (x.aplicacion2 || 0),
    a3: a.a3 + (x.aplicacion3 || 0), inf: a.inf + (x.inflorescencias || 0),
    pal: a.pal + (x.palmas || 0), err: a.err + (x.erroneos || 0),
  }), { a1: 0, a2: 0, a3: 0, inf: 0, pal: 0, err: 0 });

  c.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  gap:14px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h3 style="margin:0">Informe de polinización</h3>
          <p class="sub" style="margin:6px 0 0">Una fila por polinizador y día:
            los lotes trabajados, las aplicaciones sumadas y las palmas
            visitadas (un registro por palma). ${esc(periodoTexto())}.
            <br>Para corregir, anular o ver las palmas inexistentes, ve a la
            pestaña <strong>Descargas</strong>.</p>
        </div>
      </div>

      ${!filas.length ? `<div class="vacio" style="padding:36px 20px">
        <h3>Sin registros</h3>
        <p>${esc(periodoTexto())}. Prueba con otro rango de fechas.</p></div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th>Polinizador</th><th>Fecha</th><th>Lote</th>
            <th class="num">Aplicación 1</th><th class="num">Aplicación 2</th>
            <th class="num">Aplicación 3</th>
            <th class="num">Total inflorescencias</th>
            <th class="num">N° Palmas</th>
          </tr></thead>
          <tbody>${filas.map(x => `<tr>
            <td class="ln">${esc(x.polinizador ?? `Sin nombre (${x.polinizador_codigo})`)}</td>
            <td>${esc(x.fecha)}</td>
            <td>${esc(x.lotes ?? '—')}</td>
            <td class="num">${n0(x.aplicacion1)}</td>
            <td class="num">${n0(x.aplicacion2)}</td>
            <td class="num">${n0(x.aplicacion3)}</td>
            <td class="num">${n0(x.inflorescencias)}</td>
            <td class="num">${n0(x.palmas)}${x.erroneos
              ? ` <span class="sem sem-deficiente" style="min-width:auto"
                    title="${x.erroneos} con palma inexistente: corrígelas en Descargas">!${x.erroneos}</span>`
              : ''}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr>
            <td colspan="3">Total · ${filas.length} filas</td>
            <td class="num">${n0(tot.a1)}</td>
            <td class="num">${n0(tot.a2)}</td>
            <td class="num">${n0(tot.a3)}</td>
            <td class="num">${n0(tot.inf)}</td>
            <td class="num">${n0(tot.pal)}${tot.err
              ? ` <span class="sem sem-deficiente" style="min-width:auto">!${tot.err}</span>` : ''}</td>
          </tr></tfoot>
        </table>
      </div>`}
    </div>`;
}

// ============================================================
//  DESCARGAS · detalle, corrección y consolidado
// ============================================================
function vistaDescargas(c) {
  const d = S.datos, r = d.resumen || {};
  const fechas = S.catalogos.fechas || [];
  const acts = S.catalogos.actualizaciones || [];

  const vacio = !d.registros.length;
  const motivoVacio = S.soloErroneos
    ? `<h3>Ninguna palma inexistente</h3>
       <p>Todos los registros del período apuntan a palmas del catálogo.
          Desmarca <strong>Solo palmas inexistentes</strong> para ver el resto.</p>`
    : S.verAnulados
    ? `<h3>Ningún registro anulado</h3>
       <p>En este período no se ha anulado nada. Desmarca
          <strong>Solo anulados</strong> aquí arriba para ver los normales.</p>`
    : `<h3>Sin registros</h3>
       <p>${esc(periodoTexto())}. Prueba con otro rango de fechas.</p>`;

  c.innerHTML = `
    ${vacio ? '' : `<div class="kpis">
      <div class="kpi"><div class="l">Registros</div>
        <div class="v">${n0(r.registros)}</div>
        <div class="s">${esc(periodoTexto())}</div></div>
      <div class="kpi"><div class="l">Polinizadores</div><div class="v">${n0(r.polinizadores)}</div></div>
      <div class="kpi"><div class="l">Lotes</div><div class="v">${n0(r.lotes)}</div></div>
      <div class="kpi"><div class="l">Inflorescencias</div>
        <div class="v">${n0(r.inflorescencias)}</div>
        <div class="s">suma de lo vigente</div></div>
      ${r.erroneos ? `<div class="kpi"><div class="l">Con palma inexistente</div>
        <div class="v" style="color:var(--danger)">${n0(r.erroneos)}</div></div>` : ''}
      ${r.anulados ? `<div class="kpi"><div class="l">Anulados</div>
        <div class="v">${n0(r.anulados)}</div></div>` : ''}
    </div>`}

    ${S.verAnulados ? `<div class="msg msg-warn">Estás viendo <strong>solo los
      registros anulados</strong>. Puedes reactivarlos si alguno se descartó
      por error.</div>` : ''}

    ${S.soloErroneos && !vacio ? `<div class="msg msg-warn">Registros cuya
      <strong>palma no existe en el catálogo</strong>: casi siempre el lote,
      la línea o la palma quedaron mal anotados. Corrígelos y el indicador se
      recalcula solo.</div>` : ''}

    ${d.truncado ? `<div class="msg msg-warn">Se muestran los primeros
      ${n0(d.limite)} registros. Acota el rango de fechas para verlos todos.</div>` : ''}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  gap:14px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h3 style="margin:0">Detalle registro a registro</h3>
          <p class="sub" style="margin:6px 0 0">Selecciona uno para corregir todos
            sus campos, o varios para cambiarles el lote de una vez. La columna
            <strong>Corregido</strong> muestra quién tocó cada registro.</p>
        </div>
        <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="pErr" ${S.soloErroneos ? 'checked' : ''}>
            Solo palmas inexistentes</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="pAnu" ${S.verAnulados ? 'checked' : ''}>
            Solo anulados</label>
          <a class="btn btn-ghost" href="${API.urlDetalleExcel(filtros())}" download>Excel</a>
        </div>
      </div>

      <div class="fbar" id="pAcciones" style="margin-bottom:14px;display:none">
        <strong id="pSelN" style="font-size:14px"></strong>
        <div class="sp"></div>
        <button class="btn btn-primary" id="pEditar">Corregir</button>
        <button class="btn btn-ghost" id="pAnular">Anular</button>
        <button class="btn btn-ghost" id="pReactivar">Reactivar</button>
        <button class="btn btn-ghost" id="pQuitar">Quitar selección</button>
      </div>

      ${vacio ? `<div class="vacio" style="padding:36px 20px">${motivoVacio}</div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th style="width:34px"><input type="checkbox" id="pTodos" title="Seleccionar todo"></th>
            <th>Fecha</th><th class="num">Hora</th><th>Lote</th>
            <th class="num">Línea</th><th class="num">Palma</th>
            <th>Polinizador</th>
            <th class="num">Apl. 1</th><th class="num">Apl. 2</th>
            <th class="num">Apl. 3</th><th class="num">Total</th>
            <th>Observaciones</th><th>Corregido</th>
            <th class="num">ID único</th>
          </tr></thead>
          <tbody>${d.registros.map(x => `<tr data-id="${x.propolinizacionid}"
              ${x.anulado ? 'style="opacity:.5"' : ''}>
            <td><input type="checkbox" class="pSel" value="${x.propolinizacionid}"
                 ${S.seleccion.has(x.propolinizacionid) ? 'checked' : ''}></td>
            <td>${esc(x.fecha)}</td>
            <td class="num">${hora(x.hora)}</td>
            <td class="ln">${esc(x.lote ?? '—')}</td>
            <td class="num">${x.linea ?? '—'}</td>
            <td class="num">${x.palma ?? '—'}
              ${x.erroneo ? `<span class="sem sem-deficiente" title="La palma no existe en el catálogo">!</span>` : ''}</td>
            <td>${esc(x.trabajador ?? '—')}</td>
            <td class="num">${n0(x.aplicacion1)}</td>
            <td class="num">${n0(x.aplicacion2)}</td>
            <td class="num">${n0(x.aplicacion3)}</td>
            <td class="num">${n0(x.inflorescencias)}</td>
            <td style="max-width:200px">${esc(x.observaciones ?? '')}</td>
            <td style="font-size:12.5px">${x.corregido_por
              ? `<span class="sem sem-optimo" title="${esc(String(x.corregido_at ?? ''))}">${esc(x.corregido_por)}</span>`
              : (x.anulado_por
                  ? `<span class="sem sem-deficiente" title="${esc(x.anulado_motivo ?? '')}">anuló ${esc(x.anulado_por)}</span>`
                  : '—')}</td>
            <td class="num" style="font-size:12px">${esc(x.id_unico ?? '')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`}
    </div>

    <div class="card">
      <h3>Descargar el consolidado</h3>
      <p class="sub">Los registros con las correcciones ya aplicadas, sin los
        anulados. Usa los filtros de fecha de aquí arriba: por
        <strong>fecha del evento</strong> o por <strong>fecha de
        actualización</strong>.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="pVer">Ver antes de descargar</button>
        <a class="btn btn-primary" id="pExcel"
           href="${API.urlConsolidadoExcel(S.fechaDesde, S.fechaHasta,
                                           S.actualizaDesde, S.actualizaHasta)}"
           download>Descargar Excel</a>
      </div>
      <div id="pPrev" style="margin-top:14px"></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
    ${fechas.length ? `
    <div class="card">
      <h3>Días con polinización</h3>
      <p class="sub">Haz clic en una fecha para seleccionarla.</p>
      <div class="twrap" style="max-height:340px">
        <table class="ft">
          <thead><tr><th>Fecha</th><th class="num">Registros</th></tr></thead>
          <tbody>${fechas.map(f => `<tr class="pFecha" data-f="${f.fecha}"
              style="cursor:pointer">
            <td class="ln">${esc(f.fecha)}</td>
            <td class="num">${n0(f.registros)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : ''}
    ${acts.length ? `
    <div class="card">
      <h3>Días de actualización</h3>
      <p class="sub">Haz clic para filtrar por el día de descarga.</p>
      <div class="twrap" style="max-height:340px">
        <table class="ft">
          <thead><tr><th>Fecha</th><th class="num">Registros</th></tr></thead>
          <tbody>${acts.map(f => `<tr class="pAct" data-f="${f.fecha}"
              style="cursor:pointer">
            <td class="ln">${esc(f.fecha)}</td>
            <td class="num">${n0(f.registros)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : ''}
    </div>

    <div id="pModal"></div>`;

  $('#pAnu').onchange = e => {
    S.verAnulados = e.target.checked;
    if (e.target.checked) S.soloErroneos = false;   // son vistas distintas
    S.seleccion.clear();
    cargar();
  };
  $('#pErr').onchange = e => {
    S.soloErroneos = e.target.checked;
    if (e.target.checked) S.verAnulados = false;
    S.seleccion.clear();
    cargar();
  };

  // Con la tabla vacía estos elementos no existen, pero las casillas de
  // arriba sí: por eso cada acceso se protege en vez de salir antes.
  const refrescar = () => {
    const barra = $('#pAcciones');
    if (!barra) return;
    const n = S.seleccion.size;
    barra.style.display = n ? 'flex' : 'none';
    $('#pSelN').textContent = n === 1
      ? '1 registro seleccionado'
      : `${n} registros seleccionados`;
    $('#pEditar').textContent = n === 1 ? 'Corregir registro' : 'Corregir lote';
  };

  c.querySelectorAll('.pSel').forEach(chk => {
    chk.onchange = () => {
      const id = Number(chk.value);
      chk.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
      refrescar();
    };
  });

  const todos = $('#pTodos');
  if (todos) todos.onchange = e => {
    c.querySelectorAll('.pSel').forEach(chk => {
      chk.checked = e.target.checked;
      const id = Number(chk.value);
      e.target.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
    });
    refrescar();
  };

  const quitar = $('#pQuitar');
  if (quitar) quitar.onclick = () => {
    S.seleccion.clear();
    c.querySelectorAll('.pSel').forEach(chk => { chk.checked = false; });
    if (todos) todos.checked = false;
    refrescar();
  };

  const editar = $('#pEditar');
  if (editar) editar.onclick = () => abrirModal([...S.seleccion]);
  const anular = $('#pAnular');
  if (anular) anular.onclick = () => accion('anular');
  const react = $('#pReactivar');
  if (react) react.onclick = () => accion('reactivar');

  refrescar();

  // --- Descarga del consolidado ---
  c.querySelectorAll('.pFecha').forEach(tr => {
    tr.onclick = () => {
      S.fechaDesde = S.fechaHasta = tr.dataset.f;
      S.actualizaDesde = S.actualizaHasta = '';
      $('#pFd').value = tr.dataset.f; $('#pFh').value = tr.dataset.f;
      $('#pAd').value = ''; $('#pAh').value = '';
      S.seleccion.clear();
      cargar();
    };
  });
  c.querySelectorAll('.pAct').forEach(tr => {
    tr.onclick = () => {
      S.actualizaDesde = S.actualizaHasta = tr.dataset.f;
      S.fechaDesde = S.fechaHasta = '';
      $('#pAd').value = tr.dataset.f; $('#pAh').value = tr.dataset.f;
      $('#pFd').value = ''; $('#pFh').value = '';
      S.seleccion.clear();
      cargar();
    };
  });

  $('#pVer').onclick = async () => {
    const prev = $('#pPrev');
    prev.innerHTML = `<div class="cargando">Consultando…</div>`;
    try {
      const r = await API.consolidado(S.fechaDesde, S.fechaHasta,
                                      S.actualizaDesde, S.actualizaHasta);
      if (!r.total) {
        prev.innerHTML = `<div class="msg msg-warn">No hay registros para esas fechas.</div>`;
        return;
      }
      prev.innerHTML = `
        <div class="msg msg-ok" style="margin-bottom:14px">
          ${n0(r.total)} registros listos para descargar.
          ${r.total > 500 ? ' Se muestran los primeros 500.' : ''}
        </div>
        <div class="twrap">
          <table class="ft">
            <thead><tr>${r.columnas.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead>
            <tbody>${r.registros.map(x => `<tr>
              <td>${esc(x.fecha)}</td><td class="num">${hora(x.hora)}</td>
              <td>${esc(x.lote ?? '—')}</td>
              <td class="num">${x.linea ?? '—'}</td>
              <td class="num">${x.palma ?? '—'}</td>
              <td>${esc(x.polinizador ?? '—')}</td>
              <td class="num">${n0(x.aplicacion1)}</td>
              <td class="num">${n0(x.aplicacion2)}</td>
              <td class="num">${n0(x.aplicacion3)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
    } catch (e) {
      prev.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    }
  };
}

async function accion(tipo) {
  const ids = [...S.seleccion];
  if (!ids.length) return;

  let motivo = null;
  if (tipo === 'anular') {
    motivo = prompt(`Vas a anular ${ids.length} registro(s).\n\n` +
                    `Motivo (opcional):`, '');
    if (motivo === null) return;
  } else if (!confirm(`Vas a reactivar ${ids.length} registro(s). ¿Continuar?`)) {
    return;
  }

  try {
    await (tipo === 'anular' ? API.anular(ids, motivo) : API.reactivar(ids));
    S.seleccion.clear();
    await cargar();
  } catch (e) {
    alert(e.message);
  }
}

// ============================================================
//  VENTANA DE CORRECCIÓN
// ============================================================
async function abrirModal(ids) {
  if (!ids.length) return;
  const varios = ids.length > 1;
  const reg = varios ? null
    : (S.datos.registros.find(x => x.propolinizacionid === ids[0]) || {});

  const caja = $('#pModal');
  caja.innerHTML = `
    <div class="modal-fondo" id="pFondo">
      <div class="modal">
        <h3>${varios ? 'Ajuste para elección múltiple de registros'
                     : 'Ajuste para único registro'}</h3>
        <p class="sub">${varios
          ? `${ids.length} registros seleccionados. En una selección múltiple solo
             se puede cambiar el lote: la línea, la palma y las aplicaciones son
             propias de cada registro.`
          : `Lote ${esc(reg.lote ?? '—')} · línea ${reg.linea ?? '—'} ·
             palma ${reg.palma ?? '—'}. Deja en blanco lo que no quieras cambiar.`}</p>

        <div class="mcampo">
          <label for="mLote">Lote</label>
          <input id="mLote" list="mLoteList" autocomplete="off"
                 placeholder="Escribe el número o el nombre…">
          <datalist id="mLoteList"></datalist>
          <div class="ayuda" id="mLoteAyuda">Escribe <em>138</em> para encontrar
            <em>L138-C</em>. Hay unos 500 lotes.</div>
        </div>

        ${varios ? '' : `
        <div class="mcampo">
          <label for="mLinea">Línea</label>
          <input type="number" id="mLinea" placeholder="${reg.linea ?? ''}">
        </div>
        <div class="mcampo">
          <label for="mPalma">Palma</label>
          <input type="number" id="mPalma" placeholder="${reg.palma ?? ''}">
        </div>
        <div class="mcampo">
          <label for="mAp1">Aplicación 1</label>
          <input type="number" id="mAp1" min="0" placeholder="${reg.aplicacion1 ?? ''}">
        </div>
        <div class="mcampo">
          <label for="mAp2">Aplicación 2</label>
          <input type="number" id="mAp2" min="0" placeholder="${reg.aplicacion2 ?? ''}">
        </div>
        <div class="mcampo">
          <label for="mAp3">Aplicación 3</label>
          <input type="number" id="mAp3" min="0" placeholder="${reg.aplicacion3 ?? ''}">
        </div>
        <div class="mcampo">
          <label for="mObs">Observaciones</label>
          <input id="mObs" placeholder="${esc(reg.observaciones ?? '')}">
        </div>`}

        <div id="mMsg"></div>
        <div class="macciones">
          <button class="btn btn-ghost" id="mCancelar">Cancelar</button>
          <button class="btn btn-primary" id="mGuardar">Guardar cambios</button>
        </div>
      </div>
    </div>`;

  let loteId = null;
  let temp = null;
  const inputLote = $('#mLote');

  inputLote.oninput = async () => {
    clearTimeout(temp);
    loteId = null;
    const v = inputLote.value;
    if (!v.trim()) { $('#mLoteAyuda').textContent = ''; return; }
    temp = setTimeout(async () => {
      try {
        const r = await API.lotes(v);
        const lotes = r.lotes || [];
        $('#mLoteList').innerHTML = lotes.slice(0, 40)
          .map(l => `<option value="${esc(l.nombre)}"></option>`).join('');
        const exacto = lotes.find(l => l.nombre === v);
        if (exacto) {
          loteId = exacto.cat_lote_id;
          $('#mLoteAyuda').innerHTML =
            `<span style="color:var(--palm)">Lote «${esc(exacto.nombre)}» seleccionado.</span>`;
        } else {
          $('#mLoteAyuda').textContent = lotes.length
            ? `${lotes.length} coincidencias. Elige una de la lista.`
            : 'Ningún lote coincide.';
        }
      } catch { /* sin resultados */ }
    }, 300);
  };

  const cerrar = () => { caja.innerHTML = ''; };
  $('#mCancelar').onclick = cerrar;
  $('#pFondo').onclick = e => { if (e.target.id === 'pFondo') cerrar(); };

  $('#mGuardar').onclick = async () => {
    const btn = $('#mGuardar');
    const msg = $('#mMsg');

    if (inputLote.value.trim() && !loteId) {
      msg.innerHTML = `<div class="msg msg-err">Elige un lote de la lista:
        el nombre escrito no coincide con ninguno.</div>`;
      return;
    }
    if (varios && !loteId) {
      msg.innerHTML = `<div class="msg msg-err">Selecciona el lote correcto.</div>`;
      return;
    }

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (varios) {
        const r = await API.corregirLote(ids, loteId);
        msg.innerHTML = `<div class="msg msg-ok">${r.corregidos} registros corregidos.</div>`;
      } else {
        const campos = {};
        if (loteId) campos.cat_lote_id = loteId;
        const linea = $('#mLinea').value.trim();
        const palma = $('#mPalma').value.trim();
        const ap1 = $('#mAp1').value.trim();
        const ap2 = $('#mAp2').value.trim();
        const ap3 = $('#mAp3').value.trim();
        const obs = $('#mObs').value.trim();
        if (linea) campos.linea = Number(linea);
        if (palma) campos.palma = Number(palma);
        if (ap1) campos.aplicacion1 = Number(ap1);
        if (ap2) campos.aplicacion2 = Number(ap2);
        if (ap3) campos.aplicacion3 = Number(ap3);
        if (obs) campos.observaciones = obs;

        if (!Object.keys(campos).length) {
          msg.innerHTML = `<div class="msg msg-err">No cambiaste ningún campo.</div>`;
          btn.disabled = false; btn.textContent = 'Guardar cambios';
          return;
        }
        await API.corregir(ids[0], campos);
        msg.innerHTML = `<div class="msg msg-ok">Registro corregido.</div>`;
      }
      S.seleccion.clear();
      setTimeout(async () => { cerrar(); await cargar(); }, 900);
    } catch (e) {
      msg.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Guardar cambios';
    }
  };
}
