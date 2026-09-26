// ============================================================
// PalmaData · Administración · Usuarios y permisos
//
// Quién puede abrir qué. Dos niveles: el módulo completo, o apartados
// sueltos dentro de él.
//
// Lo que se ve aquí es comodidad; el servidor vuelve a comprobar cada
// petición. Quitar un permiso surte efecto en menos de un minuto.
// ============================================================

const S = { datos: null, usuario: null, verTodos: false };

const $ = (s, c = document) => c.querySelector(s);
const n0 = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('es-CO');
const esc = t => String(t ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const BASE = '/api/administracion/permisos';

async function pedir(url, opciones = {}) {
  const res = await fetch(url, opciones);
  const crudo = await res.text();
  let j = null;
  try { j = JSON.parse(crudo); } catch { /* no era JSON */ }
  if (!res.ok || !j) {
    throw new Error(j?.detail || (crudo || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 300)
                    || `Error ${res.status}`);
  }
  return j;
}
const json = (cuerpo) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(cuerpo) });

export async function montar(cont) {
  cont.innerHTML = `<div class="cargando">Cargando…</div>`;
  try {
    S.datos = await pedir(BASE);
  } catch (e) {
    cont.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>
      <div class="msg msg-warn">Si menciona <code>web_permiso</code>, falta ejecutar
        <strong>45_seguridad_permisos.sql</strong> en esta base.</div>`;
    return;
  }
  pintar(cont);
}

function nombreModulo(id) {
  const m = S.datos.catalogo.find(x => x.id === id);
  return m ? m.nombre : id;
}
function nombreApartado(mod, ap) {
  const m = S.datos.catalogo.find(x => x.id === mod);
  const s = m && m.submodulos.find(x => x.id === ap);
  return s ? s.nombre : ap;
}
const permisosDe = u => S.datos.permisos.filter(p => p.usuario === u);

function pintar(cont) {
  const d = S.datos;
  cont.innerHTML = `
    ${d.modo_abierto ? `<div class="msg msg-warn">
      <strong>Modo abierto:</strong> todavía no hay ningún permiso definido, así que
      <strong>todos los usuarios ven todos los módulos</strong>. En cuanto otorgues el
      primero, manda esta tabla y quien no tenga permisos solo verá Inicio.
      <br>Empieza por ti mismo, con Administración completa, para no quedarte fuera.
    </div>` : ''}

    <div class="kpis">
      <div class="kpi"><div class="l">Pueden entrar</div>
        <div class="v">${n0(d.usuarios.filter(u => u.puede_entrar).length)}</div>
        <div class="s">de ${n0(d.usuarios.length)} en la tabla</div></div>
      <div class="kpi"><div class="l">Con permisos</div>
        <div class="v">${n0(d.usuarios.filter(u => u.permisos > 0).length)}</div></div>
      <div class="kpi"><div class="l">Administran permisos</div>
        <div class="v">${n0(d.usuarios.filter(u => u.administra_permisos).length)}</div>
        <div class="s">pueden abrir esta pantalla</div></div>
    </div>

    <div style="display:grid;grid-template-columns:minmax(260px,1fr) minmax(340px,2fr);gap:16px;align-items:start">
      <div class="card" style="padding:12px">
        <h3 style="margin:0 0 4px">Usuarios</h3>
        <p class="sub" style="margin:0 0 10px">Elige uno para ver y cambiar sus accesos.</p>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12.5px;margin-bottom:10px">
          <input type="checkbox" id="pTodos" ${S.verTodos ? 'checked' : ''}>
          Mostrar también los que no pueden entrar
          (<strong>${n0(d.usuarios.filter(u => !u.puede_entrar).length)}</strong> sin clave de PalmaData)</label>
        <div class="twrap" style="max-height:60vh">
          <table class="ft">
            <thead><tr><th>Usuario</th><th class="num">Permisos</th><th></th></tr></thead>
            <tbody>${d.usuarios.filter(u => S.verTodos || u.puede_entrar).map(u => `<tr data-u="${esc(u.usuario)}"
                style="${S.usuario === u.usuario ? 'background:var(--palm-soft);' : ''}${u.puede_entrar ? '' : 'opacity:.55;'}">
              <td class="ln">${esc(u.nombre || u.usuario)}
                <div class="sub" style="font-size:11.5px">${esc(u.usuario)}${u.cargo ? ' · ' + esc(u.cargo) : ''}</div></td>
              <td class="num">${u.permisos ? n0(u.permisos) : '<span class="sub">ninguno</span>'}</td>
              <td style="text-align:right">${u.administra_permisos
                ? '<span class="sem sem-optimo" style="min-width:auto" title="Puede administrar permisos">llave</span>' : ''}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>

      <div class="card" style="padding:12px" id="pDetalle"></div>
    </div>`;

  const chk = $('#pTodos');
  if (chk) chk.onchange = e => { S.verTodos = e.target.checked; pintar(cont); };

  cont.querySelectorAll('tr[data-u]').forEach(fila => {
    fila.style.cursor = 'pointer';
    fila.onclick = () => { S.usuario = fila.dataset.u; pintar(cont); };
  });
  detalle(cont);
}

function detalle(cont) {
  const caja = $('#pDetalle');
  if (!S.usuario) {
    caja.innerHTML = `<div class="vacio" style="padding:30px 18px">
      <h3>Elige un usuario</h3><p>A la izquierda, para ver qué puede abrir.</p></div>`;
    return;
  }
  const u = S.datos.usuarios.find(x => x.usuario === S.usuario);
  const suyos = permisosDe(S.usuario);
  const conModulo = new Set(suyos.filter(p => !p.apartado).map(p => p.modulo));

  caja.innerHTML = `
    <h3 style="margin:0 0 4px">${esc(u.nombre || u.usuario)}</h3>
    ${u.puede_entrar ? '' : `<div class="msg msg-warn">Este usuario <strong>no tiene clave de
      PalmaData</strong> (<code>password_palmadata</code> vacío): existe en la tabla pero no puede
      iniciar sesión, así que los permisos que le des no tendrán efecto hasta que se le cree.</div>`}
    <p class="sub" style="margin:0 0 12px">
      ${suyos.length ? `${n0(suyos.length)} permiso(s).` : 'Sin permisos: solo verá Inicio.'}
      Inicio lo ve siempre cualquiera que pueda entrar.</p>

    <div class="fbar" style="margin-bottom:12px">
      <div class="g"><label for="pMod">Módulo</label>
        <select id="pMod" style="padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px">
          ${S.datos.catalogo.map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}
        </select></div>
      <div class="g"><label for="pAp">Apartado</label>
        <select id="pAp" style="padding:8px 11px;border:1.5px solid var(--line);border-radius:var(--radius-sm);font-size:14px;min-width:180px"></select></div>
      <button class="btn btn-primary" id="pDar">Otorgar</button>
    </div>
    <div id="pMsg"></div>

    <div class="twrap">
      <table class="ft">
        <thead><tr><th>Módulo</th><th>Apartado</th><th>Otorgado por</th><th></th></tr></thead>
        <tbody>${suyos.length ? suyos.map(p => `<tr>
          <td class="ln">${esc(nombreModulo(p.modulo))}</td>
          <td>${p.apartado
            ? esc(nombreApartado(p.modulo, p.apartado))
            : '<strong>Todo el módulo</strong>'}</td>
          <td style="font-size:12.5px">${esc(p.otorgado_por ?? '—')}</td>
          <td style="text-align:right">
            <button class="btn btn-ghost pQuitar" style="padding:3px 10px"
              data-m="${esc(p.modulo)}" data-a="${esc(p.apartado ?? '')}">Quitar</button></td>
        </tr>`).join('') : `<tr><td colspan="4" class="sub">Sin permisos.</td></tr>`}</tbody>
      </table>
    </div>`;

  // Apartados del módulo elegido; «Todo el módulo» se desactiva si ya lo tiene
  const llenarApartados = () => {
    const mod = $('#pMod').value;
    const m = S.datos.catalogo.find(x => x.id === mod);
    const yaTiene = conModulo.has(mod);
    $('#pAp').innerHTML =
      `<option value="" ${yaTiene ? 'disabled' : ''}>Todo el módulo${yaTiene ? ' (ya lo tiene)' : ''}</option>`
      + (m?.submodulos || []).map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('');
    if (yaTiene) $('#pAp').selectedIndex = Math.min(1, $('#pAp').options.length - 1);
  };
  $('#pMod').onchange = llenarApartados;
  llenarApartados();

  $('#pDar').onclick = async () => {
    const msg = $('#pMsg');
    try {
      await pedir(`${BASE}/otorgar`, json({
        usuario: S.usuario, modulo: $('#pMod').value, apartado: $('#pAp').value || null }));
      S.datos = await pedir(BASE);
      pintar(cont);
    } catch (e) { msg.innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; }
  };

  caja.querySelectorAll('.pQuitar').forEach(b => {
    b.onclick = async () => {
      const ap = b.dataset.a;
      if (!confirm(`¿Quitar ${ap ? 'este apartado' : 'el módulo completo'} a ${S.usuario}?`)) return;
      try {
        await pedir(`${BASE}/quitar`, json({ usuario: S.usuario, modulo: b.dataset.m, apartado: ap || null }));
        S.datos = await pedir(BASE);
        pintar(cont);
      } catch (e) { $('#pMsg').innerHTML = `<div class="msg msg-err">${esc(e.message)}</div>`; }
    };
  });
}
