// ============================================================
// PalmaData · Sanidad · Medidas vegetativas
//
// Un solo apartado: la tabla, las correcciones y la descarga. El Excel baja
// exactamente lo que se ve, con los mismos filtros.
//
// Con erróneos (palma inexistente), sin duplicados. Se corrigen lote,
// línea, palma y UMA; con varios seleccionados, solo el lote.
// ============================================================
import { API } from './api_medidas.js';

const S = {
  fechaDesde: '', fechaHasta: '', actualizaDesde: '', actualizaHasta: '',
  catLoteId: '', evaluador: '', nutUmaId: '',
  verAnulados: false, soloErroneos: false,
  seleccion: new Set(), catalogos: null, datos: null,
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const n1 = v => (v == null || isNaN(v)) ? '—'
  : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 2 });
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoy = () => new Date().toISOString().slice(0, 10);
const hora = h => h ? String(h).slice(0, 5) : '—';
const coord = v => (v == null) ? '—' : Number(v).toFixed(6);

const MEDIDAS = [];
for (let n = 1; n <= 8; n++) MEDIDAS.push([`ancho_${n}`, `Ancho ${n}`], [`largo_${n}`, `Largo ${n}`]);

const filtros = () => ({
  fechaDesde: S.fechaDesde, fechaHasta: S.fechaHasta,
  actualizaDesde: S.actualizaDesde, actualizaHasta: S.actualizaHasta,
  catLoteId: S.catLoteId, evaluador: S.evaluador, nutUmaId: S.nutUmaId,
  verAnulados: S.verAnulados, soloErroneos: S.soloErroneos,
});
const hayFecha = () => !!(S.fechaDesde || S.fechaHasta || S.actualizaDesde || S.actualizaHasta);

function nombreEvaluador() {
  const e = (S.catalogos?.evaluadores || []).find(x => String(x.evaluador_codigo) === String(S.evaluador));
  return e ? (e.nombre || `Sin nombre (${e.evaluador_codigo})`) : '';
}

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
    S.fechaDesde = S.fechaHasta = f ? f.fecha : hoy();
  }
  esqueleto(cont);
  await cargar();
}

function esqueleto(cont) {
  const ev = S.catalogos.evaluadores || [];
  const umas = S.catalogos.umas || [];
  const estilo = 'padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px';
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
      <button class="btn btn-ghost" id="vR">Actualizar</button>
    </div>
    <div class="fbar" style="margin-top:-8px">
      <div class="g"><label for="vLo">Lote</label>
        <input id="vLo" list="vLoList" placeholder="Buscar…" autocomplete="off" style="min-width:150px;${estilo}">
        <datalist id="vLoList"></datalist></div>
      <div class="g"><label for="vEv">Evaluador</label>
        <input id="vEv" list="vEvList" placeholder="Buscar…" autocomplete="off"
               value="${esc(nombreEvaluador())}" style="min-width:180px;${estilo}">
        <datalist id="vEvList">${ev.map(x =>
          `<option value="${esc(x.nombre || `Sin nombre (${x.evaluador_codigo})`)}">${n0(x.lecturas)} registros</option>`).join('')}</datalist>
        <button class="btn btn-ghost" id="vEvX" style="padding:8px 11px" title="Limpiar">✕</button></div>
      <div class="g"><label for="vUma">UMA</label>
        <select id="vUma" style="${estilo};max-width:180px"><option value="">Todas</option>
          ${umas.map(u => `<option value="${u.nut_uma_id}" ${String(S.nutUmaId) === String(u.nut_uma_id) ? 'selected' : ''}>${esc(u.codigo || `UMA ${u.nut_uma_id}`)} · ${n0(u.registros)}</option>`).join('')}
        </select></div>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="vErr" ${S.soloErroneos ? 'checked' : ''}> Palmas inexistentes</label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="vAnu" ${S.verAnulados ? 'checked' : ''}> Anulados</label>
      <div class="sp"></div>
      <a class="btn btn-primary" id="vExcel" href="#" download>Descargar Excel</a>
    </div>
    <div id="vC"></div>
    <div id="vModal"></div>`;

  const rec = () => {
    S.fechaDesde = $('#vFd').value; S.fechaHasta = $('#vFh').value;
    S.actualizaDesde = $('#vAd').value; S.actualizaHasta = $('#vAh').value;
    S.nutUmaId = $('#vUma').value;
    S.soloErroneos = $('#vErr').checked; S.verAnulados = $('#vAnu').checked;
    S.seleccion.clear(); cargar();
  };
  ['#vFd', '#vFh', '#vAd', '#vAh', '#vUma', '#vErr', '#vAnu'].forEach(s => { $(s).onchange = rec; });

  let tempEv = null;
  const buscarEv = () => {
    const texto = $('#vEv').value.trim().toLowerCase();
    if (!texto) { S.evaluador = ''; cargar(); return; }
    const exacto = ev.find(x => (x.nombre || '').toLowerCase() === texto);
    const parcial = ev.filter(x => (x.nombre || '').toLowerCase().includes(texto));
    const elegido = exacto || (parcial.length === 1 ? parcial[0] : null);
    if (elegido) { S.evaluador = elegido.evaluador_codigo; S.seleccion.clear(); cargar(); }
  };
  $('#vEv').oninput = () => { clearTimeout(tempEv); tempEv = setTimeout(buscarEv, 400); };
  $('#vEv').onchange = () => { clearTimeout(tempEv); buscarEv(); };
  $('#vEvX').onclick = () => { $('#vEv').value = ''; S.evaluador = ''; cargar(); };
  $('#vR').onclick = cargar;
  $('#vLimpiar').onclick = () => {
    S.fechaDesde = S.fechaHasta = S.actualizaDesde = S.actualizaHasta = '';
    S.catLoteId = S.evaluador = S.nutUmaId = '';
    S.soloErroneos = S.verAnulados = false;
    ['#vFd', '#vFh', '#vAd', '#vAh', '#vLo', '#vEv'].forEach(s => { $(s).value = ''; });
    $('#vUma').value = ''; $('#vErr').checked = false; $('#vAnu').checked = false;
    S.seleccion.clear(); cargar();
  };

  let temp = null;
  $('#vLo').oninput = e => {
    clearTimeout(temp);
    const v = e.target.value;
    temp = setTimeout(async () => {
      if (!v.trim()) { S.catLoteId = ''; cargar(); return; }
      try {
        const r = await API.lotes(v);
        $('#vLoList').innerHTML = (r.lotes || []).slice(0, 40)
          .map(l => `<option value="${esc(l.nombre)}"></option>`).join('');
        const exacto = (r.lotes || []).find(l => l.nombre === v);
        if (exacto) { S.catLoteId = exacto.cat_lote_id; S.seleccion.clear(); cargar(); }
      } catch { /* sin resultados */ }
    }, 350);
  };
}

function periodoTexto() {
  if (S.fechaDesde || S.fechaHasta) {
    if (S.fechaDesde && S.fechaDesde === S.fechaHasta) return `Fecha ${S.fechaDesde}`;
    return `Del ${S.fechaDesde || '…'} al ${S.fechaHasta || '…'}`;
  }
  return `Descargado del ${S.actualizaDesde || '…'} al ${S.actualizaHasta || '…'}`;
}

async function cargar() {
  const c = $('#vC');
  if (!c) return;
  $('#vExcel').href = API.urlExcel(filtros());
  if (!hayFecha()) {
    c.innerHTML = `<div class="vacio"><h3>Selecciona un rango de fechas</h3>
      <p>Por <strong>fecha del evento</strong> —cuándo se midió la palma— o por
         <strong>fecha de actualización</strong>, cuándo bajó del celular.</p></div>`;
    return;
  }
  c.innerHTML = `<div class="cargando">Cargando registros…</div>`;
  try {
    S.datos = await API.revision(filtros());
    vista(c);
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }
}

function vista(c) {
  const d = S.datos, r = d.resumen || {};
  const vacio = !d.registros.length;

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Registros</div><div class="v">${n0(r.registros)}</div>
        <div class="s">${esc(periodoTexto())}</div></div>
      <div class="kpi"><div class="l">Palmas medidas</div><div class="v">${n0(r.palmas)}</div></div>
      <div class="kpi"><div class="l">Palmas inexistentes</div>
        <div class="v" ${r.erroneos ? 'style="color:var(--danger)"' : ''}>${n0(r.erroneos)}</div>
        <div class="s">para corregir</div></div>
      <div class="kpi"><div class="l">Evaluadores</div><div class="v">${n0(r.evaluadores)}</div></div>
      <div class="kpi"><div class="l">Lotes</div><div class="v">${n0(r.lotes)}</div></div>
      <div class="kpi"><div class="l">UMA</div><div class="v">${n0(r.umas)}</div></div>
      ${r.anulados ? `<div class="kpi"><div class="l">Anulados</div><div class="v">${n0(r.anulados)}</div></div>` : ''}
    </div>

    ${S.verAnulados ? `<div class="msg msg-warn">Estás viendo <strong>solo los registros anulados</strong>.
      Puedes reactivar los que se anularon por error.</div>` : ''}
    ${d.truncado ? `<div class="msg msg-warn">Se muestran los primeros ${n0(d.limite)} registros.
      El Excel sí trae todos (hasta 50.000); para ver menos, acota los filtros.</div>` : ''}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h3 style="margin:0">Medidas vegetativas</h3>
          <p class="sub" style="margin:6px 0 0">Selecciona un registro para corregir lote, línea,
            palma o UMA; varios, para cambiarles el lote. El Excel baja esta misma tabla.</p>
        </div>
        <strong style="font-size:14px;color:var(--ink-soft)">${n0(d.total)} en la tabla</strong>
      </div>

      <div class="fbar" id="vAcciones" style="margin-bottom:14px;display:none">
        <strong id="vSelN" style="font-size:14px"></strong>
        <div class="sp"></div>
        <button class="btn btn-primary" id="vEditar">Corregir</button>
        ${S.verAnulados
          ? `<button class="btn btn-ghost" id="vReactivar">Reactivar</button>`
          : `<button class="btn btn-ghost" id="vAnular">Anular</button>`}
        <button class="btn btn-ghost" id="vQuitar">Quitar selección</button>
      </div>

      ${vacio ? `<div class="vacio" style="padding:36px 20px"><h3>Sin registros</h3>
        <p>${esc(periodoTexto())} con los filtros aplicados.</p></div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th style="width:34px"><input type="checkbox" id="vTodos"></th>
            <th>Fecha</th><th>Hora</th><th>Evaluador</th><th>Lote</th>
            <th class="num">Línea</th><th class="num">Palma</th><th>UMA</th>
            <th class="num">Nº foliolos</th><th class="num">Long. peciolo</th>
            <th class="num">Ancho peciolo</th><th class="num">Prof. peciolo</th>
            <th class="num">Long. raquis</th>
            ${MEDIDAS.map(([, e]) => `<th class="num">${e}</th>`).join('')}
            <th class="num">Hoja</th><th class="num">Hojas verdes</th>
            <th class="num">Latitud</th><th class="num">Longitud</th><th>Geom</th>
            <th>Estado</th><th>Corregido</th>
          </tr></thead>
          <tbody>${d.registros.map(x => `<tr data-id="${x.medidas_vegetativas_id}"
              ${x.erroneo && !x.anulado ? 'style="background:var(--danger-soft)"' : ''}>
            <td><input type="checkbox" class="vSel" value="${x.medidas_vegetativas_id}"
                 ${S.seleccion.has(x.medidas_vegetativas_id) ? 'checked' : ''}></td>
            <td>${esc(x.fecha)}</td><td>${hora(x.hora)}</td>
            <td>${esc(x.evaluador ?? `(${x.evaluador_codigo})`)}</td>
            <td class="ln">${esc(x.lote ?? '—')}</td>
            <td class="num">${x.linea ?? '—'}</td><td class="num">${x.palma ?? '—'}</td>
            <td>${esc(x.uma ?? '—')}</td>
            <td class="num">${n1(x.num_foliolos)}</td><td class="num">${n1(x.long_peciolo)}</td>
            <td class="num">${n1(x.anch_peciolo)}</td><td class="num">${n1(x.prof_peciolo)}</td>
            <td class="num">${n1(x.long_raquis)}</td>
            ${MEDIDAS.map(([k]) => `<td class="num">${n1(x[k])}</td>`).join('')}
            <td class="num">${x.hoja ?? '—'}</td><td class="num">${x.hojas_verdes ?? '—'}</td>
            <td class="num">${coord(x.latitud)}</td><td class="num">${coord(x.longitud)}</td>
            <td style="font-size:11.5px;white-space:nowrap">${esc(x.geom ?? '—')}</td>
            <td>${x.anulado
              ? `<span class="sem sem-deficiente" style="min-width:auto" title="${esc(x.anulado_motivo ?? '')}">Anulado</span>`
              : x.erroneo
                ? `<span class="sem sem-deficiente" style="min-width:auto" title="La palma ${x.cat_palma_id} no existe en cat_palma">Palma inexistente</span>`
                : '<span class="sem sem-optimo" style="min-width:auto">OK</span>'}</td>
            <td style="font-size:12.5px">${x.corregido_por
              ? `<span class="sem sem-optimo" title="${esc(String(x.corregido_at ?? ''))}">${esc(x.corregido_por)}</span>` : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`}
    </div>`;

  const refrescar = () => {
    const barra = $('#vAcciones');
    if (!barra) return;
    const n = S.seleccion.size;
    barra.style.display = n ? 'flex' : 'none';
    $('#vSelN').textContent = n === 1 ? '1 registro seleccionado' : `${n} registros seleccionados`;
    const btn = $('#vEditar');
    btn.textContent = n > 1 ? `Cambiar lote a ${n}` : 'Corregir';
    btn.disabled = S.verAnulados;
  };
  c.querySelectorAll('.vSel').forEach(chk => {
    chk.onchange = () => {
      const id = Number(chk.value);
      chk.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
      refrescar();
    };
  });
  const todos = $('#vTodos');
  if (todos) todos.onchange = e => {
    c.querySelectorAll('.vSel').forEach(chk => {
      chk.checked = e.target.checked;
      const id = Number(chk.value);
      e.target.checked ? S.seleccion.add(id) : S.seleccion.delete(id);
    });
    refrescar();
  };
  const quitar = $('#vQuitar');
  if (quitar) quitar.onclick = () => {
    S.seleccion.clear();
    c.querySelectorAll('.vSel').forEach(chk => { chk.checked = false; });
    if (todos) todos.checked = false;
    refrescar();
  };
  const editar = $('#vEditar');
  if (editar) editar.onclick = () => { if (S.seleccion.size) abrirModal([...S.seleccion]); };
  const anular = $('#vAnular');
  if (anular) anular.onclick = () => accion('anular');
  const react = $('#vReactivar');
  if (react) react.onclick = () => accion('reactivar');
  refrescar();
}

async function accion(tipo) {
  const ids = [...S.seleccion];
  if (!ids.length) return;
  let motivo = null;
  if (tipo === 'anular') {
    motivo = prompt(`Vas a anular ${ids.length} registro(s). No se borran: dejan de contar y
puedes reactivarlos.\n\nMotivo (opcional):`, '');
    if (motivo === null) return;
  } else if (!confirm(`Vas a reactivar ${ids.length} registro(s). ¿Continuar?`)) return;
  try {
    await (tipo === 'anular' ? API.anular(ids, motivo) : API.reactivar(ids));
    S.seleccion.clear();
    await cargar();
  } catch (e) { alert(e.message); }
}

// ============================================================
//  MODAL · uno: lote, línea, palma, UMA · varios: solo lote
// ============================================================
function abrirModal(ids) {
  const varios = ids.length > 1;
  const reg = varios ? {} : (S.datos.registros.find(x => x.medidas_vegetativas_id === ids[0]) || {});
  const caja = $('#vModal');

  // Un buscador con sugerencias del servidor: se usa para el lote y para
  // la UMA, que funcionan igual (se elige un nombre, viaja el id).
  const buscador = (id, etiqueta, actual, ayuda) => `
    <div class="mcampo">
      <label for="${id}">${etiqueta}</label>
      <input id="${id}" list="${id}List" autocomplete="off" placeholder="${esc(actual || 'Escribe para buscar…')}">
      <datalist id="${id}List"></datalist>
      <div class="ayuda" id="${id}Ayuda">${ayuda}</div>
    </div>`;

  caja.innerHTML = `
    <div class="modal-fondo" id="vFondo">
      <div class="modal">
        <h3>${varios ? `Cambiar lote a ${ids.length} registros` : 'Corregir registro'}</h3>
        <p class="sub">${varios
          ? 'Con varios registros solo se cambia el lote. La palma y el estado se recalculan solos.'
          : `${esc(reg.fecha ?? '')} · ${esc(reg.lote ?? '')} L${reg.linea ?? '?'} P${reg.palma ?? '?'}
             · UMA ${esc(reg.uma ?? '—')}. Deja en blanco lo que no quieras cambiar.`}</p>

        ${buscador('mLote', 'Lote', reg.lote, 'Escribe parte del nombre y elige de la lista.')}
        ${varios ? '' : `
          <div class="mcampo"><label for="mLinea">Línea</label>
            <input type="number" id="mLinea" min="0" step="1" placeholder="${reg.linea ?? ''}"></div>
          <div class="mcampo"><label for="mPalma">Palma</label>
            <input type="number" id="mPalma" min="0" step="1" placeholder="${reg.palma ?? ''}">
            <div class="ayuda">Al cambiar línea o palma se vuelve a comprobar si la palma existe.</div></div>
          ${buscador('mUma', 'UMA', reg.uma, 'Escribe parte del código y elige de la lista.')}`}

        <div id="mMsg"></div>
        <div class="macciones">
          <button class="btn btn-ghost" id="mCancelar">Cancelar</button>
          <button class="btn btn-primary" id="mGuardar">Guardar</button>
        </div>
      </div>
    </div>`;

  // Conecta un buscador a su endpoint y devuelve una función que da el id elegido
  const conectar = (id, buscar, claveId, claveNombre) => {
    let elegido = null, temp = null;
    const input = $(`#${id}`);
    input.oninput = () => {
      clearTimeout(temp); elegido = null;
      const v = input.value;
      if (!v.trim()) { $(`#${id}Ayuda`).textContent = ''; return; }
      temp = setTimeout(async () => {
        try {
          const lista = await buscar(v);
          $(`#${id}List`).innerHTML = lista.slice(0, 40)
            .map(x => `<option value="${esc(x[claveNombre])}"></option>`).join('');
          const exacto = lista.find(x => x[claveNombre] === v);
          if (exacto) {
            elegido = exacto[claveId];
            $(`#${id}Ayuda`).innerHTML = `<span style="color:var(--palm)">«${esc(exacto[claveNombre])}» seleccionado.</span>`;
          } else {
            $(`#${id}Ayuda`).textContent = lista.length
              ? `${lista.length} coincidencias. Elige una de la lista.` : 'Ninguna coincidencia.';
          }
        } catch { /* sin resultados */ }
      }, 300);
    };
    return () => ({ texto: input.value.trim(), id: elegido });
  };
  const lote = conectar('mLote', async v => (await API.lotes(v)).lotes || [], 'cat_lote_id', 'nombre');
  const uma = varios ? null : conectar('mUma', async v => (await API.umas(v)).umas || [], 'nut_uma_id', 'codigo');

  const cerrar = () => { caja.innerHTML = ''; };
  $('#mCancelar').onclick = cerrar;
  $('#vFondo').onclick = e => { if (e.target.id === 'vFondo') cerrar(); };
  $('#mLote').focus();

  $('#mGuardar').onclick = async () => {
    const msg = $('#mMsg'), btn = $('#mGuardar');
    const L = lote(), U = uma ? uma() : { texto: '', id: null };
    if (L.texto && !L.id) { msg.innerHTML = `<div class="msg msg-err">Elige un lote de la lista.</div>`; return; }
    if (U.texto && !U.id) { msg.innerHTML = `<div class="msg msg-err">Elige una UMA de la lista.</div>`; return; }
    if (varios && !L.id) { msg.innerHTML = `<div class="msg msg-err">Elige el lote nuevo.</div>`; return; }

    const campos = {};
    if (L.id) campos.cat_lote_id = L.id;
    if (!varios) {
      const li = $('#mLinea').value.trim(), pa = $('#mPalma').value.trim();
      if (li !== '') campos.linea = Number(li);
      if (pa !== '') campos.palma = Number(pa);
      if (U.id) campos.nut_uma_id = U.id;
      if (!Object.keys(campos).length) {
        msg.innerHTML = `<div class="msg msg-err">No cambiaste ningún campo.</div>`; return;
      }
    }

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const r = varios ? await API.corregirLote(ids, L.id) : await API.corregir(ids[0], campos);
      msg.innerHTML = `<div class="msg msg-ok">${n0(r.corregidos)} registro(s) corregido(s).</div>`;
      S.seleccion.clear();
      setTimeout(async () => { cerrar(); await cargar(); }, 900);
    } catch (e) {
      msg.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  };
}
