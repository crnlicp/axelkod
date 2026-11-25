// Icon library for the editable home-page sections, as SVG markup strings so the
// deploy bake, Publish and the admin icon picker share one source. Keys match
// lib/Home.mo in the backend (which rejects anything else). Pure: imported by Node.

const NODE = (cx: number, cy: number) => `<circle cx="${cx}" cy="${cy}" r="1.6" fill="currentColor" stroke="none"/>`;

export const HOME_ICONS = {
  parts: '<path d="M19.2,9.5 L21.8,9.9 L21.8,14.1 L19.2,14.5 L18.8,15.3 L20.4,17.4 L17.4,20.4 L15.3,18.8 L14.5,19.2 L14.1,21.8 L9.9,21.8 L9.5,19.2 L8.7,18.8 L6.6,20.4 L3.6,17.4 L5.2,15.3 L4.8,14.5 L2.2,14.1 L2.2,9.9 L4.8,9.5 L5.2,8.7 L3.6,6.6 L6.6,3.6 L8.7,5.2 L9.5,4.8 L9.9,2.2 L14.1,2.2 L14.5,4.8 L15.3,5.2 L17.4,3.6 L20.4,6.6 L18.8,8.7Z"/><path d="M12,8.5 L15,10.25 V13.75 L12,15.5 L9,13.75 V10.25Z"/>',
  code: `<path d="M8,6 L2.5,11 L8,16"/><path d="M16,6 L21.5,11 L16,16"/><path d="M13.5,4 L10.5,18"/><path d="M12,21 H19"/>${NODE(19, 21)}`,
  shield: '<path d="M12,2.5 C9.5,4.2 6.8,5 4,5.2 V11.5 C4,16.2 7.2,19.7 12,21.5 C16.8,19.7 20,16.2 20,11.5 V5.2 C17.2,5 14.5,4.2 12,2.5Z"/><circle cx="12" cy="10.5" r="2"/><path d="M12,12.5 V15.5"/>',
  lock: `<path d="M7,10 V7 C7,4.2 9.2,2.5 12,2.5 C14.8,2.5 17,4.2 17,7 V10"/><path d="M4.5,10 H19.5 V21 H4.5Z"/><path d="M12,14 V17"/>${NODE(12, 14)}`,
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7,12.3 L20.5,2.5"/><path d="M17,6 L20,9"/><path d="M14.5,8.5 L16.5,10.5"/>',
  bug: '<path d="M8,9 H16 V15 A4,4 0 0 1 8,15Z"/><path d="M9.5,9 A2.5,2.5 0 0 1 14.5,9"/><path d="M12,9 V19"/><path d="M8,12 H4 M16,12 H20 M8,16 L4.5,18 M16,16 L19.5,18 M8.5,9.5 L5,7 M15.5,9.5 L19,7"/>',
  eye: '<path d="M2.5,12 C5,7.5 8.2,5.5 12,5.5 C15.8,5.5 19,7.5 21.5,12 C19,16.5 15.8,18.5 12,18.5 C8.2,18.5 5,16.5 2.5,12Z"/><circle cx="12" cy="12" r="3"/>',
  cloud: '<path d="M7,18.5 A4.5,4.5 0 0 1 6.6,9.5 A6,6 0 0 1 18,10 A4.25,4.25 0 0 1 17.5,18.5Z"/>',
  server: `<path d="M3.5,4 H20.5 V10 H3.5Z"/><path d="M3.5,14 H20.5 V20 H3.5Z"/>${NODE(7, 7)}${NODE(7, 17)}<path d="M11,7 H17 M11,17 H17"/>`,
  chip: '<path d="M7,7 H17 V17 H7Z"/><path d="M10,10 H14 V14 H10Z"/><path d="M10,7 V3.5 M14,7 V3.5 M10,17 V20.5 M14,17 V20.5 M7,10 H3.5 M7,14 H3.5 M17,10 H20.5 M17,14 H20.5"/>',
  network: `<path d="M12,7 V11 M12,11 L5.5,17 M12,11 L18.5,17"/><circle cx="12" cy="5" r="2"/><circle cx="5.5" cy="19" r="2"/><circle cx="18.5" cy="19" r="2"/>${NODE(12, 11)}`,
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3,12 H21"/><path d="M12,3 C9.5,5.8 8.5,8.8 8.5,12 C8.5,15.2 9.5,18.2 12,21 C14.5,18.2 15.5,15.2 15.5,12 C15.5,8.8 14.5,5.8 12,3Z"/>',
  truck: '<path d="M2.5,6 H14 V16 H2.5Z"/><path d="M14,9.5 H18 L21.5,13 V16 H14"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
  wrench: '<path d="M14.5,3.5 A5,5 0 0 0 9.8,10.3 L3.5,16.6 L7.4,20.5 L13.7,14.2 A5,5 0 0 0 20.5,9.5 L17.5,12.5 L14.5,12.5 L11.5,9.5 L11.5,6.5Z"/>',
  store: '<path d="M3,9 L5,3.5 H19 L21,9"/><path d="M3,9 H21 C21,10.7 19.7,12 18,12 C16.3,12 15,10.7 15,9 C15,10.7 13.7,12 12,12 C10.3,12 9,10.7 9,9 C9,10.7 7.7,12 6,12 C4.3,12 3,10.7 3,9Z"/><path d="M4.5,12 V20.5 H19.5 V12"/><path d="M10,20.5 V15.5 H14 V20.5"/>',
  factory: '<path d="M2.5,20.5 V10 L8,13 V10 L13.5,13 V4 H17.5 V20.5Z"/><path d="M17.5,20.5 H21.5 V8 H17.5"/><path d="M6,17 H8 M10.5,17 H12.5"/>',
  company: '<path d="M3,21 H21"/><path d="M5,21 V10 H13 V21"/><path d="M13,21 V13 H19 V21"/><path d="M8,13 H10 M8,16.5 H10"/><path d="M9,10 V3 H14.5 L13.5,4.75 L14.5,6.5 H9"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4,21 C4,16.6 7.6,14 12,14 C16.4,14 20,16.6 20,21"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5,20 C2.5,16.2 5.4,14 9,14 C12.6,14 15.5,16.2 15.5,20"/><path d="M15,4.8 A3.5,3.5 0 0 1 15,11.2"/><path d="M17.5,14.3 C20,15 21.5,17 21.5,20"/>',
  chart: '<path d="M3.5,3.5 V20.5 H20.5"/><path d="M7.5,16 L11,11.5 L14,14 L19.5,7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12,6.5 V12 L15.5,14"/>',
  mail: '<path d="M3,5.5 H21 V18.5 H3Z"/><path d="M3,5.5 L12,13 L21,5.5"/>',
  phone: '<path d="M7.5,2.5 H16.5 V21.5 H7.5Z"/><path d="M10.5,18.5 H13.5"/>',
  pin: '<path d="M12,21.5 C12,21.5 5,14.8 5,9.5 C5,5.6 8.1,2.5 12,2.5 C15.9,2.5 19,5.6 19,9.5 C19,14.8 12,21.5 12,21.5Z"/><circle cx="12" cy="9.5" r="2.5"/>',
} as const;

export type HomeIcon = keyof typeof HOME_ICONS;
export const HOME_ICON_KEYS = Object.keys(HOME_ICONS) as HomeIcon[];

/** Full decorative <svg> for an icon key (unknown keys fall back to "shield"). */
export function iconSvg(key: string, cls: string): string {
  const inner = HOME_ICONS[key as HomeIcon] ?? HOME_ICONS.shield;
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="miter" stroke-linecap="square" aria-hidden="true" class="${cls}">${inner}</svg>`;
}
