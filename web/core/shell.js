// PalmaData · Shell
import { iconSvg } from './icons.js';

const state = { usuario:null, modulos:[], activo:'inicio', activoSub:null };

// -------- Arranque --------
async function init(){
  // ¿Hay sesión?
  const me = await fetch('/api/auth/me').then(r=>r.json()).catch(()=>({ok:false}));
  if(!me.ok){ window.location.href='/login'; return; }
  state.usuario = me.usuario;
  pintarUsuario();

  // Módulos
  const data = await fetch('/api/modulos').then(r=>r.json()).catch(()=>({modulos:[]}));
  state.modulos = data.modulos || [];
  construirMenu();
  irA('inicio');

  conectarUI();
}

// -------- Usuario --------
function pintarUsuario(){
  const n = state.usuario.nombre || state.usuario.usuario;
  document.getElementById('uname').textContent = n;
  document.getElementById('avatar').textContent = (n[0]||'?').toUpperCase();
}

// -------- Menú lateral --------
function construirMenu(){
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  state.modulos.forEach(m=>{
    const item = document.createElement('div');
    item.className = 'nav-item';
    const tieneSub = m.submodulos && m.submodulos.length;

    const btn = document.createElement('button');
    btn.className = 'nav-link';
    btn.dataset.mod = m.id;
    btn.innerHTML = `<span class="ic">${iconSvg(m.icono)}</span>
                     <span class="lbl">${m.nombre}</span>
                     ${tieneSub ? '<span class="chev">▸</span>' : ''}`;
    if(tieneSub){
      btn.addEventListener('click', ()=> toggleSub(m.id));
    } else {
      btn.addEventListener('click', ()=> irA(m.id));
    }
    item.appendChild(btn);

    if(tieneSub){
      const sub = document.createElement('div');
      sub.className = 'submenu';
      sub.dataset.sub = m.id;
      m.submodulos.forEach(s=>{
        const sb = document.createElement('button');
        sb.className='sublink';
        sb.dataset.mod=m.id; sb.dataset.subid=s.id;
        sb.textContent = s.nombre;
        sb.addEventListener('click', ()=> irA(m.id, s.id));
        sub.appendChild(sb);
      });
      item.appendChild(sub);
    }
    nav.appendChild(item);
  });
}

function toggleSub(modId){
  const btn = document.querySelector(`.nav-link[data-mod="${modId}"]`);
  const sub = document.querySelector(`.submenu[data-sub="${modId}"]`);
  btn.classList.toggle('open');
  sub.classList.toggle('open');
}

// -------- Navegación --------
function irA(modId, subId=null){
  state.activo = modId; state.activoSub = subId;
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active', b.dataset.mod===modId && !subId));
  document.querySelectorAll('.sublink').forEach(b=>b.classList.toggle('active', b.dataset.mod===modId && b.dataset.subid===subId));

  const mod = state.modulos.find(m=>m.id===modId);
  const titulo = subId
    ? `${mod.nombre} · ${mod.submodulos.find(s=>s.id===subId)?.nombre||''}`
    : (mod?.nombre||'');
  document.getElementById('pageTitle').textContent = titulo;

  renderContenido(modId, subId);
  if(window.innerWidth<=820) document.getElementById('shell').classList.remove('mobile-open');
}

// -------- Contenido de cada módulo --------
function renderContenido(modId, subId){
  const main = document.getElementById('main');

  if(modId==='inicio'){
    main.innerHTML = vistaInicio();
    document.querySelectorAll('.module-card').forEach(c=>{
      c.addEventListener('click', ()=>{
        const target = c.dataset.go;
        const mod = state.modulos.find(m=>m.id===target);
        if(mod) irA(target, mod.submodulos?.[0]?.id||null);
      });
    });
    return;
  }

  // Módulos aún no montados -> placeholder. Aquí engancharemos ANALFOLI luego.
  main.innerHTML = `<div class="placeholder">
      <h2>Módulo en construcción</h2>
      <p>El módulo <strong>${modId}</strong>${subId?' · '+subId:''} se conectará aquí.</p>
    </div>`;
}

function vistaInicio(){
  const otros = state.modulos.filter(m=>m.id!=='inicio');
  const cards = otros.map(m=>`
    <div class="module-card" data-go="${m.id}">
      <div class="mc-ic">${iconSvg(m.icono)}</div>
      <h3>${m.nombre}</h3>
      <p>${m.submodulos?.length? m.submodulos.length+' secciones':'Abrir módulo'}</p>
    </div>`).join('');

  return `<div class="welcome">
      <div class="logo-lg"><img src="/assets/logo.jpeg" alt="PalmaData"></div>
      <h1>Bienvenido a Palma<span>Data</span></h1>
      <p>Sistema de gestión y análisis para el cultivo de palma de aceite de Palmeras de Yarima. Elige un módulo para comenzar.</p>
      ${otros.length? `<div class="module-grid">${cards}</div>`
                    : `<p style="color:var(--ink-soft)">Aún no hay módulos activos. Se irán habilitando aquí.</p>`}
    </div>`;
}

// -------- UI general --------
function conectarUI(){
  document.getElementById('burger').addEventListener('click', ()=>{
    const shell = document.getElementById('shell');
    if(window.innerWidth<=820) shell.classList.toggle('mobile-open');
    else shell.classList.toggle('collapsed');
  });

  document.getElementById('btnLogout').addEventListener('click', async ()=>{
    await fetch('/api/auth/logout', {method:'POST'});
    window.location.href='/login';
  });
}

init();
