/**
 * Temporary brand mark until the name is chosen: a blue tile with three rounded bars (a playground
 * of different things) and one lime bar. Original, deliberately simple, no sparkle.
 */
import { BRAND } from '@shared/brand.ts';

export function BrandMark({ size = 28, className, decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : BRAND.name}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <rect width="32" height="32" rx="9" fill="#3147F2" />
      <rect x="7" y="13" width="4" height="12" rx="2" fill="#ffffff" />
      <rect x="14" y="7" width="4" height="18" rx="2" fill="#ffffff" />
      <rect x="21" y="16" width="4" height="9" rx="2" fill="#DFFF76" />
    </svg>
  );
}
