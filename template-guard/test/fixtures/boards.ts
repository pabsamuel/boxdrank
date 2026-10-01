import {
  SNAPSHOT_SCHEMA_VERSION,
  type AutomationSnapshot,
  type BoardSnapshot,
  type ColumnSnapshot,
} from '../../src/snapshot/types.js';

/**
 * Fixture board configurations.
 *
 * These model a real agency setup: a "Client Onboarding" template board that
 * gets duplicated per client. The template self-references through a connect
 * column (parent/child work items), which is the setup that produces the
 * mis-wiring failure when duplicated.
 */

export const TEMPLATE_BOARD_ID = '1000000001';
export const COPY_BOARD_ID = '2000000002';
export const SHARED_CRM_BOARD_ID = '3000000003';

export function column(over: Partial<ColumnSnapshot> & Pick<ColumnSnapshot, 'id' | 'title' | 'type'>): ColumnSnapshot {
  return {
    description: null,
    archived: false,
    width: 160,
    settings: {},
    settingsFromDeprecatedField: false,
    ...over,
  };
}

export function board(over: Partial<BoardSnapshot> & Pick<BoardSnapshot, 'boardId'>): BoardSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    name: 'Board',
    description: null,
    state: 'active',
    boardKind: 'public',
    workspaceId: '77',
    boardFolderId: null,
    permissions: 'everyone',
    columns: [],
    groups: [],
    views: [],
    tags: [],
    ownerIds: ['u1'],
    subscriberIds: ['u1'],
    automations: null,
    capturedAt: '2026-09-16T00:00:00.000Z',
    failures: [],
    ...over,
  };
}

export function automation(
  over: Partial<AutomationSnapshot> & Pick<AutomationSnapshot, 'id' | 'title'>,
): AutomationSnapshot {
  return {
    isActive: true,
    workflowBlocks: null,
    workflowVariables: null,
    workflowHostData: null,
    templateReferenceId: null,
    fromPreviewSchema: true,
    ...over,
  };
}

const TEMPLATE_COLUMNS: ColumnSnapshot[] = [
  column({ id: 'name', title: 'Name', type: 'name' }),
  column({ id: 'status1', title: 'Status', type: 'status', settings: { labels: { '0': 'Not started', '1': 'In progress', '5': 'Done' } } }),
  column({ id: 'person1', title: 'Account Owner', type: 'people' }),
  column({ id: 'date1', title: 'Kickoff Date', type: 'date' }),
  column({ id: 'text1', title: 'Scope Notes', type: 'text' }),
  column({ id: 'num1', title: 'Retainer', type: 'numbers' }),
  // Self-referencing connect column: the template points at itself.
  column({
    id: 'connect1',
    title: 'Related Work',
    type: 'board_relation',
    settings: { boardIds: [TEMPLATE_BOARD_ID] },
  }),
  // Connect to a genuinely shared CRM board. Should survive duplication as-is.
  column({
    id: 'connect2',
    title: 'CRM Account',
    type: 'board_relation',
    settings: { boardIds: [SHARED_CRM_BOARD_ID] },
  }),
];

export const templateBoard: BoardSnapshot = board({
  boardId: TEMPLATE_BOARD_ID,
  name: 'Client Onboarding — TEMPLATE',
  columns: TEMPLATE_COLUMNS,
  groups: [
    { id: 'g1', title: 'Week 1', color: 'green', position: '1', archived: false },
    { id: 'g2', title: 'Week 2', color: 'blue', position: '2', archived: false },
    { id: 'g3', title: 'Handover', color: 'purple', position: '3', archived: false },
  ],
  views: [
    { id: 'v1', name: 'Main Table', type: 'table', settings: {}, position: 0 },
    { id: 'v2', name: 'Timeline', type: 'timeline', settings: {}, position: 1 },
    { id: 'v3', name: 'Blocked Only', type: 'table', settings: { filter: 'status:blocked' }, position: 2 },
  ],
});

/**
 * The healthy duplicate: everything carried across, every ID is new, and the
 * self-referencing connect column was correctly re-pointed at the copy.
 *
 * This fixture must produce zero non-cosmetic findings. If a change to the
 * matcher makes it produce any, the matcher is generating false positives —
 * which for this product is worse than missing a finding, because a user who
 * stops trusting the diff stops reading it.
 */
export const cleanCopy: BoardSnapshot = board({
  boardId: COPY_BOARD_ID,
  name: 'Client Onboarding — Acme Corp',
  columns: [
    column({ id: 'c_name', title: 'Name', type: 'name' }),
    column({ id: 'c_status1', title: 'Status', type: 'status', settings: { labels: { '0': 'Not started', '1': 'In progress', '5': 'Done' } } }),
    column({ id: 'c_person1', title: 'Account Owner', type: 'people' }),
    column({ id: 'c_date1', title: 'Kickoff Date', type: 'date' }),
    column({ id: 'c_text1', title: 'Scope Notes', type: 'text' }),
    column({ id: 'c_num1', title: 'Retainer', type: 'numbers' }),
    column({ id: 'c_connect1', title: 'Related Work', type: 'board_relation', settings: { boardIds: [COPY_BOARD_ID] } }),
    column({ id: 'c_connect2', title: 'CRM Account', type: 'board_relation', settings: { boardIds: [SHARED_CRM_BOARD_ID] } }),
  ],
  groups: [
    { id: 'c_g1', title: 'Week 1', color: 'green', position: '1', archived: false },
    { id: 'c_g2', title: 'Week 2', color: 'blue', position: '2', archived: false },
    { id: 'c_g3', title: 'Handover', color: 'purple', position: '3', archived: false },
  ],
  views: [
    { id: 'c_v1', name: 'Main Table', type: 'table', settings: {}, position: 0 },
    { id: 'c_v2', name: 'Timeline', type: 'timeline', settings: {}, position: 1 },
    { id: 'c_v3', name: 'Blocked Only', type: 'table', settings: { filter: 'status:blocked' }, position: 2 },
  ],
});

/** Helper: clone the clean copy and mutate it. */
export function copyWith(mutate: (b: BoardSnapshot) => void): BoardSnapshot {
  const clone: BoardSnapshot = structuredClone(cleanCopy);
  mutate(clone);
  return clone;
}
