import { FLAT_COLORS, ICON_GLYPH, ICON_GRADIENTS, ICON_PATHS, isIconColor, type AppIconSpec } from '@shared/icons.ts';

interface Props {
  icon: AppIconSpec;
  size?: number;
  className?: string;
  title?: string;
}

/** Inline SVG app icon (same vocabulary as the server-rendered PNGs). Flat colors render without the gradient sheen. */
export function AppIcon({ icon, size = 56, className, title }: Props) {
  const color = isIconColor(icon.color) ? icon.color : 'terracotta';
  const [c1, c2] = ICON_GRADIENTS[color];
  const path = ICON_PATHS[icon.symbol] ?? ICON_PATHS.compass;
  const flat = FLAT_COLORS.has(color);
  const id = `ic-${color}`;
  const r = Math.round(size * 0.22);
  const glyph = size * 0.52;
  const offset = (size - glyph) / 2;
  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title ?? `${icon.symbol} icon`}>
      {!flat && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={c1} />
            <stop offset="1" stopColor={c2} />
          </linearGradient>
        </defs>
      )}
      <rect width={size} height={size} rx={r} ry={r} fill={flat ? c1 : `url(#${id})`} />
      {!flat && <circle cx={size * 0.78} cy={size * 0.22} r={size * 0.3} fill="#fff" fillOpacity="0.08" />}
      {color === 'paper' && <rect x="0.5" y="0.5" width={size - 1} height={size - 1} rx={r} ry={r} fill="none" stroke="#DCE0EC" />}
      <g transform={`translate(${offset} ${offset}) scale(${glyph / 24})`} fill="none" stroke={ICON_GLYPH[color]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </g>
    </svg>
  );
}
