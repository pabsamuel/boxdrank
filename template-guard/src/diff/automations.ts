import type { AutomationSnapshot, BoardSnapshot } from '../snapshot/types.js';
import { normalizeTitle, titleSimilarity, TITLE_SIMILARITY_THRESHOLD } from './match.js';
import type { Finding } from './types.js';

/**
 * Automation diffing.
 *
 * Preview-schema data (ADR-002), so everything here is conditional: it runs
 * only when BOTH snapshots actually carry an automation list. A `null` list
 * means "we did not or could not look", and produces no findings at all —
 * silence here must never read as a clean bill of health, which is why
 * `diffAutomations` also reports whether it ran.
 *
 * The 44-became-39 case is a pure count-and-title comparison, so it works even
 * if `configuration` turns out to be an opaque string. Deeper comparison
 * (which trigger, which target board) is attempted only when `configuration`
 * is structured, and degrades cleanly when it is not.
 */

export interface AutomationDiff {
  findings: Finding[];
  /** False when either side had no automation list to compare. */
  ran: boolean;
  /** Present when `ran` is false. Shown to the user verbatim. */
  skippedReason?: string;
}

function automationKey(a: AutomationSnapshot): string {
  return normalizeTitle(a.title);
}

/** True when `configuration` looks like something we can compare field-wise. */
export function isStructuredConfiguration(config: unknown): boolean {
  return config !== null && typeof config === 'object';
}

export function diffAutomations(
  template: BoardSnapshot,
  copy: BoardSnapshot,
): AutomationDiff {
  if (template.automations === null || copy.automations === null) {
    return {
      findings: [],
      ran: false,
      skippedReason:
        template.automations === null && copy.automations === null
          ? 'Automations were not compared. monday does not expose automations on its stable API, so Template Guard did not read them for either board.'
          : template.automations === null
            ? 'Automations were not compared: the template board’s automations could not be read.'
            : 'Automations were not compared: the duplicated board’s automations could not be read.',
    };
  }

  const findings: Finding[] = [];
  const copyByKey = new Map<string, AutomationSnapshot[]>();
  for (const a of copy.automations) {
    copyByKey.set(automationKey(a), [...(copyByKey.get(automationKey(a)) ?? []), a]);
  }

  const claimed = new Set<string>();

  for (const t of template.automations) {
    const key = automationKey(t);
    const candidates = (copyByKey.get(key) ?? []).filter((c) => !claimed.has(c.id));
    let match = candidates[0];

    if (!match) {
      // Fall back to a fuzzy title match before declaring it missing, so a
      // recipe whose rendered title shifted slightly is not a false alarm.
      const fuzzy = copy.automations
        .filter((c) => !claimed.has(c.id))
        .map((c) => ({ c, score: titleSimilarity(t.title, c.title) }))
        .filter((x) => x.score >= TITLE_SIMILARITY_THRESHOLD)
        .sort((a, b) => b.score - a.score)[0];
      match = fuzzy?.c;
    }

    if (!match) {
      findings.push({
        id: `automation.missing.${t.id}`,
        severity: 'missing',
        kind: 'automation.missing',
        subject: { type: 'automation', id: t.id, title: t.title },
        what: `The automation “${t.title}” exists on the template but not on this board.`,
        whyItMatters:
          'monday silently drops some automations when a board is duplicated — cross-board recipes, custom recipes, recipes with item mapping, and anything built on an integration block such as email. Nothing in monday warns you. Until this is recreated, the work this automation was doing simply is not happening.',
        howToFix:
          'Open the template board’s automation centre, find this recipe, and rebuild it on this board. Integration-based recipes must be reconnected to their external account by hand.',
        confidence: 'certain',
        evidence: { templateAutomationId: t.id, isActive: t.isActive },
      });
      continue;
    }

    claimed.add(match.id);

    if (t.isActive && !match.isActive) {
      findings.push({
        id: `automation.inactive.${match.id}`,
        severity: 'missing',
        kind: 'automation.inactive',
        subject: { type: 'automation', id: match.id, title: match.title },
        what: `The automation “${match.title}” was copied across but is switched off.`,
        whyItMatters:
          'An automation that exists but is inactive is indistinguishable from a working one at a glance, and does nothing at all.',
        howToFix: 'Open this board’s automation centre and toggle the recipe back on.',
        confidence: 'certain',
        evidence: { copyAutomationId: match.id },
      });
    }

    if (isStructuredConfiguration(t.configuration) && isStructuredConfiguration(match.configuration)) {
      const before = JSON.stringify(t.configuration);
      const after = JSON.stringify(match.configuration);
      if (before !== after) {
        findings.push({
          id: `automation.altered.${match.id}`,
          severity: 'altered',
          kind: 'automation.altered',
          subject: { type: 'automation', id: match.id, title: match.title },
          what: `The automation “${match.title}” is configured differently from the template.`,
          whyItMatters:
            'Recipes that reference a specific board, column or person are copied literally. A difference here often means the recipe is still aimed at whatever the template pointed to.',
          howToFix:
            'Open the recipe on both boards and compare them step by step, paying particular attention to any board or person referenced inside it.',
          confidence: 'likely',
          evidence: { templateAutomationId: t.id, copyAutomationId: match.id },
        });
      }
    }
  }

  return { findings, ran: true };
}
