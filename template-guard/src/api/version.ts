/**
 * The single place the monday GraphQL API version is pinned.
 *
 * monday ships a new API version each quarter and guarantees each one stable
 * for at least six months. As of 2026-07-01 the current stable default is
 * 2026-07 (2026-04 is in maintenance, 2026-10 is the release candidate).
 *
 * Changing this value is a deliberate, tested migration — not a bump. The
 * quarterly ritual is: point RELEASE_CANDIDATE at the new RC, run the suite
 * against it in CI, then promote it here. See ADR-001.
 */
export const MONDAY_API_VERSION = '2026-07' as const;

/**
 * The next version, used only by the CI smoke suite so a quarterly flip is
 * never a surprise. Never used to serve a real request.
 */
export const MONDAY_API_RELEASE_CANDIDATE = '2026-10' as const;

export const MONDAY_API_ENDPOINT = 'https://api.monday.com/v2' as const;

/**
 * Versions older than 2025-04 are deprecated and no longer served. Kept here
 * so the client can refuse to start against one rather than fail at runtime.
 */
export const MONDAY_API_MINIMUM_SUPPORTED = '2025-04' as const;
