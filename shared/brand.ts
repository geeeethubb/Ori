/**
 * Brand configuration. The product is Ori (decided; docs/ori/ORI_DESIGN_SPEC.md section 0), and its
 * symbol is the Little Companion (artwork in shared/oriArt.ts). Everything that shows the name, a
 * slogan, a brand color or the parent icon reads it from here. Internal identifiers (cookie name,
 * export format id, Android package) keep their original values so existing sessions, exports and
 * installs stay valid.
 */
import type { AppDesign, AppTheme } from './appSpec.ts';
import { ICON_GRADIENTS, type AppIconSpec } from './icons.ts';

// Messaging hierarchy. Use one headline and one explanatory line per surface, never all of them.
const PROMISE = 'Your AI companion. Your world, in your pocket.';
const BENEFIT = 'Apps made for you. Right on your home screen.';
const HEADLINE = 'Your interests have somewhere to go.';
const SIGNATURE = 'Your curiosity. Your story.';
const PRODUCT_SENTENCE = 'Ori is your AI companion for turning your interests and everyday needs into personal apps that live on your home screen.';
const LANDING_EXPLAINER = 'Your AI companion turns interests and everyday needs into apps made for you. Open them right from your home screen.';

export const BRAND = {
  /** Shown in the UI, titles, manifests and the Android launcher label. */
  name: 'Ori',
  shortName: 'Ori',
  nameStatus: 'decided' as const,
  /** Brand promise: brand and marketing moments. */
  promise: PROMISE,
  /** Concrete benefit: what Ori does for you. */
  benefit: BENEFIT,
  /** Emotional homepage headline. */
  headline: HEADLINE,
  /** Short signature: sign-offs and brand lockups. */
  signature: SIGNATURE,
  /** One-sentence product description (meta description, parent manifest). */
  productSentence: PRODUCT_SENTENCE,
  /** The explanatory line under the landing headline. */
  landingExplainer: LANDING_EXPLAINER,
  /** Alias of `headline` (the landing h1), kept so existing callers keep working. */
  tagline: HEADLINE,
  /** Alias of `productSentence`, kept for existing callers. */
  oneLiner: PRODUCT_SENTENCE,
  /** Alias of `landingExplainer` (the line under the landing headline), kept for existing callers. */
  description: LANDING_EXPLAINER,
  /** Name of the previous prototype; still used in the export format id and the Android package. */
  legacyName: 'AI App Store',
} as const;

/** Parent color tokens (spec section 4). Personal apps keep their own palettes. */
export const BRAND_COLORS = {
  canvas: '#F7F8FC',
  surface: '#FFFFFF',
  ink: '#162039',
  muted: '#59617A',
  cobalt: '#3147F2',
  lime: '#DFFF76',
  lilac: '#DBCBFF',
  orange: '#FF6A3D',
  border: '#DCE0EC',
  lightPaper: '#FAF8F4',
  lightCharcoal: '#181A1F',
} as const;

/**
 * Parent install identity. server/install.ts serves these from the companion art (oriAppIconSvg);
 * the URLs keep their original names so existing installs and the Android shell stay valid.
 */
export const BRAND_ASSETS = {
  manifest: '/manifest.webmanifest',
  favicon: '/icons/store.svg',
  touchIcon: '/icons/store-180.png',
  /** Browser chrome color for the parent. */
  themeColor: BRAND_COLORS.cobalt,
  /** Splash / manifest background for the parent. */
  backgroundColor: BRAND_COLORS.canvas,
} as const;

/** Primary navigation, in order. Settings live in the avatar menu. */
export const NAV = [
  { key: 'agent', label: 'Agent', path: '/agent' },
  { key: 'playground', label: 'Playground', path: '/playground' },
  { key: 'apps', label: 'My apps', path: '/apps' },
] as const;

/**
 * Canonical icons of the three reference apps (spec section 3): one icon per app across cards,
 * previews, launcher, manifests, shortcuts and install guides. Only Ori itself uses the companion.
 * `legacy` is the default these apps were created with before the rebrand; existing apps still store
 * it, and displayIcon maps it for display only. `interim` lists defaults that shipped for a while
 * after the rebrand: Riff was made with waveform/ink from the Ori foundation (eb2f82c) until its level
 * bars became their own symbol ('levels'). An app named anything else whose stored icon is
 * 'waveform' keeps the wave it chose.
 */
export const REFERENCE_APP_ICONS = {
  light: { name: 'Light', icon: { symbol: 'camera', color: 'charcoal' }, legacy: { symbol: 'aperture', color: 'charcoal' }, interim: [] },
  riff: { name: 'Riff', icon: { symbol: 'levels', color: 'ink' }, legacy: { symbol: 'guitar', color: 'ink' }, interim: [{ symbol: 'waveform', color: 'ink' }] },
  people: { name: 'People', icon: { symbol: 'people', color: 'white' }, legacy: { symbol: 'contact', color: 'mint' }, interim: [] },
} as const satisfies Record<string, { name: string; icon: AppIconSpec; legacy: AppIconSpec; interim: readonly AppIconSpec[] }>;

export type ReferenceAppKey = keyof typeof REFERENCE_APP_ICONS;

/** The canonical icon of a reference app, as a fresh object. */
export function referenceIcon(key: ReferenceAppKey): AppIconSpec {
  const { symbol, color } = REFERENCE_APP_ICONS[key].icon;
  return { symbol, color };
}

/** Every superseded default of a reference app: the pre-rebrand one, then any interim ones. */
export function supersededIcons(key: ReferenceAppKey): AppIconSpec[] {
  const ref = REFERENCE_APP_ICONS[key];
  const all: readonly AppIconSpec[] = [ref.legacy, ...ref.interim];
  return all.map(({ symbol, color }) => ({ symbol, color }));
}

/**
 * The icon to SHOW for an app. A reference app that still carries one of its exact superseded
 * defaults (same name, same symbol, same color: the pre-rebrand default or an interim one) shows its
 * canonical icon. Every other icon, including any icon a person chose, comes back unchanged. Display
 * only: stored specs are never rewritten.
 */
export function displayIcon(name: string | null | undefined, icon: AppIconSpec): AppIconSpec {
  if (!name) return icon;
  for (const key of Object.keys(REFERENCE_APP_ICONS) as ReferenceAppKey[]) {
    if (REFERENCE_APP_ICONS[key].name !== name) continue;
    if (supersededIcons(key).some((old) => old.symbol === icon.symbol && old.color === icon.color)) return referenceIcon(key);
  }
  return icon;
}

/**
 * The look People apps were created with before Ori (mint surface, blue accent). The Ori People
 * identity is white with orange accents (spec section 6), so that exact default is shown as
 * bright + orange.
 */
export const LEGACY_PEOPLE_LOOK = { theme: 'mint', accent: 'blue' } as const;

/** People's Ori look (spec section 6): clean white (the bright theme) with orange accents. */
export const PEOPLE_LOOK = { theme: 'bright', accent: 'orange' } as const;

/**
 * The design to SHOW for an app. Like displayIcon: only an app named People that still carries the
 * exact legacy reference look (theme mint, accent blue) is shown in the Ori People look (theme
 * bright, accent orange); any look a person chose (another theme or accent, or a revision that
 * changed either) and every other app come back unchanged, as the very same object. Display only:
 * stored specs are never rewritten. The runtime theme and the install metadata (theme-color,
 * manifest background) both use it, so a home-screen splash matches the app it opens.
 */
export function displayDesign<D extends Pick<AppDesign, 'theme' | 'accent'>>(name: string | null | undefined, design: D): D {
  if (name === REFERENCE_APP_ICONS.people.name && design.theme === LEGACY_PEOPLE_LOOK.theme && design.accent === LEGACY_PEOPLE_LOOK.accent) {
    return { ...design, theme: PEOPLE_LOOK.theme, accent: PEOPLE_LOOK.accent };
  }
  return design;
}

/** Each app theme's page colour: a personal app's manifest background (its splash on Android and iOS). */
export const APP_THEME_BACKGROUND: Readonly<Record<AppTheme, string>> = {
  bright: '#F7F8FC', paper: '#FAF8F4', charcoal: '#181A1F', ink: '#162039', mint: '#F3FBF7', lilac: '#F6F1FF', sunset: '#FFF4EF',
};

/**
 * The browser chrome colour (theme-color) of a personal app: its own page colour on a themed
 * surface, its icon colour on the parent's bright canvas. Pass the SHOWN icon and theme
 * (displayIcon, displayDesign), as the server's install metadata does, so the chrome matches the
 * app it frames and the page and its manifest agree.
 */
export function appThemeColor(icon: AppIconSpec, theme?: string | null): string {
  if (theme && theme !== 'bright' && Object.hasOwn(APP_THEME_BACKGROUND, theme)) return APP_THEME_BACKGROUND[theme as AppTheme];
  return ICON_GRADIENTS[icon.color]?.[1] ?? BRAND_COLORS.cobalt;
}
