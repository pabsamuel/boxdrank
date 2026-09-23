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

/**
 * Serialises a recipe so that two equivalent recipes produce the same string.
 *
 * ✓ The real cause of the first live false positive, 21 Sep 2026. A template
 * and its fresh duplicate returned the *same* workflow variables in a
 * different array order — keys `1, 14, 16, 15` against `16, 14, 1, 15` — and
 * `JSON.stringify` is order-sensitive, so a perfectly healthy copy was
 * reported as `altered`.
 *
 * Neither the board id nor the column ids were to blame; two rounds of fixing
 * those left the finding in place. The lesson is general enough to write down:
 * **JSON from an API has no guaranteed array or key order unless the API
 * promises one**, and comparing it literally produces findings about
 * serialisation rather than about the customer's board.
 *
 * So: object keys sorted, and arrays ordered by identity where the elements
 * carry one (`workflowVariableKey`, `workflowNodeId`, `id`) and by their own
 * canonical form otherwise. Sorting arrays is safe here because these are
 * sets — a workflow's blocks reference each other explicitly through
 * `nextWorkflowBlocksConfig` rather than by position.
 */
export function canonicalJson(value: unknown): string {
  const canon = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;

    if (Array.isArray(v)) {
      const items = v.map(canon);
      return [...items].sort((a, b) => {
        const ka = identityOf(a);
        const kb = identityOf(b);
        if (ka !== null && kb !== null && ka !== kb) return ka < kb ? -1 : 1;
        const sa = JSON.stringify(a) ?? '';
        const sb = JSON.stringify(b) ?? '';
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      });
    }

    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canon(x)]),
    );
  };

  return JSON.stringify(canon(value)) ?? '';
}

const IDENTITY_KEYS = ['workflowVariableKey', 'workflowNodeId', 'id', 'key'];

function identityOf(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of IDENTITY_KEYS) {
    const found = record[key];
    if (typeof found === 'string' || typeof found === 'number') return String(found).padStart(20, '0');
  }
  return null;
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

/**
 * Rewrites a recipe as if it had been duplicated correctly.
 *
 * ✓ Learned from the first real duplication, 21 Sep 2026. monday **does**
 * rewrite the board id inside a duplicated recipe's variables, so the
 * variables of a healthy copy differ from the template's — and the first live
 * run reported that as `altered`, on a copy that was completely fine.
 *
 * That is the false-positive class this product can least afford: a user who
 * is told a healthy board has drifted stops reading the findings, and then
 * misses the one that matters. So before comparing, the template's board id is
 * replaced with the copy's. What remains different after that is real.
 *
 * Shape-agnostic for the same reason `recipeReferencesBoard` is: it substitutes
 * values it already knows rather than navigating a structure it has not
 * verified.
 */
export function normalizeRecipe(
  value: unknown,
  fromBoardId: string,
  toBoardId: string,
  /**
   * Template column id → copy column id, from the matcher.
   *
   * ✓ Also learned from the first real duplication: a duplicated board gets
   * **new column ids**, and a recipe names the columns it acts on. So a
   * healthy copy's recipe differs from the template's in the column ids too,
   * and substituting only the board id left the false positive in place.
   *
   * The matcher has already worked out which template column became which
   * copy column — that is the hard problem this codebase solved first. Reusing
   * its answer here costs nothing and is strictly better than any rule this
   * file could invent.
   */
  columnIdMap: ReadonlyMap<string, string> = new Map(),
): unknown {
  const substitutions = new Map<string, string>([[String(fromBoardId), String(toBoardId)]]);
  for (const [from, to] of columnIdMap) substitutions.set(String(from), String(to));

  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return substitutions.get(v) ?? v;
    if (typeof v === 'number') {
      const replacement = substitutions.get(String(v));
      return replacement === undefined ? v : Number(replacement);
    }
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
  };

  return walk(value);
}

export function diffAutomations(
  template: BoardSnapshot,
  copy: BoardSnapshot,
  /** Template column id → copy column id. See `normalizeRecipe`. */
  columnIdMap: ReadonlyMap<string, string> = new Map(),
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
      const after = read(match);
      // Compare against what a *correct* duplication would have produced, not
      // against the template verbatim. monday rewrites the board id; that is
      // the copy working, not the copy drifting.
      const before = normalizeRecipe(read(t), template.boardId, copy.boardId, columnIdMap);
      if (!isStructuredConfiguration(before) || !isStructuredConfiguration(after)) return false;
      return canonicalJson(before) !== canonicalJson(after);
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
