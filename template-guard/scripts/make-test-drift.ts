/**
 * Breaks a test board on purpose, so the diff has something to find.
 *
 * **A developer utility that writes to a board — like `make-test-duplicate.ts`
 * and for the same reason, kept out of `verify-live.ts` so that script's
 * read-only guarantee stays literally true.** Point it only at a throwaway
 * copy you made for testing. It deletes a column.
 *
 * Why it exists: the first real comparison came back with **zero findings**,
 * and the script's own output says that is the suspicious result rather than
 * the reassuring one. Either monday duplicated the board faithfully or the
 * matcher is blind, and those look identical from outside. This tells them
 * apart by introducing a difference we know the exact shape of, then checking
 * that the diff reports it.
 *
 *   MONDAY_API_TOKEN=... npx tsx scripts/make-test-drift.ts --board <copy id> --drop "Column name"
 *
 * ✓ Signature introspected 21 Sep 2026:
 *   delete_column(board_id: ID!, column_id: String!): Column
 */

import { MondayClient } from '../src/api/client.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = arg('board');
  const dropTitle = arg('drop');

  if (!token || !boardId || !dropTitle) {
    console.error('Usage: MONDAY_API_TOKEN=... npx tsx scripts/make-test-drift.ts --board <id> --drop "Column title"');
    process.exit(2);
  }

  const client = new MondayClient({ token });

  const { data, errors } = await client.request<{
    boards: { id: string; name: string; columns: { id: string; title: string; type: string }[] }[] | null;
  }>(`query($ids:[ID!]){ boards(ids:$ids){ id name columns { id title type } } }`, { ids: [boardId] });

  const board = data?.boards?.[0];
  if (!board) {
    console.error(`Could not read board ${boardId}: ${errors.map((e) => e.message).join(' | ')}`);
    process.exit(1);
  }

  console.log(`\n"${board.name}" columns:`);
  for (const c of board.columns) console.log(`  ${c.id}  ${c.title} (${c.type})`);

  const target = board.columns.find((c) => c.title === dropTitle);
  if (!target) {
    console.error(`\nNo column titled "${dropTitle}" on this board.`);
    process.exit(1);
  }

  // A visible confirmation of what is about to be destroyed, because this is
  // the one script here that destroys anything.
  console.log(`\nDeleting "${target.title}" (${target.id}, ${target.type}) from board ${boardId}…`);

  const result = await client.request<{ delete_column?: { id: string } | null }>(
    `mutation TemplateGuardMakeTestDrift($boardId: ID!, $columnId: String!) {
       delete_column(board_id: $boardId, column_id: $columnId) { id }
     }`,
    { boardId, columnId: target.id },
  );

  if (result.errors.length > 0 || !result.data?.delete_column) {
    console.error(`Failed: ${result.errors.map((e) => e.message).join(' | ') || 'nothing returned'}`);
    process.exit(1);
  }

  console.log(`\n✓ Deleted. The diff should now report "${target.title}" as missing.`);
  console.log(`  If it does not, the matcher is too quiet and that is the bug worth finding.\n`);
}

main().catch((err: unknown) => {
  console.error('\nCould not introduce drift:', err instanceof Error ? err.message : err);
  process.exit(2);
});
