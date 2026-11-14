/**
 * Brand configuration. The product name is UNDECIDED: everything that shows a name reads it from
 * here so a decision is a one-line change. "Your Playground" is a temporary descriptive label,
 * not a brand proposal. Internal identifiers (cookie name, export format id, Android package)
 * keep their original values so existing sessions, exports and installs stay valid.
 */
export const BRAND = {
  /** Temporary descriptive label shown in the UI, titles and manifests. */
  name: 'Your Playground',
  shortName: 'Playground',
  nameStatus: 'temporary' as const,
  /** Emotional promise (landing headline). */
  tagline: 'Your interests have somewhere to go.',
  /** One-liner. */
  oneLiner: 'A personal AI that turns your interests and everyday needs into a playground of apps made just for you.',
  /** One-sentence explanation under the headline. */
  description: 'Share what inspires you. Discover what you could do with it. Make apps that feel like yours.',
  /** Name of the previous prototype; still used in the export format id and the Android package. */
  legacyName: 'AI App Store',
} as const;

/** Primary navigation, in order. Settings live in the avatar menu. */
export const NAV = [
  { key: 'agent', label: 'Agent', path: '/agent' },
  { key: 'playground', label: 'Playground', path: '/playground' },
  { key: 'apps', label: 'My apps', path: '/apps' },
] as const;
