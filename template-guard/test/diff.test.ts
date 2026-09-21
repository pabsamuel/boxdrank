import { describe, expect, it } from 'vitest';
import { diffBoards } from '../src/diff/diff.js';
import { diffAutomations, recipeReferencesBoard } from '../src/diff/automations.js';
import { countBySeverity, type Finding } from '../src/diff/types.js';
import { partial } from '../src/api/errors.js';
import {
  automation,
  cleanCopy,
  column,
  copyWith,
  templateBoard,
  COPY_BOARD_ID,
  TEMPLATE_BOARD_ID,
  SHARED_CRM_BOARD_ID,
} from './fixtures/boards.js';

const find = (findings: Finding[], kind: string): Finding[] =>
  findings.filter((f) => f.kind === kind);

describe('diffBoards — the healthy duplicate', () => {
  it('reports nothing on a correctly duplicated board', () => {
    const { findings, basedOnIncompleteData } = diffBoards(templateBoard, cleanCopy);
    expect(findings).toEqual([]);
    expect(basedOnIncompleteData).toBe(false);
  });

  it('does not invent findings from the new column IDs alone', () => {
    // Every column ID differs between template and copy; none of that is a finding.
    const templateIds = templateBoard.columns.map((c) => c.id);
    const copyIds = cleanCopy.columns.map((c) => c.id);
    expect(templateIds.some((id) => copyIds.includes(id))).toBe(false);
    expect(diffBoards(templateBoard, cleanCopy).findings).toHaveLength(0);
  });

  it('keeps cosmetic noise out unless asked for it', () => {
    const wider = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'Scope Notes');
      if (col) col.width = 400;
      b.views = b.views.map((v) => ({ ...v, position: v.position === 0 ? 2 : v.position - 1 }));
    });

    expect(diffBoards(templateBoard, wider).findings).toHaveLength(0);

    const withCosmetic = diffBoards(templateBoard, wider, { includeCosmetic: true });
    expect(withCosmetic.findings.length).toBeGreaterThan(0);
    expect(withCosmetic.findings.every((f) => f.severity === 'cosmetic')).toBe(true);
  });
});

describe('required case 1 — a missing automation', () => {
  const withAutomations = (b: typeof templateBoard, titles: string[]) => ({
    ...b,
    automations: titles.map((t, i) => automation({ id: `${b.boardId}-a${i}`, title: t })),
  });

  it('flags an automation present on the template and absent from the copy', () => {
    const template = withAutomations(templateBoard, [
      'When status changes to Done, notify Account Owner',
      'When Kickoff Date arrives, create item in Week 1',
      'Every Monday, send summary email to client',
    ]);
    const copy = withAutomations(cleanCopy, [
      'When status changes to Done, notify Account Owner',
      'When Kickoff Date arrives, create item in Week 1',
    ]);

    const missing = find(diffBoards(template, copy).findings, 'automation.missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.subject.title).toBe('Every Monday, send summary email to client');
    expect(missing[0]?.severity).toBe('missing');
    expect(missing[0]?.confidence).toBe('certain');
  });

  it('reproduces the 44-became-39 case', () => {
    const titles = Array.from({ length: 44 }, (_, i) => `Recipe ${i + 1}`);
    const template = withAutomations(templateBoard, titles);
    const copy = withAutomations(cleanCopy, titles.slice(0, 39));

    const missing = find(diffBoards(template, copy).findings, 'automation.missing');
    expect(missing).toHaveLength(5);
  });

  it('flags an automation that copied across but arrived switched off', () => {
    const template = {
      ...templateBoard,
      automations: [automation({ id: 't1', title: 'Notify on Done', isActive: true })],
    };
    const copy = {
      ...cleanCopy,
      automations: [automation({ id: 'c1', title: 'Notify on Done', isActive: false })],
    };

    const findings = find(diffBoards(template, copy).findings, 'automation.inactive');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('missing');
  });

  it('says so when automations were never read, rather than reporting none', () => {
    // Both snapshots have automations: null — the preview flag was off.
    const result = diffBoards(templateBoard, cleanCopy);
    expect(result.automationCoverage.checked).toBe(false);
    expect(result.automationCoverage.reason).toMatch(/not compared/i);
    // Critically: no automation findings are fabricated from the absence.
    expect(result.findings.filter((f) => f.subject.type === 'automation')).toHaveLength(0);
  });

  it('does not raise the incomplete-data alarm merely because the preview flag is off', () => {
    // The flag is off by default, so this is the state almost every diff runs
    // in. Treating it as "incomplete data" would put a warning banner on every
    // comparison the product ever shows, and a permanent warning is no warning.
    const result = diffBoards(templateBoard, cleanCopy);
    expect(result.basedOnIncompleteData).toBe(false);
    expect(result.dataWarnings).toEqual([]);
  });

  it('reports coverage as checked when both boards had automations read', () => {
    const template = { ...templateBoard, automations: [automation({ id: 't1', title: 'A' })] };
    const copy = { ...cleanCopy, automations: [automation({ id: 'c1', title: 'A' })] };
    expect(diffBoards(template, copy).automationCoverage).toEqual({ checked: true });
  });
});

describe('required case 2 — a mis-wired cross-board reference', () => {
  it('flags a connect column still pointing at the template board', () => {
    const miswired = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'Related Work');
      if (col) col.settings = { boardIds: [TEMPLATE_BOARD_ID] };
    });

    const findings = find(diffBoards(templateBoard, miswired).findings, 'column.miswired');
    expect(findings).toHaveLength(1);

    const f = findings[0];
    expect(f?.severity).toBe('miswired');
    expect(f?.confidence).toBe('certain');
    expect(f?.evidence).toMatchObject({
      pointsAt: [TEMPLATE_BOARD_ID],
      shouldPointAt: [COPY_BOARD_ID],
      selfLink: true,
    });
  });

  it('sorts the mis-wired finding above everything else', () => {
    const broken = copyWith((b) => {
      b.columns = b.columns.filter((c) => c.title !== 'Scope Notes');
      const col = b.columns.find((c) => c.title === 'Related Work');
      if (col) col.settings = { boardIds: [TEMPLATE_BOARD_ID] };
      const status = b.columns.find((c) => c.title === 'Status');
      if (status) status.title = 'Stage';
    });

    const { findings } = diffBoards(templateBoard, broken);
    expect(findings.length).toBeGreaterThan(2);
    expect(findings[0]?.severity).toBe('miswired');
  });

  it('leaves a legitimately shared connect board alone', () => {
    // "CRM Account" points at the same third board on both. Not a finding.
    const { findings } = diffBoards(templateBoard, cleanCopy);
    expect(find(findings, 'column.miswired')).toHaveLength(0);
    expect(find(findings, 'column.links_changed')).toHaveLength(0);
    expect(cleanCopy.columns.find((c) => c.title === 'CRM Account')?.settings).toEqual({
      boardIds: [SHARED_CRM_BOARD_ID],
    });
  });

  it('flags a copy that acquired a link to the template the template never had', () => {
    const miswired = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'CRM Account');
      if (col) col.settings = { boardIds: [SHARED_CRM_BOARD_ID, TEMPLATE_BOARD_ID] };
    });

    const findings = find(diffBoards(templateBoard, miswired).findings, 'column.miswired');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toMatchObject({ selfLink: false });
  });

  it('reports unreadable wiring at full severity instead of assuming it is fine', () => {
    const opaque = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'Related Work');
      if (col) col.settings = { somethingWeDoNotUnderstand: true };
    });

    const findings = find(diffBoards(templateBoard, opaque).findings, 'column.wiring_indeterminate');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('miswired');
    // It admits it is inferring rather than claiming certainty.
    expect(findings[0]?.confidence).toBe('likely');
  });

  it('treats a differently-wired connect column as altered, not mis-wired', () => {
    const rewired = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'CRM Account');
      if (col) col.settings = { boardIds: ['9999999'] };
    });

    const { findings } = diffBoards(templateBoard, rewired);
    expect(find(findings, 'column.miswired')).toHaveLength(0);
    expect(find(findings, 'column.links_changed')).toHaveLength(1);
  });
});

describe('required case 3 — a renamed column', () => {
  it('flags a rename and matches the column despite the new ID and title', () => {
    const renamed = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'Account Owner');
      if (col) col.title = 'Client Owner';
    });

    const { findings } = diffBoards(templateBoard, renamed);
    const renames = find(findings, 'column.renamed');

    expect(renames).toHaveLength(1);
    expect(renames[0]?.severity).toBe('altered');
    expect(renames[0]?.evidence).toMatchObject({
      templateTitle: 'Account Owner',
      copyTitle: 'Client Owner',
    });
    // It matched rather than reporting a delete plus an add.
    expect(find(findings, 'column.missing')).toHaveLength(0);
    expect(find(findings, 'column.added')).toHaveLength(0);
  });

  it('marks a rename inferred from weak evidence as likely, not certain', () => {
    const renamed = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'Account Owner');
      if (col) col.title = 'Client Owner';
    });

    const rename = find(diffBoards(templateBoard, renamed).findings, 'column.renamed')[0];
    expect(rename?.confidence).toBe('likely');
    expect(rename?.evidence).toMatchObject({ matchedVia: 'type+position' });
  });

  it('does not pair two unrelated columns of the same generic type', () => {
    // Replace a text column with a completely unrelated one. The honest answer
    // is one missing and one added, not a bogus "rename". `text` is a generic
    // type, so the sole-of-type fallback must not fire on it.
    const swapped = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'Scope Notes');
      if (col) col.title = 'Invoice Reference';
    });

    const { findings } = diffBoards(templateBoard, swapped);
    expect(find(findings, 'column.missing')).toHaveLength(1);
    expect(find(findings, 'column.added')).toHaveLength(1);
    expect(find(findings, 'column.renamed')).toHaveLength(0);
  });
});

describe('required case 4 — a changed column type', () => {
  it('flags a type change and still recognises it as the same column', () => {
    const retyped = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'Retainer');
      if (col) {
        col.type = 'text';
        col.settings = {};
      }
    });

    const { findings } = diffBoards(templateBoard, retyped);
    const changes = find(findings, 'column.type_changed');

    expect(changes).toHaveLength(1);
    expect(changes[0]?.severity).toBe('altered');
    expect(changes[0]?.confidence).toBe('certain');
    expect(changes[0]?.evidence).toMatchObject({ templateType: 'numbers', copyType: 'text' });
    expect(find(findings, 'column.missing')).toHaveLength(0);
  });

  it('flags a status column whose labels no longer match', () => {
    const relabelled = copyWith((b) => {
      const col = b.columns.find((c) => c.title === 'Status');
      if (col) col.settings = { labels: { '0': 'Not started', '5': 'Done' } };
    });

    const findings = find(diffBoards(templateBoard, relabelled).findings, 'column.settings_changed');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.whyItMatters).toMatch(/label/i);
  });
});

describe('missing structure beyond columns', () => {
  it('flags a missing column', () => {
    const stripped = copyWith((b) => {
      b.columns = b.columns.filter((c) => c.title !== 'Kickoff Date');
    });
    const findings = find(diffBoards(templateBoard, stripped).findings, 'column.missing');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.subject.title).toBe('Kickoff Date');
  });

  it('explains a missing connect column differently from a missing plain column', () => {
    const noConnect = copyWith((b) => {
      b.columns = b.columns.filter((c) => c.title !== 'Related Work');
    });
    const finding = find(diffBoards(templateBoard, noConnect).findings, 'column.missing')[0];
    expect(finding?.whyItMatters).toMatch(/connect/i);
  });

  it('flags a missing group and a missing view', () => {
    const stripped = copyWith((b) => {
      b.groups = b.groups.filter((g) => g.title !== 'Handover');
      b.views = b.views.filter((v) => v.name !== 'Blocked Only');
    });
    const { findings } = diffBoards(templateBoard, stripped);
    expect(find(findings, 'group.missing')).toHaveLength(1);
    expect(find(findings, 'view.missing')).toHaveLength(1);
  });
});

describe('never failing silently', () => {
  it('marks the diff as incomplete when a snapshot carries a blocking failure', () => {
    const damaged = copyWith((b) => {
      b.failures = [
        partial('permission_denied', `board.${COPY_BOARD_ID}.columns`, 'monday refused the column list.'),
      ];
    });

    const result = diffBoards(templateBoard, damaged);
    expect(result.basedOnIncompleteData).toBe(true);
    expect(result.dataWarnings).toContain('monday refused the column list.');
  });

  it('does not let a non-blocking failure raise the incomplete flag', () => {
    const noisy = copyWith((b) => {
      b.failures = [
        partial('preview_unavailable', `board.${COPY_BOARD_ID}.automations`, 'Automations unread.', {
          degradesDiff: false,
        }),
      ];
    });
    expect(diffBoards(templateBoard, noisy).dataWarnings).not.toContain('Automations unread.');
  });
});

describe('severity accounting', () => {
  it('counts a realistically broken duplicate', () => {
    const broken = copyWith((b) => {
      b.columns = b.columns.filter((c) => c.title !== 'Kickoff Date');
      const rel = b.columns.find((c) => c.title === 'Related Work');
      if (rel) rel.settings = { boardIds: [TEMPLATE_BOARD_ID] };
      const owner = b.columns.find((c) => c.title === 'Account Owner');
      if (owner) owner.title = 'Client Owner';
      b.groups = b.groups.filter((g) => g.title !== 'Handover');
      b.columns.push(column({ id: 'c_extra', title: 'Internal Notes', type: 'long_text' }));
    });

    const counts = countBySeverity(diffBoards(templateBoard, broken).findings);
    expect(counts.miswired).toBe(1);
    expect(counts.missing).toBe(2); // Kickoff Date + Handover
    expect(counts.altered).toBe(1); // the rename
    expect(counts.cosmetic).toBe(1); // the added column
  });
});

describe('automation recipe comparison (verified structure, 21 Sep)', () => {
  const base = { workflowVariables: { v: 1 }, workflowHostData: { h: 1 } };

  function boards(templateAuto: ReturnType<typeof automation>[], copyAuto: ReturnType<typeof automation>[]) {
    return [
      { ...templateBoard, automations: templateAuto },
      { ...cleanCopy, automations: copyAuto },
    ] as const;
  }

  it('names which part of the recipe moved, not just that something did', () => {
    const [t, c] = boards(
      [automation({ id: 'a1', title: 'Notify owner', workflowBlocks: { board: '111' }, ...base })],
      [automation({ id: 'b1', title: 'Notify owner', workflowBlocks: { board: '999' }, ...base })],
    );

    const { findings, ran } = diffAutomations(t, c);
    expect(ran).toBe(true);
    // "differs in its steps" is actionable; "is configured differently"
    // sends someone hunting through three JSON blobs.
    expect(findings[0]!.what).toContain('its steps');
    expect(findings[0]!.what).not.toContain('the boards and columns');
  });

  it('reports several parts when several moved', () => {
    const [t, c] = boards(
      [automation({ id: 'a1', title: 'Notify', workflowBlocks: { b: 1 }, workflowVariables: { v: 1 }, workflowHostData: { h: 1 } })],
      [automation({ id: 'b1', title: 'Notify', workflowBlocks: { b: 2 }, workflowVariables: { v: 2 }, workflowHostData: { h: 1 } })],
    );

    const finding = diffAutomations(t, c).findings[0]!;
    // Variables first: they hold the board and column ids, which is the part
    // a duplication actually gets wrong.
    expect(finding.evidence).toMatchObject({
      changedParts: ['the boards and columns it points at', 'its steps'],
    });
    expect(finding.what).toContain('the boards and columns it points at');
  });

  it('says nothing when the recipe is identical', () => {
    const [t, c] = boards(
      [automation({ id: 'a1', title: 'Notify', workflowBlocks: { b: 1 }, ...base })],
      [automation({ id: 'b1', title: 'Notify', workflowBlocks: { b: 1 }, ...base })],
    );
    expect(diffAutomations(t, c).findings).toEqual([]);
  });

  it('stays quiet rather than throwing when a recipe body is not an object', () => {
    // Preview-schema JSON can become anything without notice. A diff that
    // throws on the shape of its input is worse than one that says less.
    const [t, c] = boards(
      [automation({ id: 'a1', title: 'Notify', workflowBlocks: 'opaque' as unknown })],
      [automation({ id: 'b1', title: 'Notify', workflowBlocks: 'different' as unknown })],
    );
    expect(() => diffAutomations(t, c)).not.toThrow();
    expect(diffAutomations(t, c).findings).toEqual([]);
  });
});

describe('a recipe still pointing at the template board', () => {
  /** Shaped like a real one: blocks reference variables, variables hold ids. */
  function recipe(boardId: string) {
    return {
      workflowBlocks: [
        {
          workflowNodeId: 1,
          title: 'When item created',
          inboundFieldsSourceConfig: { boardId: { workflowVariableKey: 1 } },
        },
      ],
      workflowVariables: { 1: { kind: 'board', value: { boardId: Number(boardId) } } },
    };
  }

  it('finds a board id wherever it sits in the JSON', () => {
    expect(recipeReferencesBoard(recipe(TEMPLATE_BOARD_ID), TEMPLATE_BOARD_ID)).toBe(true);
    expect(recipeReferencesBoard(recipe(TEMPLATE_BOARD_ID), COPY_BOARD_ID)).toBe(false);
    // Numbers and strings both, because monday returns board ids as numbers.
    expect(recipeReferencesBoard({ a: [{ b: TEMPLATE_BOARD_ID }] }, TEMPLATE_BOARD_ID)).toBe(true);
  });

  it('does not loop forever on a circular structure', () => {
    const circular: Record<string, unknown> = { id: '1' };
    circular.self = circular;
    expect(() => recipeReferencesBoard(circular, TEMPLATE_BOARD_ID)).not.toThrow();
  });

  it('reports miswired — the same failure as a mis-wired connect column', () => {
    const t = {
      ...templateBoard,
      automations: [automation({ id: 'a1', title: 'Notify', ...recipe(TEMPLATE_BOARD_ID) })],
    };
    const c = {
      ...cleanCopy,
      // Duplication left the recipe naming the template's board.
      automations: [automation({ id: 'b1', title: 'Notify', ...recipe(TEMPLATE_BOARD_ID) })],
    };

    const finding = diffAutomations(t, c).findings.find((f) => f.severity === 'miswired');
    expect(finding).toBeDefined();
    expect(finding!.what).toContain(TEMPLATE_BOARD_ID);
    // A guess, and labelled as one: an unrelated number could match.
    expect(finding!.confidence).toBe('likely');
  });

  it('says nothing when the copy was re-pointed correctly', () => {
    const t = {
      ...templateBoard,
      automations: [automation({ id: 'a1', title: 'Notify', ...recipe(TEMPLATE_BOARD_ID) })],
    };
    const c = {
      ...cleanCopy,
      automations: [automation({ id: 'b1', title: 'Notify', ...recipe(COPY_BOARD_ID) })],
    };

    const findings = diffAutomations(t, c).findings;
    expect(findings.some((f) => f.severity === 'miswired')).toBe(false);
    // It does still notice the variables changed, which is correct and lesser.
    expect(findings[0]?.what).toContain('the boards and columns it points at');
  });

  it('does not cry miswired when the template never pointed at itself', () => {
    // A recipe aimed at a genuinely shared board should survive duplication
    // unchanged, and flagging that would be a false positive on a healthy copy.
    const t = {
      ...templateBoard,
      automations: [automation({ id: 'a1', title: 'Notify', ...recipe(SHARED_CRM_BOARD_ID) })],
    };
    const c = {
      ...cleanCopy,
      automations: [automation({ id: 'b1', title: 'Notify', ...recipe(SHARED_CRM_BOARD_ID) })],
    };

    expect(diffAutomations(t, c).findings).toEqual([]);
  });
});
