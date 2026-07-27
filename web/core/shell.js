// ============================================================
// PalmaData · Shell
// Carga los módulos dinámicamente: si el registro del backend
// declara un módulo, el shell intenta importar
//   /modules/<id>/<id>.js  y llamar a su función montar().
// Así añadir un módulo no obliga a tocar este archivo.
// ============================================================
import { iconSvg } from './icons.js';

const state = { usuario: null, modulos: [], activo: 'inicio', activoSub: null };
const cacheModulos = {};   // id -> módulo JS ya importado

// -------- Arranque --------
async function init() {
  const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => ({ ok: false }));
  if (!me.ok) { window.location.href = '/login'; return; }
  state.usuario = me.usuario;
  pintarUsuario();

  const data = await fetch('/api/modulos').then(r => r.json()).catch(() => ({ modulos: [] }));
  state.modulos = data.modulos || [];
  construirMenu();
  irA('inicio');

  conectarUI();
}

// -------- Usuario --------
function pintarUsuario() {
  const n = state.usuario.nombre || state.usuario.usuario;
  document.getElementById('uname').textContent = n;
  document.getElementById('avatar').textContent = (n[0] || '?').toUpperCase();
}

// -------- Menú lateral --------
function construirMenu() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';

  state.modulos.forEach(m => {
    const item = document.createElement('div');
    item.className = 'nav-item';
    const tieneSub = m.submodulos && m.submodulos.length;

    const btn = document.createElement('button');
    btn.className = 'nav-link';
    btn.dataset.mod = m.id;
    btn.innerHTML = `<span class="ic">${iconSvg(m.icono)}</span>
                     <span class="lbl">${m.nombre}</span>
                     ${tieneSub ? '<span class="chev">▸</span>' : ''}`;

    if (tieneSub) {
      btn.addEventListener('click', () => {
        toggleSub(m.id);
        if (state.activo !== m.id) irA(m.id, m.submodulos[0].id);
      });
    } else {
      btn.addEventListener('click', () => irA(m.id));
    }
    item.appendChild(btn);

    if (tieneSub) {
      const sub = document.createElement('div');
      sub.className = 'submenu';
      sub.dataset.sub = m.id;
      m.submodulos.forEach(s => {
        const sb = document.createElement('button');
        sb.className = 'sublink';
        sb.dataset.mod = m.id;
        sb.dataset.subid = s.id;
        sb.textContent = s.nombre;
        sb.addEventListener('click', e => { e.stopPropagation(); irA(m.id, s.id); });
        sub.appendChild(sb);
      });
      item.appendChild(sub);
    }
    nav.appendChild(item);
  });
}

function toggleSub(modId) {
  const btn = document.querySelector(`.nav-link[data-mod="${modId}"]`);
  const sub = document.querySelector(`.submenu[data-sub="${modId}"]`);
  if (!btn || !sub) return;
  btn.classList.toggle('open');
  sub.classList.toggle('open');
}

function abrirSub(modId) {
  const btn = document.querySelector(`.nav-link[data-mod="${modId}"]`);
  const sub = document.querySelector(`.submenu[data-sub="${modId}"]`);
  if (btn && sub) { btn.classList.add('open'); sub.classList.add('open'); }
}

// -------- Navegación --------
async function irA(modId, subId = null) {
  state.activo = modId;
  state.activoSub = subId;

  document.querySelectorAll('.nav-link').forEach(b =>
    b.classList.toggle('active', b.dataset.mod === modId && !subId));
  document.querySelectorAll('.sublink').forEach(b =>
    b.classList.toggle('active', b.dataset.mod === modId && b.dataset.subid === subId));

  const mod = state.modulos.find(m => m.id === modId);
  if (subId) abrirSub(modId);

  document.getElementById('pageTitle').textContent = mod
    ? (subId ? `${mod.nombre} · ${mod.submodulos.find(s => s.id === subId)?.nombre || ''}` : mod.nombre)
    : '';

  await renderContenido(modId, subId);
  if (window.innerWidth <= 820) document.getElementById('shell').classList.remove('mobile-open');
}

// -------- Contenido --------
async function renderContenido(modId, subId) {
  const main = document.getElementById('main');

  if (modId === 'inicio') {
    main.innerHTML = vistaInicio();
    main.querySelectorAll('.module-card').forEach(c => {
      c.addEventListener('click', () => {
        const destino = c.dataset.go;
        const m = state.modulos.find(x => x.id === destino);
        if (m) irA(destino, m.submodulos?.[0]?.id || null);
      });
    });
    return;
  }

  // Si el backend del módulo no cargó, avisamos en vez de fallar en silencio
  const mod = state.modulos.find(m => m.id === modId);
  if (mod && mod.disponible === false) {
    main.innerHTML = `<div class="placeholder">
        <h2>${mod.nombre} no está disponible</h2>
        <p>El servidor no pudo cargar este módulo. Los demás módulos siguen funcionando.</p>
        <p style="font-family:monospace;font-size:12.5px;color:var(--danger);
                  background:var(--cream);padding:10px 14px;border-radius:8px;
                  display:inline-block;margin-top:8px">${mod.error || 'Error desconocido'}</p>
      </div>`;
    return;
  }

  main.innerHTML = `<div class="cargando" style="text-align:center;padding:40px;color:var(--ink-soft)">Cargando módulo…</div>`;

  try {
    if (!cacheModulos[modId]) {
      cargarCssModulo(modId);
      cacheModulos[modId] = await import(`/modules/${modId}/${modId}.js`);
    }
    const m = cacheModulos[modId];
    if (typeof m.montar === 'function') {
      await m.montar(main, subId);
    } else {
      main.innerHTML = placeholder(modId, 'El módulo no expone una función montar().');
    }
  } catch (e) {
    console.error(`Error en el módulo ${modId}:`, e);
    main.innerHTML = placeholder(modId,
      `No se pudo abrir esta pantalla. El resto del sistema sigue funcionando.
       <br><span style="font-family:monospace;font-size:12.5px">${String(e.message || e)}</span>`);
  }
}

function cargarCssModulo(modId) {
  const href = `/modules/${modId}/${modId}.css`;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function placeholder(modId, texto) {
  return `<div class="placeholder">
      <h2>Módulo en construcción</h2>
      <p>${texto}</p>
    </div>`;
}

function vistaInicio() {
  const otros = state.modulos.filter(m => m.id !== 'inicio');
  const cards = otros.map(m => `
    <div class="module-card" data-go="${m.id}">
      <div class="mc-ic">${iconSvg(m.icono)}</div>
      <h3>${m.nombre}</h3>
      <p>${m.submodulos?.length ? m.submodulos.length + ' secciones' : 'Abrir módulo'}</p>
    </div>`).join('');

  return `<div class="welcome">
      <div class="logo-lg"><img src="/assets/logo.jpeg" alt="PalmaData"></div>
      <h1>Bienvenido a Palma<span>Data</span></h1>
      <p>Sistema de gestión y análisis para el cultivo de palma de aceite de Palmeras de Yarima.
         Elige un módulo para comenzar.</p>
      ${otros.length ? `<div class="module-grid">${cards}</div>`
                     : `<p style="color:var(--ink-soft)">Aún no hay módulos activos.</p>`}
    </div>`;
}

// -------- UI general --------
function conectarUI() {
  document.getElementById('burger').addEventListener('click', () => {
    const shell = document.getElementById('shell');
    if (window.innerWidth <= 820) shell.classList.toggle('mobile-open');
    else shell.classList.toggle('collapsed');
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

init();
