/**
 * The custom lowercase "ori" wordmark and the companion + wordmark lockup, as inline SVG drawn from
 * the paths in shared/oriArt.ts (no font). Variants (spec section 3): ink for compact headers on light
 * surfaces, cobalt for large brand treatments, light for ink surfaces. The i's dot stays lime.
 * Both are images named "Ori" unless `title=""` marks them decorative (e.g. inside a named link).
 */
import { ORI_LOCKUP_VIEWBOX, ORI_WORDMARK_VIEWBOX, oriLockupNodes, oriWordmarkNodes, type OriMood, type OriWordmarkVariant } from '@shared/oriArt.ts';
import { renderOriNodes } from './renderOriNodes.ts';

const px = (v: number | undefined, fallback: number) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : fallback);
const round = (v: number) => Math.round(v * 100) / 100;
const named = (title: string) => (title === '' ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': title });

export interface OriWordmarkProps {
  variant?: OriWordmarkVariant;
  /** Full height in px, from the top of the i's dot to the baseline; width follows (default 28). */
  height?: number;
  className?: string;
  /** Accessible name (default "Ori"); "" hides it from assistive tech. */
  title?: string;
}

export function OriWordmark({ variant = 'ink', height, className, title = 'Ori' }: OriWordmarkProps) {
  const { width: vw, height: vh } = ORI_WORDMARK_VIEWBOX;
  const h = px(height, 28);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${vw} ${vh}`}
      width={round((h * vw) / vh)}
      height={h}
      className={className ? `ori-wordmark ${className}` : 'ori-wordmark'}
      data-variant={variant}
      {...named(title)}
    >
      {renderOriNodes(oriWordmarkNodes(variant))}
    </svg>
  );
}

export interface OriLockupProps {
  /** Height in px (default 40); the companion's body is as tall as the letters. */
  size?: number;
  variant?: OriWordmarkVariant;
  /** The companion's still expression (default idle). For motion, place OriCompanion beside OriWordmark. */
  mood?: OriMood;
  className?: string;
  /** Accessible name (default "Ori"); "" hides it from assistive tech. */
  title?: string;
}

export function OriLockup({ size, variant = 'ink', mood = 'idle', className, title = 'Ori' }: OriLockupProps) {
  const vb = ORI_LOCKUP_VIEWBOX;
  const h = px(size, 40);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${round(vb.x)} ${vb.y} ${round(vb.width)} ${round(vb.height)}`}
      width={round((h * vb.width) / vb.height)}
      height={h}
      className={className ? `ori-lockup ${className}` : 'ori-lockup'}
      data-variant={variant}
      data-mood={mood}
      {...named(title)}
    >
      {renderOriNodes(oriLockupNodes({ variant, mood, height: h }))}
    </svg>
  );
}
