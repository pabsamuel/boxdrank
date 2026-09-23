/**
 * Audit rules.
 *
 * Each rule is a pure function: (snapshot, matrix, options) -> Finding[].
 * Pure because that is what makes them testable without a monday account, and
 * testable-without-an-account is what let this engine ship before the API
 * wiring existed.
 *
 * A Finding is:
 *   { rule, severity, title, detail, subjects[], monthlySavingsUsd? }
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULTS = {
  /** No activity for this long and the seat is a reclaim candidate. */
  dormantDays: 45,
  /** Invitation never accepted after this long. */
  stalePendingDays: 30,
  /** More owners than this on one board is owner sprawl. */
  maxBoardOwners: 2,
  /** More account admins than this is admin sprawl. */
  maxAdmins: 3,
  /** A board untouched this long is a cleanup candidate. */
  staleBoardDays: 180,
  /** One guest reaching more boards than this is over-shared. */
  maxBoardsPerGuest: 5,
};

function daysSince(iso, now) {
  if (!iso) return Infinity;
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

/** A user who occupies a billable seat. Guests and deactivated users do not. */
export function isBillable(user) {
  return user.enabled && !user.isGuest && !user.isPending;
}

/**
 * Dormant seats — the finding that pays for the product.
 *
 * Seats are billable whether or not anyone logs in, so every dormant seat is a
 * standing monthly charge for nothing.
 */
export function dormantSeats(snapshot, _matrix, opt = DEFAULTS, now = Date.now()) {
  const price = snapshot.account.seatPriceUsd ?? 0;
  const subjects = snapshot.users
    .filter(isBillable)
    .map((u) => ({ ...u, idleDays: daysSince(u.lastActivity, now) }))
    .filter((u) => u.idleDays >= opt.dormantDays)
    .sort((a, b) => b.idleDays - a.idleDays)
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      note:
        u.idleDays === Infinity
          ? 'never active'
          : `idle ${u.idleDays} days`,
    }));

  if (subjects.length === 0) return [];

  return [
    {
      rule: 'dormant-seats',
      severity: 'high',
      title: `${subjects.length} billable seat${subjects.length > 1 ? 's' : ''} with no recent activity`,
      detail:
        `No activity in ${opt.dormantDays}+ days. Seats bill regardless of use, ` +
        `so each one is a recurring charge for an account nobody opens.`,
      subjects,
      monthlySavingsUsd: subjects.length * price,
    },
  ];
}

/** Invitations that were never accepted but still clutter the account. */
export function stalePendingInvites(snapshot, _matrix, opt = DEFAULTS, now = Date.now()) {
  const subjects = snapshot.users
    .filter((u) => u.isPending && daysSince(u.createdAt, now) >= opt.stalePendingDays)
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      note: `invited ${daysSince(u.createdAt, now)} days ago, never accepted`,
    }));

  if (subjects.length === 0) return [];

  return [
    {
      rule: 'stale-pending-invites',
      severity: 'low',
      title: `${subjects.length} invitation${subjects.length > 1 ? 's' : ''} never accepted`,
      detail:
        'Whether pending users consume a billable seat depends on the plan — ' +
        'confirm against the account before counting these as savings.',
      subjects,
    },
  ];
}

/**
 * Owner sprawl. Board owners bypass board permissions, so every extra owner is
 * an extra person who can change anything. Consultants routinely find boards
 * with 8-10 owners where one or two were intended.
 */
export function overOwnedBoards(snapshot, _matrix, opt = DEFAULTS) {
  const subjects = snapshot.boards
    .filter((b) => b.state === 'active' && b.owners.length > opt.maxBoardOwners)
    .sort((a, b) => b.owners.length - a.owners.length)
    .map((b) => ({
      id: b.id,
      name: b.name,
      note: `${b.owners.length} owners`,
    }));

  if (subjects.length === 0) return [];

  return [
    {
      rule: 'over-owned-boards',
      severity: 'medium',
      title: `${subjects.length} board${subjects.length > 1 ? 's' : ''} with more than ${opt.maxBoardOwners} owners`,
      detail:
        'Board owners bypass board-level permissions. Every extra owner is ' +
        'another person who can change structure, permissions and automations.',
      subjects,
    },
  ];
}

/** Boards whose owners are all gone — nobody is accountable for them. */
export function orphanedBoards(snapshot, _matrix) {
  const byId = new Map(snapshot.users.map((u) => [u.id, u]));
  const subjects = snapshot.boards
    .filter((b) => b.state === 'active')
    .filter((b) => b.owners.every((id) => !byId.get(id)?.enabled))
    .map((b) => ({
      id: b.id,
      name: b.name,
      note: b.owners.length === 0 ? 'no owner' : 'all owners deactivated',
    }));

  if (subjects.length === 0) return [];

  return [
    {
      rule: 'orphaned-boards',
      severity: 'high',
      title: `${subjects.length} board${subjects.length > 1 ? 's' : ''} with no active owner`,
      detail:
        'Nobody can administer these boards. When something breaks on one, ' +
        'there is no owner to fix it and no obvious person to ask.',
      subjects,
    },
  ];
}

/** Abandoned boards holding data nobody has touched in months. */
export function staleBoards(snapshot, _matrix, opt = DEFAULTS, now = Date.now()) {
  const subjects = snapshot.boards
    .filter(
      (b) =>
        b.state === 'active' &&
        b.itemCount > 0 &&
        daysSince(b.updatedAt, now) >= opt.staleBoardDays,
    )
    .sort((a, b) => daysSince(a.updatedAt, now) - daysSince(b.updatedAt, now))
    .reverse()
    .map((b) => ({
      id: b.id,
      name: b.name,
      note: `${b.itemCount} items, untouched ${daysSince(b.updatedAt, now)} days`,
    }));

  if (subjects.length === 0) return [];

  return [
    {
      rule: 'stale-boards',
      severity: 'low',
      title: `${subjects.length} board${subjects.length > 1 ? 's' : ''} untouched for ${opt.staleBoardDays}+ days`,
      detail: 'Archive candidates. Archiving keeps the data and shortens every board list.',
      subjects,
    },
  ];
}

/** Too many account admins — the widest blast radius in the account. */
export function adminSprawl(snapshot, _matrix, opt = DEFAULTS) {
  const admins = snapshot.users.filter((u) => u.enabled && u.isAdmin);
  if (admins.length <= opt.maxAdmins) return [];

  return [
    {
      rule: 'admin-sprawl',
      severity: 'medium',
      title: `${admins.length} account admins`,
      detail:
        `More than ${opt.maxAdmins} people hold full account control, including ` +
        'billing, user management and every board an admin can reach.',
      subjects: admins.map((u) => ({ id: u.id, name: u.name, email: u.email, note: 'admin' })),
    },
  ];
}

/**
 * Guests reaching more than they should.
 *
 * This is the finding that gets a security-minded admin's attention: external
 * people, still active, still able to open client work.
 */
export function guestExposure(snapshot, matrix, opt = DEFAULTS) {
  const guests = snapshot.users.filter((u) => u.enabled && u.isGuest);
  const perGuest = new Map();
  for (const row of matrix) {
    if (!guests.some((g) => g.id === row.userId)) continue;
    if (!perGuest.has(row.userId)) perGuest.set(row.userId, []);
    perGuest.get(row.userId).push(row);
  }

  const subjects = [];
  for (const guest of guests) {
    const rows = perGuest.get(guest.id) ?? [];
    if (rows.length > opt.maxBoardsPerGuest) {
      subjects.push({
        id: guest.id,
        name: guest.name,
        email: guest.email,
        note: `reaches ${rows.length} boards`,
      });
    }
  }

  if (subjects.length === 0) return [];

  return [
    {
      rule: 'guest-exposure',
      severity: 'high',
      title: `${subjects.length} guest${subjects.length > 1 ? 's' : ''} with access to more than ${opt.maxBoardsPerGuest} boards`,
      detail:
        'External users accumulate board access as projects come and go, and ' +
        'nothing removes it when the project ends.',
      subjects,
    },
  ];
}

/** Everything, in the order a report should present it. */
export const ALL_RULES = [
  dormantSeats,
  orphanedBoards,
  guestExposure,
  overOwnedBoards,
  adminSprawl,
  stalePendingInvites,
  staleBoards,
];
