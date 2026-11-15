/**
 * The Ori brand mark for compact headers: the ink wordmark alone (spec section 3); `size` is its
 * height in px. The companion appears where it carries meaning (moods, the Ori app icon), and the
 * companion + wordmark lockup (OriLockup) only on landing and brand headers.
 */
import { BRAND } from '@shared/brand.ts';
import { OriWordmark } from './ori/OriWordmark.tsx';

export function BrandMark({ size = 28, className, decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return <OriWordmark variant="ink" height={size} className={className} title={decorative ? '' : BRAND.name} />;
}
