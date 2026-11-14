/**
 * Explorations may point only at pages the person actually shared. Any step that links elsewhere is
 * dropped (the model is told not to invent links, but the guard enforces it); an exploration left
 * without steps is dropped entirely.
 */
import type { RecommendationDraft } from '../../shared/context.ts';

const URL_RX = /https?:\/\/[^\s)>\]"']+/gi;

function host(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function groundExplorations<T extends RecommendationDraft>(draft: T, allowedUrls: (string | null | undefined)[]): T | null {
  if (draft.kind !== 'explore' || !draft.explorationSteps) return draft;
  const allowed = new Set(allowedUrls.map((u) => (u ? host(u) : null)).filter((h): h is string => Boolean(h)));
  const steps = draft.explorationSteps.filter((step) => {
    const links = step.match(URL_RX) ?? [];
    return links.every((l) => {
      const h = host(l);
      return h !== null && allowed.has(h);
    });
  });
  if (!steps.length) return null;
  return { ...draft, explorationSteps: steps };
}
