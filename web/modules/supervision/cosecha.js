// ============================================================
// PalmaData · Supervisión · Cosecha lote
//
// La tabla que se ve es exactamente la que se baja en Excel. Se puede
// corregir UN registro a la vez: lote, línea, palma, ciclo, cortador,
// recolector y alistador. No hay anulación ni corrección masiva.
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
  seleccion: null,          // id del registro elegido para corregir
};

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const n1 = v => (v == null || isNaN(v)) ? '—'
  : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 });
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hoy = () => new Date().toISOString().slice(0, 10);
const hora = h => h ? String(h).slice(0, 5) : '—';
const n2 = v => (v == null || isNaN(v)) ? '—'
  : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 2 });

// Encabezados que van alineados a la derecha (son números)
const NUMERICAS = new Set(['LINEA', 'PALMA', 'CICLO', 'FRUTO PLATO',
  'RAC. MAL ACOMODADO', 'PENDUN. LARGO', 'PORCENTAJE BASURA',
  'PLATOS ENMALEZADOS', 'MALEZAS ESTIPE', 'LOTE INUNDADO', 'PODA ATRASADA']);
const esNumerica = x => NUMERICAS.has(x) || x.startsWith('RACIMO') || x.startsWith('HOJA');

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
  S.seleccion = null;
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
          <p class="sub" style="margin:6px 0 0">Es la misma tabla que se
            descarga en Excel; el Excel trae además la línea y la palma.
            Selecciona un registro para corregir su lote, línea, palma, ciclo
            o trabajadores. Los filtros de cortador,
            recolector y alistador traen los registros donde la persona
            aparece, sola o acompañada.</p>
        </div>
        <strong style="font-size:14px;color:var(--ink-soft)">${n0(d.total)} registros</strong>
      </div>

      <div class="fbar" id="cAcciones" style="margin-bottom:14px;display:none">
        <strong id="cSelN" style="font-size:14px"></strong>
        <div class="sp"></div>
        <button class="btn btn-primary" id="cEditar">Corregir registro</button>
        <button class="btn btn-ghost" id="cQuitar">Quitar selección</button>
      </div>

      ${vacio ? `<div class="vacio" style="padding:36px 20px">
        <h3>Sin registros</h3>
        <p>${esc(periodoTexto())} con los filtros aplicados. Prueba con otro
           rango o quita algún filtro.</p></div>` : `
      <div class="twrap">
        <table class="ft">
          <thead><tr><th style="width:34px"></th>${d.columnas.map(x => `<th${
            esNumerica(x) ? ' class="num"' : ''}>${esc(x)}</th>`).join('')}</tr></thead>
          <tbody>${d.registros.map(x => `<tr data-id="${x.id}">
            <td><input type="radio" name="cSel" class="cSel" value="${x.id}"
                 title="Seleccionar para corregir"></td>
            <td>${esc(x.fecha)}</td>
            <td>${hora(x.hora)}</td>
            <td>${esc(x.supervisor ?? '—')}</td>
            <td>${esc(x.cortador ?? '—')}</td>
            <td>${esc(x.recolector ?? '—')}</td>
            <td>${esc(x.alistador ?? '—')}</td>
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
            <td class="num">${n0(x.racimomalacomo)}</td>
            <td class="num">${n0(x.pendunculolargo)}</td>
            <td class="num">${n2(x.porcentajebasura)}</td>
            <td class="num">${n0(x.platos_enmalezados)}</td>
            <td class="num">${n0(x.malezas_estipe)}</td>
            <td class="num">${n0(x.lote_inundado)}</td>
            <td class="num">${n0(x.poda_atrasada)}</td>
            <td style="font-size:12.5px">${x.corregido_por
              ? `<span class="sem sem-optimo">${esc(x.corregido_por)}</span>` : '—'}</td>
            <td style="font-size:12.5px;white-space:nowrap">${esc(x.corregido_at ?? '—')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`}
    </div>

    <div id="cModal"></div>`;

  // ── Selección: un solo registro a la vez ──
  const refrescar = () => {
    const barra = $('#cAcciones');
    if (!barra) return;
    const reg = S.seleccion && d.registros.find(x => x.id === S.seleccion);
    barra.style.display = reg ? 'flex' : 'none';
    if (reg) $('#cSelN').textContent =
      `1 registro seleccionado · ${reg.fecha} · ${reg.lote ?? 'sin lote'} · línea ${reg.linea ?? '—'} · palma ${reg.palma ?? '—'}`;
  };
  c.querySelectorAll('.cSel').forEach(r => {
    r.onchange = () => { S.seleccion = Number(r.value); refrescar(); };
  });
  $('#cQuitar').onclick = () => {
    S.seleccion = null;
    c.querySelectorAll('.cSel').forEach(r => { r.checked = false; });
    refrescar();
  };
  $('#cEditar').onclick = () => { if (S.seleccion) abrirModal(S.seleccion); };
  refrescar();
}

// ============================================================
//  VENTANA DE CORRECCIÓN · un registro
// ============================================================
const ROLES = [['cortador', 'Cortador'], ['recolector', 'Recolector'],
               ['alistador', 'Alistador']];

async function abrirModal(id) {
  const caja = $('#cModal');
  let reg;
  try {
    reg = (await API.registro(id)).registro;
  } catch (e) {
    alert(e.message);
    return;
  }

  // Copia de trabajo de cada rol: [{codigo, nombre}] en el orden guardado
  const listas = {};
  const originales = {};
  ROLES.forEach(([rol]) => {
    listas[rol] = (reg[rol] || []).map(t => ({ ...t }));
    originales[rol] = listas[rol].map(t => t.codigo).join(',');
  });

  caja.innerHTML = `
    <div class="modal-fondo" id="cFondo">
      <div class="modal" style="max-width:600px">
        <h3>Ajuste para único registro</h3>
        <p class="sub">${esc(reg.fecha ?? '')} · ${hora(reg.hora)} · supervisor
          ${esc(reg.supervisor ?? '—')}<br>Lote ${esc(reg.lote ?? '—')} · línea
          ${reg.linea ?? '—'} · palma ${reg.palma ?? '—'} · ciclo ${reg.ciclo ?? '—'}.
          Deja en blanco lo que no quieras cambiar.${reg.corregido_por
            ? `<br><span style="color:var(--ink-soft)">Última corrección: ${esc(reg.corregido_por)}
               · ${esc(reg.corregido_at ?? '')}</span>` : ''}</p>

        <div class="mcampo">
          <label for="mLote">Lote</label>
          <input id="mLote" list="mLoteList" autocomplete="off"
                 placeholder="${esc(reg.lote ?? 'Escribe el número o el nombre…')}">
          <datalist id="mLoteList"></datalist>
          <div class="ayuda" id="mLoteAyuda">Escribe <em>138</em> para encontrar
            <em>L138-C</em>.</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          <div class="mcampo">
            <label for="mLinea">Línea</label>
            <input type="number" min="1" id="mLinea" placeholder="${reg.linea ?? ''}">
          </div>
          <div class="mcampo">
            <label for="mPalma">Palma</label>
            <input type="number" min="1" id="mPalma" placeholder="${reg.palma ?? ''}">
          </div>
          <div class="mcampo">
            <label for="mCiclo">Ciclo</label>
            <input type="number" min="0" id="mCiclo" placeholder="${reg.ciclo ?? ''}">
          </div>
        </div>

        ${ROLES.map(([rol, titulo]) => `
        <div class="mcampo">
          <label>${titulo}</label>
          <div class="tchips" id="mChips-${rol}"></div>
          <input id="mBus-${rol}" list="mBusList-${rol}" autocomplete="off"
                 placeholder="Agregar ${titulo.toLowerCase()}: nombre o código…">
          <datalist id="mBusList-${rol}"></datalist>
          <div class="ayuda" id="mAyuda-${rol}"></div>
        </div>`).join('')}

        <div id="mMsg"></div>
        <div class="macciones">
          <button class="btn btn-ghost" id="mCancelar">Cancelar</button>
          <button class="btn btn-primary" id="mGuardar">Guardar cambios</button>
        </div>
      </div>
    </div>`;

  // ── Trabajadores: chips con × para quitar ──
  const pintar = (rol) => {
    const cont = $(`#mChips-${rol}`);
    cont.innerHTML = listas[rol].length
      ? listas[rol].map((t, i) => `<span class="tchip${t.nombre ? '' : ' tchip-sin'}"
            title="Código ${t.codigo}">${esc(t.nombre || `Sin nombre (${t.codigo})`)}
            <button type="button" data-i="${i}" aria-label="Quitar">×</button></span>`).join('')
      : `<span class="tvacio">Sin ${rol}</span>`;
    cont.querySelectorAll('button').forEach(b => {
      b.onclick = () => { listas[rol].splice(Number(b.dataset.i), 1); pintar(rol); };
    });
  };

  ROLES.forEach(([rol]) => {
    pintar(rol);
    const input = $(`#mBus-${rol}`);
    const ayuda = $(`#mAyuda-${rol}`);
    let opciones = new Map();          // texto de la opción -> trabajador
    let temp = null;
    input.oninput = () => {
      const v = input.value;
      // ¿Eligió una opción de la lista?
      const elegido = opciones.get(v);
      if (elegido) {
        if (listas[rol].some(t => t.codigo === elegido.codigo)) {
          ayuda.textContent = `${elegido.nombre} ya está en la lista.`;
        } else {
          listas[rol].push({ codigo: elegido.codigo, nombre: elegido.nombre });
          pintar(rol);
          ayuda.textContent = '';
        }
        input.value = '';
        return;
      }
      clearTimeout(temp);
      if (!v.trim()) { ayuda.textContent = ''; return; }
      temp = setTimeout(async () => {
        try {
          const r = await API.trabajadores(v.trim());
          const lista = r.trabajadores || [];
          opciones = new Map(lista.map(t => [
            `${t.nombre ?? 'Sin nombre'} · ${t.codigo}${t.activo ? '' : ' (inactivo)'}`, t]));
          $(`#mBusList-${rol}`).innerHTML = [...opciones.keys()]
            .map(k => `<option value="${esc(k)}"></option>`).join('');
          ayuda.textContent = lista.length
            ? `${lista.length} coincidencias. Elige una de la lista.`
            : 'Ningún trabajador coincide.';
        } catch { /* sin resultados */ }
      }, 300);
    };
  });

  // ── Lote: el mismo buscador del censo ──
  let loteId = null;
  let tempLote = null;
  const inputLote = $('#mLote');
  inputLote.oninput = () => {
    clearTimeout(tempLote);
    loteId = null;
    const v = inputLote.value;
    if (!v.trim()) { $('#mLoteAyuda').textContent = ''; return; }
    tempLote = setTimeout(async () => {
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
  $('#cFondo').onclick = e => { if (e.target.id === 'cFondo') cerrar(); };

  $('#mGuardar').onclick = async () => {
    const btn = $('#mGuardar');
    const msg = $('#mMsg');

    if (inputLote.value.trim() && !loteId) {
      msg.innerHTML = `<div class="msg msg-err">Elige un lote de la lista:
        el nombre escrito no coincide con ninguno.</div>`;
      return;
    }

    const campos = {};
    if (loteId && loteId !== reg.cat_lote_id) campos.cat_lote_id = loteId;
    for (const [clave, sel] of [['linea', '#mLinea'], ['palma', '#mPalma'], ['ciclo', '#mCiclo']]) {
      const v = $(sel).value.trim();
      if (v !== '') campos[clave] = Number(v);
    }
    // Solo se manda el rol que cambió, y completo, en el orden de la pantalla
    ROLES.forEach(([rol]) => {
      const ahora = listas[rol].map(t => t.codigo);
      if (ahora.join(',') !== originales[rol]) campos[rol] = ahora;
    });

    if (!Object.keys(campos).length) {
      msg.innerHTML = `<div class="msg msg-err">No cambiaste ningún campo.</div>`;
      return;
    }

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await API.corregir(id, campos);
      msg.innerHTML = `<div class="msg msg-ok">Registro corregido.</div>`;
      setTimeout(async () => { cerrar(); await cargar(); }, 900);
    } catch (e) {
      msg.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Guardar cambios';
    }
  };
}
