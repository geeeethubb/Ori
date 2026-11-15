/**
 * Studio Pop: each app's identity, resolved from its design block into attributes and CSS variables
 * for `.rt-root`. Pure functions, no React. The CSS in runtime.css reads `data-theme`,
 * `data-typography`, `data-density`, `data-artwork` and the inline `--app-accent*` variables set here.
 *
 * Every text/fill pair below was checked for WCAG AA (≥ 4.5:1) against the surfaces it is used on.
 */
import { designFor, type AppDesign, type AppSpec, type AppTheme } from '@shared/appSpec.ts';
import type { IconColor } from '@shared/icons.ts';

export interface ThemeInfo {
  /** Dark themes flip which accent variant is readable as text. */
  dark: boolean;
  /** Accent used when the design does not name one, or names one that would vanish on this theme. */
  defaultAccent: IconColor;
  /** Accents that are (nearly) the same as the theme's background and must fall back. */
  unusable: readonly IconColor[];
}

export const THEMES: Record<AppTheme, ThemeInfo> = {
  bright: { dark: false, defaultAccent: 'blue', unusable: ['paper', 'white'] },
  paper: { dark: false, defaultAccent: 'orange', unusable: ['paper', 'white'] },
  charcoal: { dark: true, defaultAccent: 'orange', unusable: ['charcoal', 'ink', 'slate'] },
  ink: { dark: true, defaultAccent: 'lime', unusable: ['ink', 'charcoal', 'slate', 'indigo'] },
  mint: { dark: false, defaultAccent: 'blue', unusable: ['paper', 'mint', 'white'] },
  lilac: { dark: false, defaultAccent: 'lilac', unusable: ['paper', 'white'] },
  sunset: { dark: false, defaultAccent: 'orange', unusable: ['paper', 'white'] },
};

export interface AccentSwatch {
  /** Solid fill for primary buttons, selected states and progress. */
  fill: string;
  /** Text drawn on top of `fill`. */
  onFill: string;
  /** The accent as text or an icon on a light surface (white, paper, mint-soft). */
  textLight: string;
  /** The accent as text or an icon on a dark surface (ink, charcoal). */
  textDark: string;
}

export const ACCENTS: Record<IconColor, AccentSwatch> = {
  terracotta: { fill: '#B8441C', onFill: '#FFFFFF', textLight: '#B8441C', textDark: '#F0A080' },
  plum: { fill: '#5E2E78', onFill: '#FFFFFF', textLight: '#5E2E78', textDark: '#D4B5EA' },
  teal: { fill: '#1F6B5F', onFill: '#FFFFFF', textLight: '#1F6B5F', textDark: '#7FD6C4' },
  ocean: { fill: '#1F4F8F', onFill: '#FFFFFF', textLight: '#1F4F8F', textDark: '#8FBDF0' },
  moss: { fill: '#4C6B2F', onFill: '#FFFFFF', textLight: '#4C6B2F', textDark: '#B5D98A' },
  mustard: { fill: '#7A5A00', onFill: '#FFFFFF', textLight: '#7A5A00', textDark: '#F2CB5E' },
  rose: { fill: '#A93355', onFill: '#FFFFFF', textLight: '#A93355', textDark: '#F3A3B8' },
  slate: { fill: '#3C4858', onFill: '#FFFFFF', textLight: '#3C4858', textDark: '#B3C0D1' },
  indigo: { fill: '#3A368F', onFill: '#FFFFFF', textLight: '#3A368F', textDark: '#B4B1F0' },
  coral: { fill: '#C24D2C', onFill: '#FFFFFF', textLight: '#B0421F', textDark: '#F0A48A' },
  ink: { fill: '#162039', onFill: '#DFFF76', textLight: '#162039', textDark: '#DFFF76' },
  lime: { fill: '#DFFF76', onFill: '#162039', textLight: '#4B5A00', textDark: '#DFFF76' },
  lilac: { fill: '#DBCBFF', onFill: '#162039', textLight: '#4B2E8A', textDark: '#DBCBFF' },
  orange: { fill: '#FF6A3D', onFill: '#162039', textLight: '#9A2E0E', textDark: '#FF7E57' },
  mint: { fill: '#BCEED6', onFill: '#162039', textLight: '#0F5A3C', textDark: '#BCEED6' },
  blue: { fill: '#3147F2', onFill: '#FFFFFF', textLight: '#2436C9', textDark: '#AEB7FF' },
  charcoal: { fill: '#181A1F', onFill: '#FAF8F4', textLight: '#181A1F', textDark: '#FAF8F4' },
  paper: { fill: '#FAF8F4', onFill: '#181A1F', textLight: '#59617A', textDark: '#FAF8F4' },
  // A white tile (People's icon). As an accent it only works on dark themes; light themes fall back.
  white: { fill: '#FFFFFF', onFill: '#162039', textLight: '#162039', textDark: '#FFFFFF' },
};

/** The accent actually used on a theme: the design's choice unless it would disappear. */
export function resolveAccent(theme: AppTheme, accent: IconColor | undefined): IconColor {
  const info = THEMES[theme];
  if (!accent || info.unusable.includes(accent)) return info.defaultAccent;
  return accent;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ResolvedTheme {
  design: Required<AppDesign>;
  accent: IconColor;
  swatch: AccentSwatch;
  dark: boolean;
  /** Attributes for the `.rt-root` element. */
  attrs: { 'data-theme': AppTheme; 'data-typography': string; 'data-density': string; 'data-artwork': string };
  /** Inline CSS variables for the `.rt-root` element (the accent family; the rest lives in runtime.css). */
  style: Record<string, string>;
}

/** Everything the runtime root needs to wear this app's identity. */
export function resolveTheme(spec: Pick<AppSpec, 'design' | 'pattern' | 'icon' | 'purpose'>): ResolvedTheme {
  const design = designFor(spec);
  const accent = resolveAccent(design.theme, design.accent);
  const swatch = ACCENTS[accent];
  const dark = THEMES[design.theme].dark;
  const style: Record<string, string> = {
    '--app-accent': swatch.fill,
    '--app-accent-ink': swatch.onFill,
    '--app-accent-text': dark ? swatch.textDark : swatch.textLight,
    '--app-accent-soft': rgba(swatch.fill, dark ? 0.2 : 0.14),
    '--app-accent-glow': rgba(swatch.fill, dark ? 0.45 : 0.3),
  };
  return {
    design,
    accent,
    swatch,
    dark,
    attrs: { 'data-theme': design.theme, 'data-typography': design.typography, 'data-density': design.density, 'data-artwork': design.artwork },
    style,
  };
}

// ---------- contrast helpers (used by tests to keep the tables honest) ----------

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colors (≥ 4.5 passes AA for normal text). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Surface colors per theme, mirrored from runtime.css so tests can check text contrast. */
export const THEME_SURFACES: Record<AppTheme, { bg: string; surface: string; surface2: string; ink: string; ink2: string; ink3: string }> = {
  bright: { bg: '#F7F8FC', surface: '#FFFFFF', surface2: '#EEF0F7', ink: '#162039', ink2: '#59617A', ink3: '#646C88' },
  paper: { bg: '#FAF8F4', surface: '#FFFFFF', surface2: '#F1EEE8', ink: '#181A1F', ink2: '#5C5A55', ink3: '#6E6B65' },
  charcoal: { bg: '#181A1F', surface: '#23262D', surface2: '#2C3038', ink: '#FAF8F4', ink2: '#C2C5CE', ink3: '#A9ADB8' },
  ink: { bg: '#162039', surface: '#27324D', surface2: '#324060', ink: '#F7F8FC', ink2: '#C4CBE0', ink3: '#AAB3CC' },
  mint: { bg: '#F3FBF7', surface: '#FFFFFF', surface2: '#E9FAF2', ink: '#162039', ink2: '#4F6358', ink3: '#5F7368' },
  lilac: { bg: '#F6F2FF', surface: '#FFFFFF', surface2: '#F1EAFF', ink: '#1C1733', ink2: '#5A5479', ink3: '#6B6589' },
  sunset: { bg: '#FFF6F0', surface: '#FFFFFF', surface2: '#FFECE2', ink: '#2B1A14', ink2: '#6B574E', ink3: '#7A665D' },
};
