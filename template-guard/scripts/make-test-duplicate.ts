/**
 * Creates a duplicate of a board, to test the diff against.
 *
 * **This is a developer utility, not part of the app.** It is the one thing in
 * this repository that writes to a monday board, and it is deliberately a
 * separate file from `verify-live.ts` so that the verification script's
 * read-only guarantee stays literally true rather than mostly true.
 *
 * Hard rule 8 — *v1 never writes to a board* — is about the product: the app
 * does not request `boards:write` and no code path in `src/` mutates anything.
 * That rule is not weakened by a script a developer runs by hand, with their
 * own personal token, to build a test fixture. It would be weakened by
 * pretending this file does not write, so it says so twice and lives apart.
 *
 *   MONDAY_API_TOKEN=... npx tsx scripts/make-test-duplicate.ts --board 123456
 *
 * ✓ Signature introspected 21 Sep 2026 rather than guessed:
 *
 *   duplicate_board(board_id: ID!, board_name: String,
 *                   duplicate_type: DuplicateBoardType!, folder_id: ID,
 *                   keep_subscribers: Boolean, workspace_id: ID): BoardDuplication
 *   BoardDuplication  { board: Board!, is_async: Boolean! }
 *   DuplicateBoardType = duplicate_board_with_pulses
 *                      | duplicate_board_with_pulses_and_updates
 *                      | duplicate_board_with_structure
 *
 * `duplicate_board_with_structure` is the one used here: structure only, no
 * items. It is both what a customer duplicating a template does and the only
 * variant consistent with a product that never reads item data.
 */

import { MondayClient } from '../src/api/client.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = arg('board');

  if (!token || !boardId) {
    console.error('Usage: MONDAY_API_TOKEN=... npx tsx scripts/make-test-duplicate.ts --board <id> [--name "..."]');
    process.exit(2);
  }

  const client = new MondayClient({ token });
  const name = arg('name');

  console.log(`\nDuplicating board ${boardId} (structure only, no items)…`);

  const { data, errors } = await client.request<{
    duplicate_board?: { is_async: boolean; board: { id: string; name: string } } | null;
  }>(
    `mutation TemplateGuardMakeTestDuplicate($boardId: ID!, $name: String) {
       duplicate_board(
         board_id: $boardId
         duplicate_type: duplicate_board_with_structure
         board_name: $name
       ) {
         is_async
         board { id name }
       }
     }`,
    { boardId, name: name ?? null },
  );

  if (errors.length > 0 || !data?.duplicate_board) {
    console.error(`Failed: ${errors.map((e) => e.message).join(' | ') || 'no board returned'}`);
    process.exit(1);
  }

  const { board, is_async } = data.duplicate_board;
  console.log(`\n✓ Created board ${board.id} — "${board.name}"`);
  if (is_async) {
    // monday may still be building it. Comparing too early would read a
    // half-populated board and report findings that are timing, not drift —
    // the false-positive class this product cannot afford.
    console.log(
      '\n⚠ monday reports this duplication as asynchronous. Give it a few seconds\n  before comparing, or the copy may still be filling in and the diff will\n  report findings that are timing rather than drift.',
    );
  }
  console.log(`\nNext:\n  npm run verify:live -- --board ${boardId} --compare-to ${board.id} --automations\n`);
}

main().catch((err: unknown) => {
  console.error('\nCould not duplicate the board:', err instanceof Error ? err.message : err);
  process.exit(2);
});
