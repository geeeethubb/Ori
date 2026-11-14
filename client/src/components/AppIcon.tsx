import { ICON_GRADIENTS, ICON_PATHS, type AppIconSpec } from '@shared/icons.ts';

interface Props {
  icon: AppIconSpec;
  size?: number;
  className?: string;
  title?: string;
}

/** Inline SVG app icon (same vocabulary as the server-rendered PNGs). */
export function AppIcon({ icon, size = 56, className, title }: Props) {
  const [c1, c2] = ICON_GRADIENTS[icon.color] ?? ICON_GRADIENTS.terracotta;
  const path = ICON_PATHS[icon.symbol] ?? ICON_PATHS.sparkle;
  const id = `ic-${icon.color}`;
  const r = Math.round(size * 0.22);
  const glyph = size * 0.52;
  const offset = (size - glyph) / 2;
  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title ?? `${icon.symbol} icon`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width={size} height={size} rx={r} ry={r} fill={`url(#${id})`} />
      <circle cx={size * 0.78} cy={size * 0.22} r={size * 0.3} fill="#fff" fillOpacity="0.08" />
      <g transform={`translate(${offset} ${offset}) scale(${glyph / 24})`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </g>
    </svg>
  );
}
