/**
 * SAMPLE CONTEXT — fictional profiles in the exact shape the README's export prompt produces.
 * Used by the "Try it with sample context" buttons, the seed script and tests. Everything
 * imported from these is labelled as sample in the product.
 */

export const SAMPLE_PROFILES: Record<'founder-photographer' | 'student-musician', { label: string; text: string }> = {
  'founder-photographer': {
    label: 'Sample: founder who loves photography',
    text: `SAMPLE CONTEXT — fictional, for demos and tests.

# Portable context profile

## 1. Goals I am actively pursuing
- Raise a small pre-seed round for my startup by next spring. (Confirmed — fundraising planning chat)
- Build a habit of following up with investors and mentors within three days of meeting them. (Confirmed — networking debrief, October)
- Get noticeably better at using natural light in street photography this year. (Confirmed — photography feedback thread)
- Grow a small, loyal early-user group before expanding distribution. (Inferred — product strategy chats)

## 2. Current projects, recurring responsibilities, and repeated friction
- Running an early-stage startup at UIUC with one co-founder; I own product and fundraising. (Confirmed — several conversations)
- After networking events I meet investors, mentors and other founders and then forget to follow up; names and promises get lost in my notes. (Confirmed — networking debrief)
- I promised several people a deck or an intro and lost track of who is still waiting. (Confirmed — October to-do review)
- Weekly founder coffee chats every Thursday morning with people from the founders community. (Confirmed — calendar planning chat)
- Writing a monthly newsletter update to about 80 subscribers, which often slips to the next month. (Confirmed — newsletter drafting)

## 3. Hobbies, interests, and things I want to explore or learn
- Street photography on weekend walks, usually Saturday or Sunday mornings. (Confirmed — photography feedback thread)
- I want to learn to see and use light better: shadows, reflections, golden hour. (Confirmed — photography feedback thread)
- Curious about printing a small zine of my photos someday. (Inferred — mentioned once)
- Recently moved to Chicago and want to explore new neighbourhoods on foot. (Confirmed — moving checklist chat)
- Interested in trying film photography but have not started. (Inferred — camera comparison chat)

## 4. Routines, time constraints, and how I like to organize information
- Mornings are for deep work; meetings and calls after 1 pm. (Confirmed — scheduling chat)
- I prefer a simple board or list over a heavy CRM; I abandon tools that need lots of setup. (Confirmed — tool comparison chat)
- Weekend mornings are free for walks and photography. (Confirmed)

## 5. Tools or systems I already use and what I like or dislike about them
- Notion for notes (like the flexibility, dislike how my follow-up notes get buried). (Confirmed)
- Google Calendar for scheduling; I rely on it heavily. (Confirmed)
- Tried a sales CRM for investor tracking and stopped after a week because it felt like work. (Confirmed — tool comparison chat)

## 6. Recent changes that might make older information stale
- Moved from Champaign to Chicago in September; my old walking routes no longer apply. (Confirmed — moving checklist chat)
- Co-founder went part-time in October, so I now own more of the product work. (Confirmed)

## 7. Uncertainties, contradictions, and questions I should resolve
- Not sure whether to keep writing the monthly newsletter or replace it with shorter updates. (Confirmed — newsletter drafting)
- Unclear whether the next fundraising push should start in January or March. (Inferred)

Items to review before sharing: investor names were removed; the newsletter subscriber count is approximate.`,
  },
  'student-musician': {
    label: 'Sample: student learning guitar',
    text: `SAMPLE CONTEXT — fictional, for demos and tests.

# Portable context profile

## 1. Goals I am actively pursuing
- Learn five complete songs on guitar by December. (Confirmed — practice planning chat)
- Finish this semester with every assignment submitted on time. (Confirmed — study planning chat)
- Run a 5k without stopping by the end of the semester. (Confirmed — running plan chat)

## 2. Current projects, recurring responsibilities, and repeated friction
- Third-year computer science student taking three courses with weekly problem sets and two larger projects. (Confirmed — study planning chat)
- I lose track of assignment deadlines across course websites and end up cramming the night before. (Confirmed — study planning chat)
- Teaching assistant for an intro programming course: grading every Wednesday. (Confirmed)
- A side project: a small web app for splitting apartment expenses with roommates. (Inferred — debugging sessions)

## 3. Hobbies, interests, and things I want to explore or learn
- Learning acoustic guitar since August; practising about 30 minutes most evenings. (Confirmed — practice planning chat)
- Want to understand basic music theory, especially chord progressions. (Confirmed)
- Running twice a week, slowly building distance. (Confirmed — running plan chat)
- Curious about songwriting once I know more chords. (Inferred)

## 4. Routines, time constraints, and how I like to organize information
- Classes in the morning; free most evenings after 7 pm. (Confirmed)
- I like checklists and streaks; seeing a chain of completed days keeps me going. (Confirmed — habit chat)
- I organize school work by course, not by date, which is why deadlines sneak up on me. (Inferred)

## 5. Tools or systems I already use and what I like or dislike about them
- Google Calendar for classes; I rarely add assignment deadlines to it. (Confirmed)
- A paper notebook for guitar chords, which I keep forgetting at home. (Confirmed)
- Tried a habit app and stopped because it nagged me with notifications. (Confirmed — habit chat)

## 6. Recent changes that might make older information stale
- Dropped the campus orchestra this semester to make time for guitar and running. (Confirmed)

## 7. Uncertainties, contradictions, and questions I should resolve
- In one chat I said I practise guitar daily; in another I said I barely practised this month. (Confirmed — contradiction to resolve)
- Not sure whether to prioritize the side project or the 5k training before finals. (Inferred)

Items to review before sharing: course names were removed; roommates are not named.`,
  },
};
