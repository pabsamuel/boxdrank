/**
 * The data the listing video's board view shows, computed by the real engine
 * (diffBoards + buildRepairPlan) over the fixture "Client Onboarding" template
 * and an Acme copy with three realistic losses. No customer data.
 *
 *   npx tsx scripts/make-demo-data.ts <out.json>
 */
import { writeFileSync } from 'node:fs';
import { diffBoards } from '../src/diff/diff.js';
import { buildRepairPlan } from '../src/repair/plan.js';
import { TEMPLATE_BOARD_ID, COPY_BOARD_ID, copyWith, templateBoard } from '../test/fixtures/boards.js';

const copy = copyWith((b) => {
  // Still pointing at the template's board: the flagship failure.
  const related = b.columns.find((c) => c.title === 'Related Work')!;
  related.settings = { boardIds: [TEMPLATE_BOARD_ID] };
  b.columns = b.columns.filter((c) => c.title !== 'Kickoff Date');
  b.views = b.views.filter((v) => v.name !== 'Blocked Only');
});

const diff = diffBoards(templateBoard, copy, { includeCosmetic: false });
const repairPlan = buildRepairPlan(diff.findings, { accountSlug: 'acme-agency', boardId: COPY_BOARD_ID }, templateBoard.name);

writeFileSync(
  process.argv[2]!,
  JSON.stringify({
    boards: [
      { id: TEMPLATE_BOARD_ID, name: templateBoard.name, workspace_id: '77' },
      { id: COPY_BOARD_ID, name: copy.name, workspace_id: '77' },
    ],
    templates: [
      {
        templateBoardId: TEMPLATE_BOARD_ID,
        accountId: 'demo',
        label: templateBoard.name,
        snapshot: templateBoard,
        linkedBoardIds: [COPY_BOARD_ID],
        createdAt: '2026-09-28T09:00:00.000Z',
        updatedAt: '2026-09-28T09:00:00.000Z',
      },
    ],
    plan: { accountId: 'demo', planId: 'pro', renewsAt: null },
    compare: { diff, repairPlan, copySnapshotFailures: [] },
    copyBoardId: COPY_BOARD_ID,
    copyName: copy.name,
  }),
);
console.log(diff.findings.map((f) => `${f.severity}: ${f.what}`).join('\n'));
