/**
 * Effective-permission derivation.
 *
 * monday.com permissions stack in three layers — account role, workspace
 * membership, board subscription — and a user's real access is the combination.
 * Auditing that by hand across hundreds of boards is impractical, which is the
 * whole reason this product exists.
 *
 * Every assumption about monday's semantics lives in POLICY below, in ONE place,
 * so that correcting a wrong assumption is a one-line change rather than a hunt
 * through the codebase. Each flag is cross-referenced in docs/API-VERIFICATION.md.
 */

/** Access levels, ordered weakest to strongest. */
export const LEVELS = ['none', 'view', 'edit', 'own'];

export function rank(level) {
  return LEVELS.indexOf(level);
}

/**
 * Assumptions about how monday resolves permissions.
 *
 * UNVERIFIED — see docs/API-VERIFICATION.md section 3. These are modelled from
 * monday's public documentation and consultant write-ups, not from a live
 * account. Confirm each one before the numbers in a customer-facing report can
 * be trusted.
 */
export const POLICY = {
  /** Account admins reach boards they are not subscribed to. */
  adminsBypassBoardPermissions: true,
  /** ...but private boards stay private, even from admins. */
  adminsSeePrivateBoards: false,
  /** A "main" board is visible to everyone who can see its workspace. */
  openWorkspaceGrantsBoardAccess: true,
  /** Guests never inherit workspace-level access; they need explicit sharing. */
  guestsRequireExplicitBoardAccess: true,
  /** Guests can only ever be added to shareable boards. */
  guestsOnlyOnShareableBoards: true,
};

/**
 * Resolve one user's real access to one board.
 *
 * Returns both the level and the reason, because the reason is what makes the
 * report actionable: "can edit, via open workspace" is a different problem from
 * "can edit, explicitly added".
 */
export function deriveAccess(user, board, workspace, policy = POLICY) {
  const deny = (reason) => ({ level: 'none', reason });
  const allow = (level, reason) => ({ level, reason });

  if (!user.enabled) return deny('account deactivated');
  if (board.state !== 'active') return deny(`board is ${board.state}`);

  const isOwner = board.owners.includes(user.id);
  const isSubscriber = isOwner || board.subscribers.includes(user.id);
  const inWorkspace =
    workspace?.kind === 'open' || (workspace?.memberIds ?? []).includes(user.id);

  // Ownership is the strongest signal and outranks everything else.
  if (isOwner) return allow('own', 'board owner');

  if (user.isGuest) {
    if (policy.guestsOnlyOnShareableBoards && board.boardKind !== 'share') {
      return deny('guest, board is not shareable');
    }
    if (policy.guestsRequireExplicitBoardAccess && !isSubscriber) {
      return deny('guest without explicit access');
    }
    return allow(user.isViewOnly ? 'view' : 'edit', 'guest, explicitly shared');
  }

  if (user.isAdmin && policy.adminsBypassBoardPermissions) {
    if (board.boardKind === 'private' && !isSubscriber) {
      return policy.adminsSeePrivateBoards
        ? allow('view', 'account admin (private board)')
        : deny('private board, admin not subscribed');
    }
    return allow(user.isViewOnly ? 'view' : 'edit', 'account admin');
  }

  if (isSubscriber) {
    return allow(user.isViewOnly ? 'view' : 'edit', 'explicit subscriber');
  }

  if (
    board.boardKind === 'public' &&
    policy.openWorkspaceGrantsBoardAccess &&
    inWorkspace
  ) {
    return allow(
      user.isViewOnly ? 'view' : 'edit',
      workspace.kind === 'open' ? 'open workspace' : 'workspace member',
    );
  }

  return deny('no path to this board');
}

/**
 * Full access matrix for a snapshot.
 *
 * Only non-'none' entries are kept — on a real account the matrix is mostly
 * empty, and materialising every zero would dwarf the findings.
 */
export function buildAccessMatrix(snapshot, policy = POLICY) {
  const workspaces = new Map(snapshot.workspaces.map((w) => [w.id, w]));
  const rows = [];

  for (const board of snapshot.boards) {
    const workspace = workspaces.get(board.workspaceId);
    for (const user of snapshot.users) {
      const { level, reason } = deriveAccess(user, board, workspace, policy);
      if (level === 'none') continue;
      rows.push({
        userId: user.id,
        userName: user.name,
        boardId: board.id,
        boardName: board.name,
        workspaceId: board.workspaceId,
        level,
        reason,
      });
    }
  }
  return rows;
}
