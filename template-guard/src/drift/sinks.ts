import type { MondayClient } from '../api/client.js';
import type { DriftNotification, NotificationSink } from './scheduler.js';

/**
 * Where a drift alert actually lands.
 *
 * Two implementations, because the right one depends on a thing we do not
 * know yet: whether ops people live in monday or in their inbox. Both sit
 * behind `NotificationSink`, so switching is a constructor argument.
 *
 * A delivery failure is thrown, not swallowed. The scheduler catches it and
 * records it on the sweep result — that is the layer that knows whether a
 * failed alert should stop the sweep (it should not) and how to report it.
 * A sink that quietly returns on failure would make a monitoring product
 * silently stop notifying, which is this app's signature failure.
 */

/**
 * Posts into monday itself, via `create_notification`.
 *
 * The strong option when it works: the alert appears where the boards are,
 * and there is no mail deliverability problem to own. The constraint is that
 * it needs a monday user id to notify, so the caller supplies one per account
 * — normally the person who installed the app.
 *
 * ✱ UNVERIFIED — `create_notification`'s exact argument names and whether it
 * accepts `Project` as a target type for a board. Verify before relying on it;
 * `WebhookSink` is the fallback that needs nothing from monday.
 */
export class MondayNotificationSink implements NotificationSink {
  constructor(
    private readonly clientFor: (accountId: string) => Promise<MondayClient | null>,
    private readonly recipientFor: (accountId: string) => Promise<string | null>,
  ) {}

  async deliver(n: DriftNotification): Promise<void> {
    const client = await this.clientFor(n.accountId);
    if (!client) {
      throw new Error(`No monday client for account ${n.accountId}: the app may have been uninstalled.`);
    }

    const userId = await this.recipientFor(n.accountId);
    if (!userId) {
      throw new Error(
        `No notification recipient recorded for account ${n.accountId}. Set one, or the account is monitored with nowhere to report to.`,
      );
    }

    const { data, errors } = await client.request<{ create_notification: { id: string } | null }>(
      `mutation TemplateGuardNotify($userId: ID!, $targetId: ID!, $text: String!) {
         create_notification(user_id: $userId, target_id: $targetId, target_type: Project, text: $text) {
           id
         }
       }`,
      { userId, targetId: n.copyBoardId, text: n.message },
    );

    if (!data?.create_notification || errors.length > 0) {
      throw new Error(
        errors[0]?.message ?? 'monday accepted the notification request but returned nothing.',
      );
    }
  }
}

/**
 * POSTs the alert as JSON to a URL the customer controls.
 *
 * Deliberately the simplest possible thing: it reaches Slack, an inbox via a
 * relay, or an internal system, without this app taking on mail delivery,
 * bounce handling, or an email provider's data-processing agreement — all of
 * which would enlarge the security review for no product gain today.
 *
 * The payload carries board IDs and a message. No item data, consistent with
 * the storage rule: a webhook is still somewhere customer data would be
 * leaving, and the answer is that there is none to leave.
 */
export class WebhookSink implements NotificationSink {
  constructor(
    private readonly urlFor: (accountId: string) => Promise<string | null>,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async deliver(n: DriftNotification): Promise<void> {
    const url = await this.urlFor(n.accountId);
    if (!url) throw new Error(`No webhook URL configured for account ${n.accountId}.`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'template-guard',
          severity: n.severity,
          message: n.message,
          templateBoardId: n.templateBoardId,
          copyBoardId: n.copyBoardId,
          at: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Webhook responded ${res.status}.`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Tries each sink in order and succeeds if any one does.
 *
 * For an account with both a monday recipient and a webhook: one channel being
 * down should not lose the alert. If every channel fails, it throws with all
 * the reasons, because "we could not tell you" is itself something the sweep
 * report has to carry.
 */
export class FallbackSink implements NotificationSink {
  constructor(private readonly sinks: NotificationSink[]) {}

  async deliver(n: DriftNotification): Promise<void> {
    const reasons: string[] = [];
    for (const sink of this.sinks) {
      try {
        await sink.deliver(n);
        return;
      } catch (err) {
        reasons.push(err instanceof Error ? err.message : String(err));
      }
    }
    throw new Error(
      reasons.length > 0
        ? `Every delivery channel failed: ${reasons.join(' | ')}`
        : 'No delivery channel is configured for this account.',
    );
  }
}
