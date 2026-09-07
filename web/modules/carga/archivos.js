// ============================================================
// PalmaData · Cargar datos · Archivos de la app
//
// Sube los Excel que genera la app cuando no hay internet. Cada archivo
// se procesa por separado, así que uno con problemas no impide que los
// demás entren — importa cuando se suben diez o quince de una vez.
//
// Subir el mismo archivo dos veces NO duplica nada: cada registro trae su
// identificador y la base descarta los que ya tiene.
// ============================================================
import { API } from './api.js';

const S = { catalogo: null, seleccion: [], subiendo: false, resultados: null };

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kb = b => b < 1024 * 1024 ? `${Math.round(b / 1024)} KB`
                                : `${(b / 1024 / 1024).toFixed(1)} MB`;

// Del nombre del archivo se saca la tabla, igual que hace el servidor.
// Aquí solo sirve para mostrarlo antes de subir.
function tablaDe(nombre) {
  const base = nombre.replace(/\.xlsx?$/i, '');
  const m = base.match(/^(.+)_(\d{8})_(\d+)$/);
  return m ? { tabla: m[1].toLowerCase(), fecha: m[2], orden: Number(m[3]) }
           : { tabla: base.toLowerCase(), fecha: null, orden: null };
}

// Mismo orden que usa el servidor: por fecha y luego por el número final.
function ordenar(lista) {
  return [...lista].sort((a, b) => {
    const A = tablaDe(a.name), B = tablaDe(b.name);
    return (A.fecha || '99999999').localeCompare(B.fecha || '99999999')
        || (A.orden ?? 9999) - (B.orden ?? 9999)
        || a.name.localeCompare(b.name);
  });
}

// ============================================================
export async function montar(cont) {
  cont.innerHTML = `<div class="cargando">Cargando…</div>`;
  try {
    S.catalogo = await API.tablas();
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  esqueleto(cont);
  pintarSeleccion();
  await pintarHistorial();
}

function esqueleto(cont) {
  cont.innerHTML = `
    <div class="card">
      <h3>Cargar los Excel de la app</h3>
      <p class="sub">Para los sitios donde no hay internet: la app guarda en
        Excel lo mismo que enviaría por red, y aquí entra a la base. El
        resultado es idéntico — los cálculos y validaciones de cada tabla
        corren igual.</p>

      <div class="soltar" id="cZona">
        <div class="icono">📄</div>
        <h3>Arrastra aquí los archivos</h3>
        <p class="sub" style="margin:0">o haz clic para elegirlos. Puedes soltar
          varios a la vez; se procesan en el orden en que los generó la app.</p>
        <input type="file" id="cInput" multiple accept=".xlsx,.xlsm" hidden>
      </div>

      <div class="lista-archivos" id="cLista"></div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;align-items:center">
        <button class="btn btn-primary" id="cSubir" disabled>Cargar a la base</button>
        <button class="btn btn-ghost" id="cQuitar" disabled>Quitar todos</button>
        <span class="sub" id="cAviso" style="margin:0"></span>
      </div>

      <div id="cResultado" style="margin-top:16px"></div>
    </div>

    <div class="card">
      <h3>Qué archivos acepta</h3>
      <p class="sub">El nombre del archivo dice a qué tabla va. La columna de
        control es la que evita que un registro entre dos veces.</p>
      <div class="twrap" style="max-height:300px">
        <table class="ft">
          <thead><tr><th>Archivo empieza por</th><th>Columna de control</th></tr></thead>
          <tbody>${(S.catalogo.tablas || []).map(t => `<tr>
            <td class="ln">${esc(t.tabla)}</td>
            <td>${esc(t.conflicto)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      ${(S.catalogo.no_soportadas || []).length ? `
        <div class="msg msg-warn" style="margin-top:12px">
          ${S.catalogo.no_soportadas.map(x =>
            `<strong>${esc(x.tabla)}</strong>: ${esc(x.motivo)}`).join('<br>')}
        </div>` : ''}
    </div>

    <div id="cHistorial"></div>`;

  const zona = $('#cZona'), input = $('#cInput');
  zona.onclick = () => input.click();
  input.onchange = () => { agregar(input.files); input.value = ''; };

  ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
    e.preventDefault(); zona.classList.add('encima');
  }));
  ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
    e.preventDefault(); zona.classList.remove('encima');
  }));
  zona.addEventListener('drop', e => agregar(e.dataTransfer.files));

  $('#cQuitar').onclick = () => { S.seleccion = []; pintarSeleccion(); };
  $('#cSubir').onclick = subir;
}

function agregar(lista) {
  const nuevos = [...lista].filter(f => /\.xlsx?$/i.test(f.name));
  const rechazados = [...lista].length - nuevos.length;

  // Sin repetir: si sueltan dos veces el mismo, se cuenta una
  for (const f of nuevos) {
    if (!S.seleccion.some(x => x.name === f.name && x.size === f.size)) {
      S.seleccion.push(f);
    }
  }
  pintarSeleccion(rechazados
    ? `${rechazados} archivo(s) ignorado(s): solo se aceptan .xlsx.` : '');
}

function pintarSeleccion(aviso = '') {
  const lista = $('#cLista');
  if (!lista) return;
  S.seleccion = ordenar(S.seleccion);

  const conocidas = new Set((S.catalogo.tablas || []).map(t => t.tabla));
  const vetadas = new Set((S.catalogo.no_soportadas || []).map(t => t.tabla));

  lista.innerHTML = S.seleccion.map((f, i) => {
    const t = tablaDe(f.name);
    let tag = `<span class="tag">${esc(t.tabla)}</span>`;
    if (vetadas.has(t.tabla)) {
      tag = `<span class="tag" style="background:#f6e3c8">no se carga</span>`;
    } else if (!conocidas.has(t.tabla)) {
      tag = `<span class="tag" style="background:#f4d4d4">tabla desconocida</span>`;
    }
    return `<div class="arch">
      <span class="nom">${esc(f.name)}</span>
      ${tag}
      <span class="tag">${kb(f.size)}</span>
      <button class="btn btn-ghost" data-i="${i}" style="padding:2px 9px">✕</button>
    </div>`;
  }).join('');

  lista.querySelectorAll('button[data-i]').forEach(b => {
    b.onclick = () => { S.seleccion.splice(Number(b.dataset.i), 1); pintarSeleccion(); };
  });

  $('#cSubir').disabled = !S.seleccion.length || S.subiendo;
  $('#cQuitar').disabled = !S.seleccion.length || S.subiendo;
  $('#cAviso').innerHTML = aviso
    ? `<span style="color:var(--danger)">${esc(aviso)}</span>`
    : (S.seleccion.length ? `${S.seleccion.length} archivo(s) listos.` : '');
}

async function subir() {
  if (!S.seleccion.length || S.subiendo) return;
  S.subiendo = true;
  $('#cSubir').disabled = true;
  $('#cQuitar').disabled = true;
  $('#cSubir').textContent = 'Cargando…';
  $('#cResultado').innerHTML = `<div class="cargando">Procesando
    ${S.seleccion.length} archivo(s)…</div>`;

  try {
    const r = await API.subir(S.seleccion);
    S.resultados = r;
    pintarResultado(r);
    S.seleccion = [];
    pintarSeleccion();
    await pintarHistorial();
  } catch (e) {
    $('#cResultado').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
  } finally {
    S.subiendo = false;
    $('#cSubir').textContent = 'Cargar a la base';
    pintarSeleccion();
  }
}

function pintarResultado(r) {
  const t = r.total;
  const marca = {
    ok:      '<span class="sem sem-optimo" style="min-width:auto">Cargado</span>',
    vacio:   '<span class="sem" style="min-width:auto;background:#e8e6e1;color:#6b6560">Sin filas</span>',
    omitido: '<span class="sem" style="min-width:auto;background:#f6e3c8;color:#7a5a1e">Omitido</span>',
    error:   '<span class="sem sem-deficiente" style="min-width:auto">Error</span>',
  };

  $('#cResultado').innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Archivos</div><div class="v">${n0(t.archivos)}</div>
        ${t.con_error ? `<div class="s" style="color:var(--danger)">${n0(t.con_error)} con error</div>` : ''}</div>
      <div class="kpi"><div class="l">Registros nuevos</div><div class="v">${n0(t.nuevas)}</div></div>
      <div class="kpi"><div class="l">Ya estaban</div><div class="v">${n0(t.repetidas)}</div>
        <div class="s">no se duplicaron</div></div>
    </div>
    <div class="twrap">
      <table class="ft">
        <thead><tr><th>Archivo</th><th>Tabla</th><th></th>
          <th class="num">Leídas</th><th class="num">Nuevas</th>
          <th class="num">Repetidas</th><th>Detalle</th></tr></thead>
        <tbody>${r.resultados.map(x => `<tr>
          <td class="ln" style="word-break:break-all">${esc(x.archivo)}</td>
          <td>${esc(x.tabla ?? '—')}</td>
          <td>${marca[x.estado] || marca.error}</td>
          <td class="num">${n0(x.leidas)}</td>
          <td class="num">${x.estado === 'ok' ? n0(x.nuevas) : '—'}</td>
          <td class="num">${x.estado === 'ok' ? n0(x.repetidas) : '—'}</td>
          <td style="max-width:340px;font-size:12.5px">${esc(x.mensaje)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

async function pintarHistorial() {
  const caja = $('#cHistorial');
  if (!caja) return;
  try {
    const h = await API.historial(50);
    const r = h.resumen || {};
    caja.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;
                    gap:14px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <h3 style="margin:0">Últimas cargas</h3>
            <p class="sub" style="margin:6px 0 0">${n0(r.archivos)} archivos ·
              ${n0(r.filas_nuevas)} registros nuevos ·
              ${n0(r.filas_repetidas)} que ya estaban${r.con_error
                ? ` · <span style="color:var(--danger)">${n0(r.con_error)} con error</span>` : ''}</p>
          </div>
        </div>
        ${!h.registros.length ? `<div class="vacio" style="padding:28px">
          <h3>Todavía no se ha cargado nada</h3>
          <p>Los archivos que subas van a aparecer aquí.</p></div>` : `
        <div class="twrap" style="max-height:420px">
          <table class="ft">
            <thead><tr><th>Cuándo</th><th>Archivo</th><th>Tabla</th>
              <th class="num">Nuevas</th><th class="num">Repetidas</th>
              <th>Resultado</th><th>Quién</th></tr></thead>
            <tbody>${h.registros.map(x => `<tr ${x.resultado !== 'ok' ? 'style="opacity:.7"' : ''}>
              <td>${esc(x.cargado_at)}</td>
              <td class="ln" style="word-break:break-all">${esc(x.archivo)}</td>
              <td>${esc(x.tabla)}</td>
              <td class="num">${n0(x.filas_nuevas)}</td>
              <td class="num">${n0(x.filas_repetidas)}</td>
              <td>${x.resultado === 'ok'
                ? '<span class="sem sem-optimo" style="min-width:auto">ok</span>'
                : `<span class="sem sem-deficiente" style="min-width:auto"
                     title="${esc(x.detalle ?? '')}">error</span>`}</td>
              <td>${esc(x.cargado_por ?? '—')}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`}
      </div>`;
  } catch (e) {
    caja.innerHTML = `<div class="msg msg-warn">No se pudo cargar el
      historial: ${esc(e.message)}</div>`;
  }
}
