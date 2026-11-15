/**
 * Maps the framework-free Ori artwork trees from shared/oriArt.ts onto React elements, so the
 * companion and wordmark render inline (not as <img>) and ori.css can address their named groups.
 */
import { createElement, type CSSProperties, type ReactElement } from 'react';
import type { OriNode } from '@shared/oriArt.ts';

const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** "fill:red;--ori-lean:4deg" → { fill: 'red', '--ori-lean': '4deg' }; custom properties keep their names. */
function styleObject(css: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const colon = decl.indexOf(':');
    if (colon <= 0) continue;
    const name = decl.slice(0, colon).trim();
    out[name.startsWith('--') ? name : camel(name)] = decl.slice(colon + 1).trim();
  }
  return out as CSSProperties;
}

function propsOf(attrs: OriNode['attrs']): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (name === 'class') props.className = value;
    else if (name === 'style') props.style = styleObject(String(value));
    else props[camel(name)] = value; // stroke-width → strokeWidth; maskUnits, cx, d… unchanged
  }
  return props;
}

/**
 * Keys follow the stable group class names (ori-figure, ori-eyes, ori-orbit…), so a mood change keeps
 * the same DOM elements and CSS transitions on them (the pose) can run. Unnamed leaves use position.
 */
export function renderOriNodes(nodes: readonly OriNode[]): ReactElement[] {
  return nodes.map((node, i) => {
    const cls = node.attrs.class;
    const key = typeof cls === 'string' ? cls : `${node.tag}${i}`;
    return createElement(node.tag, { key, ...propsOf(node.attrs) }, node.children ? renderOriNodes(node.children) : undefined);
  });
}
