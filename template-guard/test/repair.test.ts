import { describe, expect, it } from 'vitest';
import { diffBoards } from '../src/diff/diff.js';
import { buildRepairPlan } from '../src/repair/plan.js';
import { serializeDefaults } from '../src/repair/execute.js';
import {
  automation,
  cleanCopy,
  copyWith,
  templateBoard,
  COPY_BOARD_ID,
  TEMPLATE_BOARD_ID,
} from './fixtures/boards.js';

const ctx = { accountSlug: 'acme', boardId: COPY_BOARD_ID };

const planFor = (copy: typeof cleanCopy) =>
  buildRepairPlan(diffBoards(templateBoard, copy).findings, ctx, templateBoard.name);

describe('repair planning', () => {
  it('offers a one-click fix for a missing plain column', () => {
    const plan = planFor(
      copyWith((b) => {
        b.columns = b.columns.filter((c) => c.title !== 'Kickoff Date');
      }),
    );

    expect(plan.auto).toHaveLength(1);
    expect(plan.auto[0]?.action).toMatchObject({
      type: 'create_column',
      boardId: COPY_BOARD_ID,
      title: 'Kickoff Date',
      columnType: 'date',
    });
    expect(plan.auto[0]?.preview).toContain('Kickoff Date');
  });

  it('offers a one-click fix for a missing group', () => {
    const plan = planFor(
      copyWith((b) => {
        b.groups = b.groups.filter((g) => g.title !== 'Handover');
      }),
    );
    expect(plan.auto.map((a) => a.action.type)).toEqual(['create_group']);
  });

  it('offers a one-click fix for a rename, pointing back at the template title', () => {
    const plan = planFor(
      copyWith((b) => {
        const col = b.columns.find((c) => c.title === 'Account Owner');
        if (col) col.title = 'Client Owner';
      }),
    );

    expect(plan.auto).toHaveLength(1);
    expect(plan.auto[0]?.action).toMatchObject({
      type: 'rename_column',
      columnId: 'c_person1',
      title: 'Account Owner',
    });
  });

  it('refuses to auto-fix a mis-wired connect column, and says why', () => {
    const plan = planFor(
      copyWith((b) => {
        const col = b.columns.find((c) => c.title === 'Related Work');
        if (col) col.settings = { boardIds: [TEMPLATE_BOARD_ID] };
      }),
    );

    expect(plan.auto).toHaveLength(0);
    expect(plan.manual).toHaveLength(1);

    const step = plan.manual[0];
    expect(step?.instruction).toContain('Related Work');
    // The instruction names the board to change it FROM, which is the thing
    // that makes the checklist item actionable in five seconds.
    expect(step?.instruction).toContain(templateBoard.name);
    expect(step?.whyManual).toMatch(/by hand|existing data|decision/i);
    expect(step?.link).toContain(COPY_BOARD_ID);
  });

  it('refuses to auto-create a missing connect column', () => {
    const plan = planFor(
      copyWith((b) => {
        b.columns = b.columns.filter((c) => c.title !== 'Related Work');
      }),
    );

    expect(plan.auto).toHaveLength(0);
    expect(plan.manual[0]?.whyManual).toMatch(/which board/i);
  });

  it('never writes to automations, even when it could read them', () => {
    const template = {
      ...templateBoard,
      automations: [automation({ id: 't1', title: 'Email the client weekly' })],
    };
    const copy = { ...cleanCopy, automations: [] };

    const plan = buildRepairPlan(
      diffBoards(template, copy).findings,
      ctx,
      templateBoard.name,
    );

    expect(plan.auto).toHaveLength(0);
    expect(plan.manual).toHaveLength(1);
    expect(plan.manual[0]?.link).toContain('/automations');
    expect(plan.manual[0]?.whyManual).toMatch(/stable API/i);
  });

  it('ignores cosmetic findings rather than cluttering the checklist', () => {
    const plan = buildRepairPlan(
      diffBoards(
        templateBoard,
        copyWith((b) => {
          const col = b.columns.find((c) => c.title === 'Scope Notes');
          if (col) col.width = 400;
        }),
        { includeCosmetic: true },
      ).findings,
      ctx,
      templateBoard.name,
    );

    expect(plan.auto).toHaveLength(0);
    expect(plan.manual).toHaveLength(0);
    expect(plan.ignored.length).toBeGreaterThan(0);
  });

  it('gives every finding somewhere to go — nothing falls off the list', () => {
    const broken = copyWith((b) => {
      b.columns = b.columns.filter((c) => c.title !== 'Kickoff Date');
      const rel = b.columns.find((c) => c.title === 'Related Work');
      if (rel) rel.settings = { boardIds: [TEMPLATE_BOARD_ID] };
      const owner = b.columns.find((c) => c.title === 'Account Owner');
      if (owner) owner.title = 'Client Owner';
      const retainer = b.columns.find((c) => c.title === 'Retainer');
      if (retainer) retainer.type = 'text';
      b.groups = b.groups.filter((g) => g.title !== 'Handover');
      b.views = b.views.filter((v) => v.name !== 'Blocked Only');
    });

    const { findings } = diffBoards(templateBoard, broken);
    const plan = buildRepairPlan(findings, ctx, templateBoard.name);

    const accountedFor = new Set([
      ...plan.auto.map((a) => a.findingId),
      ...plan.manual.map((m) => m.findingId),
      ...plan.ignored,
    ]);
    for (const f of findings) expect(accountedFor.has(f.id)).toBe(true);
    expect(accountedFor.size).toBe(findings.length);
  });

  it('gives an unknown finding kind a manual step instead of dropping it', () => {
    const plan = buildRepairPlan(
      [
        {
          id: 'x.1',
          severity: 'missing',
          kind: 'something.new',
          subject: { type: 'board', id: null, title: 'Whatever' },
          what: 'w',
          whyItMatters: 'y',
          howToFix: 'Do the thing.',
          confidence: 'certain',
          evidence: {},
        },
      ],
      ctx,
      templateBoard.name,
    );

    expect(plan.manual).toHaveLength(1);
    expect(plan.manual[0]?.instruction).toBe('Do the thing.');
  });
});

describe('serializeDefaults', () => {
  it('returns null for empty settings rather than an empty object', () => {
    expect(serializeDefaults({})).toBeNull();
  });

  it('encodes settings as a JSON string', () => {
    expect(serializeDefaults({ labels: { '0': 'Todo' } })).toBe('{"labels":{"0":"Todo"}}');
  });

  it('degrades to null on an unserializable blob instead of throwing', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(serializeDefaults(circular)).toBeNull();
  });
});
