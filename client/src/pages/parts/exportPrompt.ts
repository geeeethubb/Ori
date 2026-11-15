/**
 * The "Copyable context-export prompt" from AI_App_Store_README.md, with the product named Ori (the
 * README predates the name). People paste it into the AI they already use and bring the answer back.
 */
export const EXPORT_PROMPT = `Help me create a portable context profile for Ori, an AI companion
that makes small personal apps for me. It will suggest tools for both
my recurring workflows and my hobbies, curiosity, and goals.

Use only information actually available in this conversation and memory
you are permitted to use. Do not claim to read other conversations,
accounts, apps, or my full history. If you know little about me, say so.
Keep information about other people separate from information about me.

Write a concise Markdown profile with these sections:
1. Goals I am actively pursuing.
2. Current projects, recurring responsibilities, and repeated friction.
3. Hobbies, interests, and things I want to explore or learn.
4. Routines, time constraints, and how I like to organize information.
5. Tools or systems I already use and what I like or dislike about them.
6. Recent changes that might make older information stale.
7. Uncertainties, contradictions, and questions I should resolve.

For each useful fact, label it Confirmed or Inferred, identify the
conversation/topic it came from, and include a date only if known.
Do not invent quotes, dates, preferences, problems, or sources.
Leave out passwords, API keys, account numbers, precise home addresses,
private information about others, and confidential employer/client data.
Use broad descriptions where those are sufficient.

Do not propose apps yet. Describe my needs and interests so Ori can
make its own suggestions. Keep the profile under 800 words.
End with a short list of items I should review before sharing it.`;
