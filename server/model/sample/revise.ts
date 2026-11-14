/**
 * Natural-language revision planner for sample mode. Maps a request onto the bounded set of
 * revision operations (always additive or reversible) and declines everything else with a concrete
 * supported alternative. Every proposal is dry-run through applyRevision before it is returned.
 */
import { FieldSchema, RuleSchema, type AppSpec, type FieldSpec, type ViewSpec } from '../../../shared/appSpec.ts';
import type { FieldInput, RuleInput } from './builders.ts';
import { slugifyFieldId } from '../../../shared/ids.ts';
import { RevisionProposalSchema, applyRevision, type RevisionOp, type RevisionProposal } from '../../../shared/revision.ts';
import type { ReviseInput } from '../types.ts';
import { conceptForSpec } from './catalog.ts';
import { cleanLabel, dueDatePlan, genericField, planInstructions, promptRotationPlan, typeWord, type Unsupported } from './heuristics.ts';
import { clip, contentTokens, jaccard, normalize, quote } from './text.ts';

export const NO_MATCH_SUMMARY = "I couldn't map that to a supported change";
export const SUPPORTED_HINT = 'Supported changes: add a field, hide or show a field, rename a field or the app, add a stage or option, change the due-soon window, or add a weekly challenge or daily prompt.';

const RX = {
  clearData: /\b(?:delete|clear|remove|wipe|erase|reset)\s+(?:all\s+)?(?:the\s+|my\s+)?(?:entries|data|records|everything|history|all)\b|\bstart (?:over|fresh|from scratch)\b/i,
  typeChange: /\b(?:change|convert|turn|switch)\s+(?:the\s+)?(.+?)\s+(?:field\s+)?(?:to|into)\s+(?:a |an )?(number|numeric|date|text|short text|long text|checkbox|yes\/no|rating|choice|select|dropdown|link|url|tags?)(?:\s+field)?\b|\bmake\s+(?:the\s+)?(.+?)\s+(?:field\s+)?(?:a |an )(number|numeric|date|text|short text|long text|checkbox|rating|choice|select|link|url|tags?)(?:\s+field)\b/i,
  hide: /^(?:please\s+)?(?:remove|delete|hide|drop|get rid of|take (?:away|out|off))\s+(?:the\s+)?(.+?)(?:\s+(?:field|column|box|input|question))?$/i,
  show: /^(?:please\s+)?(?:show|unhide|bring back|restore|re-?add|add back|put back)\s+(?:the\s+)?(.+?)(?:\s+(?:field|column|box|input|question))?(?:\s+again)?$/i,
  renameTo: /^(?:please\s+)?(?:rename|change the name of|retitle|relabel|change the label of)\s+(?:the\s+)?(.+?)\s+(?:to|as|into)\s+["“']?(.+?)["”']?$/i,
  addOption: /\b(?:add|create|include|new)\s+(?:a |an |another )?(?:new )?(?:option|stage|column|status|choice|category|bucket)\s*(?:called|named|for|:)?\s*["“']?([^"”'.,;]{1,40}?)["”']?(?:\s+(?:to|in|on|under)\s+(?:the\s+)?(.+?))?$/i,
  window: /\b(?:due|window|highlight|heads?[- ]?up|warn(?:ing)?|alert|notice)\b[^.;]*?\b(\d{1,2})\s*(?:-|\s)?days?\b|\b(\d{1,2})[- ]day\s+(?:window|warning|heads?[- ]?up|notice)|\bwithin\s+(\d{1,2})\s+days?\b/i,
  required: /\bmake\s+(?:the\s+)?(.+?)\s+(?:field\s+)?(required|optional|mandatory)\b/i,
  entryNoun: /\bcall\s+(?:each\s+|the\s+|every\s+)?(?:entry|entries|item|items|card|cards|record|records)\s+(?:an?\s+)?["“']?([a-z][a-z \-]{1,30}?)["”']?$/i,
  typeWord: /^(?:date|rating|number|checkbox|tags?|link|url|text|notes?|long text|select|choice|dropdown)$/i,
};

type MatchOpts = { hidden?: boolean };

/** Fuzzy field lookup by label, id or type word; returns the best candidate above a threshold. */
function findField(spec: AppSpec, phrase: string, opts: MatchOpts = {}): FieldSpec | undefined {
  const p = cleanPhrase(phrase);
  if (!p) return undefined;
  const pool = spec.fields.filter((f) => (opts.hidden === undefined ? true : Boolean(f.hidden) === opts.hidden));
  const n = normalize(p);
  const slug = slugifyFieldId(p);
  let best: { f: FieldSpec; score: number } | undefined;
  const phraseTokens = contentTokens(p);
  for (const f of pool) {
    const ln = normalize(f.label);
    const labelTokens = contentTokens(f.label);
    let score = 0;
    if (ln === n || f.id === slug || f.id === n.replace(/ /g, '_')) score = 1;
    else if (ln.includes(n) || n.includes(ln)) score = 0.8;
    else if (phraseTokens.length > 0 && phraseTokens.every((t) => labelTokens.includes(t))) score = 0.7;
    else score = jaccard(labelTokens, phraseTokens) * 0.9;
    if (score > (best?.score ?? 0)) best = { f, score };
  }
  if (best && best.score >= 0.45) return best.f;
  if (RX.typeWord.test(p)) {
    const t = p.toLowerCase();
    const type = t.startsWith('note') ? 'long_text' : t === 'long text' ? 'long_text' : t === 'tag' || t === 'tags' ? 'tags' : t === 'link' || t === 'url' ? 'url' : t === 'choice' || t === 'dropdown' ? 'select' : t;
    return pool.find((f) => f.type === type);
  }
  return undefined;
}

function cleanPhrase(s: string): string {
  return s
    .replace(/^["“']+|["”']+$/g, '')
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/\s+(?:field|column|box|input|question|checkbox|toggle|rating|date|number|text|select|dropdown|choice|tags?|link|option)$/i, '')
    .trim();
}

/** Fields a view or rule is organised by; hiding them would break the app's main screen. */
function structuralFieldIds(spec: AppSpec): Set<string> {
  const ids = new Set<string>();
  for (const v of spec.views) {
    if (v.type === 'journal') { ids.add(v.dateFieldId); if (v.titleFieldId) ids.add(v.titleFieldId); }
    if (v.type === 'board') { ids.add(v.stageFieldId); ids.add(v.titleFieldId); }
    if (v.type === 'list') ids.add(v.titleFieldId);
    if (v.type === 'summary') for (const m of v.metrics) if (m.fieldId && m.kind !== 'count') ids.add(m.fieldId);
  }
  for (const r of spec.rules) if (r.type === 'due_soon') { ids.add(r.dateFieldId); if (r.stageFieldId) ids.add(r.stageFieldId); if (r.doneFieldId) ids.add(r.doneFieldId); }
  return ids;
}

function viewKind(spec: AppSpec): string {
  return spec.pattern === 'board' ? 'board' : spec.pattern === 'journal' ? 'journal' : 'list';
}

function splitClauses(text: string): string[] {
  return text
    .split(/(?<=[.;!?\n])\s+|[.;!?\n]+\s*|,?\s+(?:and then|and also|and|then|also|plus)\s+(?=\S)/i)
    .map((c) => c.trim().replace(/[.;,]+$/, ''))
    .filter((c) => c.length > 0);
}

function pluralize(word: string): string {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

export function proposeRevision(input: ReviseInput): RevisionProposal {
  const spec = input.spec;
  const request = (input.request ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  const ops: RevisionOp[] = [];
  const unsupported: Unsupported[] = [];
  if (!request) return RevisionProposalSchema.parse({ summary: NO_MATCH_SUMMARY, ops: [], unsupported: [{ request: '', reason: 'The request was empty.', alternative: SUPPORTED_HINT }] });

  const structural = structuralFieldIds(spec);
  const lastVisible = [...spec.fields].reverse().find((f) => !f.hidden)?.id;
  const taken = new Set(spec.fields.map((f) => f.id));
  const takeId = (label: string) => { const id = slugifyFieldId(label, taken); taken.add(id); return id; };
  const addField = (field: FieldInput) => ops.push({ op: 'add_field', field: FieldSchema.parse(field), ...(lastVisible ? { afterFieldId: lastVisible } : {}) });
  const rule = (r: RuleInput) => RuleSchema.parse(r);

  const remaining: string[] = [];
  for (const clause of splitClauses(request)) {
    // Never delete data through a revision.
    if (RX.clearData.test(clause)) {
      unsupported.push({ request: clip(clause, 400), reason: 'Data is never deleted by a change to the app.', alternative: 'Delete entries one at a time from inside the app if you no longer want them.' });
      continue;
    }
    // Field type changes are declined; offer a new field plus hiding the old one.
    const tc = RX.typeChange.exec(clause);
    if (tc) {
      const phrase = tc[1] ?? tc[3] ?? '';
      const newType = (tc[2] ?? tc[4] ?? 'text').toLowerCase();
      const field = findField(spec, phrase, { hidden: false });
      const name = field ? field.label : cleanLabel(phrase) || 'Field';
      unsupported.push({
        request: clip(clause, 400),
        reason: `Changing the type of ${quote(name)} would risk the ${spec.entryNoun.plural} you already saved.`,
        alternative: field && !structural.has(field.id)
          ? `Add a new ${newType} field and hide the old one; both steps are included below.`
          : `Add a new ${newType} field next to it; the current one stays because the ${viewKind(spec)} is organised by it.`,
      });
      const label = `${name} (${newType})`;
      addField(genericField(takeId(label), clip(label, 60), newType));
      if (field && !structural.has(field.id)) ops.push({ op: 'hide_field', fieldId: field.id });
      continue;
    }
    // Hide a field (values are kept).
    const hide = RX.hide.exec(clause);
    if (hide?.[1] && !/\b(?:option|stage|column|rule|view|challenge|prompt)\b/i.test(hide[1])) {
      const field = findField(spec, hide[1], { hidden: false });
      if (!field) {
        unsupported.push({ request: clip(clause, 400), reason: `I couldn't find a field called ${quote(cleanPhrase(hide[1]))}.`, alternative: `Fields you can hide: ${spec.fields.filter((f) => !f.hidden && !structural.has(f.id)).map((f) => f.label).join(', ') || 'none right now'}.` });
      } else if (structural.has(field.id)) {
        unsupported.push({ request: clip(clause, 400), reason: `${quote(field.label)} is what the ${viewKind(spec)} is organised by, so it cannot be hidden.`, alternative: 'Rename it instead, or ask for a new field to sit alongside it.' });
      } else {
        ops.push({ op: 'hide_field', fieldId: field.id });
      }
      continue;
    }
    // Show a hidden field again.
    const show = RX.show.exec(clause);
    if (show?.[1]) {
      const field = findField(spec, show[1], { hidden: true });
      if (field) { ops.push({ op: 'unhide_field', fieldId: field.id }); continue; }
      if (findField(spec, show[1], { hidden: false })) continue; // already visible: nothing to do
      remaining.push(clause); // maybe "show me a weekly prompt" style; let the planner try
      continue;
    }
    // Rename the app or a field.
    const rename = RX.renameTo.exec(clause);
    if (rename?.[1] && rename[2]) {
      const target = cleanPhrase(rename[1]);
      const newName = clip(rename[2].trim().replace(/["“”']/g, ''), 60);
      if (newName.length < 1) continue;
      const aboutApp = /^(?:app|this app|the app|it|this|name|title|everything)$/i.test(target) || normalize(target) === normalize(spec.name);
      const field = aboutApp ? undefined : findField(spec, target, { hidden: false });
      if (field) ops.push({ op: 'update_field', fieldId: field.id, patch: { label: newName } });
      else if (aboutApp || !field) {
        if (!ops.some((o) => o.op === 'rename_app')) ops.push({ op: 'rename_app', name: newName });
      }
      continue;
    }
    // Add a stage/option to a choice field.
    const opt = RX.addOption.exec(clause);
    if (opt?.[1]) {
      const label = clip(opt[1].trim(), 40);
      const board = spec.views.find((v): v is Extract<ViewSpec, { type: 'board' }> => v.type === 'board');
      const target = (opt[2] ? findField(spec, opt[2], { hidden: false }) : undefined)
        ?? (board ? spec.fields.find((f) => f.id === board.stageFieldId) : undefined)
        ?? spec.fields.find((f) => f.type === 'select' && !f.hidden);
      if (!target || target.type !== 'select') {
        unsupported.push({ request: clip(clause, 400), reason: 'There is no choice field to add that option to.', alternative: 'Ask for a choice field first, for example "add a priority field".' });
        continue;
      }
      const value = slugifyFieldId(label, target.options.map((o) => o.value));
      if (!target.options.some((o) => normalize(o.label) === normalize(label))) ops.push({ op: 'add_select_option', fieldId: target.id, option: { value, label } });
      continue;
    }
    // Due-soon window.
    const win = RX.window.exec(clause);
    if (win) {
      const n = Math.max(0, Math.min(90, Number(win[1] ?? win[2] ?? win[3])));
      const existingRule = spec.rules.find((r) => r.type === 'due_soon');
      if (existingRule && existingRule.type === 'due_soon') ops.push({ op: 'replace_rule', ruleId: existingRule.id, rule: { ...existingRule, withinDays: n } });
      else {
        const plan = dueDatePlan(spec);
        if (plan.field) addField(plan.field);
        if (plan.rule) ops.push({ op: 'add_rule', rule: rule({ ...plan.rule, ...(plan.rule.type === 'due_soon' ? { withinDays: n } : {}) }) });
        if (plan.boardView) {
          const v = spec.views.find((x) => x.id === plan.boardView?.viewId);
          if (v && v.type === 'board') ops.push({ op: 'replace_view', viewId: v.id, view: { ...v, dueFieldId: plan.dateFieldId } });
        }
      }
      continue;
    }
    // Required / optional.
    const req = RX.required.exec(clause);
    if (req?.[1] && req[2]) {
      const field = findField(spec, req[1], { hidden: false });
      if (field) { ops.push({ op: 'update_field', fieldId: field.id, patch: { required: req[2].toLowerCase() !== 'optional' } }); continue; }
    }
    // What entries are called.
    const noun = RX.entryNoun.exec(clause);
    if (noun?.[1]) {
      const singular = noun[1].trim().toLowerCase();
      ops.push({ op: 'set_entry_noun', singular, plural: pluralize(singular) });
      continue;
    }
    remaining.push(clause);
  }

  // Everything else goes through the shared instruction planner (fields, prompts, due dates, declines).
  const concept = conceptForSpec(spec);
  for (const intent of planInstructions(spec, remaining.join('. '), concept?.id)) {
    switch (intent.kind) {
      case 'add_field':
        if (!ops.some((o) => o.op === 'add_field' && o.field.id === intent.field.id)) addField(intent.field);
        break;
      case 'unhide_field':
        ops.push({ op: 'unhide_field', fieldId: intent.fieldId });
        break;
      case 'prompt_rotation': {
        const plan = promptRotationPlan(spec, intent.cadence, concept?.id);
        if (plan.replaceRuleId) ops.push({ op: 'replace_rule', ruleId: plan.replaceRuleId, rule: rule(plan.rule) });
        else ops.push({ op: 'add_rule', rule: rule(plan.rule) });
        break;
      }
      case 'due_date': {
        const plan = dueDatePlan(spec);
        if (plan.field && !ops.some((o) => o.op === 'add_field' && o.field.id === plan.field?.id)) addField(plan.field);
        if (plan.rule) ops.push({ op: 'add_rule', rule: rule(plan.rule) });
        if (plan.boardView) {
          const v = spec.views.find((x) => x.id === plan.boardView?.viewId);
          if (v && v.type === 'board') ops.push({ op: 'replace_view', viewId: v.id, view: { ...v, dueFieldId: plan.dateFieldId } });
        }
        break;
      }
      case 'rename':
        if (!ops.some((o) => o.op === 'rename_app')) ops.push({ op: 'rename_app', name: intent.name });
        break;
      case 'unsupported':
        unsupported.push(intent.item);
        break;
    }
  }

  // Dry run: keep only the operations that apply cleanly, in order.
  const kept: RevisionOp[] = [];
  const seen = new Set<string>();
  for (const op of ops) {
    const key = JSON.stringify(op);
    if (seen.has(key)) continue;
    const trial = applyRevision(spec, [...kept, op]);
    if (trial.ok) { kept.push(op); seen.add(key); }
  }
  const dry = applyRevision(spec, kept);
  const changes = dry.ok ? dry.changes : [];

  let summary: string;
  if (kept.length === 0 && unsupported.length === 0) {
    summary = NO_MATCH_SUMMARY;
    unsupported.push({ request: clip(request, 400), reason: 'That is not a change I know how to make yet.', alternative: SUPPORTED_HINT });
  } else if (kept.length === 0) {
    summary = clip(`Nothing to change yet. ${unsupported[0]?.reason ?? ''}`.trim(), 300);
  } else {
    const firsts = changes.map((c) => c.split(/(?<=\.)\s+/)[0] ?? c);
    const joined = firsts.join(' ');
    summary = clip(joined.length <= 300 ? joined : `${firsts.length} changes: ${firsts.map((f) => f.replace(/\.$/, '')).join('; ')}.`, 300);
    if (unsupported.length) summary = clip(`${summary.replace(/\.?$/, '.')} ${unsupported.length === 1 ? 'One request' : `${unsupported.length} requests`} not included; see below.`, 300);
  }

  return RevisionProposalSchema.parse({ summary, ops: kept, unsupported: unsupported.slice(0, 10).map((u) => ({ request: clip(u.request, 400), reason: clip(u.reason, 400), alternative: clip(u.alternative, 400) })) });
}

export { typeWord };
