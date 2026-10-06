// Inline stroke icons on a 24px grid.
const PATHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  'chevron-left': '<path d="M15 18l-6-6 6-6"/>',
  'chevron-right': '<path d="M9 18l6-6-6-6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  home: '<path d="M4 11.5L12 5l8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M4 4v16h16"/><path d="M8 15l3.5-4 3 2.5L19 8"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  moon: '<path d="M19.5 14.6A7.5 7.5 0 0 1 9.4 4.5a7.5 7.5 0 1 0 10.1 10.1z"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
  gear: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 4 2.2 4H6"/>',
  grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6.5" r="1.5"/><circle cx="15" cy="6.5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17.5" r="1.5"/><circle cx="15" cy="17.5" r="1.5"/></g>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 12.5a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5L17.5 7M9.5 7V4.5h5V7"/>',
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4 7.5l8 5.5 8-5.5"/>',
  flame: '<path d="M12 21c3.9 0 6.5-2.6 6.5-6.2 0-3.6-2.6-5.4-3.6-8.3-1 1.8-2 2.6-3.3 2.6.3-2.3-.3-4.4-2.2-6.1-.6 3.6-5.9 6.3-5.9 11.6C3.5 18.4 7.6 21 12 21z"/>',
  repeat: '<path d="M17 3.5l3 3-3 3"/><path d="M4 11.5v-1a4 4 0 0 1 4-4h12"/><path d="M7 20.5l-3-3 3-3"/><path d="M20 12.5v1a4 4 0 0 1-4 4H4"/>',
  bell: '<path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 5.5 2.5 7.5 2.5 7.5H4s2.5-2 2.5-7.5z"/><path d="M10 20.5h4"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 20V9M7.5 13.5L12 9l4.5 4.5M5 4h14"/>',
  share: '<path d="M12 3.5v12M8 7.5l4-4 4 4"/><path d="M6 11.5H5v9h14v-9h-1"/>',
  edit: '<path d="M4 20h4.5L19.5 9 15 4.5 4 15.5z"/><path d="M13 6.5l4.5 4.5"/>',
  arrow: '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = cls ? `ico ${cls}` : 'ico';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return span;
}
