// ============================================================
// PalmaData · Sanidad · Trampas
//
// Sobre santrampalectura:
//   · sin erróneos ni duplicados
//   · filtros: fecha del evento, actualización, lote, trabajador y TRAMPA
//   · corrección SOLO unitaria: trampa (y con ella el lote), hembras,
//     machos, observaciones, cambio de feromona (si/no) y cambio de
//     atrayente (0/1). Lectura, fecha, hora, evaluador y sin lectura no
//     se editan. Anular/reactivar sí admite varios.
//   · descarga por cualquiera de las dos fechas, sin geom
// ============================================================
import { API } from './api_trampas.js';

const S = {
  fechaDesde: '', fechaHasta: '',
  actualizaDesde: '', actualizaHasta: '',
  catLoteId: '', evaluador: '', santrampaid: '',
  verAnulados: false,
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
const siNo = b => b === true ? 'Sí' : (b === false ? 'No' : '—');

const filtros = () => ({
  fechaDesde: S.fechaDesde, fechaHasta: S.fechaHasta,
  actualizaDesde: S.actualizaDesde, actualizaHasta: S.actualizaHasta,
  catLoteId: S.catLoteId, evaluador: S.evaluador, santrampaid: S.santrampaid,
  verAnulados: S.verAnulados,
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
  if (!hayFecha()) {
    const ult = (S.catalogos.actualizaciones || [])[0];
    S.actualizaDesde = S.actualizaHasta = ult ? ult.fecha : hoy();
  }
  esqueleto(cont);
  await cargar();
}

// Buscador con datalist contra el servidor (lotes y trampas usan el mismo).
function buscador(inputSel, listSel, fn, clave, campoNombre, alElegir) {
  let temp = null;
  $(inputSel).oninput = e => {
    clearTimeout(temp);
    const v = e.target.value;
    temp = setTimeout(async () => {
      if (!v.trim()) { alElegir(null); return; }
      try {
        const r = await fn(v);
        const lista = r[clave] || [];
        $(listSel).innerHTML = lista.slice(0, 40)
          .map(x => `<option value="${esc(x[campoNombre])}">${esc(x.lote && campoNombre !== 'nombre' ? x.lote : '')}</option>`).join('');
        const exacto = lista.find(x => x[campoNombre] === v);
        if (exacto) alElegir(exacto);
      } catch { /* sin resultados */ }
    }, 350);
  };
}

function esqueleto(cont) {
  const ev = S.catalogos.evaluadores || [];
  const estilo = 'padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px';
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="rFd">Fecha lectura · desde</label>
        <input type="date" id="rFd" value="${S.fechaDesde}"></div>
      <div class="g"><label for="rFh">hasta</label>
        <input type="date" id="rFh" value="${S.fechaHasta}"></div>
      <div class="g"><label for="rAd">Actualización · desde</label>
        <input type="date" id="rAd" value="${S.actualizaDesde}"></div>
      <div class="g"><label for="rAh">hasta</label>
        <input type="date" id="rAh" value="${S.actualizaHasta}"></div>
      <div class="g"><label for="rLo">Lote</label>
        <input id="rLo" list="rLoList" placeholder="Buscar…" autocomplete="off"
               style="min-width:140px;${estilo}">
        <datalist id="rLoList"></datalist></div>
      <div class="g"><label for="rTr">Trampa</label>
        <input id="rTr" list="rTrList" placeholder="Código…" autocomplete="off"
               style="min-width:140px;${estilo}">
        <datalist id="rTrList"></datalist></div>
      <div class="g"><label for="rEv">Trabajador</label>
        <input id="rEv" list="rEvList" placeholder="Buscar…" autocomplete="off"
               value="${esc(nombreEvaluador())}" style="min-width:180px;${estilo}">
        <datalist id="rEvList">${ev.map(x =>
          `<option value="${esc(x.nombre || `Sin nombre (${x.evaluador_codigo})`)}">${n0(x.lecturas)} lecturas</option>`).join('')}</datalist>
        <button class="btn btn-ghost" id="rEvX" style="padding:8px 11px" title="Limpiar">✕</button></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="rLimpiar">Limpiar</button>
      <button class="btn btn-ghost" id="rR">Actualizar</button>
    </div>
    <div class="ftabs">
      <button class="ftab" data-tab="revision">Revisión</button>
      <button class="ftab" data-tab="descargas">Descargas</button>
    </div>
    <div id="rC"></div>`;

  const rec = () => {
    S.fechaDesde = $('#rFd').value; S.fechaHasta = $('#rFh').value;
    S.actualizaDesde = $('#rAd').value; S.actualizaHasta = $('#rAh').value;
    S.seleccion.clear();
    cargar();
  };
  ['#rFd', '#rFh', '#rAd', '#rAh'].forEach(s => { $(s).onchange = rec; });

  let tempEv = null;
  const buscarEv = () => {
    const texto = $('#rEv').value.trim().toLowerCase();
    if (!texto) { S.evaluador = ''; cargar(); return; }
    const lista = S.catalogos.evaluadores || [];
    const exacto = lista.find(x => (x.nombre || '').toLowerCase() === texto);
    const parcial = lista.filter(x => (x.nombre || '').toLowerCase().includes(texto));
    const elegido = exacto || (parcial.length === 1 ? parcial[0] : null);
    if (elegido) { S.evaluador = elegido.evaluador_codigo; cargar(); }
  };
  $('#rEv').oninput = () => { clearTimeout(tempEv); tempEv = setTimeout(buscarEv, 400); };
  $('#rEv').onchange = () => { clearTimeout(tempEv); buscarEv(); };
  $('#rEvX').onclick = () => { $('#rEv').value = ''; S.evaluador = ''; cargar(); };
  $('#rR').onclick = cargar;
  $('#rLimpiar').onclick = () => {
    S.fechaDesde = S.fechaHasta = S.actualizaDesde = S.actualizaHasta = '';
    S.catLoteId = ''; S.evaluador = ''; S.santrampaid = '';
    ['#rFd', '#rFh', '#rAd', '#rAh', '#rLo', '#rTr', '#rEv'].forEach(s => { $(s).value = ''; });
    cargar();
  };

  buscador('#rLo', '#rLoList', API.lotes, 'lotes', 'nombre',
    x => { S.catLoteId = x ? x.cat_lote_id : ''; cargar(); });
  buscador('#rTr', '#rTrList', API.trampas, 'trampas', 'codigo',
    x => { S.santrampaid = x ? x.santrampaid : ''; cargar(); });

  cont.querySelectorAll('.ftab').forEach(b =>
    b.onclick = () => { S.tab = b.dataset.tab; cargar(); });
}

function periodoTexto() {
  if (S.fechaDesde || S.fechaHasta)
    return `Lecturas del ${S.fechaDesde || '…'} al ${S.fechaHasta || '…'}`;
  if (S.actualizaDesde === S.actualizaHasta && S.actualizaDesde)
    return `Descargado el ${S.actualizaDesde}`;
  return `Descargado del ${S.actualizaDesde || '…'} al ${S.actualizaHasta || '…'}`;
}

async function cargar() {
  document.querySelectorAll('.ftab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === S.tab));
  const c = $('#rC');
  if (!c) return;

  if (S.tab === 'descargas') return vistaDescargas(c);

  if (!hayFecha()) {
    c.innerHTML = `<div class="vacio"><h3>Selecciona un rango de fechas</h3>
      <p>Puedes filtrar por <strong>fecha de la lectura</strong> —cuándo se hizo
         en campo— o por <strong>fecha de actualización</strong>, que es el día en
         que los registros se descargaron del celular.</p>
      <p>Sin filtro la consulta recorrería toda la tabla de trampas.</p></div>`;
    return;
  }

  c.innerHTML = `<div class="cargando">Cargando registros…</div>`;
  try {
    S.datos = await API.revision(filtros());
    vistaRevision(c);
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }
}

// ============================================================
//  REVISIÓN
// ============================================================
function vistaRevision(c) {
  const d = S.datos, r = d.resumen || {};
  const vacio = !d.registros.length;
  const motivoVacio = S.verAnulados
    ? `<h3>Ningún registro anulado</h3>
       <p>En este período no se ha anulado nada. Desmarca
          <strong>Solo anulados</strong> aquí arriba para ver los normales.</p>`
    : `<h3>Sin registros</h3>
       <p>${esc(periodoTexto())}. Prueba con otro rango de fechas.</p>`;

  c.innerHTML = `
    ${vacio ? '' : `<div class="kpis">
      <div class="kpi"><div class="l">Lecturas</div>
        <div class="v">${n0(r.registros)}</div>
        <div class="s">${esc(periodoTexto())}</div></div>
      <div class="kpi"><div class="l">Trampas</div><div class="v">${n0(r.trampas)}</div></div>
      <div class="kpi"><div class="l">Lotes</div><div class="v">${n0(r.lotes)}</div></div>
      <div class="kpi"><div class="l">Evaluadores</div><div class="v">${n0(r.evaluadores)}</div></div>
      <div class="kpi"><div class="l">Hembras</div><div class="v">${n0(r.hembras)}</div>
        <div class="s">suma de lo vigente</div></div>
      <div class="kpi"><div class="l">Machos</div><div class="v">${n0(r.machos)}</div></div>
      ${r.sin_lectura ? `<div class="kpi"><div class="l">Sin lectura</div>
        <div class="v">${n0(r.sin_lectura)}</div></div>` : ''}
      ${r.anulados ? `<div class="kpi"><div class="l">Anulados</div>
        <div class="v">${n0(r.anulados)}</div></div>` : ''}
    </div>`}

    ${S.verAnulados ? `<div class="msg msg-warn">Estás viendo <strong>solo los
      registros anulados</strong>. Puedes reactivarlos si alguno se descartó
      por error.</div>` : ''}

    ${d.truncado ? `<div class="msg msg-warn">Se muestran los primeros
      ${n0(d.limite)} registros. Acota el rango de fechas para verlos todos.</div>` : ''}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  gap:14px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h3 style="margin:0">Registros del período</h3>
          <p class="sub" style="margin:6px 0 0">La corrección es <strong>de un
            registro a la vez</strong>: el lote no es un campo propio, se deriva de
            la trampa. Anular y reactivar sí admiten varios.</p>
        </div>
        <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="rAnu" ${S.verAnulados ? 'checked' : ''}>
            Solo anulados</label>
          <a class="btn btn-ghost" href="${API.urlRevisionExcel(filtros())}" download>Excel</a>
        </div>
      </div>

      <div class="fbar" id="rAcciones" style="margin-bottom:14px;display:none">
        <strong id="rSelN" style="font-size:14px"></strong>
        <div class="sp"></div>
        <button class="btn btn-primary" id="rEditar">Corregir registro</button>
        <button class="btn btn-ghost" id="rAnular">Anular</button>
        <button class="btn btn-ghost" id="rReactivar">Reactivar</button>
        <button class="btn btn-ghost" id="rQuitar">Quitar selección</button>
      </div>

      ${vacio ? `<div class="vacio" style="padding:36px 20px">${motivoVacio}</div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th style="width:34px"><input type="checkbox" id="rTodos" title="Seleccionar todo"></th>
            <th class="num">Lectura</th><th>Fecha</th><th class="num">Hora</th>
            <th>Trampa</th><th>Lote</th>
            <th class="num">Hembras</th><th class="num">Machos</th>
            <th>Evaluador</th><th>Sin lectura</th><th>Observaciones</th>
            <th>Cambio feromona</th><th>Cambio atrayente</th>
            <th>Corregido</th><th class="num">ID único</th>
          </tr></thead>
          <tbody>${d.registros.map(x => `<tr data-id="${x.santrampalecturaid}"
              ${x.anulado ? 'style="opacity:.5"' : ''}>
            <td><input type="checkbox" class="rSel" value="${x.santrampalecturaid}"
                 ${S.seleccion.has(x.santrampalecturaid) ? 'checked' : ''}></td>
            <td class="num">${x.lectura ?? '—'}</td>
            <td>${esc(x.fecha)}</td>
            <td class="num">${hora(x.hora)}</td>
            <td class="ln">${esc(x.trampa ?? '—')}</td>
            <td>${esc(x.lote ?? '—')}</td>
            <td class="num">${n0(x.hembras)}</td>
            <td class="num">${n0(x.machos)}</td>
            <td>${esc(x.trabajador ?? '—')}</td>
            <td>${siNo(x.nolectura)}</td>
            <td style="max-width:200px">${esc(x.observaciones ?? '')}</td>
            <td>${esc(x.feromona ?? '—')}</td>
            <td class="num">${x.atrayente ?? '—'}</td>
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
    <div id="rModal"></div>`;

  $('#rAnu').onchange = e => {
    S.verAnulados = e.target.checked;
    S.seleccion.clear();
    cargar();
  };

  const refrescar = () => {
    const barra = $('#rAcciones');
    if (!barra) return;
    const n = S.seleccion.size;
    barra.style.display = n ? 'flex' : 'none';
    $('#rSelN').textContent = n === 1
      ? '1 registro seleccionado' : `${n} registros seleccionados`;
    // Solo se corrige de a uno
    const btn = $('#rEditar');
    btn.disabled = n !== 1;
    btn.title = n > 1 ? 'Selecciona un solo registro para corregirlo' : '';
  };

  c.querySelectorAll('.rSel').forEach(chk => {
    chk.onchange = () => {
      const id = Number(chk.value);
      chk.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
      refrescar();
    };
  });

  const todos = $('#rTodos');
  if (todos) todos.onchange = e => {
    c.querySelectorAll('.rSel').forEach(chk => {
      chk.checked = e.target.checked;
      const id = Number(chk.value);
      e.target.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
    });
    refrescar();
  };

  const quitar = $('#rQuitar');
  if (quitar) quitar.onclick = () => {
    S.seleccion.clear();
    c.querySelectorAll('.rSel').forEach(chk => { chk.checked = false; });
    if (todos) todos.checked = false;
    refrescar();
  };

  const editar = $('#rEditar');
  if (editar) editar.onclick = () => {
    if (S.seleccion.size === 1) abrirModal([...S.seleccion][0]);
  };
  const anular = $('#rAnular');
  if (anular) anular.onclick = () => accion('anular');
  const react = $('#rReactivar');
  if (react) react.onclick = () => accion('reactivar');

  refrescar();
}

async function accion(tipo) {
  const ids = [...S.seleccion];
  if (!ids.length) return;

  let motivo = null;
  if (tipo === 'anular') {
    motivo = prompt(`Vas a anular ${ids.length} registro(s).\n\nMotivo (opcional):`, '');
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
//  VENTANA DE CORRECCIÓN · un solo registro
// ============================================================
async function abrirModal(id) {
  const reg = S.datos.registros.find(x => x.santrampalecturaid === id) || {};
  const opFer = S.catalogos.feromona || ['si', 'no'];
  const opAtr = S.catalogos.atrayente || [0, 1];

  const caja = $('#rModal');
  caja.innerHTML = `
    <div class="modal-fondo" id="rFondo">
      <div class="modal">
        <h3>Ajuste para único registro</h3>
        <p class="sub">Lectura ${reg.lectura ?? '—'} · trampa
          ${esc(reg.trampa ?? '—')} · lote ${esc(reg.lote ?? '—')} ·
          ${esc(reg.fecha ?? '')}. Deja en blanco lo que no quieras cambiar.</p>

        <div class="mcampo">
          <label for="mTrampa">Trampa</label>
          <input id="mTrampa" list="mTrampaList" autocomplete="off"
                 placeholder="Escribe el código…">
          <datalist id="mTrampaList"></datalist>
          <div class="ayuda" id="mTrampaAyuda">Al cambiar la trampa, el lote
            cambia solo: es el lote de la trampa nueva.</div>
        </div>
        <div class="mcampo">
          <label for="mHem">Hembras</label>
          <input type="number" id="mHem" min="0" placeholder="${reg.hembras ?? ''}">
        </div>
        <div class="mcampo">
          <label for="mMac">Machos</label>
          <input type="number" id="mMac" min="0" placeholder="${reg.machos ?? ''}">
        </div>
        <div class="mcampo">
          <label for="mObs">Observaciones</label>
          <input id="mObs" maxlength="255" placeholder="${esc(reg.observaciones ?? '')}">
        </div>
        <div class="mcampo">
          <label for="mFer">Cambio feromona</label>
          <select id="mFer">
            <option value="">— sin cambio (${esc(reg.feromona ?? 'vacío')}) —</option>
            ${opFer.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
          </select>
        </div>
        <div class="mcampo">
          <label for="mAtr">Cambio atrayente</label>
          <select id="mAtr">
            <option value="">— sin cambio (${reg.atrayente ?? 'vacío'}) —</option>
            ${opAtr.map(o => `<option value="${o}">${o}</option>`).join('')}
          </select>
        </div>

        <div id="mMsg"></div>
        <div class="macciones">
          <button class="btn btn-ghost" id="mCancelar">Cancelar</button>
          <button class="btn btn-primary" id="mGuardar">Guardar cambios</button>
        </div>
      </div>
    </div>`;

  let trampaId = null;
  let temp = null;
  const inputTrampa = $('#mTrampa');

  inputTrampa.oninput = () => {
    clearTimeout(temp);
    trampaId = null;
    const v = inputTrampa.value;
    if (!v.trim()) {
      $('#mTrampaAyuda').textContent = 'Al cambiar la trampa, el lote cambia solo: es el lote de la trampa nueva.';
      return;
    }
    temp = setTimeout(async () => {
      try {
        const r = await API.trampas(v);
        const lista = r.trampas || [];
        $('#mTrampaList').innerHTML = lista.slice(0, 40)
          .map(t => `<option value="${esc(t.codigo)}">${esc(t.lote ?? '')}</option>`).join('');
        const exacto = lista.find(t => t.codigo === v);
        if (exacto) {
          trampaId = exacto.santrampaid;
          $('#mTrampaAyuda').innerHTML =
            `<span style="color:var(--palm)">Trampa «${esc(exacto.codigo)}» seleccionada
             · lote ${esc(exacto.lote ?? '—')}.</span>`;
        } else {
          $('#mTrampaAyuda').textContent = lista.length
            ? `${lista.length} coincidencias. Elige una de la lista.`
            : 'Ninguna trampa coincide.';
        }
      } catch { /* sin resultados */ }
    }, 300);
  };

  const cerrar = () => { caja.innerHTML = ''; };
  $('#mCancelar').onclick = cerrar;
  $('#rFondo').onclick = e => { if (e.target.id === 'rFondo') cerrar(); };

  $('#mGuardar').onclick = async () => {
    const btn = $('#mGuardar');
    const msg = $('#mMsg');

    if (inputTrampa.value.trim() && !trampaId) {
      msg.innerHTML = `<div class="msg msg-err">Elige una trampa de la lista:
        el código escrito no coincide con ninguna.</div>`;
      return;
    }

    const campos = {};
    if (trampaId) campos.santrampaid = trampaId;
    const hem = $('#mHem').value.trim();
    const mac = $('#mMac').value.trim();
    const obs = $('#mObs').value.trim();
    if (hem !== '') campos.hembras = parseInt(hem, 10);
    if (mac !== '') campos.machos = parseInt(mac, 10);
    if (obs) campos.observaciones = obs;
    if ($('#mFer').value) campos.feromona = $('#mFer').value;
    if ($('#mAtr').value !== '') campos.atrayente = Number($('#mAtr').value);

    if (!Object.keys(campos).length) {
      msg.innerHTML = `<div class="msg msg-err">No cambiaste ningún campo.</div>`;
      return;
    }

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await API.corregir(id, campos);
      msg.innerHTML = `<div class="msg msg-ok">Registro corregido.</div>`;
      S.seleccion.clear();
      setTimeout(async () => { cerrar(); await cargar(); }, 900);
    } catch (e) {
      msg.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Guardar cambios';
    }
  };
}

// ============================================================
//  DESCARGAS
// ============================================================
async function vistaDescargas(c) {
  const fechas = S.catalogos.fechas || [];
  const acts = S.catalogos.actualizaciones || [];

  c.innerHTML = `
    <div class="card">
      <h3>Descargar el consolidado</h3>
      <p class="sub">Las lecturas de trampas con las correcciones ya aplicadas.
        Puedes filtrar por <strong>fecha de la lectura</strong> —cuándo se hizo en
        campo— o por <strong>fecha de actualización</strong>, el día en que los
        registros se descargaron del celular. No incluye los anulados.</p>

      <div class="fbar" style="margin-bottom:16px">
        <div class="g"><label for="dFd">Lectura · desde</label>
          <input type="date" id="dFd" value="${fechas[0]?.fecha || hoy()}"></div>
        <div class="g"><label for="dFh">hasta</label>
          <input type="date" id="dFh" value="${fechas[0]?.fecha || hoy()}"></div>
        <div class="g"><label for="dAd">Actualización · desde</label>
          <input type="date" id="dAd" value=""></div>
        <div class="g"><label for="dAh">hasta</label>
          <input type="date" id="dAh" value=""></div>
        <div class="sp"></div>
        <button class="btn btn-ghost" id="dVer">Ver antes de descargar</button>
        <a class="btn btn-primary" id="dExcel" href="#" download>Descargar Excel</a>
      </div>

      <div id="dPrev"></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
    ${fechas.length ? `
    <div class="card">
      <h3>Días con lecturas</h3>
      <p class="sub">Haz clic en una fecha para seleccionarla.</p>
      <div class="twrap" style="max-height:340px">
        <table class="ft">
          <thead><tr><th>Fecha</th><th class="num">Registros</th></tr></thead>
          <tbody>${fechas.map(f => `<tr class="dFecha" data-f="${f.fecha}" style="cursor:pointer">
            <td class="ln">${esc(f.fecha)}</td><td class="num">${n0(f.registros)}</td>
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
          <tbody>${acts.map(f => `<tr class="dAct" data-f="${f.fecha}" style="cursor:pointer">
            <td class="ln">${esc(f.fecha)}</td><td class="num">${n0(f.registros)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : ''}
    </div>`;

  const refrescar = () => {
    $('#dExcel').href = API.urlConsolidadoExcel(
      $('#dFd').value, $('#dFh').value, $('#dAd').value, $('#dAh').value);
  };
  refrescar();
  ['#dFd', '#dFh', '#dAd', '#dAh'].forEach(s => { $(s).onchange = refrescar; });

  c.querySelectorAll('.dFecha').forEach(tr => {
    tr.onclick = () => {
      $('#dFd').value = tr.dataset.f; $('#dFh').value = tr.dataset.f;
      $('#dAd').value = ''; $('#dAh').value = '';
      refrescar(); $('#dVer').click();
    };
  });
  c.querySelectorAll('.dAct').forEach(tr => {
    tr.onclick = () => {
      $('#dAd').value = tr.dataset.f; $('#dAh').value = tr.dataset.f;
      $('#dFd').value = ''; $('#dFh').value = '';
      refrescar(); $('#dVer').click();
    };
  });

  $('#dVer').onclick = async () => {
    const prev = $('#dPrev');
    prev.innerHTML = `<div class="cargando">Consultando…</div>`;
    try {
      const r = await API.consolidado($('#dFd').value, $('#dFh').value,
                                      $('#dAd').value, $('#dAh').value);
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
              <td class="num">${x.lectura ?? '—'}</td>
              <td>${esc(x.fecha)}</td><td class="num">${hora(x.hora)}</td>
              <td>${esc(x.trampa ?? '—')}</td>
              <td>${esc(x.lote ?? '—')}</td>
              <td class="num">${n0(x.hembras)}</td>
              <td class="num">${n0(x.machos)}</td>
              <td>${esc(x.evaluador ?? '—')}</td>
              <td>${siNo(x.nolectura)}</td>
              <td style="max-width:200px">${esc(x.observaciones ?? '')}</td>
              <td>${esc(x.feromona ?? '—')}</td>
              <td class="num">${x.atrayente ?? '—'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
    } catch (e) {
      prev.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    }
  };
}
