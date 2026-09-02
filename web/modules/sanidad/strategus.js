// ============================================================
// PalmaData · Sanidad · Strategus
//
// Réplica de la pantalla del censo sobre sanstrategus:
//   · con análisis de erróneos (catpalmaid inexistente), sin duplicados
//   · filtros: fecha del evento, actualización, lote y trabajador
//   · corrección múltiple = solo lote; corrección de uno = lote, línea,
//     palma y galerías. Sector, lectura, fecha y evaluador no se editan.
//     El sector se deriva del lote: al corregir el lote cambia solo.
//   · descarga por cualquiera de las dos fechas, con GEOM
// ============================================================
import { API } from './api_strategus.js';

const S = {
  fechaDesde: '', fechaHasta: '',
  actualizaDesde: '', actualizaHasta: '',
  catLoteId: '', evaluador: '',
  verAnulados: false, soloErroneos: false,
  seleccion: new Set(),
  catalogos: null, datos: null,
  tab: 'revision',
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const n1 = v => (v == null || isNaN(v)) ? '—'
  : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 2 });
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoy = () => new Date().toISOString().slice(0, 10);
const hora = h => h ? String(h).slice(0, 5) : '—';

const filtros = () => ({
  fechaDesde: S.fechaDesde, fechaHasta: S.fechaHasta,
  actualizaDesde: S.actualizaDesde, actualizaHasta: S.actualizaHasta,
  catLoteId: S.catLoteId, evaluador: S.evaluador,
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
      <div class="g"><label for="gFd">Fecha censo · desde</label>
        <input type="date" id="sFd" value="${S.fechaDesde}"></div>
      <div class="g"><label for="gFh">hasta</label>
        <input type="date" id="sFh" value="${S.fechaHasta}"></div>
      <div class="g"><label for="gAd">Actualización · desde</label>
        <input type="date" id="sAd" value="${S.actualizaDesde}"></div>
      <div class="g"><label for="gAh">hasta</label>
        <input type="date" id="sAh" value="${S.actualizaHasta}"></div>
      <div class="g"><label for="gLo">Lote</label>
        <input id="sLo" list="gLoList" placeholder="Buscar…" autocomplete="off"
               style="min-width:150px;padding:8px 11px;border:1.5px solid var(--line);
                      border-radius:var(--radius-sm);font-size:14px">
        <datalist id="sLoList"></datalist></div>
      <div class="g"><label for="gEv">Trabajador</label>
        <input id="sEv" list="gEvList" placeholder="Buscar…" autocomplete="off"
               value="${esc(nombreEvaluador())}"
               style="min-width:180px;padding:8px 11px;border:1.5px solid var(--line);
                      border-radius:var(--radius-sm);font-size:14px">
        <datalist id="sEvList">${ev.map(x =>
          `<option value="${esc(x.nombre || `Sin nombre (${x.evaluador_codigo})`)}">${n0(x.lecturas)} lecturas</option>`).join('')}</datalist>
        <button class="btn btn-ghost" id="sEvX" style="padding:8px 11px" title="Limpiar">✕</button></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="sLimpiar">Limpiar</button>
      <button class="btn btn-ghost" id="sR">Actualizar</button>
    </div>
    <div class="ftabs">
      <button class="ftab" data-tab="revision">Revisión</button>
      <button class="ftab" data-tab="descargas">Descargas</button>
    </div>
    <div id="sC"></div>`;

  const rec = () => {
    S.fechaDesde = $('#sFd').value; S.fechaHasta = $('#sFh').value;
    S.actualizaDesde = $('#sAd').value; S.actualizaHasta = $('#sAh').value;
    S.seleccion.clear();
    cargar();
  };
  ['#sFd', '#sFh', '#sAd', '#sAh'].forEach(s => { $(s).onchange = rec; });

  // Trabajador: se busca escribiendo
  let tempEv = null;
  const buscarEv = () => {
    const texto = $('#sEv').value.trim().toLowerCase();
    if (!texto) { S.evaluador = ''; cargar(); return; }
    const lista = S.catalogos.evaluadores || [];
    const exacto = lista.find(x => (x.nombre || '').toLowerCase() === texto);
    const parcial = lista.filter(x => (x.nombre || '').toLowerCase().includes(texto));
    const elegido = exacto || (parcial.length === 1 ? parcial[0] : null);
    if (elegido) { S.evaluador = elegido.evaluador_codigo; cargar(); }
  };
  $('#sEv').oninput = () => { clearTimeout(tempEv); tempEv = setTimeout(buscarEv, 400); };
  $('#sEv').onchange = () => { clearTimeout(tempEv); buscarEv(); };
  $('#sEvX').onclick = () => { $('#sEv').value = ''; S.evaluador = ''; cargar(); };
  $('#sR').onclick = cargar;
  $('#sLimpiar').onclick = () => {
    S.fechaDesde = S.fechaHasta = S.actualizaDesde = S.actualizaHasta = '';
    S.catLoteId = ''; S.evaluador = '';
    $('#sFd').value = ''; $('#sFh').value = '';
    $('#sAd').value = ''; $('#sAh').value = '';
    $('#sLo').value = ''; $('#sEv').value = '';
    cargar();
  };

  // Lote: 500 opciones, se filtran contra el servidor
  let temp = null;
  $('#sLo').oninput = e => {
    clearTimeout(temp);
    const v = e.target.value;
    temp = setTimeout(async () => {
      if (!v.trim()) { S.catLoteId = ''; cargar(); return; }
      try {
        const r = await API.lotes(v);
        $('#sLoList').innerHTML = (r.lotes || []).slice(0, 40)
          .map(l => `<option value="${esc(l.nombre)}"></option>`).join('');
        const exacto = (r.lotes || []).find(l => l.nombre === v);
        if (exacto) { S.catLoteId = exacto.cat_lote_id; cargar(); }
      } catch { /* sin resultados */ }
    }, 350);
  };

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
  const c = $('#sC');
  if (!c) return;

  if (S.tab === 'descargas') return vistaDescargas(c);

  if (!hayFecha()) {
    c.innerHTML = `<div class="vacio"><h3>Selecciona un rango de fechas</h3>
      <p>Puedes filtrar por <strong>fecha de la lectura</strong> —cuándo se hizo
         en campo— o por <strong>fecha de actualización</strong>, que es el día en
         que los registros se descargaron del celular.</p>
      <p>Sin filtro la consulta recorrería toda la tabla de Strategus.</p></div>`;
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
      <div class="kpi"><div class="l">Evaluadores</div><div class="v">${n0(r.evaluadores)}</div></div>
      <div class="kpi"><div class="l">Lotes</div><div class="v">${n0(r.lotes)}</div></div>
      <div class="kpi"><div class="l">Sectores</div><div class="v">${n0(r.sectores)}</div></div>
      <div class="kpi"><div class="l">Galerías</div><div class="v">${n0(r.galerias)}</div>
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
          <h3 style="margin:0">Registros del período</h3>
          <p class="sub" style="margin:6px 0 0">Selecciona uno para corregir todos
            sus campos, o varios para cambiarles el lote de una vez. La columna
            <strong>Corregido</strong> muestra quién tocó cada registro.</p>
        </div>
        <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="sErr" ${S.soloErroneos ? 'checked' : ''}>
            Solo palmas inexistentes</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="sAnu" ${S.verAnulados ? 'checked' : ''}>
            Solo anulados</label>
          <a class="btn btn-ghost" href="${API.urlRevisionExcel(filtros())}" download>Excel</a>
        </div>
      </div>

      <div class="fbar" id="sAcciones" style="margin-bottom:14px;display:none">
        <strong id="sSelN" style="font-size:14px"></strong>
        <div class="sp"></div>
        <button class="btn btn-primary" id="sEditar">Corregir</button>
        <button class="btn btn-ghost" id="sAnular">Anular</button>
        <button class="btn btn-ghost" id="sReactivar">Reactivar</button>
        <button class="btn btn-ghost" id="sQuitar">Quitar selección</button>
      </div>

      ${vacio ? `<div class="vacio" style="padding:36px 20px">${motivoVacio}</div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th style="width:34px"><input type="checkbox" id="sTodos" title="Seleccionar todo"></th>
            <th>Sector</th><th>Lote</th><th class="num">Lectura</th><th>Fecha</th>
            <th class="num">Línea</th><th class="num">Palma</th>
            <th class="num">Galerías</th><th>Evaluador</th>
            <th>Corregido</th><th class="num">ID único</th>
          </tr></thead>
          <tbody>${d.registros.map(x => `<tr data-id="${x.sanstrategusid}"
              ${x.anulado ? 'style="opacity:.5"' : ''}>
            <td><input type="checkbox" class="sSel" value="${x.sanstrategusid}"
                 ${S.seleccion.has(x.sanstrategusid) ? 'checked' : ''}></td>
            <td>${esc(x.sector ?? '—')}</td>
            <td class="ln">${esc(x.lote ?? '—')}</td>
            <td class="num">${x.lectura ?? '—'}</td>
            <td>${esc(x.fecha)}</td>
            <td class="num">${x.linea ?? '—'}</td>
            <td class="num">${x.palma ?? '—'}
              ${x.erroneo ? `<span class="sem sem-deficiente" title="La palma no existe en el catálogo">!</span>` : ''}</td>
            <td class="num">${n0(x.galerias)}</td>
            <td>${esc(x.trabajador ?? '—')}</td>
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
    <div id="sModal"></div>`;

  $('#sAnu').onchange = e => {
    S.verAnulados = e.target.checked;
    if (e.target.checked) S.soloErroneos = false;
    S.seleccion.clear();
    cargar();
  };
  $('#sErr').onchange = e => {
    S.soloErroneos = e.target.checked;
    if (e.target.checked) S.verAnulados = false;
    S.seleccion.clear();
    cargar();
  };

  // Con la tabla vacía estos elementos no existen: cada acceso se protege.
  const refrescar = () => {
    const barra = $('#sAcciones');
    if (!barra) return;
    const n = S.seleccion.size;
    barra.style.display = n ? 'flex' : 'none';
    $('#sSelN').textContent = n === 1
      ? '1 registro seleccionado' : `${n} registros seleccionados`;
    $('#sEditar').textContent = n === 1 ? 'Corregir registro' : 'Corregir lote';
  };

  c.querySelectorAll('.sSel').forEach(chk => {
    chk.onchange = () => {
      const id = Number(chk.value);
      chk.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
      refrescar();
    };
  });

  const todos = $('#sTodos');
  if (todos) todos.onchange = e => {
    c.querySelectorAll('.sSel').forEach(chk => {
      chk.checked = e.target.checked;
      const id = Number(chk.value);
      e.target.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
    });
    refrescar();
  };

  const quitar = $('#sQuitar');
  if (quitar) quitar.onclick = () => {
    S.seleccion.clear();
    c.querySelectorAll('.sSel').forEach(chk => { chk.checked = false; });
    if (todos) todos.checked = false;
    refrescar();
  };

  const editar = $('#sEditar');
  if (editar) editar.onclick = () => abrirModal([...S.seleccion]);
  const anular = $('#sAnular');
  if (anular) anular.onclick = () => accion('anular');
  const react = $('#sReactivar');
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
//  VENTANA DE CORRECCIÓN
// ============================================================
async function abrirModal(ids) {
  if (!ids.length) return;
  const varios = ids.length > 1;
  const reg = varios ? null
    : (S.datos.registros.find(x => x.sanstrategusid === ids[0]) || {});
  const campoNum = (id, etiqueta, valor, paso) => `
    <div class="mcampo">
      <label for="${id}">${etiqueta}</label>
      <input type="number" id="${id}" min="0" ${paso ? `step="${paso}"` : ''}
             placeholder="${valor ?? ''}">
    </div>`;

  const caja = $('#sModal');
  caja.innerHTML = `
    <div class="modal-fondo" id="sFondo">
      <div class="modal">
        <h3>${varios ? 'Ajuste para elección múltiple de registros'
                     : 'Ajuste para único registro'}</h3>
        <p class="sub">${varios
          ? `${ids.length} registros seleccionados. En una selección múltiple solo
             se puede cambiar el lote; el sector sigue al lote nuevo.`
          : `Sector ${esc(reg.sector ?? '—')} · lote ${esc(reg.lote ?? '—')} ·
             línea ${reg.linea ?? '—'} · palma ${reg.palma ?? '—'} · lectura
             ${reg.lectura ?? '—'}. Deja en blanco lo que no quieras cambiar.`}</p>

        <div class="mcampo">
          <label for="mLote">Lote</label>
          <input id="mLote" list="mLoteList" autocomplete="off"
                 placeholder="Escribe el número o el nombre…">
          <datalist id="mLoteList"></datalist>
          <div class="ayuda" id="mLoteAyuda">Escribe <em>138</em> para encontrar
            <em>L138-C</em>. El sector cambia con el lote.</div>
        </div>

        ${varios ? '' : `
        ${campoNum('mLinea', 'Línea', reg.linea)}
        ${campoNum('mPalma', 'Palma', reg.palma)}
        ${campoNum('mGal', 'Galerías', reg.galerias)}`}

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
          .map(l => `<option value="${esc(l.nombre)}">${esc(l.sector ?? '')}</option>`).join('');
        const exacto = lotes.find(l => l.nombre === v);
        if (exacto) {
          loteId = exacto.cat_lote_id;
          $('#mLoteAyuda').innerHTML =
            `<span style="color:var(--palm)">Lote «${esc(exacto.nombre)}» seleccionado
             · sector ${esc(exacto.sector ?? '—')}.</span>`;
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
  $('#sFondo').onclick = e => { if (e.target.id === 'sFondo') cerrar(); };

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
        const num = (sel, clave, entero) => {
          const v = $(sel).value.trim();
          if (v !== '') campos[clave] = entero ? parseInt(v, 10) : Number(v);
        };
        num('#mLinea', 'linea', true);
        num('#mPalma', 'palma', true);
        num('#mGal', 'galerias', true);

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

// ============================================================
//  DESCARGAS
// ============================================================
async function vistaDescargas(c) {
  const fechas = S.catalogos.fechas || [];
  const acts = S.catalogos.actualizaciones || [];

  c.innerHTML = `
    <div class="card">
      <h3>Descargar el consolidado</h3>
      <p class="sub">Las lecturas de Strategus con las correcciones ya aplicadas y
        la columna <strong>GEOM</strong> al final. Puedes filtrar por
        <strong>fecha de la lectura</strong> —cuándo se hizo en campo— o por
        <strong>fecha de actualización</strong>, el día en que los registros se
        descargaron del celular. No incluye los anulados.</p>

      <div class="fbar" style="margin-bottom:16px">
        <div class="g"><label for="dFd">Censo · desde</label>
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
          <tbody>${fechas.map(f => `<tr class="dFecha" data-f="${f.fecha}"
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
          <tbody>${acts.map(f => `<tr class="dAct" data-f="${f.fecha}"
              style="cursor:pointer">
            <td class="ln">${esc(f.fecha)}</td>
            <td class="num">${n0(f.registros)}</td>
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
      refrescar();
      $('#dVer').click();
    };
  });
  c.querySelectorAll('.dAct').forEach(tr => {
    tr.onclick = () => {
      $('#dAd').value = tr.dataset.f; $('#dAh').value = tr.dataset.f;
      $('#dFd').value = ''; $('#dFh').value = '';
      refrescar();
      $('#dVer').click();
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
              <td>${esc(x.sector ?? '—')}</td>
              <td>${esc(x.lote ?? '—')}</td>
              <td class="num">${x.lectura ?? '—'}</td>
              <td>${esc(x.fecha)}</td>
              <td class="num">${x.linea ?? '—'}</td>
              <td class="num">${x.palma ?? '—'}</td>
              <td class="num">${n0(x.galerias)}</td>
              <td>${esc(x.evaluador ?? '—')}</td>
              <td style="font-size:12px">${esc(x.geom ?? '')}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
    } catch (e) {
      prev.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    }
  };
}
