/**
 * App icon vocabulary. Every app picks one symbol and one color; the same definitions render as
 * inline SVG in the client, as PNG for home screens (server-side) and as launcher shortcut bitmaps
 * on Android.
 *
 * Glyph paths are Lucide icons (ISC license, https://lucide.dev), flattened to single path strings
 * so they rasterize without a font. See docs/ASSET_SOURCES.md.
 */

export const ICON_SYMBOLS = [
  // original set
  'camera', 'pen', 'board', 'music', 'checklist', 'map', 'book', 'heart', 'leaf', 'star',
  'people', 'calendar', 'chart', 'mic', 'palette', 'bike', 'coffee', 'lightbulb', 'target',
  'globe', 'compass', 'sparkle', 'home', 'sun', 'dumbbell', 'plant', 'film', 'wallet',
  // redesign additions (Studio Pop app identities)
  'guitar', 'timer', 'headphones', 'waveform', 'aperture', 'image', 'bookmark', 'link', 'disc', 'piano',
  'contact', 'footprints', 'mountain', 'waves', 'flame', 'trophy', 'plane', 'utensils', 'graduation', 'rocket',
  'puzzle', 'binoculars', 'brush', 'flower', 'kanban', 'notebook', 'checks',
] as const;
export type IconSymbol = (typeof ICON_SYMBOLS)[number];

export const ICON_COLORS = [
  // original gradient colors (kept so every existing app renders unchanged)
  'terracotta', 'plum', 'teal', 'ocean', 'moss', 'mustard', 'rose', 'slate', 'indigo', 'coral',
  // flat Electric Playground / Studio Pop colors
  'ink', 'lime', 'lilac', 'orange', 'mint', 'blue', 'charcoal', 'paper',
] as const;
export type IconColor = (typeof ICON_COLORS)[number];

/** Background stops (top-left to bottom-right). Flat colors repeat one value. */
export const ICON_GRADIENTS: Record<IconColor, [string, string]> = {
  terracotta: ['#E2744A', '#B8441C'],
  plum: ['#9B5DB5', '#5E2E78'],
  teal: ['#3FA796', '#1F6B5F'],
  ocean: ['#4A8FD9', '#1F4F8F'],
  moss: ['#7FA65A', '#4C6B2F'],
  mustard: ['#E0B23C', '#A67A12'],
  rose: ['#E36E8C', '#A93355'],
  slate: ['#6E7F93', '#3C4858'],
  indigo: ['#6F6BD9', '#3A368F'],
  coral: ['#F0845F', '#C24D2C'],
  ink: ['#162039', '#162039'],
  lime: ['#DFFF76', '#DFFF76'],
  lilac: ['#DBCBFF', '#DBCBFF'],
  orange: ['#FF6A3D', '#FF6A3D'],
  mint: ['#BCEED6', '#BCEED6'],
  blue: ['#3147F2', '#3147F2'],
  charcoal: ['#181A1F', '#181A1F'],
  paper: ['#FAF8F4', '#FAF8F4'],
};

/** Glyph (stroke) color per background. Light backgrounds take dark ink for contrast. */
export const ICON_GLYPH: Record<IconColor, string> = {
  terracotta: '#ffffff', plum: '#ffffff', teal: '#ffffff', ocean: '#ffffff', moss: '#ffffff',
  mustard: '#ffffff', rose: '#ffffff', slate: '#ffffff', indigo: '#ffffff', coral: '#ffffff',
  ink: '#DFFF76', lime: '#162039', lilac: '#162039', orange: '#162039', mint: '#162039', blue: '#ffffff', charcoal: '#FAF8F4', paper: '#181A1F',
};

/** Flat colors render without the gradient sheen; legacy colors keep it. */
export const FLAT_COLORS: ReadonlySet<IconColor> = new Set<IconColor>(['ink', 'lime', 'lilac', 'orange', 'mint', 'blue', 'charcoal', 'paper']);

/** A readable text color for UI drawn on top of a given icon color (chips, theme bars). */
export function contrastInk(color: IconColor): string {
  return ICON_GLYPH[color] === '#ffffff' ? '#ffffff' : '#162039';
}

/**
 * 24x24 stroke paths (stroke-width 2, round caps/joins). Lucide icons flattened to one path each.
 */
export const ICON_PATHS: Record<IconSymbol, string> = {
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  pen: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  board: 'M4 4h4v16H4z M10 4h4v10h-4z M16 4h4v7h-4z',
  music: 'M9 18V5l12-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  checklist: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z M2 21c0-3 1.9-5.5 3.5-7',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1L12 2z',
  people: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18',
  chart: 'M18 20V10 M12 20V4 M6 20v-6',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8',
  palette: 'M12 22a10 10 0 1 1 0-20c5.5 0 10 3.6 10 8 0 2.8-2.2 5-5 5h-1.8a1.5 1.5 0 0 0-1.1 2.5c.4.4.6 1 .6 1.5a2.5 2.5 0 0 1-2.7 3z M7.5 11.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M11 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M16 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  bike: 'M5.5 21a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M18.5 21a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M12 17.5V14l-3-3 4-3 2 3h2',
  coffee: 'M18 8h1a4 4 0 0 1 0 8h-1 M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z M6 1v3 M10 1v3 M14 1v3',
  lightbulb: 'M9 18h6 M10 22h4 M15.1 14c.9-1 1.9-2.3 1.9-4a5 5 0 0 0-10 0c0 1.7 1 3 1.9 4 .7.8 1.1 1.5 1.1 2.5h4c0-1 .4-1.7 1.1-2.5z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3 6.3-2.1z',
  sparkle: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17z',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z M9 22V12h6v10',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  dumbbell: 'M6.5 6.5l11 11 M21 21l-1-1 M3 3l1 1 M18 22l4-4 M2 6l4-4 M3 10l7-7 M14 21l7-7',
  plant: 'M12 22V12 M12 12c0-4-3-7-8-7 0 5 3 7 8 7z M12 15c0-4 3-7 8-7 0 5-3 7-8 7z',
  film: 'M19.8 2H4.2A2.2 2.2 0 0 0 2 4.2v15.6A2.2 2.2 0 0 0 4.2 22h15.6a2.2 2.2 0 0 0 2.2-2.2V4.2A2.2 2.2 0 0 0 19.8 2z M7 2v20 M17 2v20 M2 12h20 M2 7h5 M2 17h5 M17 17h5 M17 7h5',
  wallet: 'M20 12V8H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h12v4 M4 6v12a2 2 0 0 0 2 2h14v-4 M18 12a2 2 0 0 0 0 4h4v-4h-4z',
  guitar: 'm11.9 12.1 4.514-4.514 M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z m6 16 2 2 M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z',
  timer: 'M10 2L14 2 M12 14L15 11 M4 14a8 8 0 1 0 16 0a8 8 0 1 0 -16 0',
  headphones: 'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3',
  waveform: 'M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2',
  aperture: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 m14.31 8 5.74 9.94 M9.69 8h11.48 m7.38 12 5.74-9.94 M9.69 16 3.95 6.06 M14.31 16H2.83 m16.62 12-5.74 9.94',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
  bookmark: 'M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  disc: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M6 12c0-1.7.7-3.2 1.8-4.2 M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M18 12c0 1.7-.7 3.2-1.8 4.2',
  piano: 'M10 13v4 M14 13v4 M18 13v4 M2 13h20 M22 11.5A3.5 3.5 0 0018.5 8a3.52 3.52 0 01-3.173-2A7 7 0 002 9v10a2 2 0 002 2h16a2 2 0 002-2z M6 13v4',
  contact: 'M16 2v2 M7 21v-2a2 2 0 012-2h6a2 2 0 012 2v2 M8 2v2 M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z',
  footprints: 'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z M16 17h4 M4 13h4',
  mountain: 'm8 3 4 8 5-5 5 15H2L8 3z',
  waves: 'M2 12q2.5 2 5 0t5 0 5 0 5 0 M2 19q2.5 2 5 0t5 0 5 0 5 0 M2 5q2.5 2 5 0t5 0 5 0 5 0',
  flame: 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4',
  trophy: 'M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2 M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2 M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3 M4 22h16 M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3',
  plane: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  utensils: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
  graduation: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z M22 10v6 M6 12.5V16a6 3 0 0 0 12 0v-3.5',
  rocket: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5 M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09 M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05',
  puzzle: 'M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z',
  binoculars: 'M10 10h4 M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3 M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z M 22 16 L 2 16 M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3',
  brush: 'm11 10 3 3 M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031',
  flower: 'M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1 M10 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M12 10v12 M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z',
  kanban: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z M8 7v7 M12 7v4 M16 7v9',
  notebook: 'M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4 M2 6h4 M2 10h4 M2 14h4 M2 18h4 M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z',
  checks: 'M13 5h8 M13 12h8 M13 19h8 m3 17 2 2 4-4 m3 7 2 2 4-4',
};

export interface AppIconSpec {
  symbol: IconSymbol;
  color: IconColor;
}

/**
 * Build the SVG markup for an app icon. `size` is the pixel box; `radiusFraction` the corner
 * radius fraction (0 for maskable/adaptive icons which get their own mask, ~0.22 for display).
 */
export function appIconSvg(icon: AppIconSpec, size = 192, radiusFraction = 0.22): string {
  const color: IconColor = isIconColor(icon.color) ? icon.color : 'terracotta';
  const [c1, c2] = ICON_GRADIENTS[color];
  const path = ICON_PATHS[icon.symbol] ?? ICON_PATHS.sparkle;
  const glyphColor = ICON_GLYPH[color];
  const flat = FLAT_COLORS.has(color);
  const r = Math.round(size * radiusFraction);
  // Glyph occupies ~52% of the box, centered.
  const glyph = size * 0.52;
  const offset = (size - glyph) / 2;
  const scale = glyph / 24;
  const gradId = `g-${color}`;
  const fill = flat ? c1 : `url(#${gradId})`;
  const defs = flat
    ? ''
    : `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
  const sheen = flat ? '' : `<circle cx="${size * 0.78}" cy="${size * 0.22}" r="${size * 0.3}" fill="#ffffff" fill-opacity="0.08"/>`;
  // Paper icons need an outline to stay visible on a white home screen.
  const outline = color === 'paper' ? `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${Math.max(0, r - 1)}" ry="${Math.max(0, r - 1)}" fill="none" stroke="#DCE0EC" stroke-width="2"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    defs +
    `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${fill}"/>` +
    sheen +
    outline +
    `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${glyphColor}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></g></svg>`
  );
}

export function isIconSymbol(v: unknown): v is IconSymbol {
  return typeof v === 'string' && (ICON_SYMBOLS as readonly string[]).includes(v);
}
export function isIconColor(v: unknown): v is IconColor {
  return typeof v === 'string' && (ICON_COLORS as readonly string[]).includes(v);
}
