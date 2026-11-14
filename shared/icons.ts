/**
 * App icon vocabulary. Every generated app picks one symbol and one color; the same
 * definitions render as inline SVG in the storefront, as PNG for iOS home screens
 * (server-side), and as launcher shortcut bitmaps on Android.
 */

export const ICON_SYMBOLS = [
  'camera', 'pen', 'board', 'music', 'checklist', 'map', 'book', 'heart', 'leaf', 'star',
  'people', 'calendar', 'chart', 'mic', 'palette', 'bike', 'coffee', 'lightbulb', 'target',
  'globe', 'compass', 'sparkle', 'home', 'sun', 'dumbbell', 'plant', 'film', 'wallet',
] as const;
export type IconSymbol = (typeof ICON_SYMBOLS)[number];

export const ICON_COLORS = [
  'terracotta', 'plum', 'teal', 'ocean', 'moss', 'mustard', 'rose', 'slate', 'indigo', 'coral',
] as const;
export type IconColor = (typeof ICON_COLORS)[number];

/** Gradient stops (top-left to bottom-right) per color name. */
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
};

/**
 * 24x24 stroke paths (Lucide-style, stroke-width 2, round caps). Kept deliberately simple so
 * they rasterize crisply without any font.
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
  const [c1, c2] = ICON_GRADIENTS[icon.color] ?? ICON_GRADIENTS.terracotta;
  const path = ICON_PATHS[icon.symbol] ?? ICON_PATHS.sparkle;
  const r = Math.round(size * radiusFraction);
  // Glyph occupies ~52% of the box, centered.
  const glyph = size * 0.52;
  const offset = (size - glyph) / 2;
  const scale = glyph / 24;
  const gradId = `g-${icon.color}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#${gradId})"/>` +
    `<circle cx="${size * 0.78}" cy="${size * 0.22}" r="${size * 0.3}" fill="#ffffff" fill-opacity="0.08"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#ffffff" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></g></svg>`
  );
}

export function isIconSymbol(v: unknown): v is IconSymbol {
  return typeof v === 'string' && (ICON_SYMBOLS as readonly string[]).includes(v);
}
export function isIconColor(v: unknown): v is IconColor {
  return typeof v === 'string' && (ICON_COLORS as readonly string[]).includes(v);
}
