/* ============================================================
   a lucide subset, inline, the same way index.html already ships
   icons on the live site. one set, one stroke weight, currentColor.
   ============================================================ */
const ICONS = {
  play:'<path d="M6 3.5 20 12 6 20.5z"/>',
  pause:'<rect x="6.5" y="4" width="4" height="16"/><rect x="13.5" y="4" width="4" height="16"/>',
  stop:'<rect x="6" y="6" width="12" height="12"/>',
  mic:'<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
  scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
  wand:'<path d="m3 21 12-12"/><path d="M18 3v4"/><path d="M16 5h4"/><path d="M18 13v4"/><path d="M16 15h4"/>',
  music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  waves:'<path d="M2 7c1.5 0 1.5 1.5 3 1.5S6.5 7 8 7s1.5 1.5 3 1.5S12.5 7 14 7s1.5 1.5 3 1.5S18.5 7 20 7"/><path d="M2 12c1.5 0 1.5 1.5 3 1.5S6.5 12 8 12s1.5 1.5 3 1.5S12.5 12 14 12s1.5 1.5 3 1.5S18.5 12 20 12"/><path d="M2 17c1.5 0 1.5 1.5 3 1.5S6.5 17 8 17s1.5 1.5 3 1.5S12.5 17 14 17s1.5 1.5 3 1.5S18.5 17 20 17"/>',
  zap:'<path d="M4 14h7l-1 8 10-12h-7l1-8z"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  volume:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  mute:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>',
  trash:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
  plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  left:'<path d="m14 5-7 7 7 7"/>',
  right:'<path d="m10 5 7 7-7 7"/>',
  upload:'<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
  image:'<rect x="3" y="3" width="18" height="18"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3-3-6 6"/>',
  type:'<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',
  book:'<path d="M12 7v14"/><path d="M3 18V4h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v14h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock:'<rect x="4" y="10" width="16" height="11"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  sliders:'<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  check:'<path d="m5 13 4 4 10-10"/>',
  dot:'<circle cx="12" cy="12" r="4"/>',
  film:'<rect x="3" y="4" width="18" height="16"/><path d="M7 4v16"/><path d="M17 4v16"/><path d="M3 12h18"/>',
  save:'<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3"/><path d="M8 21v-7h8v7"/>'
};
const icon = (n, cls) =>
  `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
