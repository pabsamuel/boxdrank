import crypto from 'node:crypto';
import { verifySubscriptionToken } from '../billing/subscription.js';

/**
 * Decides whether a call to `/mndy-cronjob/drift` may start a sweep.
 *
 * Two ways in, because there are two callers:
 *
 *  - **monday code's scheduler.** It cannot be given custom headers — a job is
 *    a schedule and a path, nothing more — so the `X-Template-Guard-Cron`
 *    secret alone would reject every real run with a 401. The platform signs
 *    its calls with the app's signing secret and sends the JWT in
 *    `Authorization`; that is what is checked here, with the same HS256-pinned,
 *    timing-safe verifier the billing webhook uses.
 *  - **Anything else** (a self-hosted cron, a manual run) presents
 *    `DRIFT_CRON_SECRET` in `X-Template-Guard-Cron`.
 *
 * A token that verifies but has expired is still refused.
 */
export function isAuthorisedCronCaller(opts: {
  authorization?: string;
  cronHeader?: string;
  cronSecret?: string;
  signingSecret: string;
  nowSeconds?: number;
}): boolean {
  const { authorization, cronHeader, cronSecret, signingSecret } = opts;

  if (cronSecret && cronHeader) {
    const a = Buffer.from(cronHeader);
    const b = Buffer.from(cronSecret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }

  const token = authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  try {
    const payload = verifySubscriptionToken(token, signingSecret);
    const exp = payload.exp;
    const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (typeof exp === 'number' && exp < now) return false;
    return true;
  } catch {
    return false;
  }
}
