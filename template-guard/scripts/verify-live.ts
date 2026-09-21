/**
 * Verifies the `✱` claims against a real monday account.
 *
 * Everything in this repository was built from indexed documentation, because
 * `developer.monday.com` was unreachable from the build environment. Five
 * claims are therefore marked `✱` — believed, not observed. This script
 * observes them.
 *
 * It is read-only. It issues no mutation, fetches no items, and prints no
 * board content beyond column titles and types. Point it at a board you own.
 *
 *   MONDAY_API_TOKEN=... npx tsx scripts/verify-live.ts --list-boards
 *   MONDAY_API_TOKEN=... npx tsx scripts/verify-live.ts --board 1234567890
 *
 * Run `--list-boards` first. It prints every board with its id and says which
 * ones are worth testing against — a run that reports SKIPPED has verified
 * nothing, and the commonest reason for that is pointing at a board with no
 * connect column.
 *
 * Add `--automations` to also exercise the preview schema, and
 * `--connect-board <id>` to name a board a connect column should point at.
 *
 * The output is a table of VERIFIED / FAILED / SKIPPED with the *observed*
 * shape printed next to each claim, so a failure tells you what to change
 * rather than only that something is wrong. Exit code is non-zero if any
 * check failed, so this can gate a release.
 */

import { MondayClient } from '../src/api/client.js';
import { MONDAY_API_PREVIEW_VERSION, MONDAY_API_VERSION } from '../src/api/version.js';
import { BOARD_CONFIG_QUERY, BOARD_LIST_PAGE_LIMIT, BOARD_LIST_QUERY } from '../src/api/queries.js';
import { readBoardAutomations } from '../src/api/preview/automations.js';
import { parseSettings } from '../src/snapshot/capture.js';
import { isBoardReferencing, linkedBoardIds } from '../src/diff/connect.js';
import type { PartialFailure } from '../src/api/errors.js';
import type { ColumnSnapshot } from '../src/snapshot/types.js';

type Status = 'VERIFIED' | 'FAILED' | 'SKIPPED';

interface CheckResult {
  id: string;
  claim: string;
  status: Status;
  observed: string;
  /** What to do about it, when it failed. */
  action?: string;
}

const results: CheckResult[] = [];

function record(r: CheckResult): void {
  results.push(r);
  const mark = r.status === 'VERIFIED' ? '✓' : r.status === 'FAILED' ? '✗' : '–';
  console.log(`${mark} ${r.id}  ${r.status}`);
  console.log(`    claim:    ${r.claim}`);
  console.log(`    observed: ${r.observed}`);
  // Only on a failure. Printing "here is how to fix it" under a ✓ made the
  // first live run read as though a passing check still needed work.
  if (r.action && r.status !== 'VERIFIED') console.log(`    action:   ${r.action}`);
  console.log();
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Unwraps whatever a PartialFailure's `cause` turned out to be. */
function describeCause(cause: unknown): string {
  if (cause == null) return '';
  if (Array.isArray(cause)) {
    return cause
      .map((e) => {
        const err = e as { message?: string; extensions?: { code?: string } };
        return err?.message ? `${err.message}${err.extensions?.code ? ` [${err.extensions.code}]` : ''}` : JSON.stringify(e);
      })
      .join(' | ');
  }
  if (cause instanceof Error) return cause.message;
  return typeof cause === 'string' ? cause : JSON.stringify(cause);
}

function truncate(value: unknown, max = 400): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text == null) return String(value);
  return text.length > max ? `${text.slice(0, max)}… (${text.length} chars)` : text;
}

/**
 * Lists the boards this token can see and says which are worth testing with.
 *
 * The first run of this script usually ends in SKIPPED checks, because the
 * board it was pointed at has no connect column — and a SKIPPED check is not
 * a pass. Rather than explaining that in a README nobody reads at the right
 * moment, this finds the right board and prints the exact next command.
 */
async function listBoards(client: MondayClient): Promise<void> {
  const { data, errors } = await client.request<{
    boards: { id: string; name: string; board_kind?: string }[] | null;
  }>(BOARD_LIST_QUERY, { limit: BOARD_LIST_PAGE_LIMIT, page: 1 });

  if (errors.length > 0 || !data?.boards) {
    console.error('Could not list boards:', errors.map((e) => e.message).join(' | ') || 'no data');
    process.exit(2);
  }

  const boards = data.boards;
  console.log(`\n${boards.length} board(s) this token can see.\n`);

  // One config read for all of them, batched, so this stays a cheap call even
  // on an account with a hundred boards.
  const ids = boards.map((b) => String(b.id));
  const detail = new Map<string, { connects: string[]; columns: number }>();

  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const res = await client.request<{
      boards: { id: string; columns?: { title: string; type: string }[] | null }[] | null;
    }>(BOARD_CONFIG_QUERY, { ids: batch });

    for (const board of res.data?.boards ?? []) {
      const columns = board.columns ?? [];
      detail.set(String(board.id), {
        columns: columns.length,
        connects: columns
          .filter((c) => ['board_relation', 'mirror', 'dependency'].includes(c.type))
          .map((c) => `${c.title} (${c.type})`),
      });
    }
  }

  const usable: string[] = [];
  for (const board of boards) {
    const id = String(board.id);
    const info = detail.get(id);
    const connects = info?.connects ?? [];
    const mark = connects.length > 0 ? '★' : ' ';
    if (connects.length > 0) usable.push(id);

    console.log(`${mark} ${id}  ${board.name}`);
    console.log(`     ${info?.columns ?? 0} columns${connects.length > 0 ? ` · connect: ${connects.join(', ')}` : ' · no connect column'}`);
  }

  console.log('\n★ = has a connect column, which is the claim that matters most.\n');

  if (usable.length === 0) {
    console.log(
      'None of these can verify the important claim. Add a Connect Boards column to any\nboard, point it at another board, and run this again — that one column is what the\nwhole mis-wiring detector reads.',
    );
  } else {
    console.log('Next:\n');
    console.log(
      `  MONDAY_API_TOKEN=... npx tsx scripts/verify-live.ts --board ${usable[0]} --automations`,
    );
    console.log(
      '\nAdd --connect-board <id> with the board that column should point at, and the\nscript will also confirm it is pointing at the right one.',
    );
  }
}

/**
 * Asks monday's own schema which automation-related fields exist.
 *
 * Two hypotheses about ✱4 have now failed — the pinned version header, then
 * the `dev` header. Hard rule 1 says stop guessing at this point: introspection
 * turns "what should we try next" into "what is actually there".
 *
 * Runs against both the pinned version and the dev schema, because the
 * difference between the two answers is itself the finding.
 */
async function probePreview(token: string): Promise<void> {
  const INTROSPECT = `query { __schema { queryType { fields { name description } } } }`;

  for (const version of [MONDAY_API_VERSION, MONDAY_API_PREVIEW_VERSION]) {
    console.log(`\n── API-Version: ${version} ──`);
    const client = new MondayClient({ token, apiVersion: version });

    const { data, errors } = await client.request<{
      __schema?: { queryType?: { fields?: { name: string; description?: string | null }[] } };
    }>(INTROSPECT, {}, version);

    if (errors.length > 0) {
      console.log(`  introspection refused: ${errors.map((e) => e.message).join(' | ')}`);
      continue;
    }

    const fields = data?.__schema?.queryType?.fields ?? [];
    if (fields.length === 0) {
      console.log('  introspection returned no root fields (it may be disabled).');
      continue;
    }

    const matches = fields.filter((f) => /automat|recipe|workflow/i.test(f.name));
    console.log(`  ${fields.length} root fields; ${matches.length} mention automation/recipe/workflow:`);
    for (const f of matches) {
      console.log(`    · ${f.name}${f.description ? ` — ${f.description.split('\n')[0]}` : ''}`);
    }
    if (matches.length === 0) {
      console.log('    (none — this schema exposes no automation read at all)');
    }
  }

  console.log(
    '\nIf a field exists under one version and not the other, that is the answer.\nIf it exists nowhere, automations are not readable by this token and the\nfeature flag stays off — which the product is already built to handle.\n',
  );

  // The field existing is not the same as knowing how to call it. Two guesses
  // have already been spent; this reads the signature instead of inventing a
  // third.
  await probeField(token, 'board_automations');
}

/** A type reference, unwrapped through NON_NULL and LIST layers. */
interface TypeRef {
  kind: string;
  name: string | null;
  ofType?: TypeRef | null;
}

function typeName(t: TypeRef | null | undefined): string {
  if (!t) return '?';
  if (t.name) return t.kind === 'NON_NULL' ? `${t.name}!` : t.name;
  const inner = typeName(t.ofType);
  if (t.kind === 'NON_NULL') return `${inner}!`;
  if (t.kind === 'LIST') return `[${inner}]`;
  return inner;
}

/** The bare type name, with NON_NULL/LIST wrappers stripped. */
function bareTypeName(t: TypeRef | null | undefined): string | null {
  if (!t) return null;
  return t.name ?? bareTypeName(t.ofType);
}

const TYPE_REF = `kind name ofType { kind name ofType { kind name ofType { kind name } } }`;

/**
 * Prints a root field's exact arguments and its return shape.
 *
 * This is the disciplined alternative to a third guess: monday's own schema
 * states the signature, so the query gets written from that rather than from
 * a description sentence that says "filter by ids or board_ids" without
 * saying what either one is.
 */
async function probeField(token: string, fieldName: string): Promise<void> {
  const client = new MondayClient({ token, apiVersion: MONDAY_API_PREVIEW_VERSION });

  const { data, errors } = await client.request<{
    __type?: {
      fields?: {
        name: string;
        args: { name: string; type: TypeRef; defaultValue?: string | null }[];
        type: TypeRef;
      }[];
    };
  }>(
    `query { __type(name: "Query") { fields { name args { name defaultValue type { ${TYPE_REF} } } type { ${TYPE_REF} } } } }`,
    {},
    MONDAY_API_PREVIEW_VERSION,
  );

  if (errors.length > 0) {
    console.log(`Could not read the signature of ${fieldName}: ${errors.map((e) => e.message).join(' | ')}`);
    return;
  }

  const field = (data?.__type?.fields ?? []).find((f) => f.name === fieldName);
  if (!field) {
    console.log(`${fieldName} is not a root field on the dev schema after all.`);
    return;
  }

  console.log(`── ${fieldName}, exactly as the schema declares it ──\n`);
  console.log(`  returns: ${typeName(field.type)}`);
  console.log(`  arguments:`);
  for (const a of field.args) {
    console.log(`    · ${a.name}: ${typeName(a.type)}${a.defaultValue ? ` = ${a.defaultValue}` : ''}`);
  }
  if (field.args.length === 0) console.log('    (none)');

  const returnType = bareTypeName(field.type);
  if (!returnType) return;

  const shape = await client.request<{
    __type?: { name: string; fields?: { name: string; type: TypeRef }[] };
  }>(`query($n:String!){ __type(name:$n){ name fields { name type { ${TYPE_REF} } } } }`, { n: returnType }, MONDAY_API_PREVIEW_VERSION);

  const fields = shape.data?.__type?.fields ?? [];
  if (fields.length > 0) {
    console.log(`\n  ${returnType} has:`);
    for (const f of fields) console.log(`    · ${f.name}: ${typeName(f.type)}`);

    // One more level for whichever field carries the automations themselves.
    const listField = fields.find((f) => /automation|item|node|record/i.test(f.name));
    const nested = listField ? bareTypeName(listField.type) : null;
    if (nested && nested !== returnType) {
      const deep = await client.request<{
        __type?: { name: string; fields?: { name: string; type: TypeRef }[] };
      }>(`query($n:String!){ __type(name:$n){ name fields { name type { ${TYPE_REF} } } } }`, { n: nested }, MONDAY_API_PREVIEW_VERSION);

      const deepFields = deep.data?.__type?.fields ?? [];
      if (deepFields.length > 0) {
        console.log(`\n  ${nested} has:`);
        for (const f of deepFields) console.log(`    · ${f.name}: ${typeName(f.type)}`);
      }
    }
  }
  console.log();
}

async function main(): Promise<void> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = arg('board');
  const wantsList = process.argv.includes('--list-boards');
  const wantsProbe = process.argv.includes('--probe-preview');

  if (!token) {
    console.error(
      'Set MONDAY_API_TOKEN. In monday: your avatar (bottom left) → Developers → My Access Tokens.\nAn account admin can also find one under Administration → Connections → API.',
    );
    process.exit(2);
  }

  if (wantsList) {
    await listBoards(new MondayClient({ token }));
    process.exit(0);
  }

  if (wantsProbe) {
    await probePreview(token);
    process.exit(0);
  }

  if (!boardId) {
    console.error(
      'Usage:\n  MONDAY_API_TOKEN=... npx tsx scripts/verify-live.ts --list-boards\n  MONDAY_API_TOKEN=... npx tsx scripts/verify-live.ts --board <boardId> [--automations] [--connect-board <boardId>]\n\nStart with --list-boards: it picks the right board for you.',
    );
    process.exit(2);
  }

  const client = new MondayClient({ token });
  console.log(`\nTemplate Guard live verification`);
  console.log(`API version: ${MONDAY_API_VERSION}   board: ${boardId}\n`);

  // --- ✱1 — the typed `settings` object exists on columns ------------------

  const { data, errors } = await client.request<{
    boards: { id: string; name: string; columns?: unknown[] | null }[] | null;
  }>(BOARD_CONFIG_QUERY, { ids: [boardId] });

  if (errors.length > 0) {
    record({
      id: '✱0',
      claim: 'BOARD_CONFIG_QUERY is valid against the pinned API version.',
      status: 'FAILED',
      observed: errors.map((e) => e.message).join(' | '),
      action:
        'A field in src/api/queries.ts is wrong or has been removed in this API version. The error message names it.',
    });
    finish();
    return;
  }

  const board = data?.boards?.[0];
  if (!board) {
    record({
      id: '✱0',
      claim: 'The board is readable with this token.',
      status: 'FAILED',
      observed: 'monday returned no board for that id.',
      action: 'Check the board id and that the token can see it.',
    });
    finish();
    return;
  }

  record({
    id: '✱0',
    claim: 'BOARD_CONFIG_QUERY is valid against the pinned API version.',
    status: 'VERIFIED',
    observed: `Read "${board.name}" with ${board.columns?.length ?? 0} columns.`,
  });

  const rawColumns = (board.columns ?? []) as {
    id: string;
    title: string;
    type: string;
    settings?: unknown;
    settings_str?: string | null;
  }[];

  const withTypedSettings = rawColumns.filter((c) => c.settings != null);
  record({
    id: '✱1',
    claim: 'Columns expose a typed `settings` object (settings_str was deprecated in 2025-10).',
    status: withTypedSettings.length > 0 ? 'VERIFIED' : 'FAILED',
    observed:
      withTypedSettings.length > 0
        ? `${withTypedSettings.length}/${rawColumns.length} columns returned a non-null \`settings\`. Example (${withTypedSettings[0]!.type}): ${truncate(withTypedSettings[0]!.settings)}`
        : `No column returned \`settings\`. settings_str present on ${rawColumns.filter((c) => c.settings_str).length}/${rawColumns.length}.`,
    action:
      withTypedSettings.length > 0
        ? undefined
        : 'Snapshots will fall back to the deprecated settings_str path. Check whether `settings` needs a different selection set in COLUMN_FIELDS.',
  });

  // --- ✱2 — which settings key holds linked board IDs ----------------------
  //
  // The most dangerous unknown in the codebase. Guessing wrong does not throw;
  // it reports every board as correctly wired.

  const connectColumns: ColumnSnapshot[] = rawColumns
    .filter((c) => c.type === 'board_relation' || c.type === 'mirror' || c.type === 'dependency')
    .map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      description: null,
      archived: false,
      width: null,
      settings: parseSettings(c.settings) ?? parseSettings(c.settings_str) ?? {},
      settingsFromDeprecatedField: c.settings == null,
    }));

  if (connectColumns.length === 0) {
    record({
      id: '✱2',
      claim: 'linkedBoardIds() reads the settings key that holds linked board IDs.',
      status: 'SKIPPED',
      observed: 'This board has no board_relation, mirror or dependency column.',
      action:
        'Re-run against a board that has a connect column. This is the highest-priority claim — guessing the key wrong reports every board as correctly wired.',
    });
  } else {
    for (const column of connectColumns) {
      const ids = linkedBoardIds(column);
      record({
        id: `✱2 (${column.type} "${column.title}")`,
        claim: 'linkedBoardIds() finds the board IDs this column points at.',
        status: ids && ids.length > 0 ? 'VERIFIED' : 'FAILED',
        observed:
          ids && ids.length > 0
            ? `Found ${ids.join(', ')}. Raw settings: ${truncate(column.settings)}`
            : `Returned ${ids === null ? 'null (understood nothing)' : '[] (no ids)'}. Raw settings: ${truncate(column.settings)}`,
        action:
          ids && ids.length > 0
            ? undefined
            : 'Add the real key to BOARD_ID_KEYS in src/diff/connect.ts. The raw settings above name it. Nothing else in the app matters more than this.',
      });

      const expected = arg('connect-board');
      if (expected && ids) {
        record({
          id: `✱2b ("${column.title}")`,
          claim: `The column points at board ${expected}, as you stated.`,
          status: ids.includes(expected) ? 'VERIFIED' : 'FAILED',
          observed: `Points at ${ids.join(', ')}.`,
          action: ids.includes(expected)
            ? undefined
            : 'Either the board id you passed is wrong, or this column really is mis-wired — which would make this script the product working.',
        });
      }
    }

    record({
      id: '✱2c',
      claim: 'isBoardReferencing() recognises every board-referencing column type on this board.',
      status: connectColumns.every(isBoardReferencing) ? 'VERIFIED' : 'FAILED',
      observed: connectColumns
        .map((c) => `${c.type}:${isBoardReferencing(c) ? 'yes' : 'NO'}`)
        .join(', '),
      action: 'Add the unrecognised type to the list in src/diff/connect.ts.',
    });
  }

  // --- ✱3 — owners and subscribers, now inside the config query ------------

  const rawBoard = board as { owners?: unknown[]; subscribers?: unknown[] };
  const hasPeopleFields = 'owners' in rawBoard || 'subscribers' in rawBoard;

  record({
    id: '✱3',
    claim:
      '`owners` and `subscribers` are selectable inside BOARD_CONFIG_QUERY with no arguments (they reject limit/page).',
    status: hasPeopleFields ? 'VERIFIED' : 'FAILED',
    observed: hasPeopleFields
      ? `owners: ${rawBoard.owners?.length ?? 0}, subscribers: ${rawBoard.subscribers?.length ?? 0} — one request per board, not two.`
      : 'The config query returned neither field.',
    action:
      'The fields moved or need different selection. They are not read by the diff, so this degrades permissions data only.',
  });

  // --- ✱4 — the preview automations schema, opt-in -------------------------

  if (arg('automations') !== undefined || process.argv.includes('--automations')) {
    const failures: PartialFailure[] = [];
    const automations = await readBoardAutomations(client, boardId, failures);

    if (automations === null) {
      // The underlying GraphQL error, not our user-facing wrapper.
      //
      // The first two live runs printed only `message` — the sentence written
      // for a customer — and so hid the one thing a developer needs. A
      // PartialFailure carries `cause` precisely for this, and nothing was
      // reading it. Fixed here rather than argued about.
      const causes = failures
        .map((f) => describeCause(f.cause))
        .filter((c) => c.length > 0)
        .join(' | ');

      record({
        id: '✱4',
        claim: '`board_automations` is readable on the dev (preview) schema.',
        status: 'FAILED',
        observed: causes || failures.map((f) => `${f.kind}: ${f.message}`).join(' | ') || 'Returned null with no recorded failure.',
        action:
          'Run with --probe-preview to ask the schema itself which automation fields exist, instead of guessing again.',
      });
    } else {
      record({
        id: '✱4',
        claim: '`board_automations` is readable on the dev (preview) schema.',
        status: 'VERIFIED',
        observed: `Read ${automations.length} automation(s).`,
      });

      // The high-value unknown: is the recipe body structured enough to diff
      // field by field, or only countable?
      const sample = automations[0];
      if (!sample) {
        record({
          id: '✱5',
          claim: 'The recipe body is structured JSON, so automation diffing is real rather than presence-counting.',
          status: 'SKIPPED',
          observed: 'This board has no automations to sample.',
          action: 'Re-run against a board with an automation on it.',
        });
      } else {
        const structured =
          sample.workflowBlocks !== null && typeof sample.workflowBlocks === 'object';
        record({
          id: '✱5',
          claim: '`workflow_blocks` is a structured recipe graph, not an opaque string.',
          status: structured ? 'VERIFIED' : 'FAILED',
          observed: `"${sample.title}" (active: ${sample.isActive}${sample.templateReferenceId ? `, from template ${sample.templateReferenceId}` : ''}) — workflow_blocks typeof ${typeof sample.workflowBlocks}: ${truncate(sample.workflowBlocks)}`,
          action:
            'Opaque after all: automation diffing falls back to presence and title comparison, which still catches the documented 44→39 case.',
        });

        record({
          id: '✱6',
          claim: 'Board and column ids live in `workflow_variables`, not in `workflow_blocks`.',
          status: 'SKIPPED',
          observed: `workflow_variables (where the board and column ids actually live): ${truncate(sample.workflowVariables, 2000)}`,
          action:
            'A human reads this one. Look for this board id inside the variables — that is what a duplicated copy fails to rewrite, and what automation.miswired scans for.',
        });
      }
    }
  } else {
    record({
      id: '✱4/✱5',
      claim: 'The preview automations schema and the shape of `configuration`.',
      status: 'SKIPPED',
      observed: 'Not requested.',
      action: 'Re-run with --automations against a board that has automations.',
    });
  }

  finish();
}

function finish(): void {
  const failed = results.filter((r) => r.status === 'FAILED');
  const skipped = results.filter((r) => r.status === 'SKIPPED');

  console.log('─'.repeat(72));
  console.log(
    `${results.filter((r) => r.status === 'VERIFIED').length} verified · ${failed.length} failed · ${skipped.length} skipped`,
  );

  if (failed.length > 0) {
    console.log('\nFailed checks, in the order they matter:');
    for (const f of failed) console.log(`  ✗ ${f.id} — ${f.action ?? f.observed}`);
  }
  if (skipped.length > 0) {
    console.log('\nSkipped checks are not passes. A claim you did not test is still a guess.');
  }

  // Non-zero on failure so this can gate a release rather than be read
  // optimistically at the end of a long log.
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('\nVerification could not run:', err instanceof Error ? err.message : err);
  process.exit(2);
});
