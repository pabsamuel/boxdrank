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
 * The 44-became-39 case is a pure count-and-title comparison, and works no
 * matter what the recipe body looks like.
 *
 * ✓ 21 Sep 2026: the recipe body **is** structured JSON —
 * `workflow_blocks`, `workflow_variables`, `workflow_host_data` — so the
 * deeper comparison is real rather than the fallback ADR-002 planned for. It
 * is still guarded, because preview-schema JSON can turn into something else
 * without notice and a diff must never throw on the shape of its input.
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

/** True when a recipe body is something we can compare field-wise. */
export function isStructuredConfiguration(config: unknown): boolean {
  return config !== null && typeof config === 'object';
}

/**
 * The parts of a recipe worth comparing, most load-bearing first.
 *
 * ✓ Corrected 21 Sep 2026 after reading a real recipe. I had these the wrong
 * way round. `workflow_blocks` does **not** contain board or column IDs — it
 * references them indirectly:
 *
 *     "inboundFieldsSourceConfig": {
 *       "boardId":         { "workflowVariableKey": 1 },
 *       "peopleColumnId":  { "workflowVariableKey": 15 }
 *     }
 *
 * The variable *keys* are stable, so `workflow_blocks` is identical between a
 * template and its copy even when the copy points at the wrong board. The
 * actual IDs live in `workflow_variables`. Comparing blocks alone would have
 * found nothing in exactly the case this product exists for.
 */
const RECIPE_PARTS = [
  ['the boards and columns it points at', (a: AutomationSnapshot) => a.workflowVariables],
  ['its steps', (a: AutomationSnapshot) => a.workflowBlocks],
  ['its connection settings', (a: AutomationSnapshot) => a.workflowHostData],
] as const;

/**
 * Searches a recipe for a board ID, wherever monday chose to put it.
 *
 * Deliberately shape-agnostic: it walks the JSON and compares every string and
 * number against the ID. That is not laziness — `workflow_variables`' internal
 * structure is preview-schema data this codebase has not verified, and a
 * scanner that knows too much about a shape it has not seen is a scanner that
 * silently stops matching when the shape changes. Comparing values it already
 * knows requires no such assumption.
 *
 * The cost is a possible false positive: some unrelated number that happens to
 * equal a board ID. Board IDs are ten digits, so that is unlikely, and the
 * finding it produces is graded `likely` rather than `certain`.
 */
export function recipeReferencesBoard(recipe: unknown, boardId: string): boolean {
  const target = String(boardId);
  const seen = new Set<unknown>();

  const walk = (value: unknown): boolean => {
    if (value == null) return false;
    if (typeof value === 'string' || typeof value === 'number') return String(value) === target;
    if (typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);

    if (Array.isArray(value)) return value.some(walk);
    return Object.values(value as Record<string, unknown>).some(walk);
  };

  return walk(recipe);
}

/** Everything a recipe carries, for scanning as one document. */
function recipeOf(a: AutomationSnapshot): unknown[] {
  return [a.workflowVariables, a.workflowBlocks, a.workflowHostData];
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

    // The headline severity, extended to automations.
    //
    // A recipe on the copy that still names the *template's* board is the same
    // failure as a mis-wired connect column, and it is just as invisible: the
    // automation runs, reports success, and does its work on the wrong
    // client's board. Checked before the field-by-field comparison because it
    // outranks anything that comparison can find.
    const pointsAtTemplate = recipeOf(match).some((part) =>
      recipeReferencesBoard(part, template.boardId),
    );
    const templatePointsAtItself = recipeOf(t).some((part) =>
      recipeReferencesBoard(part, template.boardId),
    );

    if (pointsAtTemplate && templatePointsAtItself && template.boardId !== copy.boardId) {
      findings.push({
        id: `automation.miswired.${match.id}`,
        severity: 'miswired',
        kind: 'automation.miswired',
        subject: { type: 'automation', id: match.id, title: match.title },
        what: `The automation “${match.title}” still refers to the template board (${template.boardId}), not to this one.`,
        whyItMatters:
          'On the template this recipe pointed at its own board. On this copy it still points at the template. It will run without erroring, report success, and do its work on the wrong board — which is the single hardest failure here to notice, because nothing looks broken.',
        howToFix:
          'Open this recipe in the board’s automation centre and re-select the board it should act on. Check every step: a recipe can name a board in more than one place.',
        confidence: 'likely',
        evidence: { copyAutomationId: match.id, templateBoardId: template.boardId },
      });
    }

    const changedParts = RECIPE_PARTS.filter(([, read]) => {
      const before = read(t);
      const after = read(match);
      if (!isStructuredConfiguration(before) || !isStructuredConfiguration(after)) return false;
      return JSON.stringify(before) !== JSON.stringify(after);
    }).map(([label]) => label);

    {
      if (changedParts.length > 0) {
        findings.push({
          id: `automation.altered.${match.id}`,
          severity: 'altered',
          kind: 'automation.altered',
          subject: { type: 'automation', id: match.id, title: match.title },
          what: `The automation “${match.title}” differs from the template in ${changedParts.join(' and ')}.`,
          whyItMatters:
            'Recipes that reference a specific board, column or person are copied literally. A difference here often means the recipe is still aimed at whatever the template pointed to.',
          howToFix:
            'Open the recipe on both boards and compare them step by step, paying particular attention to any board or person referenced inside it.',
          confidence: 'likely',
          evidence: { templateAutomationId: t.id, copyAutomationId: match.id, changedParts },
        });
      }
    }
  }

  return { findings, ran: true };
}
