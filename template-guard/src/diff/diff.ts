import type { BoardSnapshot, ColumnSnapshot } from '../snapshot/types.js';
import { diffAutomations } from './automations.js';
import { compareWiring, isBoardReferencing, linkedBoardIds } from './connect.js';
import { matchColumns, type ColumnMatch } from './match.js';
import { sortFindings, type DiffResult, type Finding } from './types.js';

/**
 * The diff engine.
 *
 * Pure: no network, no monday SDK, no clock beyond an injectable `now`. It
 * takes two snapshots and returns findings. That purity is what makes the
 * matching heuristics testable against fixtures, which is the only reason we
 * can trust them.
 */

export interface DiffOptions {
  now?: () => Date;
  /** Include width/order noise. Off by default — it drowns the real findings. */
  includeCosmetic?: boolean;
}

export function diffBoards(
  template: BoardSnapshot,
  copy: BoardSnapshot,
  opts: DiffOptions = {},
): DiffResult {
  const now = opts.now ?? (() => new Date());
  const findings: Finding[] = [];
  const dataWarnings: string[] = [];

  for (const f of [...template.failures, ...copy.failures]) {
    if (f.degradesDiff) dataWarnings.push(f.message);
  }

  const { matches, templateOnly, copyOnly } = matchColumns(template.columns, copy.columns);

  findings.push(...missingColumnFindings(templateOnly));
  findings.push(...addedColumnFindings(copyOnly));

  for (const match of matches) {
    findings.push(...comparePair(match, template, copy, opts.includeCosmetic ?? false));
  }

  findings.push(...diffGroups(template, copy));
  findings.push(...diffViews(template, copy, opts.includeCosmetic ?? false));

  const automations = diffAutomations(template, copy);
  findings.push(...automations.findings);

  return {
    templateBoardId: template.boardId,
    copyBoardId: copy.boardId,
    findings: sortFindings(findings),
    basedOnIncompleteData: dataWarnings.length > 0,
    dataWarnings,
    automationCoverage: automations.ran
      ? { checked: true }
      : { checked: false, reason: automations.skippedReason },
    comparedAt: now().toISOString(),
  };
}

function missingColumnFindings(templateOnly: ColumnSnapshot[]): Finding[] {
  return templateOnly.map((c) => ({
    id: `column.missing.${c.id}`,
    severity: 'missing' as const,
    kind: 'column.missing',
    subject: { type: 'column' as const, id: c.id, title: c.title },
    what: `The column “${c.title}” exists on the template but not on this board.`,
    whyItMatters: isBoardReferencing(c)
      ? 'This is a connect-type column. Anything that reads or writes through it — automations, mirrored values, dependency chains — has nothing to run against on this board.'
      : 'Any automation, view filter or integration on the template that referenced this column has nothing to point at here, and will not run.',
    howToFix: `Add a “${c.title}” column of type ${c.type} to this board.`,
    confidence: 'certain' as const,
    evidence: { templateColumnId: c.id, type: c.type, settings: c.settings },
  }));
}

function addedColumnFindings(copyOnly: ColumnSnapshot[]): Finding[] {
  return copyOnly.map((c) => ({
    id: `column.added.${c.id}`,
    severity: 'cosmetic' as const,
    kind: 'column.added',
    subject: { type: 'column' as const, id: c.id, title: c.title },
    what: `This board has a column “${c.title}” that the template does not.`,
    whyItMatters:
      'Usually deliberate — someone customised this board. Worth a glance only to confirm it was not meant to go back into the template.',
    howToFix: 'No action needed unless the template should have it too.',
    confidence: 'likely' as const,
    evidence: { copyColumnId: c.id, type: c.type },
  }));
}

function comparePair(
  match: ColumnMatch,
  template: BoardSnapshot,
  copy: BoardSnapshot,
  includeCosmetic: boolean,
): Finding[] {
  const { template: t, copy: c } = match;
  const findings: Finding[] = [];

  if (t.type !== c.type) {
    findings.push({
      id: `column.type_changed.${c.id}`,
      severity: 'altered',
      kind: 'column.type_changed',
      subject: { type: 'column', id: c.id, title: c.title },
      what: `“${c.title}” is a ${c.type} column here, but a ${t.type} column on the template.`,
      whyItMatters:
        'A column’s type determines what can be stored in it and which automations can act on it. A recipe written against the template’s type will not fire here, and monday gives no warning that the types diverged.',
      howToFix: `Change this column back to ${t.type}, or update the template if this board’s type is the one you want. monday cannot convert between all column types — you may need to add a new column and move the data.`,
      confidence: match.confidence,
      evidence: {
        templateColumnId: t.id,
        copyColumnId: c.id,
        templateType: t.type,
        copyType: c.type,
        matchedVia: match.via,
      },
    });
  }

  if (t.title !== c.title) {
    findings.push({
      id: `column.renamed.${c.id}`,
      severity: 'altered',
      kind: 'column.renamed',
      subject: { type: 'column', id: c.id, title: c.title },
      what: `The template’s “${t.title}” column is called “${c.title}” here.`,
      whyItMatters:
        'Renames are often intentional, but anything matching this column by name — an integration, a form, an exported report, another app — will stop finding it.',
      howToFix: `Rename it back to “${t.title}” if the difference was not deliberate.`,
      confidence: match.confidence,
      evidence: {
        templateColumnId: t.id,
        copyColumnId: c.id,
        templateTitle: t.title,
        copyTitle: c.title,
        matchedVia: match.via,
      },
    });
  }

  if (isBoardReferencing(t) || isBoardReferencing(c)) {
    findings.push(...compareConnectColumn(match, template, copy));
  } else if (!deepEqual(t.settings, c.settings)) {
    findings.push({
      id: `column.settings_changed.${c.id}`,
      severity: 'altered',
      kind: 'column.settings_changed',
      subject: { type: 'column', id: c.id, title: c.title },
      what: `“${c.title}” is configured differently from the template.`,
      whyItMatters:
        'For a status or dropdown column this usually means the available labels differ. Automations that fire on a specific label will never fire if that label does not exist here.',
      howToFix: `Open the column’s settings on both boards and reconcile them.`,
      confidence: match.confidence,
      evidence: {
        templateColumnId: t.id,
        copyColumnId: c.id,
        templateSettings: t.settings,
        copySettings: c.settings,
      },
    });
  }

  if (includeCosmetic && t.width !== c.width && t.width != null && c.width != null) {
    findings.push({
      id: `column.width.${c.id}`,
      severity: 'cosmetic',
      kind: 'column.width_changed',
      subject: { type: 'column', id: c.id, title: c.title },
      what: `“${c.title}” is a different width than on the template.`,
      whyItMatters: 'Purely visual. Listed for completeness.',
      howToFix: 'Drag the column edge if it bothers you.',
      confidence: 'certain',
      evidence: { templateWidth: t.width, copyWidth: c.width },
    });
  }

  return findings;
}

function compareConnectColumn(
  match: ColumnMatch,
  template: BoardSnapshot,
  copy: BoardSnapshot,
): Finding[] {
  const { template: t, copy: c } = match;
  const verdict = compareWiring(t, c, template.boardId, copy.boardId);

  switch (verdict.status) {
    case 'correct':
      return [];

    case 'miswired':
      return [
        {
          id: `column.miswired.${c.id}`,
          severity: 'miswired',
          kind: 'column.miswired',
          subject: { type: 'column', id: c.id, title: c.title },
          what: verdict.selfLink
            ? `“${c.title}” still connects to the template board instead of to this one.`
            : `“${c.title}” connects to the template board, which the template’s own copy of this column does not.`,
          whyItMatters:
            'This is the failure that does real damage. The column looks perfectly normal in monday — it shows linked items, automations run without erroring — but every one of those items lives on the template board. Work gets written to the wrong board, and because nothing errors, nobody notices until the data is tangled.',
          howToFix: `Open this column’s settings and change the connected board from “${template.name || template.boardId}” to this board.`,
          confidence: 'certain',
          evidence: {
            templateColumnId: t.id,
            copyColumnId: c.id,
            pointsAt: verdict.pointsAt,
            shouldPointAt: verdict.shouldPointAt,
            selfLink: verdict.selfLink,
            templateBoardId: template.boardId,
            copyBoardId: copy.boardId,
          },
        },
      ];

    case 'altered':
      return [
        {
          id: `column.links_changed.${c.id}`,
          severity: 'altered',
          kind: 'column.links_changed',
          subject: { type: 'column', id: c.id, title: c.title },
          what: `“${c.title}” connects to different boards than the template does.`,
          whyItMatters:
            'Often intentional — a per-client board legitimately connects elsewhere. Worth confirming, because a connect column aimed at the wrong board behaves identically to one aimed at the right board.',
          howToFix: 'Open the column’s settings and confirm the connected boards are the ones you intend.',
          confidence: 'likely',
          evidence: {
            templateColumnId: t.id,
            copyColumnId: c.id,
            templateLinks: verdict.templateLinks,
            copyLinks: verdict.copyLinks,
          },
        },
      ];

    case 'indeterminate':
      return [
        {
          id: `column.wiring_unknown.${c.id}`,
          severity: 'miswired',
          kind: 'column.wiring_indeterminate',
          subject: { type: 'column', id: c.id, title: c.title },
          what: `Template Guard could not read which board “${c.title}” connects to.`,
          whyItMatters:
            'Connect columns are where the most damaging duplication failures hide, so an unreadable one is reported at full severity rather than passed over. Template Guard will not tell you this column is fine when it does not know.',
          howToFix: `Open “${c.title}” in this board’s column settings and confirm by eye that it points at this board, not at the template.`,
          confidence: 'likely',
          evidence: {
            templateColumnId: t.id,
            copyColumnId: c.id,
            reason: verdict.reason,
            templateLinksRaw: linkedBoardIds(t),
            copyLinksRaw: linkedBoardIds(c),
          },
        },
      ];
  }
}

function diffGroups(template: BoardSnapshot, copy: BoardSnapshot): Finding[] {
  const copyTitles = new Set(copy.groups.filter((g) => !g.archived).map((g) => g.title.trim().toLowerCase()));
  return template.groups
    .filter((g) => !g.archived && !copyTitles.has(g.title.trim().toLowerCase()))
    .map((g) => ({
      id: `group.missing.${g.id}`,
      severity: 'missing' as const,
      kind: 'group.missing',
      subject: { type: 'group' as const, id: g.id, title: g.title },
      what: `The group “${g.title}” exists on the template but not on this board.`,
      whyItMatters:
        'Automations that move or create items in a named group cannot run without it, and “create item in group” recipes fail quietly.',
      howToFix: `Add a group called “${g.title}” to this board.`,
      confidence: 'certain' as const,
      evidence: { templateGroupId: g.id, color: g.color },
    }));
}

function diffViews(
  template: BoardSnapshot,
  copy: BoardSnapshot,
  includeCosmetic: boolean,
): Finding[] {
  const findings: Finding[] = [];
  const copyByName = new Map(copy.views.map((v) => [v.name.trim().toLowerCase(), v]));

  for (const v of template.views) {
    const key = v.name.trim().toLowerCase();
    const found = copyByName.get(key);
    if (!found) {
      findings.push({
        id: `view.missing.${v.id}`,
        severity: 'missing',
        kind: 'view.missing',
        subject: { type: 'view', id: v.id, title: v.name },
        what: `The view “${v.name}” exists on the template but not on this board.`,
        whyItMatters:
          'Views carry filters and groupings the team relies on. A missing view usually means someone is looking at an unfiltered board and does not realise it.',
        howToFix: `Recreate the “${v.name}” view (type: ${v.type}) on this board.`,
        confidence: 'certain',
        evidence: { templateViewId: v.id, type: v.type },
      });
      continue;
    }

    if (found.type !== v.type) {
      findings.push({
        id: `view.type_changed.${found.id}`,
        severity: 'altered',
        kind: 'view.type_changed',
        subject: { type: 'view', id: found.id, title: found.name },
        what: `The view “${found.name}” is a ${found.type} view here but a ${v.type} view on the template.`,
        whyItMatters: 'The team is looking at this board through a different lens than the template intends.',
        howToFix: `Recreate the view as a ${v.type} view.`,
        confidence: 'certain',
        evidence: { templateViewId: v.id, copyViewId: found.id },
      });
    }

    if (includeCosmetic && found.position !== v.position) {
      findings.push({
        id: `view.order.${found.id}`,
        severity: 'cosmetic',
        kind: 'view.reordered',
        subject: { type: 'view', id: found.id, title: found.name },
        what: `The view “${found.name}” sits in a different position in the view bar.`,
        whyItMatters: 'Purely visual. Listed for completeness.',
        howToFix: 'Drag the view tab if you want them to match.',
        confidence: 'certain',
        evidence: { templatePosition: v.position, copyPosition: found.position },
      });
    }
  }

  return findings;
}

/** Structural equality for parsed settings blobs. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao).sort();
    const bk = Object.keys(bo).sort();
    if (ak.length !== bk.length) return false;
    if (!ak.every((k, i) => k === bk[i])) return false;
    return ak.every((k) => deepEqual(ao[k], bo[k]));
  }

  return false;
}
