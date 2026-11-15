/**
 * Things people ask for that this product does not do: syncing or importing from other services,
 * calendars, sending messages, reminders and notifications, listening to audio. Each is named plainly
 * (services by name) with what works instead, so a reply never implies an integration exists.
 * Only requests count: "auto-sync my Spotify", "import from Instagram", "connect my Spotify". Ordinary
 * mentions ("connect with her on Instagram", "pull up the YouTube lesson", "in sync with the loop") do not.
 */
import type { UnsupportedItem } from '../../../shared/context.ts';

const SERVICE_RX = /\b(spotify|instagram|tiktok|youtube|soundcloud|apple music|pinterest|strava|notion|google (?:sheets|docs|drive|photos)|icloud|dropbox)\b/gi;
/** An integration verb; group 1 is what follows it (where the service must appear). */
const INTEGRATION_RX = /\b(?:auto[- ]?sync(?:ing|ed)?|(?<!\bin\s)sync(?:ing|ed)?|auto[- ]?import(?:ing|ed)?|import(?:ing)?|pull(?:ing)?\s+(?:in|from)|connect(?:ing)?\s+(?:to|my)|link(?:ing)?\s+my|automatically\s+(?:add|save|pull|import|bring))\b([^.!?;]{0,60})/gi;

const PRETTY: Record<string, string> = {
  spotify: 'Spotify', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', soundcloud: 'SoundCloud', 'apple music': 'Apple Music',
  pinterest: 'Pinterest', strava: 'Strava', notion: 'Notion', icloud: 'iCloud', dropbox: 'Dropbox',
};

function pretty(name: string): string {
  const k = name.toLowerCase();
  return PRETTY[k] ?? k.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** A sync item (the only kind an app's saved-links list can stand in for). */
export const isSyncItem = (u: UnsupportedItem): boolean => / sync$/.test(u.request);

export function findUnsupported(text: string): UnsupportedItem[] {
  const t = text.trim();
  if (!t) return [];
  const out: UnsupportedItem[] = [];
  const add = (item: UnsupportedItem) => {
    if (!out.some((o) => o.request === item.request)) out.push(item);
  };
  INTEGRATION_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INTEGRATION_RX.exec(t))) {
    const span = m[1] ?? '';
    for (const s of span.matchAll(SERVICE_RX)) {
      const name = pretty(s[1] ?? '');
      if (name) add({ request: `${name} sync`, reason: `There is no connection to ${name} here, so nothing is synced or read from it.`, alternative: 'Save the links you care about by hand; each stays a saved link.' });
    }
  }
  if (/\b(?:add|put|sync|schedule|block)\b[^.!?]{0,40}\b(?:to|in|on|into)\s+(?:my\s+)?(?:google\s+|apple\s+|outlook\s+)?calendar\b/i.test(t)) {
    add({ request: 'Calendar sync', reason: 'No calendar is connected, so nothing is added to one.', alternative: 'Give the entry a date; the app highlights it when it is due.' });
  }
  if (/\b(?:remind me|reminders?|notify me|notifications?|alert me|alarms?|ping me)\b/i.test(t)) {
    add({ request: 'Reminders and notifications', reason: 'Nothing here sends reminders or notifications.', alternative: 'Give it a date; the app highlights what is due when you open it.' });
  }
  if (/\b(?:send|text|email|e-mail|message|dm|whatsapp|slack)\b[^.!?]{0,40}\b(?:for me|automatically)\b|\bauto(?:matically)?[- ]?(?:send|post|reply)\b/i.test(t)) {
    add({ request: 'Sending messages for you', reason: 'Nothing is ever sent for you.', alternative: 'Keep a draft you can copy and send yourself.' });
  }
  if (/\b(?:transcribe|analy[sz]e (?:the |my )?(?:audio|recording|sound|song)|listen to (?:the |my )?(?:recording|audio|track)|detect (?:the )?(?:chords|tempo|key|notes))\b/i.test(t)) {
    add({ request: 'Listening to audio', reason: 'Nothing here listens to or analyses audio.', alternative: 'Describe what you hear in a line; that is what your AI works from.' });
  }
  return out.slice(0, 4);
}
