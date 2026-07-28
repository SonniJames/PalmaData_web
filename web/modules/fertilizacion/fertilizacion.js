// ============================================================
// PalmaData · Fertilización
// El sistema no recalcula la agronomía: muestra lo que trae el
// Excel y le suma consolidación, costos y gráficas.
// ============================================================
import { API } from './api.js';

const S = {
  anio: null, campanas: [],
  zona: 'Todas', sector: 'Todos', rangoEdad: 'Todas',
  zonas: [], sectores: [], rangos: [],
  fertilizantes: [], nutrientes: [],
  tab: 'resumen', lotes: [], params: null,
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
      <div class="g"><label for="fS">Sector</label><select id="fS"><option>Todos</option></select></div>
      <div class="g"><label for="fZ">Zona</label><select id="fZ"><option>Todas</option></select></div>
      <div class="g"><label for="fE">Edad</label><select id="fE"><option>Todas</option></select></div>
      <div class="sp"></div>
      <button class="btn btn-ghost" id="fR">Actualizar</button>
    </div>
    <div class="ftabs">
      <button class="ftab" data-tab="resumen">Resumen</button>
      <button class="ftab" data-tab="diagnostico">Diagnóstico</button>
      <button class="ftab" data-tab="balance">Índice de balance</button>
      <button class="ftab" data-tab="plan">Plan y costos</button>
      <button class="ftab" data-tab="parametros">Parámetros</button>
      <button class="ftab" data-tab="datos">Cargar datos</button>
    </div>
    <div id="fC"></div>`;

  $('#fA').onchange = e => {
    S.anio = +e.target.value;
    S.zona = 'Todas'; S.sector = 'Todos'; S.rangoEdad = 'Todas';
    cargar();
  };
  $('#fS').onchange = e => { S.sector = e.target.value; S.zona = 'Todas'; cargar(); };
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
  if (S.tab === 'diagnostico') return vistaDiagnostico(c);

  c.innerHTML = `<div class="cargando">Cargando…</div>`;
  try {
    const f = { zona: S.zona, sector: S.sector, rangoEdad: S.rangoEdad };
    const r = await API.lotes(S.anio, f);
    S.lotes = r.lotes || [];
    S.zonas = r.zonas || []; S.sectores = r.sectores || []; S.rangos = r.rangos_edad || [];
    S.fertilizantes = r.fertilizantes || []; S.nutrientes = r.nutrientes || [];
    pintarFiltros();
  } catch (e) {
    c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; return;
  }
  if (!S.lotes.length) return vacio(c);
  S.tab === 'balance' ? vistaBalance(c) : vistaPlan(c);
}

function vacio(c) {
  c.innerHTML = `<div class="vacio"><h3>Sin datos para ${S.anio}</h3>
    <p>Carga el Excel en la pestaña <strong>Cargar datos</strong>.</p></div>`;
}

function pintarFiltros() {
  const set = (sel, valores, actual) => {
    const el = $(sel);
    if (el) el.innerHTML = valores.map(v =>
      `<option ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
  };
  set('#fS', ['Todos', ...S.sectores], S.sector);
  set('#fZ', ['Todas', ...S.zonas], S.zona);
  set('#fE', ['Todas', ...S.rangos], S.rangoEdad);
}

// ============================================================
//  RESUMEN
// ============================================================
async function vistaResumen(c) {
  c.innerHTML = `<div class="cargando">Calculando indicadores…</div>`;
  let d;
  try { d = await API.dashboard(S.anio); }
  catch (e) { c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; return; }
  if (d.vacio) return vacio(c);

  const t = d.total;
  const aviso = (d.sin_precio || []).length ? `
    <div class="msg msg-warn" style="margin-bottom:18px">
      Estos fertilizantes no tienen precio en la campaña ${S.anio}, así que no
      suman al costo: <strong>${d.sin_precio.map(esc).join(', ')}</strong>.
      Ponlos en la pestaña Parámetros.
    </div>` : '';

  c.innerHTML = `
    ${aviso}
    <div class="kpis">
      <div class="kpi"><div class="l">Lotes</div><div class="v">${n0(t.lotes)}</div></div>
      <div class="kpi"><div class="l">Palmas</div><div class="v">${n0(t.palmas)}</div></div>
      <div class="kpi"><div class="l">Fertilizante</div><div class="v">${n2(t.cantidad, 1)}</div><div class="s">toneladas</div></div>
      <div class="kpi acc"><div class="l">Costo total</div><div class="v">${copM(t.costo_total)}</div>
        <div class="s">flete incluido · ${S.anio}</div></div>
      ${t.costo_flete ? `<div class="kpi"><div class="l">Del cual, flete</div>
        <div class="v">${copM(t.costo_flete)}</div>
        <div class="s">${n2(t.costo_flete / t.costo_total * 100, 1)}% · ${cop(t.flete_promedio)}/t prom.</div></div>` : ''}
      <div class="kpi"><div class="l">Costo por palma</div><div class="v">${cop(t.costo_por_palma)}</div></div>
      ${t.costo_por_hectarea ? `<div class="kpi"><div class="l">Costo por hectárea</div>
        <div class="v">${cop(t.costo_por_hectarea)}</div>
        <div class="s">${n2(t.hectareas_usadas, 0)} ha</div></div>` : ''}
    </div>

    <div class="grid2">
      <div class="card">
        <h3>Fertilizante por producto</h3>
        <p class="sub">Cantidad y costo puesto en finca (precio + flete).</p>
        <div class="twrap" style="max-height:none">
          <table class="ft">
            <thead><tr><th>Producto</th><th class="num">Ton</th>
              <th class="num">Precio/t</th><th class="num">Flete/t</th>
              <th class="num">Fertilizante</th><th class="num">Flete</th>
              <th class="num">Total</th></tr></thead>
            <tbody>${d.productos.map(p => `<tr>
              <td class="ln">${esc(p.nombre)}</td>
              <td class="num">${n2(p.cantidad, 1)}</td>
              <td class="num">${cop(p.precio)}</td>
              <td class="num">${cop(p.flete)}</td>
              <td class="num">${copM(p.costo_fertilizante)}</td>
              <td class="num">${copM(p.costo_flete)}</td>
              <td class="num">${copM(p.costo)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>Costo por sector</h3>
        <p class="sub">Distribución del presupuesto por finca, con flete incluido.</p>
        ${barras((d.por_sector || []).map(g => ({ etiqueta: g.grupo, valor: g.costo_total })), '', copM)}
        <div class="twrap" style="max-height:none;margin-top:14px">
          <table class="ft">
            <thead><tr><th>Sector</th><th class="num">Ton</th>
              <th class="num">Fertilizante</th><th class="num">Flete</th>
              <th class="num">Total</th></tr></thead>
            <tbody>${(d.por_sector || []).map(g => `<tr>
              <td class="ln">${esc(g.grupo)}</td>
              <td class="num">${n2(g.cantidad, 1)}</td>
              <td class="num">${copM(g.costo_fertilizante)}</td>
              <td class="num">${copM(g.costo_flete)}</td>
              <td class="num">${copM(g.costo_total)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
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
        <h3>Costo por zona</h3>
        <p class="sub">Dónde se concentra la inversión.</p>
        ${barras((d.por_zona || []).map(g => ({ etiqueta: g.grupo, valor: g.costo_total })), '', copM)}
      </div>
      <div class="card">
        <h3>Toneladas por rango de edad</h3>
        <p class="sub">Cómo se reparte el fertilizante según la edad del cultivo.</p>
        ${barras((d.por_edad || []).map(g => ({ etiqueta: g.grupo, valor: g.cantidad })), ' t')}
      </div>
    </div>

    <div class="card">
      <h3>Lotes de mayor costo</h3>
      <p class="sub">Los diez que más pesan en el presupuesto.</p>
      <div class="twrap" style="max-height:340px">
        <table class="ft">
          <thead><tr><th>Lote</th><th>Sector</th><th>Zona</th>
            <th class="num">Ton</th><th class="num">Costo</th></tr></thead>
          <tbody>${d.top_lotes.map(l => `<tr>
            <td class="ln">${esc(l.identificacion)}</td>
            <td>${esc(l.sector ?? '—')}</td><td>${esc(l.zona ?? '—')}</td>
            <td class="num">${n2(l.cantidad, 1)}</td>
            <td class="num">${copM(l.costo)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

function barras(datos, sufijo = '', fmt = null) {
  const validos = (datos || []).filter(d => d.valor > 0);
  if (!validos.length) return `<p style="color:var(--ink-soft);font-size:13px">Sin datos.</p>`;
  const max = Math.max(...validos.map(d => d.valor));
  return `<div class="bars">${validos.map((d, i) => {
    const pct = Math.max(1.5, (d.valor / max) * 100);
    const texto = fmt ? fmt(d.valor) : n2(d.valor, 1) + sufijo;
    return `<div class="barrow">
        <div class="bl" title="${esc(d.etiqueta)}">${esc(String(d.etiqueta).slice(0, 24))}</div>
        <div class="btrack"><div class="bfill" style="width:${pct}%;background:${COLORES[i % COLORES.length]}"></div></div>
        <div class="bv">${texto}</div>
      </div>`;
  }).join('')}</div>`;
}

function barrasEstado(nutricion) {
  const total = nutricion.total_lotes || 1;
  const estados = ['deficiente', 'bajo', 'optimo', 'excesivo', 'sin-dato'];
  return nutricion.nutrientes.map(n => `
    <div class="nutrow">
      <div class="nm">${esc(n.nutriente)}</div>
      <div class="nutbar">${estados.map(e => {
        const v = n[e] || 0;
        if (!v) return '';
        return `<span style="width:${(v / total * 100).toFixed(2)}%;background:${COL_ESTADO[e]}" title="${e}: ${v} lotes"></span>`;
      }).join('')}</div>
      <div class="pr">${n2(n.promedio, 0)}%</div>
    </div>`).join('');
}

// ============================================================
//  DIAGNÓSTICO · análisis foliar del laboratorio
// ============================================================
async function vistaDiagnostico(c) {
  c.innerHTML = `<div class="cargando">Cargando análisis foliar…</div>`;
  let d;
  try {
    d = await API.diagnostico(S.anio, { zona: S.zona, sector: S.sector, rangoEdad: S.rangoEdad });
  } catch (e) { c.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; return; }

  S.zonas = d.zonas || []; S.sectores = d.sectores || []; S.rangos = d.rangos_edad || [];
  pintarFiltros();

  if (!d.lotes.length) return vacio(c);
  const nut = d.nutrientes || [];

  if (!nut.length) {
    c.innerHTML = `<div class="vacio"><h3>Sin análisis foliar</h3>
      <p>El Excel de ${S.anio} no trae la hoja <strong>anal_foliar</strong>.</p></div>`;
    return;
  }

  // Promedio por nutriente
  const prom = {};
  nut.forEach(n => {
    const vals = d.lotes.map(l => l.foliar[n]).filter(v => v != null && !isNaN(v));
    prom[n] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Lotes analizados</div><div class="v">${n0(d.lotes.length)}</div></div>
      <div class="kpi"><div class="l">Nutrientes</div><div class="v">${nut.length}</div></div>
      <div class="kpi"><div class="l">Campaña</div><div class="v">${S.anio}</div></div>
    </div>

    <div class="card">
      <h3>Promedio de la plantación</h3>
      <p class="sub">Valor medio de cada nutriente en los lotes seleccionados.</p>
      <div class="proms">
        ${nut.map(n => `<div class="prom">
            <div class="pn">${esc(n)}</div>
            <div class="pv">${prom[n] == null ? '—' : n2(prom[n], prom[n] < 10 ? 3 : 1)}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="twrap">
      <table class="ft">
        <thead><tr>
          <th>Lote</th><th class="num">UMA</th><th>Sector</th><th>Zona</th>
          <th>Edad</th><th class="num">Palmas</th><th class="num">M.S.T</th>
          ${nut.map(n => `<th class="num">${esc(n)}</th>`).join('')}
        </tr></thead>
        <tbody>${d.lotes.map(l => `<tr>
          <td class="ln">${esc(l.identificacion)}</td>
          <td class="num">${l.uma ?? '—'}</td>
          <td>${esc(l.sector ?? '—')}</td>
          <td>${esc(l.zona ?? '—')}</td>
          <td>${esc(l.rango_edad ?? '—')}</td>
          <td class="num">${n0(l.palmas)}</td>
          <td class="num">${n2(l.mst, 1)}</td>
          ${nut.map(n => {
            const v = l.foliar[n];
            return `<td class="num">${v == null ? '—' : n2(v, v < 10 ? 3 : 1)}</td>`;
          }).join('')}
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

// ============================================================
//  ÍNDICE DE BALANCE
// ============================================================
function vistaBalance(c) {
  const nut = S.nutrientes;
  if (!nut.length) {
    c.innerHTML = `<div class="vacio"><h3>Sin índice de balance</h3>
      <p>El Excel de ${S.anio} no trae la hoja <strong>ind_balan</strong>.</p></div>`;
    return;
  }

  const palmas = S.lotes.reduce((a, l) => a + (l.palmas || 0), 0);
  const tons = S.lotes.reduce((a, l) => a + (+l.tons || 0), 0);

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Lotes</div><div class="v">${n0(S.lotes.length)}</div></div>
      <div class="kpi"><div class="l">Palmas</div><div class="v">${n0(palmas)}</div></div>
      <div class="kpi"><div class="l">Cosecha esperada</div><div class="v">${n0(tons)}</div><div class="s">toneladas</div></div>
    </div>
    <div class="twrap">
      <table class="ft">
        <thead><tr>
          <th>Lote</th><th>Sector</th><th>Zona</th><th>Edad</th>
          <th class="num">Palmas</th>
          ${nut.map(n => `<th class="num">${esc(n)}</th>`).join('')}
        </tr></thead>
        <tbody>${S.lotes.map(l => `<tr>
          <td class="ln">${esc(l.identificacion)}</td>
          <td>${esc(l.sector ?? '—')}</td>
          <td>${esc(l.zona ?? '—')}</td>
          <td>${esc(l.rango_edad ?? '—')}</td>
          <td class="num">${n0(l.palmas)}</td>
          ${nut.map(n => `<td class="num"><span class="sem sem-${l.semaforo?.[n] || 'sin-dato'}">${
            l.balance?.[n] != null ? n2(l.balance[n], 0) + '%' : '—'}</span></td>`).join('')}
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

// ============================================================
//  PLAN Y COSTOS
// ============================================================
function vistaPlan(c) {
  const ferts = S.fertilizantes;
  if (!ferts.length) {
    c.innerHTML = `<div class="vacio"><h3>Sin plan de fertilización</h3>
      <p>El Excel de ${S.anio} no trae la hoja <strong>reque_fert</strong>.</p></div>`;
    return;
  }

  const tot = {}; ferts.forEach(f => tot[f] = 0);
  let costo = 0, cant = 0, ha = 0, fert = 0, flete = 0;
  S.lotes.forEach(l => {
    ferts.forEach(f => tot[f] += +(l.requerimiento?.[f] || 0));
    costo += l.costos.costo_total;
    fert += l.costos.costo_fertilizante || 0;
    flete += l.costos.costo_flete || 0;
    cant += l.costos.cantidad;
    ha += +(l.hectareas || 0);
  });
  const palmas = S.lotes.reduce((a, l) => a + (l.palmas || 0), 0);
  const principal = ferts.reduce((a, b) => tot[a] >= tot[b] ? a : b, ferts[0]);

  c.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Fertilizante</div><div class="v">${n2(cant, 1)}</div><div class="s">toneladas</div></div>
      <div class="kpi acc"><div class="l">Costo total</div><div class="v">${copM(costo)}</div>
        <div class="s">flete incluido · ${S.sector !== 'Todos' ? esc(S.sector) : (S.zona !== 'Todas' ? esc(S.zona) : 'toda la plantación')}</div></div>
      ${flete ? `<div class="kpi"><div class="l">Del cual, flete</div><div class="v">${copM(flete)}</div>
        <div class="s">${n2(flete / costo * 100, 1)}%</div></div>` : ''}
      <div class="kpi"><div class="l">${esc(principal)}</div><div class="v">${n2(tot[principal], 1)}</div><div class="s">toneladas</div></div>
      <div class="kpi"><div class="l">Costo por palma</div><div class="v">${cop(palmas ? costo / palmas : null)}</div></div>
      ${ha ? `<div class="kpi"><div class="l">Costo por hectárea</div>
        <div class="v">${cop(costo / ha)}</div><div class="s">${n2(ha, 0)} ha</div></div>` : ''}
    </div>
    <div class="twrap">
      <table class="ft">
        <thead><tr><th>Lote</th><th>Sector</th><th>Zona</th><th class="num">Palmas</th>
          ${ferts.map(f => `<th class="num">${esc(f)}</th>`).join('')}
          <th class="num">Fertilizante</th><th class="num">Flete</th>
          <th class="num">Costo total</th></tr></thead>
        <tbody>${S.lotes.map(l => `<tr>
          <td class="ln">${esc(l.identificacion)}</td>
          <td>${esc(l.sector ?? '—')}</td>
          <td>${esc(l.zona ?? '—')}</td>
          <td class="num">${n0(l.palmas)}</td>
          ${ferts.map(f => `<td class="num">${n2(l.requerimiento?.[f])}</td>`).join('')}
          <td class="num">${cop(l.costos.costo_fertilizante)}</td>
          <td class="num">${cop(l.costos.costo_flete)}</td>
          <td class="num">${cop(l.costos.costo_total)}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Total</td>
          ${ferts.map(f => `<td class="num">${n2(tot[f])}</td>`).join('')}
          <td class="num">${cop(fert)}</td>
          <td class="num">${cop(flete)}</td>
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
      Carga primero un Excel para la campaña ${S.anio}.</div>`; return;
  }
  S.params = r.params;
  const ferts = r.fertilizantes || [];
  const campos = r.campos || {};
  const b = S.params.bands || {};

  const bloquePrecios = ferts.length ? `
    <div class="pgrp">
      <button class="phead open" data-t="precios">
        <span>Precios de fertilizantes · campaña ${S.anio}</span><span class="ar">▸</span></button>
      <div class="pbody open" data-b="precios">
        ${ferts.map(f => `<div class="pf">
          <label>${esc(f)}</label>
          <input type="number" step="any" data-precio="${esc(f)}"
                 value="${S.params.precios?.[f] ?? 0}">
        </div>`).join('')}
      </div>
    </div>

    <div class="pgrp">
      <button class="phead open" data-t="fletes">
        <span>Flete por fertilizante (COP por tonelada)</span><span class="ar">▸</span></button>
      <div class="pbody open" data-b="fletes">
        ${ferts.map(f => `<div class="pf">
          <label>${esc(f)}</label>
          <input type="number" step="any" data-flete="${esc(f)}"
                 value="${S.params.fletes?.[f] ?? 0}">
        </div>`).join('')}
      </div>
      <div style="padding:0 18px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="number" step="any" id="fTodos" placeholder="Valor para todos"
               style="padding:8px 10px;border:1.5px solid var(--line);
                      border-radius:var(--radius-sm);font-size:13.5px;width:170px">
        <button class="btn btn-ghost" id="fAplicar">Aplicar a todos</button>
        <span style="font-size:12.5px;color:var(--ink-soft)">
          Si el flete es igual para todos los productos, escríbelo aquí y aplícalo.</span>
      </div>
    </div>`
    : `<div class="msg msg-warn">Aún no hay fertilizantes cargados para ${S.anio}.
        Sube el Excel y aquí aparecerán sus productos para ponerles precio y flete.</div>`;

  c.innerHTML = `
    <div class="card">
      <h3>Parámetros de la campaña ${S.anio}</h3>
      <p class="sub">El sistema no recalcula la agronomía del Excel. Aquí se ajusta lo que
        el archivo no trae: los precios de los fertilizantes de esta campaña, el flete,
        los umbrales de color y las hectáreas. Todo se guarda por año, así el histórico
        conserva los valores que regían en cada campaña.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="pG">Guardar</button>
      </div>
      <div id="pM"></div>
    </div>

    ${bloquePrecios}

    <div class="pgrp">
      <button class="phead open" data-t="general"><span>Datos de la plantación</span><span class="ar">▸</span></button>
      <div class="pbody open" data-b="general">
        <div class="pf">
          <label for="p_ha">${esc(campos.hectareas || 'Hectáreas totales')}</label>
          <input type="number" step="any" id="p_ha" value="${S.params.hectareas ?? 0}">
        </div>

      </div>
    </div>

    <div class="pgrp">
      <button class="phead" data-t="bands"><span>Umbrales del semáforo (% sobre el óptimo)</span><span class="ar">▸</span></button>
      <div class="pbody" data-b="bands">
        ${['deficiente', 'bajo', 'optimo'].map(k => `<div class="pf">
          <label for="p_${k}">${esc(campos[k] || k)}</label>
          <input type="number" step="any" id="p_${k}" data-band="${k}" value="${b[k] ?? 0}">
        </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <p class="sub" style="margin:0 0 10px">Si la hoja <strong>identificacion</strong> del Excel
        trae una columna <strong>hectareas</strong> por lote, el sistema usa esa y calcula el
        costo por hectárea de cada zona y sector. El valor de arriba es el respaldo cuando la
        columna no viene.</p>
      <p class="sub" style="margin:0">Cada fertilizante tiene su propio <strong>flete</strong>,
        por si vienen de proveedores distintos. El valor de un producto es
        <em>cantidad × (precio + su flete)</em>, y queda incluido en todos los totales:
        por lote, por zona, por sector y en el general de la plantación.</p>
    </div>`;

  c.querySelectorAll('.phead').forEach(h => h.onclick = () => {
    h.classList.toggle('open');
    c.querySelector(`[data-b="${h.dataset.t}"]`).classList.toggle('open');
  });

  const btnAplicar = $('#fAplicar');
  if (btnAplicar) btnAplicar.onclick = () => {
    const v = parseFloat($('#fTodos').value);
    if (isNaN(v)) return;
    c.querySelectorAll('input[data-flete]').forEach(i => { i.value = v; });
  };

  $('#pG').onclick = async () => {
    const nuevos = JSON.parse(JSON.stringify(S.params));
    nuevos.precios = {};
    c.querySelectorAll('input[data-precio]').forEach(i => {
      const v = parseFloat(i.value);
      nuevos.precios[i.dataset.precio] = isNaN(v) ? 0 : v;
    });
    nuevos.bands = nuevos.bands || {};
    c.querySelectorAll('input[data-band]').forEach(i => {
      const v = parseFloat(i.value);
      if (!isNaN(v)) nuevos.bands[i.dataset.band] = v;
    });
    nuevos.fletes = {};
    c.querySelectorAll('input[data-flete]').forEach(i => {
      const v = parseFloat(i.value);
      nuevos.fletes[i.dataset.flete] = isNaN(v) ? 0 : v;
    });
    const ha = parseFloat($('#p_ha').value);
    nuevos.hectareas = isNaN(ha) ? 0 : ha;

    try {
      await API.guardarParametros(S.anio, nuevos);
      S.params = nuevos;
      $('#pM').innerHTML = `<div class="msg msg-ok">Guardado. Los costos de ${S.anio} ya usan estos valores.</div>`;
    } catch (e) {
      $('#pM').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    }
  };
}

// ============================================================
//  CARGAR DATOS
// ============================================================
function vistaCarga(c) {
  const previa = S.campanas.length ? S.campanas[0].anio : null;

  c.innerHTML = `
    <div class="card">
      <h3>Cargar el Excel de la campaña</h3>
      <p class="sub">El archivo tiene una hoja por concepto. El sistema guarda los valores
        tal como vienen: no recalcula ninguna fórmula.</p>

      <div class="fbar" style="margin-bottom:16px">
        <div class="g"><label for="cA">Año</label>
          <input type="number" id="cA" min="1990" max="2100" step="1"
                 value="${S.anio}" style="width:110px"></div>
        <div class="g"><label style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" id="cRe"> Reemplazar todo el año</label></div>
        <div class="sp"></div>
        <a class="btn btn-ghost" href="${API.urlFormato()}" download>Formato en blanco</a>
        ${previa ? `<a class="btn btn-ghost" href="${API.urlFormato(previa)}" download>Formato con los lotes de ${previa}</a>` : ''}
      </div>

      <div class="dz" id="cZ">
        <div class="ic"><svg width="36" height="36" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/>
          <path d="M12 5v12"/></svg></div>
        <div class="m">Arrastra el archivo aquí o haz clic para elegirlo</div>
        <div class="s">.xlsx con las hojas identificacion, anal_foliar, ind_balan y reque_fert</div>
        <input type="file" id="cF" accept=".xlsx,.xlsm" hidden>
      </div>
      <div id="cCh"></div>
      <div style="margin-top:16px"><button class="btn btn-primary" id="cS" disabled>Cargar a la base de datos</button></div>
      <div id="cM"></div>
    </div>

    <div class="card">
      <h3>Las hojas del archivo</h3>
      <div class="twrap" style="max-height:none">
        <table class="ft">
          <thead><tr><th>Hoja</th><th>Qué contiene</th><th>Dónde se usa</th></tr></thead>
          <tbody>
            <tr><td class="ln">identificacion</td>
              <td>Quién es cada lote: uma, sector, zona, rango de edad, palmas, hectáreas, mst, tons</td>
              <td>Filtros y agrupaciones</td></tr>
            <tr><td class="ln">anal_foliar</td>
              <td>Resultado del laboratorio, una columna por nutriente</td>
              <td>Pestaña Diagnóstico</td></tr>
            <tr><td class="ln">ind_balan</td>
              <td>Índice de balance, % sobre el óptimo</td>
              <td>Semáforo y estado nutricional</td></tr>
            <tr><td class="ln">reque_fert</td>
              <td>Fertilizantes requeridos y su cantidad</td>
              <td>Plan, costos y gráficas</td></tr>
          </tbody>
        </table>
      </div>
      <p class="sub" style="margin:16px 0 0">
        En todas las hojas: la <strong>fila 1</strong> lleva los nombres de las columnas y la
        <strong>columna A</strong> la identificación del lote, escrita igual en todas.
        Los fertilizantes y nutrientes no son fijos: puedes agregar, quitar o cambiar
        columnas entre campañas y el sistema se adapta.</p>
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
    if (!anio || anio < 1990 || anio > 2100) {
      m.innerHTML = `<div class="msg msg-err">Escribe un año válido (entre 1990 y 2100).</div>`;
      return;
    }
    btn.disabled = true; btn.textContent = 'Cargando…'; m.innerHTML = '';
    try {
      const r = await API.cargar(anio, archivo, $('#cRe').checked);
      const av = (r.advertencias || []).length
        ? `<ul>${r.advertencias.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
      const cols = r.columnas || {};
      const detalle = Object.entries(cols).filter(([, v]) => v.length)
        .map(([k, v]) => `<li><strong>${esc(k)}</strong>: ${v.map(esc).join(', ')}</li>`).join('');
      m.innerHTML = `<div class="msg ${av ? 'msg-warn' : 'msg-ok'}">
        Campaña ${r.anio}: ${r.lotes_leidos} lotes · ${r.nuevos} nuevos ·
        ${r.actualizados} actualizados${r.borrados ? ` · ${r.borrados} borrados` : ''}.
        ${detalle ? `<ul>${detalle}</ul>` : ''}${av}</div>`;
      S.anio = anio;
      S.campanas = (await API.campanas()).campanas || [];
      $('#fA').innerHTML = S.campanas.map(x =>
        `<option value="${x.anio}" ${x.anio === anio ? 'selected' : ''}>${x.anio} · ${x.lotes} lotes</option>`).join('');
    } catch (e) {
      m.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`;
    } finally { btn.disabled = false; btn.textContent = 'Cargar a la base de datos'; }
  };
}
