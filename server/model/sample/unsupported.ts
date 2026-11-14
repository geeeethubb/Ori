/**
 * Things people ask for that this product does not do: syncing or importing from other services,
 * calendars, sending messages, listening to audio. Each is named plainly (services by name) with what
 * works instead, so a reply never implies that an integration exists.
 */
import type { UnsupportedItem } from '../../../shared/context.ts';

const SERVICE_RX = /\b(spotify|instagram|tiktok|youtube|soundcloud|apple music|pinterest|strava|notion|google (?:sheets|docs|drive|photos)|icloud|dropbox)\b/gi;
const PULL_RX = /\b(?:auto[- ]?sync(?:ing|ed)?|sync(?:ing|ed)?|auto[- ]?import(?:ing|ed)?|import(?:ing)? (?:from|my|all)|pull(?:ing)?(?: in| from)?|connect(?:ing)?(?: to| my)?|link(?:ing)? (?:up|my)|automatically (?:add|save|pull|import|bring))\b/i;

const PRETTY: Record<string, string> = {
  spotify: 'Spotify', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', soundcloud: 'SoundCloud', 'apple music': 'Apple Music',
  pinterest: 'Pinterest', strava: 'Strava', notion: 'Notion', icloud: 'iCloud', dropbox: 'Dropbox',
};

function pretty(name: string): string {
  const k = name.toLowerCase();
  return PRETTY[k] ?? k.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function findUnsupported(text: string): UnsupportedItem[] {
  const t = text.trim();
  if (!t) return [];
  const out: UnsupportedItem[] = [];
  const add = (item: UnsupportedItem) => {
    if (!out.some((o) => o.request === item.request)) out.push(item);
  };
  if (PULL_RX.test(t)) {
    const names = [...new Set([...t.matchAll(SERVICE_RX)].map((m) => pretty(m[1] ?? '')))].filter(Boolean);
    for (const name of names) {
      add({ request: `${name} sync`, reason: `There is no connection to ${name} here, so nothing is synced or read from it.`, alternative: 'Save the links you care about by hand; each stays a saved link.' });
    }
  }
  if (/\b(?:google |apple |outlook )?calendar\b/i.test(t) && /\b(?:add|put|sync|schedule|block|book)\b/i.test(t)) {
    add({ request: 'Calendar sync', reason: 'No calendar is connected, so nothing is added to one.', alternative: 'Give the entry a date; the app highlights it when it is due.' });
  }
  if (/\b(?:send|text|email|e-mail|message|dm|whatsapp|slack)\b[^.!?]{0,40}\b(?:for me|automatically)\b|\bauto(?:matically)?[- ]?(?:send|post|reply)\b/i.test(t)) {
    add({ request: 'Sending messages for you', reason: 'Nothing is ever sent for you.', alternative: 'Keep a draft you can copy and send yourself.' });
  }
  if (/\b(?:transcribe|analy[sz]e (?:the |my )?(?:audio|recording|sound|song)|listen to (?:the |my )?(?:recording|audio|track)|detect (?:the )?(?:chords|tempo|key|notes))\b/i.test(t)) {
    add({ request: 'Listening to audio', reason: 'Nothing here listens to or analyses audio.', alternative: 'Describe what you hear in a line; that is what your AI works from.' });
  }
  return out.slice(0, 4);
}
