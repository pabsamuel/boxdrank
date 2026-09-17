/**
 * Deep links into monday's settings panels.
 *
 * The point of these: when Template Guard cannot fix something itself, the
 * difference between a useful checklist item and a useless one is whether the
 * user lands on the exact panel or has to go hunting. "Reconnect the Related
 * Work column" is a chore; a link that opens that column's settings is five
 * seconds.
 *
 * ✱ UNVERIFIED — every URL shape below.
 *
 * monday's in-product URL structure is not part of the documented API and has
 * never been guaranteed stable. These were derived from observed board URLs,
 * not from documentation, and have NOT been confirmed against a live account.
 *
 * Because of that, every builder here degrades rather than guesses: if we are
 * not confident about a sub-path, we return the board URL, which is always
 * correct and still saves the user most of the hunt. A link that 404s is worse
 * than a link that lands one click away — it makes the user distrust the whole
 * checklist.
 */

export interface DeepLinkContext {
  /** The account subdomain, e.g. `acme` in acme.monday.com. */
  accountSlug: string;
  boardId: string;
}

function boardBase(ctx: DeepLinkContext): string {
  return `https://${ctx.accountSlug}.monday.com/boards/${ctx.boardId}`;
}

/** The board itself. Confirmed shape — this one we are sure of. */
export function boardLink(ctx: DeepLinkContext): string {
  return boardBase(ctx);
}

/**
 * A specific view on the board.
 *
 * ✱ The `/views/{id}` suffix is observed, not documented.
 */
export function viewLink(ctx: DeepLinkContext, viewId: string | null): string {
  if (!viewId) return boardBase(ctx);
  return `${boardBase(ctx)}/views/${viewId}`;
}

/**
 * The board's automation centre.
 *
 * ✱ Observed as an `/automations` suffix. If monday has moved it, the user
 * lands on the board and the automations button is one click away — acceptable
 * degradation, which is why this is not gated behind a feature flag.
 */
export function automationsLink(ctx: DeepLinkContext): string {
  return `${boardBase(ctx)}/automations`;
}

/**
 * A column's settings.
 *
 * monday has no stable URL that opens a single column's settings panel — the
 * column menu is client-side state, not a route. Rather than invent a
 * parameter that will not work, we link to the board and let the instruction
 * text name the column. Being honest about the limit beats a broken link.
 */
export function columnLink(ctx: DeepLinkContext, _columnId: string | null): string {
  return boardBase(ctx);
}

/** Human-readable navigation hint to pair with a link that cannot be exact. */
export function columnNavigationHint(columnTitle: string): string {
  return `Open the board, click the “${columnTitle}” column header, then choose Settings → Customize.`;
}

export function automationNavigationHint(): string {
  return 'Open the board, click Automate in the top-right, then review the recipe list.';
}
