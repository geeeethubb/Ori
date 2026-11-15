/**
 * The Little Companion as inline SVG (docs/ori/ORI_DESIGN_SPEC.md sections 3 and 5).
 *
 * Purely presentational: the mood comes from the current UI operation (see useOriMood), never from
 * model output. All motion lives in ori.css and is bound to the current mood, so it stops when the
 * mood changes or the component unmounts; there are no JS timers here. motion="none" and
 * prefers-reduced-motion show the same expression, still. Below 28px the simplified drawing is used
 * (no accents, larger eyes). Decorative by default, because adjacent text should carry the state.
 */
import { useId, useMemo } from 'react';
import { ORI_FRAME, ORI_SIMPLIFIED_BELOW_PX, isOriMood, oriCompanionNodes, type OriMood } from '@shared/oriArt.ts';
import { renderOriNodes } from './renderOriNodes.ts';
import './ori.css';

export interface OriCompanionProps {
  mood?: OriMood;
  /** Width and height in px (default 48). */
  size?: number;
  /** "none" freezes the expression; prefers-reduced-motion does the same automatically. */
  motion?: 'auto' | 'none';
  /** Default true: hidden from assistive tech. Set false to expose it as an image named `label`. */
  decorative?: boolean;
  /** Accessible name when not decorative (default "Ori"). */
  label?: string;
  className?: string;
  /** Single colour for every mark (eyes become cut-outs, no cheek): ink on light, white on ink. */
  mono?: string;
}

export function OriCompanion({ mood = 'idle', size = 48, motion = 'auto', decorative = true, label = 'Ori', className, mono }: OriCompanionProps) {
  const current: OriMood = isOriMood(mood) ? mood : 'idle';
  const px = Number.isFinite(size) && size > 0 ? size : 48;
  const simplified = px < ORI_SIMPLIFIED_BELOW_PX;
  // Mono eyes are a mask; its id must be unique per instance on the page.
  const idPrefix = `ori${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const art = useMemo(
    () => renderOriNodes(oriCompanionNodes({ mood: current, simplified, mono, pose: 'style', idPrefix })),
    [current, simplified, mono, idPrefix],
  );
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${ORI_FRAME} ${ORI_FRAME}`}
      width={px}
      height={px}
      className={className ? `ori-companion ${className}` : 'ori-companion'}
      data-mood={current}
      data-motion={motion === 'none' ? 'none' : 'auto'}
      data-scale={simplified ? 'sm' : px >= 56 ? 'lg' : 'md'}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      {art}
    </svg>
  );
}
