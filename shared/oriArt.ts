/**
 * Ori brand artwork: the Little Companion and the lowercase "ori" wordmark, as plain SVG.
 *
 * One source of truth for every placement. The React components (client/src/components/ori)
 * render these node trees inline so CSS can animate the named groups; the string helpers below
 * produce standalone SVG documents for icons, favicons and rasterized exports (resvg).
 *
 * Companion geometry
 * ------------------
 * Every mood draws inside one 100 × 100 frame, so swapping moods never moves or resizes the body.
 * The body is a reconstruction of the large companion on the approved identity board
 * (docs/ori/references/"Ori_ a little companion identity board.png"): its outline was traced from
 * the board and fitted with seven cubic Béziers (98.6% area overlap with the reference), then scaled
 * so the body is 78 units tall and centred (x 16.2–83.8, y 12–90). The margins hold the accents.
 * Eye, cheek and accent positions were measured on the same board (the four mood tiles and the
 * large mark) and expressed in this frame. Moods the board does not draw (building, clarify, error)
 * use the same parts: eyes, a lean, one accent.
 *
 * Groups (stable class names, animated by client/src/components/ori/ori.css):
 *   .ori-orbit                  building only, drawn behind the body; .ori-orbit-spin and
 *                               .ori-orbit-counter carry the dot round the ring
 *   .ori-figure > .ori-motion   the character; .ori-figure carries the mood's lean/tilt
 *     .ori-body                 the one body path, identical in every mood
 *     .ori-eyes (.ori-pupils)   mood-specific eyes
 *     .ori-cheek                the lime cheek
 *   .ori-accents                .ori-rays / .ori-dots / .ori-spark in front
 *
 * Rules from docs/ori/ORI_DESIGN_SPEC.md §3 and §5: no mouth, arms, legs, costumes, gradients or
 * gloss; variation only through eyes, a subtle lean, a small accent dot or short rays.
 */

export type OriMood = 'idle' | 'attentive' | 'thinking' | 'discovery' | 'building' | 'success' | 'clarify' | 'error';

export const ORI_MOODS: readonly OriMood[] = ['idle', 'attentive', 'thinking', 'discovery', 'building', 'success', 'clarify', 'error'];

/** Design labels from the spec's mood table. "Listening" is a label, never a microphone claim. */
export const ORI_MOOD_LABELS: Readonly<Record<OriMood, string>> = {
  idle: 'Here',
  attentive: 'Listening',
  thinking: 'Thinking',
  discovery: 'Found something',
  building: 'Making',
  success: 'Ready',
  clarify: 'Need a detail',
  error: 'Try again',
};

export const ORI_COLORS = {
  cobalt: '#3147F2',
  lime: '#DFFF76',
  lilac: '#DBCBFF',
  ink: '#162039',
  white: '#FFFFFF',
  orange: '#FF6A3D',
  canvas: '#F7F8FC',
} as const;

type OriColorName = keyof typeof ORI_COLORS;

export function isOriMood(v: unknown): v is OriMood {
  return typeof v === 'string' && (ORI_MOODS as readonly string[]).includes(v);
}

/* ------------------------------------------------------------------------------------------ */
/* Node tree: the same artwork serializes to a string or maps onto React elements.             */
/* ------------------------------------------------------------------------------------------ */

export interface OriNode {
  tag: 'g' | 'path' | 'ellipse' | 'circle' | 'rect' | 'defs' | 'mask';
  attrs: Readonly<Record<string, string | number | undefined>>;
  children?: readonly OriNode[];
}

/** Numbers in the markup: at most two decimals, no trailing zeros. */
function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function serializeOriNodes(nodes: readonly OriNode[]): string {
  return nodes
    .map((n) => {
      const attrs = Object.entries(n.attrs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => ` ${k}="${escapeAttr(typeof v === 'number' ? num(v) : String(v))}"`)
        .join('');
      return n.children && n.children.length > 0
        ? `<${n.tag}${attrs}>${serializeOriNodes(n.children)}</${n.tag}>`
        : `<${n.tag}${attrs}/>`;
    })
    .join('');
}

/* ------------------------------------------------------------------------------------------ */
/* Companion                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** Side of the square companion frame (user units). */
export const ORI_FRAME = 100;

/** Where the body sits inside the frame. */
export const ORI_BODY_BOX = { x: 16.18, y: 12, width: 67.65, height: 78 } as const;

/**
 * The body, identical for every mood. Clockwise from the curl's tip:
 *   C → 77.6 30.5   outer edge of the curl, round to its widest point
 *   C → 71.7 43.1   down into the notch where the tail rises from the body
 *   C → 80.9 55.1   out of the notch onto the right shoulder
 *   C → 72.3 84.2   right flank and the widest point of the base
 *   C → 16.8 59.9   the broad rounded base, up to the left flank
 *   C → 62.9 24.4   the long left shoulder rising toward the tail
 *   C → 63.1 13.3   inner side of the curl, hooking back toward the left
 *   Q → start       the softened tip
 */
export const ORI_BODY_PATH =
  'M64 12.1C72.7 13 80.7 21.8 77.6 30.5C76.2 34.3 70.8 39 71.7 43.1C72.7 47.7 78.5 51.1 80.9 55.1' +
  'C87.4 65.8 81.8 77.7 72.3 84.2C53.8 96.7 9.4 89.5 16.8 59.9C23.5 33.3 53.1 32.1 62.9 24.4' +
  'C68.9 19.7 64.6 15.5 63.1 13.3Q62.6 12 64 12.1Z';

/** Leans and tilts pivot on the middle of the base, so the character rocks instead of sliding. */
const PIVOT_X = 50;
const PIVOT_Y = 90;

/** [cx, cy, rx, ry, rotate°] — an eye or cheek ellipse. */
type Oval = readonly [number, number, number, number, number];
/** [cx, cy, r] — a happy-eye arc (upper half circle) or a dot. */
type Circle = readonly [number, number, number];

type Eyes =
  | { kind: 'oval'; left: Oval; right: Oval; /** [dx, dy, r] from each eye centre, body-coloured. */ pupils?: Circle }
  | { kind: 'happy'; left: Circle; right: Circle; width: number };

type Accent =
  | { kind: 'rays'; color: OriColorName; cx: number; cy: number; angles: readonly number[]; from: number; to: number; width: number }
  | { kind: 'dots'; color: OriColorName; dots: readonly Circle[] }
  | { kind: 'spark'; dot: Circle; rayColor: OriColorName; angles: readonly number[]; from: number; to: number; width: number }
  | { kind: 'orbit'; cx: number; cy: number; rx: number; ry: number; tilt: number; ring: number; dot: number; start: number };

interface MoodArt {
  /** Rotation in degrees about the base (positive = clockwise, toward the right). */
  lean: number;
  eyes: Eyes;
  accents: readonly Accent[];
}

/** The lime cheek on the viewer's right, the same in every mood. */
const CHEEK: Oval = [68.1, 71.5, 7.5, 3.7, -27];

/**
 * The building orbit ring: a deeper lilac than the token so it still reads on lilac surfaces
 * (about 1.45:1 there, 2.1:1 on canvas, 7:1 on ink) while staying a soft, restrained line.
 */
const ORBIT_RING = '#B7A2FF';

/** Relaxed resting eyes of the large board mark: tall ovals leaning slightly to the right. */
const IDLE_EYES: Eyes = { kind: 'oval', left: [41.4, 59.5, 3.5, 6.2, 18], right: [57.4, 60.1, 3.5, 6.2, 18] };

const MOOD_ART: Readonly<Record<OriMood, MoodArt>> = {
  idle: { lean: 0, eyes: IDLE_EYES, accents: [] },
  // Listening: the board's tile keeps the body upright and the cheek in place; the eyes widen a
  // touch and glance up-left toward three short orange rays. The lean is a slight 3° toward them.
  attentive: {
    lean: -3,
    eyes: { kind: 'oval', left: [41.2, 57.1, 4, 6.5, 20], right: [56.8, 59.3, 4, 6.5, 20] },
    accents: [{ kind: 'rays', color: 'orange', cx: 32.5, cy: 52.5, angles: [-127, -151, -174], from: 19.5, to: 29.5, width: 4 }],
  },
  // Thinking: rounder eyes glancing up (body-coloured pupils biting the top) with the head tipped
  // back 4°, as on the board, and three small dots rising from the shoulder while a request is pending.
  thinking: {
    lean: -4,
    eyes: { kind: 'oval', left: [43.6, 54.8, 4.8, 5.9, 4], right: [60.3, 52.3, 4.8, 5.9, 4], pupils: [2, -5.4, 2.5] },
    accents: [{ kind: 'dots', color: 'cobalt', dots: [[29.5, 31.5, 1.7], [22.5, 25.5, 2.2], [14, 20.5, 2.7]] }],
  },
  // Found something: open upright eyes, a lime dot beside the tail and short cobalt rays. The dot
  // matches the board; its ray fan is turned ~25° upward so the rays stay inside the frame.
  discovery: {
    lean: 0,
    eyes: { kind: 'oval', left: [41.1, 56.6, 4.2, 7.5, 0], right: [56.6, 56.6, 4.2, 7.5, 0] },
    accents: [{ kind: 'spark', dot: [87.2, 30.2, 7.3], rayColor: 'cobalt', angles: [-100, -72, -44], from: 11.2, to: 15.6, width: 2.6 }],
  },
  // Making: focused eyes turned toward a restrained lilac orbit carrying a lime dot.
  building: {
    lean: 0,
    eyes: { kind: 'oval', left: [42.4, 58.4, 3.4, 5.3, 0], right: [58.2, 58.4, 3.4, 5.3, 0] },
    accents: [{ kind: 'orbit', cx: 50, cy: 64, rx: 46, ry: 11, tilt: -14, ring: 2.2, dot: 4.2, start: -28 }],
  },
  // Ready: happy upward-curved eyes, same cheek and silhouette.
  success: { lean: 0, eyes: { kind: 'happy', left: [41, 60.4, 5.5], right: [59.8, 60.4, 5.5], width: 3.1 }, accents: [] },
  // Need a detail: a small head tilt and one eye raised and wider — inquisitive.
  clarify: {
    lean: -7,
    eyes: { kind: 'oval', left: [41.6, 59.8, 3.5, 5.8, 4], right: [57.8, 57.8, 4.3, 7.2, 4] },
    accents: [],
  },
  // Try again: calm, neutral, slightly lowered eyes and a slight tilt. No distress. The tilt sits
  // close to the thinking pose it usually follows, because error is static (no transition into it).
  error: {
    lean: -2,
    eyes: { kind: 'oval', left: [41.6, 61.2, 3.3, 4.7, 2], right: [57.4, 61.6, 3.3, 4.7, 2] },
    accents: [],
  },
};

/** Below this many px (frame size) the simplified drawing is used. */
export const ORI_SIMPLIFIED_BELOW_PX = 28;

/**
 * Simplified (small-size) art: eyes grow this much and stand upright so they land on whole pixels
 * and stay legible at 16–24px. Accents are dropped; silhouette and cheek stay.
 */
const SMALL_EYE_SCALE = 1.35;

/** Happy eyes are upper half circles with short legs, like the board's "Ready". */
const HAPPY_LEG = 0.8;

export interface OriArtOptions {
  mood?: OriMood;
  /** Single-colour variant: every mark in this colour, eyes become cut-outs, no cheek. */
  mono?: string;
  /** Small-size art (≤ 24px): no accents, slightly larger eyes. */
  simplified?: boolean;
  /** Draw the mood's accents. Default: not simplified. */
  accents?: boolean;
  /**
   * How the lean is written: an SVG transform attribute (standalone files), or `style` for inline
   * React art, which sets the `--ori-lean` custom property that ori.css turns into a transform so
   * the pose can transition between moods.
   */
  pose?: 'attribute' | 'style';
  /** Prefix for the mono eye-mask id when several SVGs share one document. */
  idPrefix?: string;
}

/** An ellipse; `scale` grows the radii in place, `upright` drops the rotation (small-size art). */
function ellipse(o: Oval, scale: number, attrs: Record<string, string> = {}, upright = false): OriNode {
  const [cx, cy, rx, ry, rot] = o;
  return {
    tag: 'ellipse',
    attrs: { cx, cy, rx: rx * scale, ry: ry * scale, transform: rot && !upright ? `rotate(${num(rot)} ${num(cx)} ${num(cy)})` : undefined, ...attrs },
  };
}

function happyArc([cx, cy, r]: Circle, scale: number): string {
  const rr = r * Math.min(scale, 1.1);
  const leg = HAPPY_LEG * scale;
  return `M${num(cx - rr)} ${num(cy + leg)}V${num(cy)}A${num(rr)} ${num(rr)} 0 0 1 ${num(cx + rr)} ${num(cy)}V${num(cy + leg)}`;
}

/** The eye shapes, in one fill colour (white on the body, black inside a mono mask). */
function eyeNodes(eyes: Eyes, scale: number, color: string, pupilColor: string): OriNode[] {
  const small = scale > 1;
  if (eyes.kind === 'happy') {
    const d = happyArc(eyes.left, scale) + happyArc(eyes.right, scale);
    const width = eyes.width * (small ? 1.4 : 1);
    return [{ tag: 'path', attrs: { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } }];
  }
  const out: OriNode[] = [ellipse(eyes.left, scale, { fill: color }, small), ellipse(eyes.right, scale, { fill: color }, small)];
  if (eyes.pupils) {
    const [dx, dy, r] = eyes.pupils;
    const pupil = (o: Oval): OriNode => ({ tag: 'circle', attrs: { cx: o[0] + dx * scale, cy: o[1] + dy * scale, r: r * scale } });
    out.push({ tag: 'g', attrs: { class: 'ori-pupils', fill: pupilColor }, children: [pupil(eyes.left), pupil(eyes.right)] });
  }
  return out;
}

function rayPath(cx: number, cy: number, angles: readonly number[], from: number, to: number): string {
  return angles
    .map((a) => {
      const t = (a * Math.PI) / 180;
      const c = Math.cos(t);
      const s = Math.sin(t);
      return `M${num(cx + from * c)} ${num(cy + from * s)}L${num(cx + to * c)} ${num(cy + to * s)}`;
    })
    .join('');
}

function accentNode(a: Exclude<Accent, { kind: 'orbit' }>, mono?: string): OriNode {
  const paint = (c: OriColorName) => mono ?? ORI_COLORS[c];
  switch (a.kind) {
    case 'rays':
      return {
        tag: 'path',
        attrs: { class: 'ori-rays', d: rayPath(a.cx, a.cy, a.angles, a.from, a.to), fill: 'none', stroke: paint(a.color), 'stroke-width': a.width, 'stroke-linecap': 'round' },
      };
    case 'dots':
      return {
        tag: 'g',
        attrs: { class: 'ori-dots', fill: paint(a.color) },
        children: a.dots.map(([cx, cy, r]) => ({ tag: 'circle', attrs: { cx, cy, r } })),
      };
    case 'spark': {
      const [cx, cy, r] = a.dot;
      return {
        tag: 'g',
        attrs: { class: 'ori-spark' },
        children: [
          { tag: 'circle', attrs: { class: 'ori-spark-dot', cx, cy, r, fill: paint('lime') } },
          {
            tag: 'path',
            attrs: { class: 'ori-spark-rays', d: rayPath(cx, cy, a.angles, a.from, a.to), fill: 'none', stroke: paint(a.rayColor), 'stroke-width': a.width, 'stroke-linecap': 'round' },
          },
        ],
      };
    }
  }
}

/**
 * The orbit: a lilac ring behind the body and a lime dot riding it. The dot sits at `start` on the
 * ring; ori.css spins `.ori-orbit-spin` (and counter-spins `.ori-orbit-counter` so the dot stays
 * round) only while a real create/apply operation is pending.
 */
function orbitNode(a: Extract<Accent, { kind: 'orbit' }>, mono?: string): OriNode {
  const k = a.ry / a.rx;
  return {
    tag: 'g',
    attrs: { class: 'ori-orbit' },
    children: [
      {
        tag: 'ellipse',
        attrs: {
          class: 'ori-orbit-ring', cx: a.cx, cy: a.cy, rx: a.rx, ry: a.ry, fill: 'none',
          stroke: mono ?? ORBIT_RING, 'stroke-width': a.ring, transform: `rotate(${num(a.tilt)} ${num(a.cx)} ${num(a.cy)})`,
        },
      },
      {
        tag: 'g',
        attrs: { transform: `translate(${num(a.cx)} ${num(a.cy)}) rotate(${num(a.tilt)}) scale(1 ${num(k)})` },
        children: [{
          tag: 'g',
          attrs: { transform: `rotate(${num(a.start)})` },
          children: [{
            tag: 'g',
            attrs: { class: 'ori-orbit-spin' },
            children: [{
              tag: 'g',
              attrs: { transform: `translate(${num(a.rx)} 0)` },
              children: [{
                tag: 'g',
                attrs: { class: 'ori-orbit-counter' },
                children: [{
                  tag: 'g',
                  attrs: { transform: `rotate(${num(-a.start)}) scale(1 ${num(1 / k)})` },
                  children: [{ tag: 'circle', attrs: { class: 'ori-orbit-dot', r: a.dot, fill: mono ?? ORI_COLORS.lime } }],
                }],
              }],
            }],
          }],
        }],
      },
    ],
  };
}

/**
 * The companion's elements (children of a `0 0 100 100` svg). Unknown moods fall back to idle:
 * the mood always comes from UI state, never from model output.
 */
export function oriCompanionNodes(opts: OriArtOptions = {}): OriNode[] {
  const mood: OriMood = isOriMood(opts.mood) ? opts.mood : 'idle';
  const art = MOOD_ART[mood];
  const simplified = opts.simplified === true;
  const withAccents = opts.accents ?? !simplified;
  const mono = opts.mono;
  const eyeScale = simplified ? SMALL_EYE_SCALE : 1;
  const out: OriNode[] = [];

  let maskId: string | undefined;
  if (mono) {
    maskId = `${opts.idPrefix ?? 'ori'}-eyes-${mood}${simplified ? '-s' : ''}`;
    out.push({
      tag: 'defs',
      attrs: {},
      children: [{
        tag: 'mask',
        attrs: { id: maskId, maskUnits: 'userSpaceOnUse', x: -20, y: -20, width: 140, height: 140 },
        children: [{ tag: 'rect', attrs: { x: -20, y: -20, width: 140, height: 140, fill: '#fff' } }, ...eyeNodes(art.eyes, eyeScale, '#000', '#fff')],
      }],
    });
  }

  const orbit = withAccents ? art.accents.find((a): a is Extract<Accent, { kind: 'orbit' }> => a.kind === 'orbit') : undefined;
  if (orbit) out.push(orbitNode(orbit, mono));

  const pose = opts.pose ?? 'attribute';
  const lean = art.lean;
  const figureAttrs: Record<string, string> = { class: 'ori-figure' };
  if (pose === 'style') {
    // ori.css: transform: translate(50px, 90px) rotate(var(--ori-lean)) translate(-50px, -90px).
    figureAttrs.style = `--ori-lean:${num(lean)}deg`;
  } else if (lean !== 0) {
    figureAttrs.transform = `rotate(${num(lean)} ${PIVOT_X} ${PIVOT_Y})`;
  }

  const figure: OriNode[] = [
    { tag: 'path', attrs: { class: 'ori-body', d: ORI_BODY_PATH, fill: mono ?? ORI_COLORS.cobalt, mask: maskId ? `url(#${maskId})` : undefined } },
  ];
  if (!mono) {
    figure.push({ tag: 'g', attrs: { class: 'ori-eyes' }, children: eyeNodes(art.eyes, eyeScale, ORI_COLORS.white, ORI_COLORS.cobalt) });
    figure.push({ tag: 'g', attrs: { class: 'ori-cheek' }, children: [ellipse(CHEEK, 1, { fill: ORI_COLORS.lime })] });
  }
  out.push({ tag: 'g', attrs: figureAttrs, children: [{ tag: 'g', attrs: { class: 'ori-motion' }, children: figure }] });

  const front = withAccents ? art.accents.filter((a): a is Exclude<Accent, { kind: 'orbit' }> => a.kind !== 'orbit') : [];
  if (front.length > 0) out.push({ tag: 'g', attrs: { class: 'ori-accents' }, children: front.map((a) => accentNode(a, mono)) });
  return out;
}

export interface OriCompanionSvgOptions {
  mood?: OriMood;
  /** Output width and height in px. */
  size: number;
  /** Single colour for every mark (e.g. ink on light, white on ink). */
  mono?: string;
  /** Small-size art; defaults to true below ORI_SIMPLIFIED_BELOW_PX (28px). */
  simplified?: boolean;
  /** Fill behind the frame (omit for transparent). */
  background?: string;
  /**
   * Space in px between the output edge and the companion frame. Negative values crop into the
   * frame's own margin (at most 9 units, so the body never clips) to let a tiny static mark such
   * as a favicon fill more of its box; accents may clip when cropped.
   */
  padding?: number;
}

function svgDocument(width: number, height: number, viewBox: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="${viewBox}">${body}</svg>`;
}

/** A standalone SVG document of the companion (static: no CSS motion). */
export function oriCompanionSvg(opts: OriCompanionSvgOptions): string {
  const size = Math.max(1, opts.size);
  const simplified = opts.simplified ?? size < ORI_SIMPLIFIED_BELOW_PX;
  const padPx = Math.min(opts.padding ?? 0, size / 2 - 0.5);
  const p = Math.max(-9, (padPx / (size - 2 * padPx)) * ORI_FRAME);
  const span = ORI_FRAME + 2 * p;
  const bg = opts.background
    ? serializeOriNodes([{ tag: 'rect', attrs: { x: -p, y: -p, width: span, height: span, fill: opts.background } }])
    : '';
  const art = serializeOriNodes(oriCompanionNodes({ mood: opts.mood, mono: opts.mono, simplified }));
  return svgDocument(size, size, `${num(-p)} ${num(-p)} ${num(span)} ${num(span)}`, bg + art);
}

/**
 * Ori's own app icon: the static idle companion on a lilac tile. Non-maskable icons get a rounded
 * square; maskable ones are full-bleed with the companion inside the central 80% safe zone so
 * platform masks (circle, squircle) never crop the curl. Browser-tab sizes use oriFaviconSvg.
 */
export function oriAppIconSvg(size: number, opts: { maskable?: boolean } = {}): string {
  return svgDocument(size, size, '0 0 100 100', serializeOriNodes(oriAppIconNodes(size, opts)));
}

/** The app icon's elements, in a 0 0 100 100 frame (`size` only picks the small drawing). */
function oriAppIconNodes(size: number, opts: { maskable?: boolean } = {}): OriNode[] {
  const maskable = opts.maskable === true;
  const bodyHeight = maskable ? 54 : 68; // share of the tile, in units of 100
  const k = bodyHeight / ORI_BODY_BOX.height;
  const cx = ORI_BODY_BOX.x + ORI_BODY_BOX.width / 2;
  const cy = ORI_BODY_BOX.y + ORI_BODY_BOX.height / 2;
  const tx = 50 - cx * k;
  const ty = 49 - cy * k; // a hair above centre: the base carries the visual weight
  const tile: OriNode = maskable
    ? { tag: 'rect', attrs: { width: 100, height: 100, fill: ORI_COLORS.lilac } }
    : { tag: 'rect', attrs: { width: 100, height: 100, rx: 22, ry: 22, fill: ORI_COLORS.lilac } };
  const art: OriNode = {
    tag: 'g',
    attrs: { transform: `translate(${num(tx)} ${num(ty)}) scale(${Math.round(k * 1000) / 1000})` },
    children: oriCompanionNodes({ mood: 'idle', simplified: size * (bodyHeight / 100) < 30, accents: false }),
  };
  return [tile, art];
}

/* ------------------------------------------------------------------------------------------ */
/* Favicon: a dedicated tiny drawing for browser tabs                                          */
/* ------------------------------------------------------------------------------------------ */

/**
 * At 16 px the app icon's eyes merge into one pale smear: its body fills only 68% of the tile and
 * its oval eyes fall between pixels. The favicon is drawn on its own pixel grids instead (spec
 * section 3: preserve the silhouette and legible eyes at 16–24 px). The same body path fills 85%
 * of the box; the eyes are whole-pixel bars with a clear cobalt gap; the lime cheek stays.
 * Coordinates below are pixels of each grid.
 */
export interface OriFaviconSpec {
  tileRadius: number;
  /** Top-left pixel of each eye. */
  eyes: readonly (readonly [number, number])[];
  /** Eye width and height in whole pixels. */
  eyeSize: readonly [number, number];
  eyeRadius: number;
  /** A whole-pixel cheek, or null to scale the art's own oval. */
  cheek: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

export type OriFaviconGrid = 16 | 32;

export const ORI_FAVICON_GRIDS: Readonly<Record<OriFaviconGrid, OriFaviconSpec>> = {
  16: { tileRadius: 3.5, eyes: [[6, 8], [9, 8]], eyeSize: [1, 2], eyeRadius: 0, cheek: { x: 11, y: 11, width: 2, height: 1 } },
  32: { tileRadius: 7, eyes: [[12, 17], [17, 17]], eyeSize: [2, 4], eyeRadius: 1, cheek: null },
};

/** Share of the favicon box the body's height fills. */
const FAVICON_BODY_SHARE = 0.85;

/** The favicon drawn on one grid, in that grid's pixel units (a `0 0 grid grid` frame). */
function faviconNodes(grid: OriFaviconGrid): OriNode[] {
  const spec = ORI_FAVICON_GRIDS[grid];
  const k = (FAVICON_BODY_SHARE * grid) / ORI_BODY_BOX.height;
  // Centre the body box in the grid; frame units → grid pixels.
  const tx = (grid - ORI_BODY_BOX.width * k) / 2 - ORI_BODY_BOX.x * k;
  const ty = (grid - ORI_BODY_BOX.height * k) / 2 - ORI_BODY_BOX.y * k;
  const [ew, eh] = spec.eyeSize;
  const r = spec.eyeRadius || undefined;
  const cheek: OriNode = spec.cheek
    ? { tag: 'rect', attrs: { ...spec.cheek, fill: ORI_COLORS.lime } }
    : (() => {
        const [ccx, ccy, crx, cry, rot] = CHEEK;
        const cx = tx + ccx * k;
        const cy = ty + ccy * k;
        return { tag: 'ellipse', attrs: { cx, cy, rx: crx * k, ry: cry * k, transform: `rotate(${num(rot)} ${num(cx)} ${num(cy)})`, fill: ORI_COLORS.lime } };
      })();
  return [
    { tag: 'rect', attrs: { width: grid, height: grid, rx: spec.tileRadius, ry: spec.tileRadius, fill: ORI_COLORS.lilac } },
    { tag: 'path', attrs: { class: 'ori-body', d: ORI_BODY_PATH, transform: `translate(${num(tx)} ${num(ty)}) scale(${Math.round(k * 10000) / 10000})`, fill: ORI_COLORS.cobalt } },
    { tag: 'g', attrs: { class: 'ori-eyes', fill: ORI_COLORS.white }, children: spec.eyes.map(([x, y]) => ({ tag: 'rect' as const, attrs: { x, y, width: ew, height: eh, rx: r, ry: r } })) },
    cheek,
  ];
}

/** The grid a favicon of `size` px is drawn on: 16 below 24 px, 32 from there. */
export function oriFaviconGrid(size: number): OriFaviconGrid {
  return size < 24 ? 16 : 32;
}

/**
 * The favicon as a standalone SVG of `size` px (the 16 and 32 px PNGs). Exact at 16 and 32;
 * other sizes scale the nearer grid.
 */
export function oriFaviconSvg(size: number): string {
  const px = Math.max(1, size);
  const grid = oriFaviconGrid(px);
  return svgDocument(px, px, `0 0 ${grid} ${grid}`, serializeOriNodes(faviconNodes(grid)));
}

/**
 * The parent favicon document (/icons/store.svg): the 16 px drawing by default, the 32 px drawing
 * from 24 px and the full app icon from 48 px. Browsers evaluate an SVG image's media queries
 * against the size they draw it at, so a tab gets the tiny drawing and a large tile the full icon.
 * A renderer without CSS shows the 16 px drawing (the others start hidden by attribute).
 */
export function oriFaviconDocument(): string {
  const style =
    '<style>@media (min-width:24px){.ori-fav-16{display:none}.ori-fav-32{display:inline}}' +
    '@media (min-width:48px){.ori-fav-32{display:none}.ori-fav-full{display:inline}}</style>';
  const groups: OriNode[] = [
    { tag: 'g', attrs: { class: 'ori-fav-16', transform: 'scale(2)' }, children: faviconNodes(16) },
    { tag: 'g', attrs: { class: 'ori-fav-32', display: 'none' }, children: faviconNodes(32) },
    { tag: 'g', attrs: { class: 'ori-fav-full', display: 'none', transform: 'scale(0.32)' }, children: oriAppIconNodes(256) },
  ];
  return svgDocument(32, 32, '0 0 32 32', style + serializeOriNodes(groups));
}

/* ------------------------------------------------------------------------------------------ */
/* Wordmark                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export type OriWordmarkVariant = 'ink' | 'cobalt' | 'light';

/**
 * Custom lowercase "ori", rebuilt from the identity board in its pixel units (letters 315 tall).
 * Plain paths with round ends, so it renders without any font:
 *   o  a filled ring open at its upper right: an outer ellipse and a smaller counter set higher, so
 *      the stroke is heavier at the bottom right as on the board, joined by two round ends that
 *      almost touch, so it never reads as c (fitted to the board: 97.5% overlap)
 *   r  a rounded stem and one soft arm sweeping up and out to a round end
 *   i  a rounded stem; its dot is a lime circle framed by a ring
 */
export const ORI_WORDMARK_VIEWBOX = { width: 496, height: 321 } as const;

const WORDMARK = {
  /** Outer arc, top round end, counter arc (reversed), right round end. */
  o: 'M208.2 154.4A103.8 113.4 29.5 1 1 150.6 100.2A27.1 27.1 0 0 1 130.2 150.4A46.5 52.1 27.3 1 0 156.8 173.8A27.5 27.5 0 0 1 208.2 154.4Z',
  rStem: { d: 'M258.5 283V128', width: 70 },
  rArm: { d: 'M258.5 236C258.5 166 289 126 358 126', width: 66 },
  iStem: { d: 'M439 280V156', width: 78 },
  dot: { cx: 439, cy: 57.5, ring: 54, inner: 37 },
} as const;

/**
 * Every variant frames the lime dot in cobalt (spec section 3: "a lime dot framed in blue"); on ink
 * the white letters carry the name and the cobalt ring reads as the dot's frame, as on the board.
 */
const WORDMARK_PAINT: Readonly<Record<OriWordmarkVariant, { letters: string; ring: string; dot: string }>> = {
  ink: { letters: ORI_COLORS.ink, ring: ORI_COLORS.cobalt, dot: ORI_COLORS.lime },
  cobalt: { letters: ORI_COLORS.cobalt, ring: ORI_COLORS.cobalt, dot: ORI_COLORS.lime },
  light: { letters: ORI_COLORS.white, ring: ORI_COLORS.cobalt, dot: ORI_COLORS.lime },
};

export function oriWordmarkNodes(variant: OriWordmarkVariant = 'ink'): OriNode[] {
  const paint = WORDMARK_PAINT[variant] ?? WORDMARK_PAINT.ink;
  const stroke = (part: { d: string; width: number }): OriNode => ({ tag: 'path', attrs: { d: part.d, 'stroke-width': part.width } });
  const { cx, cy, ring, inner } = WORDMARK.dot;
  return [
    {
      tag: 'g',
      attrs: { class: 'ori-letters', fill: paint.letters },
      children: [
        { tag: 'path', attrs: { d: WORDMARK.o } },
        { tag: 'g', attrs: { fill: 'none', stroke: paint.letters, 'stroke-linecap': 'round' }, children: [stroke(WORDMARK.rStem), stroke(WORDMARK.rArm), stroke(WORDMARK.iStem)] },
      ],
    },
    { tag: 'circle', attrs: { class: 'ori-dot-ring', cx, cy, r: ring, fill: paint.ring } },
    { tag: 'circle', attrs: { class: 'ori-dot', cx, cy, r: inner, fill: paint.dot } },
  ];
}

/** A standalone SVG document of the wordmark at the given height (width follows the aspect). */
export function oriWordmarkSvg(opts: { variant: OriWordmarkVariant; height: number }): string {
  const { width: vw, height: vh } = ORI_WORDMARK_VIEWBOX;
  const h = Math.max(1, opts.height);
  return svgDocument((h * vw) / vh, h, `0 0 ${vw} ${vh}`, serializeOriNodes(oriWordmarkNodes(opts.variant)));
}

/* ------------------------------------------------------------------------------------------ */
/* Lockup: companion + wordmark in one coordinate system (board proportions).                  */
/* ------------------------------------------------------------------------------------------ */

/**
 * On the board the companion's body is as tall as the letters (324 vs 315 px), shares their top
 * edge, and sits 38 px left of the o. Accents are left out of the lockup so nothing collides with
 * the letters; the mood still shows through the eyes and lean.
 */
const LOCKUP_BODY_HEIGHT = 324;
const LOCKUP_GAP = 37;
const LOCKUP_SCALE = LOCKUP_BODY_HEIGHT / ORI_BODY_BOX.height;
const LOCKUP_BODY_LEFT = 3 - LOCKUP_GAP - ORI_BODY_BOX.width * LOCKUP_SCALE;
const LOCKUP_PAD = 4;

export const ORI_LOCKUP_VIEWBOX = {
  x: LOCKUP_BODY_LEFT - LOCKUP_PAD,
  y: 0,
  width: ORI_WORDMARK_VIEWBOX.width - (LOCKUP_BODY_LEFT - LOCKUP_PAD),
  height: 3.5 + LOCKUP_BODY_HEIGHT + LOCKUP_PAD,
} as const;

/** Where the companion frame goes inside the lockup's coordinate system. */
export const ORI_LOCKUP_COMPANION_TRANSFORM =
  `translate(${num(LOCKUP_BODY_LEFT - ORI_BODY_BOX.x * LOCKUP_SCALE)} ${num(3.5 - ORI_BODY_BOX.y * LOCKUP_SCALE)}) scale(${Math.round(LOCKUP_SCALE * 1000) / 1000})`;

/** Single colour of the lockup's companion on ink: cobalt there is only about 2.5:1. */
const LOCKUP_LIGHT_COMPANION = ORI_COLORS.white;

export interface OriLockupOptions {
  variant: OriWordmarkVariant;
  height: number;
  mood?: OriMood;
  /** Prefix for the light variant's eye-mask id when several lockups share one document. */
  idPrefix?: string;
}

/**
 * The lockup's elements (children of an svg with ORI_LOCKUP_VIEWBOX). The companion is static: in
 * full colour beside the ink and cobalt wordmarks, and the white single-colour companion (eyes cut
 * out, no cheek) beside the light wordmark on ink. It switches to the small drawing when, at
 * `height` px, its frame would be under ORI_SIMPLIFIED_BELOW_PX.
 */
export function oriLockupNodes(opts: OriLockupOptions): OriNode[] {
  const framePx = (Math.max(1, opts.height) * LOCKUP_SCALE * ORI_FRAME) / ORI_LOCKUP_VIEWBOX.height;
  const companion: OriNode = {
    tag: 'g',
    attrs: { class: 'ori-lockup-companion', transform: ORI_LOCKUP_COMPANION_TRANSFORM },
    children: oriCompanionNodes({
      mood: opts.mood,
      accents: false,
      simplified: framePx < ORI_SIMPLIFIED_BELOW_PX,
      mono: opts.variant === 'light' ? LOCKUP_LIGHT_COMPANION : undefined,
      idPrefix: opts.idPrefix ?? 'ori-lockup',
    }),
  };
  return [companion, ...oriWordmarkNodes(opts.variant)];
}

export function oriLockupSvg(opts: OriLockupOptions): string {
  const vb = ORI_LOCKUP_VIEWBOX;
  const h = Math.max(1, opts.height);
  return svgDocument((h * vb.width) / vb.height, h, `${num(vb.x)} ${vb.y} ${num(vb.width)} ${num(vb.height)}`,
    serializeOriNodes(oriLockupNodes({ ...opts, height: h })));
}
