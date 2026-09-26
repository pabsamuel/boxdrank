import { MondayClient } from '../api/client.js';
import { TemplateGuardError } from '../api/errors.js';
import type { Storage, StoredInstall } from '../server/storage.js';
import type { TokenCipher } from '../server/storage.js';
import { canUseDriftMonitoring } from '../billing/tiers.js';
import { notificationFor, runDriftCheck, type DriftFinding, type DriftReport } from './monitor.js';

/**
 * What actually makes drift monitoring run.
 *
 * `runDriftCheck` checks one template for one account. This walks every paying
 * account on a timer and calls it. Keeping the two separate is the whole
 * reason `runDriftCheck` is testable without a clock.
 *
 * Three things this must never do, in order of how badly they would hurt:
 *
 *  1. **Get the app rate-limited.** A sweep hits the API on behalf of every
 *     customer at once. If monday throttles the app's token, every customer
 *     loses the product simultaneously — including the ones sitting in front
 *     of it clicking Compare. So accounts are processed one at a time with a
 *     pause between them, and a rate-limit response ends that account's sweep
 *     immediately instead of retrying into the wall.
 *  2. **Overlap with itself.** A slow sweep plus a fixed interval is how you
 *     get two sweeps racing and double the API load. A run in progress causes
 *     the next tick to be skipped and recorded, not queued.
 *  3. **Fail quietly.** An account that could not be checked is reported as
 *     unchecked. Silence in a monitoring product reads as "everything is
 *     fine", which is the precise failure this app exists to prevent.
 */

export interface DriftNotification {
  accountId: string;
  templateBoardId: string;
  copyBoardId: string;
  message: string;
  severity: 'miswired' | 'missing' | 'altered' | 'cosmetic';
}

/**
 * Where notifications go. Kept an interface because delivery is a separate
 * problem with separate failure modes — email, monday notification, webhook —
 * and none of them should be able to break a sweep.
 */
export interface NotificationSink {
  deliver(notification: DriftNotification): Promise<void>;
}

/** Logs and drops. Useful in development; a real deployment replaces it. */
export class ConsoleNotificationSink implements NotificationSink {
  async deliver(n: DriftNotification): Promise<void> {
    console.log(`[template-guard] drift ${n.severity} account=${n.accountId} board=${n.copyBoardId}: ${n.message}`);
  }
}

export interface AccountSweepResult {
  accountId: string;
  /** Reports for the templates we managed to check. */
  reports: DriftReport[];
  notificationsSent: number;
  /** Set when the account was not checked at all, with the reason. */
  skipped?: string;
  /** Set when delivery or the check itself failed. Never swallowed. */
  errors: string[];
}

export interface SweepResult {
  startedAt: string;
  finishedAt: string;
  accountsConsidered: number;
  accountsChecked: number;
  results: AccountSweepResult[];
  /** True when this run continued a sweep an earlier run did not finish. */
  resumed: boolean;
  /** Accounts left for the next run. Empty means the sweep completed. */
  remainingAccountIds: string[];
}

export interface SchedulerOptions {
  /** How often a sweep starts. Default 6 hours. */
  intervalMs?: number;
  /**
   * Random delay added before each sweep, up to this many ms. Without it every
   * instance of this app wakes on the same boundary and monday sees a spike.
   */
  jitterMs?: number;
  /** Pause between accounts within one sweep. */
  accountPauseMs?: number;
  /**
   * Ceiling on storage reads per second during a sweep.
   *
   * monday code's Secure Storage is limited to 7 requests/second (reduced
   * from 30 in February 2026), and the sweep reads an install, a plan and a
   * settings record for every account. Pacing the monday API but not our own
   * storage would just move the throttle somewhere less visible. Default 5,
   * which leaves headroom for the requests the app is serving to people at
   * the same time. (ADR-020.)
   */
  storageOpsPerSecond?: number;
  automationsPreviewEnabled?: boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  random?: () => number;
  /** Injectable so tests never open a socket. */
  makeClient?: (token: string) => MondayClient;
  /**
   * Wall-clock budget for one run. When it is spent, the sweep stops and
   * saves what is left; the next run picks up there.
   *
   * On monday code the sweep runs inside an HTTP request from the platform
   * scheduler, and a container has a request timeout this codebase has not
   * verified. The budget does not need to know that number — it only needs to
   * be comfortably under it. Two minutes is, for any plausible value, and
   * being a run late with a drift alert costs nothing.
   */
  maxRunMs?: number;
  /** A sweep that has not finished in this long is abandoned and restarted. */
  checkpointMaxAgeMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class DriftScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  /** Ticks dropped because a sweep was still going. Surfaced, not hidden. */
  private skippedTicks = 0;
  private lastSweep: SweepResult | null = null;

  /** Timestamp the next storage read is allowed at, for pacing. */
  private nextStorageOpAt = 0;

  constructor(
    private readonly storage: Storage,
    private readonly cipher: TokenCipher,
    private readonly sink: NotificationSink,
    private readonly opts: SchedulerOptions = {},
  ) {}

  /**
   * Spaces storage reads out.
   *
   * A minimum interval rather than a token bucket, deliberately: a bucket
   * allows a burst, and a burst is exactly what trips a 7/second limit at the
   * start of a sweep over many accounts. Slower and even beats faster and
   * throttled — being an hour late with a drift alert costs nothing.
   */
  private async pacedRead<T>(read: () => Promise<T>): Promise<T> {
    const perSecond = this.opts.storageOpsPerSecond ?? 5;
    if (perSecond <= 0) return read();

    const now = (this.opts.now ?? (() => new Date()))().getTime();
    const minInterval = Math.ceil(1000 / perSecond);
    const waitMs = Math.max(0, this.nextStorageOpAt - now);
    if (waitMs > 0) await (this.opts.sleep ?? defaultSleep)(waitMs);

    this.nextStorageOpAt = now + waitMs + minInterval;
    return read();
  }

  get status() {
    return {
      running: this.running,
      started: this.timer !== null,
      skippedTicks: this.skippedTicks,
      lastSweep: this.lastSweep,
    };
  }

  start(): void {
    if (this.timer) return;
    const interval = this.opts.intervalMs ?? 6 * 60 * 60 * 1000;
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
    // Not a daemon's job to keep a process alive.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One scheduled firing. Exposed for tests and for a manual trigger. */
  async tick(): Promise<SweepResult | null> {
    if (this.running) {
      this.skippedTicks += 1;
      console.warn(
        `[template-guard] drift sweep skipped: the previous sweep is still running (${this.skippedTicks} skipped so far). If this keeps happening the interval is shorter than a sweep takes.`,
      );
      return null;
    }

    const jitter = this.opts.jitterMs ?? 60_000;
    if (jitter > 0) {
      const random = this.opts.random ?? Math.random;
      await (this.opts.sleep ?? defaultSleep)(Math.floor(random() * jitter));
    }

    return this.sweep();
  }

  async sweep(): Promise<SweepResult> {
    this.running = true;
    const now = this.opts.now ?? (() => new Date());
    const sleep = this.opts.sleep ?? defaultSleep;
    const startedAt = now().toISOString();
    const runStartedMs = now().getTime();
    const maxRunMs = this.opts.maxRunMs ?? 120_000;
    const results: AccountSweepResult[] = [];

    try {
      const { queue, resumed, sweepStartedAt } = await this.resolveQueue(now);
      const remaining = [...queue];

      while (remaining.length > 0) {
        const accountId = remaining.shift()!;
        results.push(await this.sweepAccount(accountId));

        // Checkpoint after each account, not at the end. A checkpoint written
        // only on a clean finish is a checkpoint that never survives the thing
        // it exists for.
        await this.storage.saveSweepCheckpoint(
          remaining.length > 0 ? { startedAt: sweepStartedAt, remainingAccountIds: remaining } : null,
        );

        if (remaining.length === 0) break;

        if (now().getTime() - runStartedMs >= maxRunMs) {
          // Not an error and not a skip: the work is saved and the next run
          // continues it. Logged because a sweep that never finishes within
          // one interval is something an operator should know about.
          console.warn(
            `[template-guard] drift sweep paused after ${results.length} account(s); ${remaining.length} left for the next run.`,
          );
          break;
        }

        await sleep(this.opts.accountPauseMs ?? 2_000);
      }

      const result: SweepResult = {
        startedAt,
        finishedAt: now().toISOString(),
        accountsConsidered: results.length + remaining.length,
        accountsChecked: results.filter((r) => !r.skipped).length,
        results,
        resumed,
        remainingAccountIds: remaining,
      };
      this.lastSweep = result;
      return result;
    } finally {
      // Whatever happened above, the next tick must be able to run. A stuck
      // `running` flag is a monitor that has silently stopped monitoring.
      this.running = false;
    }
  }

  /**
   * Either continues an unfinished sweep or starts a new one.
   *
   * A checkpoint is abandoned once it is older than a day. Without that, one
   * bad account could freeze the queue on a stale list forever, and every
   * later run would re-check the same few boards while reporting success —
   * which is this product's signature failure, in its own scheduler.
   */
  private async resolveQueue(
    now: () => Date,
  ): Promise<{ queue: string[]; resumed: boolean; sweepStartedAt: string }> {
    const checkpoint = await this.storage.getSweepCheckpoint();
    const maxAge = this.opts.checkpointMaxAgeMs ?? 24 * 60 * 60 * 1000;

    if (checkpoint && checkpoint.remainingAccountIds.length > 0) {
      const age = now().getTime() - Date.parse(checkpoint.startedAt);
      if (Number.isFinite(age) && age >= 0 && age <= maxAge) {
        return { queue: checkpoint.remainingAccountIds, resumed: true, sweepStartedAt: checkpoint.startedAt };
      }
      console.warn(
        `[template-guard] abandoning a drift sweep checkpoint from ${checkpoint.startedAt}: it is older than the limit, so the account list is restarted.`,
      );
    }

    const startedAt = now().toISOString();
    return {
      queue: await this.storage.listAccountIdsWithTemplates(),
      resumed: false,
      sweepStartedAt: startedAt,
    };
  }

  private async sweepAccount(accountId: string): Promise<AccountSweepResult> {
    const out: AccountSweepResult = { accountId, reports: [], notificationsSent: 0, errors: [] };

    const plan = await this.pacedRead(() => this.storage.getPlan(accountId));
    const gate = canUseDriftMonitoring(plan);
    if (!gate.allowed) {
      // Not an error. A free account simply is not monitored, and saying so
      // keeps "0 accounts checked" from reading as a broken scheduler.
      out.skipped = 'Free plan: scheduled monitoring is a Pro feature.';
      return out;
    }

    const install = await this.pacedRead(() => this.storage.getInstall(accountId));
    if (!install) {
      out.skipped = 'No stored install: the app was uninstalled or its token was revoked.';
      return out;
    }

    let client: MondayClient;
    try {
      client = this.clientFor(install);
    } catch (err) {
      // A token that will not decrypt usually means the encryption key was
      // rotated without re-encrypting. Loud, because every future sweep for
      // this account will fail the same way until someone acts.
      out.skipped = 'Stored access token could not be decrypted. This account needs to reinstall Template Guard.';
      out.errors.push(describe(err));
      return out;
    }

    const templates = await this.pacedRead(() => this.storage.listTemplates(accountId));
    for (const template of templates) {
      if (template.linkedBoardIds.length === 0) continue;

      try {
        const report = await runDriftCheck(client, plan, template, {
          automationsPreviewEnabled: this.opts.automationsPreviewEnabled ?? false,
          sleep: this.opts.sleep,
          now: this.opts.now,
        });
        out.reports.push(report);
        out.notificationsSent += await this.notify(accountId, report.drifted, out.errors);
      } catch (err) {
        // One template's failure must not cancel the rest of the account.
        out.errors.push(`Template ${template.templateBoardId}: ${describe(err)}`);
        if (err instanceof TemplateGuardError && err.kind === 'rate_limited') {
          out.errors.push('Stopped sweeping this account early: monday is rate-limiting it.');
          break;
        }
      }
    }

    return out;
  }

  private async notify(accountId: string, drifted: DriftFinding[], errors: string[]): Promise<number> {
    let sent = 0;
    for (const finding of drifted) {
      const severity = topSeverity(finding);
      const notification: DriftNotification = {
        accountId,
        templateBoardId: finding.templateBoardId,
        copyBoardId: finding.copyBoardId,
        message: notificationFor(finding, finding.diff.copyBoardId),
        severity,
      };
      try {
        await this.sink.deliver(notification);
        sent += 1;
      } catch (err) {
        // A delivery failure is recorded rather than retried here. Retrying
        // inside a sweep risks turning a mail outage into a stalled monitor.
        errors.push(`Notification for board ${finding.copyBoardId} could not be delivered: ${describe(err)}`);
      }
    }
    return sent;
  }

  private clientFor(install: StoredInstall): MondayClient {
    const token = this.cipher.decrypt(install.encryptedToken);
    return (this.opts.makeClient ?? (() => new MondayClient({ token })))(token);
  }
}

function topSeverity(finding: DriftFinding): DriftNotification['severity'] {
  if (finding.counts.miswired > 0) return 'miswired';
  if (finding.counts.missing > 0) return 'missing';
  if (finding.counts.altered > 0) return 'altered';
  return 'cosmetic';
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
