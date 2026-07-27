// ============================================================
// PalmaData · Fertilización
// El sistema no recalcula la agronomía: muestra lo que trae el
// Excel del ingeniero y le suma consolidación, costos y gráficas.
// ============================================================
import { API } from './api.js';

const S = {
  anio: null, campanas: [], zona: 'Todas', rangoEdad: 'Todas',
  zonas: [], rangos: [], tab: 'resumen', lotes: [], params: null,
};

const $ = (s, c = document) => c.querySelector(s);

const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const n2 = (v, d = 2) => (v == null || isNaN(v)) ? '—'
  : Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const cop = v => (v == null || isNaN(v)) ? '—' : '$ ' + Math.round(v).toLocaleString('es-CO');
const copM = v => (v == null || isNaN(v)) ? '—'
  : (Math.abs(v) >= 1e9 ? '$ ' + (v / 1e9).toFixed(2) + ' MM'
    : Math.abs(v) >= 1e6 ? '$ ' + (v / 1e6).toFixed(1) + ' M' : cop(v));
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const COLORES = ['#16412b', '#2f7d4f', '#e6a817', '#e0651a', '#5c8d6f',
  '#b8890f', '#8ab19a', '#c9560f', '#1d5237'];
const COL_ESTADO = {
  deficiente: '#c0392b', bajo: '#e6a817', optimo: '#2f7d4f',
  excesivo: '#1f4e79', 'sin-dato': '#c8bfab',
};

// ============================================================
export async function montar(cont, sub = 'resumen') {
  S.tab = sub || 'resumen';
  cont.innerHTML = `<div class="cargando">Cargando campañas…</div>`;
  try {
    S.campanas = (await API.campanas()).campanas || [];
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    return;
  }
  if (!S.anio) S.anio = S.campanas.length ? S.campanas[0].anio : new Date().getFullYear();
  esqueleto(cont);
  await cargar();
}

function esqueleto(cont) {
  const ops = S.campanas.length
    ? S.campanas.map(c => `<option value="${c.anio}" ${c.anio == S.anio ? 'selected' : ''}>${c.anio} · ${c.lotes} lotes</option>`).join('')
    : `<option value="${S.anio}">${S.anio}</option>`;

  cont.innerHTML = `
    <div class="fbar">
      <div class="g"><label for="fA">Campaña</label><select id="fA">${ops}</select></div>
      <div class="g"><label for="fZ">Zona</label><select id="fZ"><option>Todas</option></select></div>
      <div class="g"><label for="fE">Edad</label><select id="fE"><option>Todas</option></select></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="fR">Actualizar</button>
    </div>
    <div class="ftabs">
      <button class="ftab" data-tab="resumen">Resumen</button>
      <button class="ftab" data-tab="lotes">Lotes</button>
      <button class="ftab" data-tab="plan">Plan y costos</button>
      <button class="ftab" data-tab="parametros">Parámetros</button>
      <button class="ftab" data-tab="datos">Cargar datos</button>
    </div>
    <div id="fC"></div>`;

  $('#fA').onchange = e => { S.anio = +e.target.value; S.zona = 'Todas'; S.rangoEdad = 'Todas'; cargar(); };
  $('#fZ').onchange = e => { S.zona = e.target.value; cargar(); };
  $('#fE').onchange = e => { S.rangoEdad = e.target.value; cargar(); };
  $('#fR').onclick = cargar;
  cont.querySelectorAll('.ftab').forEach(b =>
    b.onclick = () => { S.tab = b.dataset.tab; cargar(); });
}

async function cargar() {
  document.querySelectorAll('.ftab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === S.tab));
  const c = $('#fC');
  if (!c) return;

  if (S.tab === 'parametros') return vistaParams(c);
  if (S.tab === 'datos') return vistaCarga(c);
  if (S.tab === 'resumen') return vistaResumen(c);

  c.innerHTML = `<div class="cargando">Cargando…</div>`;
  try {
    const r = await API.lotes(S.anio, { zona: S.zona, rangoEdad: S.rangoEdad });
    S.lotes = r.lotes || [];
    S.zonas = r.zonas || []; S.rangos = r.rangos_edad || [];
    filtros();
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; return;
  }
  if (!S.lotes.length) return vacio(c);
  S.tab === 'lotes' ? vistaLotes(c) : vistaPlan(c);
}

function vacio(c) {
  c.innerHTML = `<div class="vacio"><h3>Sin datos para ${S.anio}</h3>
    <p>Carga el Excel en la pestaña <strong>Cargar datos</strong>.</p></div>`;
}

function filtros() {
  const z = $('#fZ'), e = $('#fE');
  if (z) z.innerHTML = ['Todas', ...S.zonas].map(v =>
    `<option ${v === S.zona ? 'selected' : ''}>${esc(v)}</option>`).join('');
  if (e) e.innerHTML = ['Todas', ...S.rangos].map(v =>
    `<option ${v === S.rangoEdad ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

// ============================================================
//  RESUMEN · indicadores y gráficas
// ============================================================
async function vistaResumen(c) {
  c.innerHTML = `<div class="cargando">Calculando indicadores…</div>`;
  let d;
  try { d = await API.dashboard(S.anio); }
  catch (e) { c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; return; }
  if (d.vacio) return vacio(c);

  const t = d.total;
  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Lotes</div><div class="v">${n0(t.lotes)}</div></div>
      <div class="kpi"><div class="l">Palmas</div><div class="v">${n0(t.palmas)}</div></div>
      <div class="kpi"><div class="l">Fertilizante</div><div class="v">${n2(t.toneladas, 1)}</div><div class="s">toneladas</div></div>
      <div class="kpi acc"><div class="l">Costo estimado</div><div class="v">${copM(t.costo_total)}</div><div class="s">COP · ${S.anio}</div></div>
      <div class="kpi"><div class="l">Costo por palma</div><div class="v">${cop(t.costo_por_palma)}</div></div>
      ${t.ejecucion_pct != null ? `<div class="kpi"><div class="l">Presupuesto</div><div class="v">${n2(t.ejecucion_pct, 1)}%</div><div class="s">ejecutado</div></div>` : ''}
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Fertilizante por producto</h3>
        <p class="sub">Toneladas del plan de la campaña ${S.anio}.</p>
        ${barras(d.productos.map(p => ({ etiqueta: p.nombre, valor: p.toneladas })), ' t')}
      </div>
      <div class="card">
        <h3>Costo por zona</h3>
        <p class="sub">Distribución del presupuesto de fertilización.</p>
        ${barras(d.por_zona.map(g => ({ etiqueta: g.grupo, valor: g.costo_total })), '', copM)}
      </div>
    </div>

    <div class="card">
      <h3>Estado nutricional de la plantación</h3>
      <p class="sub">Cuántos lotes hay en cada rango del índice de balance, por nutriente.
        Los umbrales se ajustan en Parámetros.</p>
      ${barrasEstado(d.nutricion)}
      <div class="leg">
        ${Object.entries(COL_ESTADO).map(([k, v]) =>
          `<span><i style="background:${v}"></i>${k.replace('-', ' ')}</span>`).join('')}
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Toneladas por rango de edad</h3>
        <p class="sub">Cómo se reparte el fertilizante según la edad del cultivo.</p>
        ${barras(d.por_edad.map(g => ({ etiqueta: g.grupo, valor: g.toneladas })), ' t')}
      </div>
      <div class="card">
        <h3>Lotes de mayor costo</h3>
        <p class="sub">Los diez que más pesan en el presupuesto.</p>
        <div class="twrap" style="max-height:330px">
          <table class="ft">
            <thead><tr><th>Lote</th><th>Zona</th><th class="num">Ton</th><th class="num">Costo</th></tr></thead>
            <tbody>${d.top_lotes.map(l => `<tr>
              <td class="ln">${esc(l.identificacion)}</td><td>${esc(l.zona ?? '—')}</td>
              <td class="num">${n2(l.toneladas, 1)}</td><td class="num">${copM(l.costo)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// --- Gráfica de barras horizontales ---
function barras(datos, sufijo = '', fmt = null) {
  const validos = datos.filter(d => d.valor > 0);
  if (!validos.length) return `<p style="color:var(--ink-soft);font-size:13px">Sin datos.</p>`;
  const max = Math.max(...validos.map(d => d.valor));

  return `<div class="bars">${validos.map((d, i) => {
    const pct = Math.max(1.5, (d.valor / max) * 100);
    const texto = fmt ? fmt(d.valor) : n2(d.valor, 1) + sufijo;
    return `<div class="barrow">
        <div class="bl" title="${esc(d.etiqueta)}">${esc(String(d.etiqueta).slice(0, 22))}</div>
        <div class="btrack"><div class="bfill" style="width:${pct}%;background:${COLORES[i % COLORES.length]}"></div></div>
        <div class="bv">${texto}</div>
      </div>`;
  }).join('')}</div>`;
}

// --- Barras apiladas de estado nutricional ---
function barrasEstado(nutricion) {
  const total = nutricion.total_lotes || 1;
  const estados = ['deficiente', 'bajo', 'optimo', 'excesivo', 'sin-dato'];
  return nutricion.nutrientes.map(n => {
    const segmentos = estados.map(e => {
      const v = n[e] || 0;
      if (!v) return '';
      const pct = (v / total * 100).toFixed(2);
      return `<span style="width:${pct}%;background:${COL_ESTADO[e]}" title="${e}: ${v} lotes"></span>`;
    }).join('');
    return `<div class="nutrow">
        <div class="nm">${esc(n.nutriente)}</div>
        <div class="nutbar">${segmentos}</div>
        <div class="pr">${n2(n.promedio, 0)}%</div>
      </div>`;
  }).join('');
}

// ============================================================
//  LOTES · análisis foliar e índice
// ============================================================
function vistaLotes(c) {
  const nut = ['n', 'p', 'k', 'ca', 'mg', 's', 'b', 'cu', 'fe', 'mn', 'zn'];
  const et = { n: 'N', p: 'P', k: 'K', ca: 'Ca', mg: 'Mg', s: 'S', b: 'B', cu: 'Cu', fe: 'Fe', mn: 'Mn', zn: 'Zn' };
  const palmas = S.lotes.reduce((a, l) => a + (l.palmas || 0), 0);
  const tons = S.lotes.reduce((a, l) => a + (+l.tons || 0), 0);

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Lotes</div><div class="v">${n0(S.lotes.length)}</div></div>
      <div class="kpi"><div class="l">Palmas</div><div class="v">${n0(palmas)}</div></div>
      <div class="kpi"><div class="l">Cosecha esperada</div><div class="v">${n0(tons)}</div><div class="s">toneladas</div></div>
    </div>
    <div class="card" style="padding:14px 18px">
      <p class="sub" style="margin:0">Valores tal como vienen del Excel. El color aplica los
      umbrales de la campaña; los números no se recalculan.</p>
    </div>
    <div class="twrap">
      <table class="ft">
        <thead><tr>
          <th>Lote</th><th>Zona</th><th>Edad</th><th class="num">Palmas</th>
          <th class="num">M.S.T</th><th class="num">Tons</th>
          ${nut.map(k => `<th class="num">${et[k]}</th>`).join('')}
        </tr></thead>
        <tbody>${S.lotes.map(l => `<tr>
          <td class="ln">${esc(l.identificacion)}</td>
          <td>${esc(l.zona ?? '—')}</td>
          <td>${esc(l.rango_edad ?? '—')}</td>
          <td class="num">${n0(l.palmas)}</td>
          <td class="num">${n2(l.mst, 1)}</td>
          <td class="num">${n0(l.tons)}</td>
          ${nut.map(k => `<td class="num"><span class="sem sem-${l.semaforo[k]}">${
            l.indice?.[k] ? n2(l.indice[k], 0) + '%' : '—'}</span></td>`).join('')}
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

// ============================================================
//  PLAN Y COSTOS
// ============================================================
function vistaPlan(c) {
  const prods = [['t_grado', 'Grado'], ['t_nca', 'NCa'], ['t_rafos', 'Rafos'],
    ['t_ksomgo', 'KSOMgO'], ['t_kieserita', 'Kieserita'],
    ['t_borax', 'Bórax'], ['t_znso4', 'ZnSO4']];

  const tot = {}; prods.forEach(([k]) => tot[k] = 0);
  let costo = 0, ton = 0;
  S.lotes.forEach(l => {
    prods.forEach(([k]) => tot[k] += +(l.toneladas?.[k] || 0));
    costo += l.costos.costo_total; ton += l.costos.toneladas;
  });

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Fertilizante</div><div class="v">${n2(ton, 1)}</div><div class="s">toneladas</div></div>
      <div class="kpi acc"><div class="l">Costo</div><div class="v">${copM(costo)}</div>
        <div class="s">${S.zona === 'Todas' ? 'toda la plantación' : esc(S.zona)}</div></div>
      <div class="kpi"><div class="l">Grado compuesto</div><div class="v">${n2(tot.t_grado, 1)}</div><div class="s">toneladas</div></div>
      <div class="kpi"><div class="l">Lotes</div><div class="v">${n0(S.lotes.length)}</div></div>
    </div>
    <div class="twrap">
      <table class="ft">
        <thead><tr><th>Lote</th><th>Zona</th><th class="num">Palmas</th>
          ${prods.map(([, n]) => `<th class="num">${n}</th>`).join('')}
          <th class="num">Costo</th></tr></thead>
        <tbody>${S.lotes.map(l => `<tr>
          <td class="ln">${esc(l.identificacion)}</td>
          <td>${esc(l.zona ?? '—')}</td>
          <td class="num">${n0(l.palmas)}</td>
          ${prods.map(([k]) => `<td class="num">${n2(l.toneladas?.[k])}</td>`).join('')}
          <td class="num">${cop(l.costos.costo_total)}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total</td>
          ${prods.map(([k]) => `<td class="num">${n2(tot[k])}</td>`).join('')}
          <td class="num">${cop(costo)}</td></tr></tfoot>
      </table>
    </div>`;
}

// ============================================================
//  PARÁMETROS
// ============================================================
async function vistaParams(c) {
  c.innerHTML = `<div class="cargando">Cargando parámetros…</div>`;
  let r;
  try { r = await API.parametros(S.anio); }
  catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}<br>
      Crea la campaña ${S.anio} cargando un Excel primero.</div>`; return;
  }
  S.params = r.params;
  const eti = r.etiquetas || {}, campos = r.campos || {};

  const grupos = Object.entries(S.params).map(([g, vals]) => {
    if (!vals || typeof vals !== 'object') return '';
    const fs = Object.entries(vals).filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `<div class="pf">
        <label for="p_${g}_${k}">${esc(campos[k] || k)}</label>
        <input type="number" step="any" id="p_${g}_${k}" data-g="${g}" data-k="${k}" value="${v}">
      </div>`).join('');
    if (!fs) return '';
    return `<div class="pgrp">
        <button class="phead" data-t="${g}"><span>${esc(eti[g] || g)}</span><span class="ar">▸</span></button>
        <div class="pbody" data-b="${g}">${fs}</div>
      </div>`;
  }).join('');

  c.innerHTML = `
    <div class="card">
      <h3>Parámetros de la campaña ${S.anio}</h3>
      <p class="sub">El sistema no recalcula la agronomía del Excel. Aquí solo se ajusta
        lo que el archivo no trae: precios, costos indirectos, metas y los umbrales
        de color. Se guardan por año.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="pG">Guardar</button>
        <button class="btn btn-ghost" id="pR">Restaurar valores por defecto</button>
      </div>
      <div id="pM"></div>
    </div>${grupos}`;

  c.querySelectorAll('.phead').forEach(h => h.onclick = () => {
    h.classList.toggle('open');
    c.querySelector(`[data-b="${h.dataset.t}"]`).classList.toggle('open');
  });
  c.querySelector('.phead')?.click();

  $('#pG').onclick = async () => {
    const nuevos = JSON.parse(JSON.stringify(S.params));
    c.querySelectorAll('input[data-g]').forEach(i => {
      const v = parseFloat(i.value);
      if (!isNaN(v)) nuevos[i.dataset.g][i.dataset.k] = v;
    });
    try {
      await API.guardarParametros(S.anio, nuevos);
      S.params = nuevos;
      $('#pM').innerHTML = `<div class="msg msg-ok">Guardado. Los costos de ${S.anio} ya usan estos valores.</div>`;
    } catch (e) { $('#pM').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; }
  };

  $('#pR').onclick = async () => {
    if (!confirm(`¿Restaurar los valores por defecto para ${S.anio}?`)) return;
    S.params = (await API.parametrosDefault()).params;
    vistaParams(c);
  };
}

// ============================================================
//  CARGAR DATOS
// ============================================================
function vistaCarga(c) {
  const hoy = new Date().getFullYear();
  const anios = []; for (let a = hoy + 1; a >= hoy - 6; a--) anios.push(a);

  c.innerHTML = `
    <div class="card">
      <h3>Cargar el Excel de la campaña</h3>
      <p class="sub">Sube el archivo del ingeniero agrónomo completo, de la columna A a la ED.
        El sistema lo guarda tal cual: no recalcula ninguna fórmula. El año no va dentro
        del archivo, se elige aquí.</p>

      <div class="fbar" style="margin-bottom:16px">
        <div class="g"><label for="cA">Año</label>
          <select id="cA">${anios.map(a => `<option ${a === S.anio ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="g"><label style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" id="cRe"> Reemplazar todo el año</label></div>
        <div class="sp"></div>
        <a class="btn btn-ghost" href="${API.urlFormato()}" download>Descargar formato</a>
      </div>

      <div class="dz" id="cZ">
        <div class="ic"><svg width="36" height="36" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/>
          <path d="M12 5v12"/></svg></div>
        <div class="m">Arrastra el archivo aquí o haz clic para elegirlo</div>
        <div class="s">.xlsx · hoja RESULTADOS · datos desde la fila 4</div>
        <input type="file" id="cF" accept=".xlsx,.xlsm" hidden>
      </div>
      <div id="cCh"></div>
      <div style="margin-top:16px"><button class="btn btn-primary" id="cS" disabled>Cargar a la base de datos</button></div>
      <div id="cM"></div>
    </div>

    <div class="card">
      <h3>Cómo usar el formato</h3>
      <p class="sub">Para que no haya diferencias entre archivos, descarga el formato y pega
        allí tus datos.</p>
      <ol style="font-size:14px;color:var(--ink-soft);line-height:1.85;margin:0;padding-left:20px">
        <li>Descarga el formato con el botón de arriba.</li>
        <li>Abre tu Excel del año y copia el rango de datos: desde la fila 4 hacia abajo,
            columnas A hasta ED.</li>
        <li>Pega en la hoja RESULTADOS del formato, en la celda A4.
            Usa <strong>Pegado especial → Valores</strong> para que no viajen las fórmulas.</li>
        <li>Guarda y súbelo aquí.</li>
      </ol>
      <p class="sub" style="margin:16px 0 0">
        La columna D (Identificación) es la que identifica cada lote: es obligatoria y no
        debe repetirse. Si vuelves a cargar el mismo año, los lotes se actualizan en vez
        de duplicarse. Marca <em>Reemplazar todo el año</em> solo si quieres borrar lo
        cargado antes y empezar de cero.</p>
    </div>`;

  const z = $('#cZ'), inp = $('#cF'), btn = $('#cS');
  let archivo = null;
  const elegir = f => {
    if (!f) return;
    archivo = f;
    $('#cCh').innerHTML = `<div class="chip">📄 ${esc(f.name)}</div>`;
    btn.disabled = false;
  };
  z.onclick = () => inp.click();
  inp.onchange = e => elegir(e.target.files[0]);
  ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => {
    e.preventDefault(); z.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => {
    e.preventDefault(); z.classList.remove('over');
  }));
  z.addEventListener('drop', e => elegir(e.dataTransfer.files[0]));

  btn.onclick = async () => {
    const anio = +$('#cA').value, m = $('#cM');
    btn.disabled = true; btn.textContent = 'Cargando…'; m.innerHTML = '';
    try {
      const r = await API.cargar(anio, archivo, $('#cRe').checked);
      const av = (r.advertencias || []).length
        ? `<ul>${r.advertencias.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
      m.innerHTML = `<div class="msg ${av ? 'msg-warn' : 'msg-ok'}">
        Campaña ${r.anio}: ${r.lotes_leidos} lotes leídos · ${r.nuevos} nuevos ·
        ${r.actualizados} actualizados${r.borrados ? ` · ${r.borrados} borrados` : ''}.${av}</div>`;
      S.anio = anio;
      S.campanas = (await API.campanas()).campanas || [];
      $('#fA').innerHTML = S.campanas.map(c2 =>
        `<option value="${c2.anio}" ${c2.anio === anio ? 'selected' : ''}>${c2.anio} · ${c2.lotes} lotes</option>`).join('');
    } catch (e) {
      m.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    } finally { btn.disabled = false; btn.textContent = 'Cargar a la base de datos'; }
  };
}
