import { displayIcon } from '@shared/brand.ts';
import { FLAT_COLORS, ICON_GLYPH, ICON_GRADIENTS, ICON_PATHS, OUTLINED_COLORS, isIconColor, type AppIconSpec } from '@shared/icons.ts';

interface Props {
  icon: AppIconSpec;
  /**
   * The app's name. Pass it whenever the icon belongs to an app: a reference app (Light, Riff,
   * People) still carrying its pre-Ori default then shows its canonical icon, exactly as on the
   * home screen. Custom icons are never changed.
   */
  name?: string;
  size?: number;
  className?: string;
  /** Accessible name. An empty string marks the icon decorative (adjacent text names the app). */
  title?: string;
}

/** Inline SVG app icon (same vocabulary as the server-rendered PNGs). Flat colors render without the gradient sheen. */
export function AppIcon({ icon: stored, name, size = 56, className, title }: Props) {
  const icon = displayIcon(name, stored);
  const decorative = title === '';
  const color = isIconColor(icon.color) ? icon.color : 'terracotta';
  const [c1, c2] = ICON_GRADIENTS[color];
  const path = ICON_PATHS[icon.symbol] ?? ICON_PATHS.compass;
  const flat = FLAT_COLORS.has(color);
  const id = `ic-${color}`;
  const r = Math.round(size * 0.22);
  const glyph = size * 0.52;
  const offset = (size - glyph) / 2;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : (title ?? (name ? `${name} icon` : `${icon.symbol} icon`))}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
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
      {OUTLINED_COLORS.has(color) && <rect x="0.5" y="0.5" width={size - 1} height={size - 1} rx={r} ry={r} fill="none" stroke="#DCE0EC" />}
      <g transform={`translate(${offset} ${offset}) scale(${glyph / 24})`} fill="none" stroke={ICON_GLYPH[color]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </g>
    </svg>
  );
}
