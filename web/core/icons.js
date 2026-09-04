// PalmaData · Iconos SVG (línea, 24x24). Se referencian por nombre desde el registro de módulos.
export const ICONS = {
  home:  '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
  leaf:  '<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16Z"/><path d="M8 17c2-3 5-5 8-6"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
  shield:'<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  // Engranaje. El anterior dibujaba los rayos alrededor de un círculo
  // pequeño pero SIN aro exterior, y por eso se leía como un sol. Los
  // dientes ahora nacen del aro, que es lo que lo hace un engranaje.
  cog:   '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2.5"/>'
       + '<path d="M12 5.5V2.8M12 18.5v2.7M5.5 12H2.8M18.5 12h2.7'
       + 'M7.4 7.4 5.5 5.5M16.6 16.6l1.9 1.9M16.6 7.4l1.9-1.9M7.4 16.6l-1.9 1.9"/>',

  // Lupa con un ojo dentro: revisar, inspeccionar.
  eye:   '<circle cx="10" cy="10" r="7.2"/><path d="M15.1 15.1 20.5 20.5"/>'
       + '<path d="M6.5 10c1.2-1.8 2.4-2.7 3.5-2.7s2.3.9 3.5 2.7'
       + 'c-1.2 1.8-2.4 2.7-3.5 2.7S7.7 11.8 6.5 10Z"/>'
       + '<circle cx="10" cy="10" r="1.3"/>',

  // Insecto visto desde arriba: cuerpo, cabeza, antenas y patas.
  bug:   '<ellipse cx="12" cy="13.5" rx="4.3" ry="6"/><circle cx="12" cy="5.8" r="2.1"/>'
       + '<path d="M10.6 4.3 9 2.4M13.4 4.3 15 2.4"/>'
       + '<path d="M7.9 10 4.2 8.2M7.7 13.5H3.9M7.9 17 4.2 18.8'
       + 'M16.1 10l3.7-1.8M16.3 13.5h3.8M16.1 17l3.7 1.8"/>'
       + '<path d="M12 8.5v10"/>',
  // Mapa doblado: tres paneles con los pliegues marcados. Mismo trazo de
  // línea que los demás, sin relleno, para que no pese más en el menú.
  map:   '<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7Z"/><path d="M9 4v13"/><path d="M15 7v13"/>',
};

export function iconSvg(name){
  const body = ICONS[name] || ICONS.cog;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" width="20" height="20">${body}</svg>`;
}
