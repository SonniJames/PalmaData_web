// ============================================================
// PalmaData · Administración · Personal
//
// Tabla maestra de trabajadores: una sola pantalla, sin revisión ni
// descargas. Alta, corrección, baja (estado = 0) y reactivación.
//
// La baja NO borra el registro: los censos, cosechas y polinizaciones
// que apuntan a ese trabajador seguirían mostrando su nombre.
// ============================================================
import { API } from './api_personal.js';

const S = {
  busqueda: '',
  verAnulados: false,
  soloSupervisores: false,
  seleccion: new Set(),
  datos: null,
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fecha = f => f ? String(f).slice(0, 10) : '—';

// ============================================================
export async function montar(cont) {
  esqueleto(cont);
  await cargar();
}

function esqueleto(cont) {
  const estilo = 'padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px';
  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="pBus">Buscar trabajador</label>
        <input id="pBus" list="pBusList" placeholder="Nombre o documento…"
               autocomplete="off" style="min-width:240px;${estilo}">
        <datalist id="pBusList"></datalist>
        <button class="btn btn-ghost" id="pBusX" style="padding:8px 11px" title="Limpiar">✕</button></div>
      <div class="sp"></div>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="pSup"> Solo supervisores</label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="pAnu"> Solo anulados</label>
      <button class="btn btn-primary" id="pNuevo">Ingresar trabajador</button>
    </div>
    <div id="pC"></div>
    <div id="pModal"></div>`;

  // El buscador filtra la tabla; las sugerencias salen del servidor.
  let temp = null;
  $('#pBus').oninput = e => {
    clearTimeout(temp);
    const v = e.target.value;
    temp = setTimeout(async () => {
      if (v.trim().length >= 2) {
        try {
          const r = await API.buscar(v);
          $('#pBusList').innerHTML = (r.trabajadores || [])
            .map(t => `<option value="${esc(t.nombre)}">${esc(t.documento ?? '')}${t.activo ? '' : ' · anulado'}</option>`)
            .join('');
        } catch { /* sin sugerencias */ }
      }
      S.busqueda = v;
      S.seleccion.clear();
      cargar();
    }, 350);
  };
  $('#pBusX').onclick = () => {
    $('#pBus').value = ''; S.busqueda = ''; S.seleccion.clear(); cargar();
  };
  $('#pSup').onchange = e => {
    S.soloSupervisores = e.target.checked; S.seleccion.clear(); cargar();
  };
  $('#pAnu').onchange = e => {
    S.verAnulados = e.target.checked; S.seleccion.clear(); cargar();
  };
  $('#pNuevo').onclick = () => abrirModal(null);
}

async function cargar() {
  const c = $('#pC');
  if (!c) return;
  c.innerHTML = `<div class="cargando">Cargando trabajadores…</div>`;
  try {
    S.datos = await API.listar({
      q: S.busqueda, verAnulados: S.verAnulados,
      soloSupervisores: S.soloSupervisores,
    });
    vista(c);
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  }
}

function vista(c) {
  const d = S.datos, r = d.resumen || {};
  const vacio = !d.registros.length;
  const motivoVacio = S.busqueda
    ? `<h3>Sin coincidencias</h3>
       <p>Ningún trabajador ${S.verAnulados ? 'anulado ' : ''}coincide con
          «${esc(S.busqueda)}». Limpia el buscador para ver la lista completa.</p>`
    : S.verAnulados
    ? `<h3>Ningún trabajador anulado</h3>
       <p>No hay bajas registradas. Desmarca <strong>Solo anulados</strong>
          para ver la lista de activos.</p>`
    : S.soloSupervisores
    ? `<h3>Ningún supervisor</h3>
       <p>No hay trabajadores marcados como supervisores.</p>`
    : `<h3>Sin trabajadores</h3>
       <p>Usa <strong>Ingresar trabajador</strong> para crear el primero.</p>`;

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Trabajadores activos</div>
        <div class="v">${n0(r.activos)}</div>
        <div class="s">de ${n0(r.total)} en total</div></div>
      <div class="kpi"><div class="l">Supervisores</div>
        <div class="v">${n0(r.supervisores)}</div>
        <div class="s">entre los activos</div></div>
      ${r.anulados ? `<div class="kpi"><div class="l">Anulados</div>
        <div class="v">${n0(r.anulados)}</div></div>` : ''}
      ${r.sin_documento ? `<div class="kpi"><div class="l">Sin documento</div>
        <div class="v">${n0(r.sin_documento)}</div>
        <div class="s">activos, para completar</div></div>` : ''}
    </div>

    ${S.verAnulados ? `<div class="msg msg-warn">Estás viendo <strong>solo los
      trabajadores anulados</strong>. Puedes reactivar los que se dieron de
      baja por error.</div>` : ''}

    ${d.truncado ? `<div class="msg msg-warn">Se muestran los primeros
      ${n0(d.limite)} trabajadores. Usa el buscador para acotar.</div>` : ''}

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;
                  gap:14px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <h3 style="margin:0">Personal</h3>
          <p class="sub" style="margin:6px 0 0">Selecciona un trabajador para
            corregirlo, o varios para darlos de baja. La baja
            <strong>no borra</strong>: los registros de campo que lo
            mencionan siguen intactos.</p>
        </div>
        <strong style="font-size:14px;color:var(--muted)">${n0(d.total)} en la tabla</strong>
      </div>

      <div class="fbar" id="pAcciones" style="margin-bottom:14px;display:none">
        <strong id="pSelN" style="font-size:14px"></strong>
        <div class="sp"></div>
        <button class="btn btn-primary" id="pEditar">Corregir trabajador</button>
        <button class="btn btn-ghost" id="pAnular">Anular</button>
        <button class="btn btn-ghost" id="pReactivar">Reactivar</button>
        <button class="btn btn-ghost" id="pQuitar">Quitar selección</button>
      </div>

      ${vacio ? `<div class="vacio" style="padding:36px 20px">${motivoVacio}</div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr>
            <th style="width:34px"><input type="checkbox" id="pTodos" title="Seleccionar todo"></th>
            <th class="num">Código</th>
            <th>Nombre</th><th>Documento</th><th>Estado</th>
            <th>Supervisor</th><th>Código SIP</th>
            <th>Agregado por</th><th>Corregido</th>
          </tr></thead>
          <tbody>${d.registros.map(x => `<tr data-id="${x.aux_trabajador_id}"
              ${x.activo ? '' : 'style="opacity:.5"'}>
            <td><input type="checkbox" class="pSel" value="${x.aux_trabajador_id}"
                 ${S.seleccion.has(x.aux_trabajador_id) ? 'checked' : ''}></td>
            <td class="num">${x.aux_trabajador_id}</td>
            <td class="ln">${esc(x.nombre ?? '—')}</td>
            <td>${esc(x.documento ?? '—')}</td>
            <td>${x.activo
              ? '<span class="sem sem-optimo" style="min-width:auto">Activo</span>'
              : `<span class="sem sem-deficiente" style="min-width:auto"
                   title="${esc(x.anulado_motivo ?? '')}">Anulado</span>`}</td>
            <td>${x.es_supervisor ? 'Sí' : 'No'}</td>
            <td>${esc(x.codigo_sip ?? '—')}</td>
            <td style="font-size:12.5px">${x.agregado_por
              ? `${esc(x.agregado_por)}<br><span style="color:var(--muted)">${fecha(x.creado_at)}</span>`
              : '—'}</td>
            <td style="font-size:12.5px">${x.corregido_por
              ? `<span class="sem sem-optimo" title="${esc(String(x.corregido_at ?? ''))}">${esc(x.corregido_por)}</span>`
              : (x.anulado_por
                  ? `<span class="sem sem-deficiente" title="${esc(x.anulado_motivo ?? '')}">anuló ${esc(x.anulado_por)}</span>`
                  : '—')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`}
    </div>`;

  const refrescar = () => {
    const barra = $('#pAcciones');
    if (!barra) return;
    const n = S.seleccion.size;
    barra.style.display = n ? 'flex' : 'none';
    $('#pSelN').textContent = n === 1
      ? '1 trabajador seleccionado' : `${n} trabajadores seleccionados`;
    // La corrección es de a uno: los campos son propios de cada persona.
    const btn = $('#pEditar');
    btn.disabled = n !== 1;
    btn.title = n > 1 ? 'Selecciona un solo trabajador para corregirlo' : '';
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
  if (editar) editar.onclick = () => {
    if (S.seleccion.size === 1) abrirModal([...S.seleccion][0]);
  };
  const anular = $('#pAnular');
  if (anular) anular.onclick = () => accion('anular');
  const react = $('#pReactivar');
  if (react) react.onclick = () => accion('reactivar');

  refrescar();
}

async function accion(tipo) {
  const ids = [...S.seleccion];
  if (!ids.length) return;

  let motivo = null;
  if (tipo === 'anular') {
    motivo = prompt(`Vas a dar de baja ${ids.length} trabajador(es).\n\n` +
                    `No se borra nada: sus registros de campo quedan intactos ` +
                    `y puedes reactivarlo cuando quieras.\n\nMotivo (opcional):`, '');
    if (motivo === null) return;
  } else if (!confirm(`Vas a reactivar ${ids.length} trabajador(es). ¿Continuar?`)) {
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
//  VENTANA DE ALTA / CORRECCIÓN
//  id === null  ->  crear
// ============================================================
function abrirModal(id) {
  const nuevo = id === null;
  const reg = nuevo ? {}
    : (S.datos.registros.find(x => x.aux_trabajador_id === id) || {});

  const caja = $('#pModal');
  caja.innerHTML = `
    <div class="modal-fondo" id="pFondo">
      <div class="modal">
        <h3>${nuevo ? 'Ingresar trabajador' : 'Corregir trabajador'}</h3>
        <p class="sub">${nuevo
          ? `El código lo asigna la base de datos. Los demás campos de la
             tabla (área, cuadrilla, cargo…) quedan vacíos: no se piden aquí.`
          : `Código ${reg.aux_trabajador_id} · ${esc(reg.nombre ?? '')}.
             Deja en blanco lo que no quieras cambiar.`}</p>

        <div class="mcampo">
          <label for="mNom">Nombre${nuevo ? ' <span style="color:var(--danger)">*</span>' : ''}</label>
          <input id="mNom" maxlength="100" autocomplete="off"
                 ${nuevo ? '' : `placeholder="${esc(reg.nombre ?? '')}"`}>
        </div>
        <div class="mcampo">
          <label for="mDoc">Documento</label>
          <input id="mDoc" maxlength="50" autocomplete="off"
                 ${nuevo ? '' : `placeholder="${esc(reg.documento ?? '')}"`}>
          <div class="ayuda">No puede repetirse entre trabajadores activos.</div>
        </div>
        <div class="mcampo">
          <label for="mSup">Supervisor${nuevo ? ' <span style="color:var(--danger)">*</span>' : ''}</label>
          <select id="mSup">
            ${nuevo
              ? `<option value="">— elige —</option>
                 <option value="0">No</option>
                 <option value="1">Sí</option>`
              : `<option value="">— sin cambio (${reg.es_supervisor ? 'Sí' : 'No'}) —</option>
                 <option value="0">No</option>
                 <option value="1">Sí</option>`}
          </select>
        </div>
        <div class="mcampo">
          <label for="mSip">Código SIP</label>
          <input id="mSip" maxlength="200" autocomplete="off"
                 ${nuevo ? '' : `placeholder="${esc(reg.codigo_sip ?? '')}"`}>
        </div>

        <div id="mMsg"></div>
        <div class="macciones">
          <button class="btn btn-ghost" id="mCancelar">Cancelar</button>
          <button class="btn btn-primary" id="mGuardar">
            ${nuevo ? 'Crear trabajador' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>`;

  const cerrar = () => { caja.innerHTML = ''; };
  $('#mCancelar').onclick = cerrar;
  $('#pFondo').onclick = e => { if (e.target.id === 'pFondo') cerrar(); };
  $('#mNom').focus();

  $('#mGuardar').onclick = async () => {
    const btn = $('#mGuardar');
    const msg = $('#mMsg');
    const campos = {
      nombre: $('#mNom').value.trim(),
      documento: $('#mDoc').value.trim(),
      supervisor: $('#mSup').value,
      sucursal: $('#mSip').value.trim(),
    };

    if (nuevo) {
      if (!campos.nombre) {
        msg.innerHTML = `<div class="msg msg-err">El nombre es obligatorio.</div>`;
        return;
      }
      if (campos.supervisor === '') {
        msg.innerHTML = `<div class="msg msg-err">Indica si es supervisor.</div>`;
        return;
      }
    } else if (!campos.nombre && !campos.documento
               && campos.supervisor === '' && !campos.sucursal) {
      msg.innerHTML = `<div class="msg msg-err">No cambiaste ningún campo.</div>`;
      return;
    }

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (nuevo) {
        const r = await API.crear(campos);
        msg.innerHTML = `<div class="msg msg-ok">Trabajador creado con el
          código ${r.aux_trabajador_id}.</div>`;
      } else {
        await API.corregir(id, campos);
        msg.innerHTML = `<div class="msg msg-ok">Trabajador corregido.</div>`;
      }
      S.seleccion.clear();
      setTimeout(async () => { cerrar(); await cargar(); }, 1000);
    } catch (e) {
      msg.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
      btn.disabled = false;
      btn.textContent = nuevo ? 'Crear trabajador' : 'Guardar cambios';
    }
  };
}
