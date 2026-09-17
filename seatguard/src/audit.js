/**
 * Audit orchestrator: snapshot in, report out.
 *
 * The snapshot is a plain object with no monday types in it. That boundary is
 * deliberate — the rules never touch the API, so they stay testable and the API
 * client can be replaced without rewriting the analysis.
 */
import { buildAccessMatrix, POLICY } from './permissions.js';
import { ALL_RULES, DEFAULTS, isBillable } from './rules.js';

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

/** Shape check with useful errors, because a bad snapshot should say so. */
export function validateSnapshot(snapshot) {
  const problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); };

  need(snapshot && typeof snapshot === 'object', 'snapshot must be an object');
  if (problems.length) return problems;

  need(snapshot.account?.name, 'account.name is required');
  for (const key of ['users', 'boards', 'workspaces']) {
    need(Array.isArray(snapshot[key]), `${key} must be an array`);
  }
  if (problems.length) return problems;

  const workspaceIds = new Set(snapshot.workspaces.map((w) => w.id));
  const userIds = new Set(snapshot.users.map((u) => u.id));

  for (const board of snapshot.boards) {
    need(board.id != null, 'every board needs an id');
    need(
      workspaceIds.has(board.workspaceId),
      `board ${board.id} references unknown workspace ${board.workspaceId}`,
    );
    for (const owner of board.owners ?? []) {
      need(userIds.has(owner), `board ${board.id} has unknown owner ${owner}`);
    }
  }
  return problems;
}

export function audit(snapshot, options = {}) {
  const problems = validateSnapshot(snapshot);
  if (problems.length) {
    throw new Error(`Invalid snapshot:\n  - ${problems.join('\n  - ')}`);
  }

  const opt = { ...DEFAULTS, ...options };
  const now = options.now ?? Date.now();
  const policy = options.policy ?? POLICY;

  const matrix = buildAccessMatrix(snapshot, policy);

  const findings = ALL_RULES
    .flatMap((rule) => rule(snapshot, matrix, opt, now))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const billableSeats = snapshot.users.filter(isBillable).length;
  const price = snapshot.account.seatPriceUsd ?? 0;
  const monthlySavingsUsd = findings.reduce(
    (sum, f) => sum + (f.monthlySavingsUsd ?? 0),
    0,
  );

  return {
    account: snapshot.account,
    generatedAt: new Date(now).toISOString(),
    snapshotAt: snapshot.fetchedAt ?? null,
    totals: {
      users: snapshot.users.length,
      billableSeats,
      monthlySeatCostUsd: billableSeats * price,
      boards: snapshot.boards.length,
      workspaces: snapshot.workspaces.length,
      accessGrants: matrix.length,
    },
    monthlySavingsUsd,
    annualSavingsUsd: monthlySavingsUsd * 12,
    findings,
    matrix,
  };
}
