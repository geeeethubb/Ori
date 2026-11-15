/**
 * Brand configuration. The product is Ori (decided; docs/ori/ORI_DESIGN_SPEC.md section 0), and its
 * symbol is the Little Companion (artwork in shared/oriArt.ts). Everything that shows the name, a
 * slogan, a brand color or the parent icon reads it from here. Internal identifiers (cookie name,
 * export format id, Android package) keep their original values so existing sessions, exports and
 * installs stay valid.
 */
import type { AppIconSpec } from './icons.ts';

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
 * it, and displayIcon maps it for display only.
 */
export const REFERENCE_APP_ICONS = {
  light: { name: 'Light', icon: { symbol: 'camera', color: 'charcoal' }, legacy: { symbol: 'aperture', color: 'charcoal' } },
  riff: { name: 'Riff', icon: { symbol: 'waveform', color: 'ink' }, legacy: { symbol: 'guitar', color: 'ink' } },
  people: { name: 'People', icon: { symbol: 'people', color: 'white' }, legacy: { symbol: 'contact', color: 'mint' } },
} as const satisfies Record<string, { name: string; icon: AppIconSpec; legacy: AppIconSpec }>;

export type ReferenceAppKey = keyof typeof REFERENCE_APP_ICONS;

/** The canonical icon of a reference app, as a fresh object. */
export function referenceIcon(key: ReferenceAppKey): AppIconSpec {
  const { symbol, color } = REFERENCE_APP_ICONS[key].icon;
  return { symbol, color };
}

/**
 * The icon to SHOW for an app. A reference app that still carries its exact pre-rebrand default
 * (same name, same symbol, same color) shows its canonical icon. Every other icon, including any icon
 * a person chose, comes back unchanged. Display only: stored specs are never rewritten.
 */
export function displayIcon(name: string | null | undefined, icon: AppIconSpec): AppIconSpec {
  if (!name) return icon;
  for (const key of Object.keys(REFERENCE_APP_ICONS) as ReferenceAppKey[]) {
    const ref = REFERENCE_APP_ICONS[key];
    if (ref.name === name && ref.legacy.symbol === icon.symbol && ref.legacy.color === icon.color) return referenceIcon(key);
  }
  return icon;
}
