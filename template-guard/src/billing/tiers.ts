/**
 * Plan gating.
 *
 * Priced **per account, not per seat**. The buyer is one ops person
 * administering boards on everyone else's behalf; charging per seat on an
 * admin tool means the person who benefits has to justify a bill that scales
 * with colleagues who will never open the app. That is a hard sell and it caps
 * adoption at exactly the accounts that need it most.
 *
 * The gating rule that matters most is at the bottom: nothing behind the
 * paywall may depend on the preview schema. See ADR-002. We do not take money
 * for a feature monday can remove without notice.
 */

export type PlanId = 'free' | 'pro';

export interface PlanLimits {
  id: PlanId;
  label: string;
  /** How many boards may be designated as templates. */
  maxTemplates: number;
  /** Scheduled re-checks of linked boards. */
  driftMonitoring: boolean;
  /** Notifications when a live board diverges. */
  notifications: boolean;
  /** One-click repair. Manual checklists are always available. */
  oneClickRepair: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: 'free',
    label: 'Free',
    maxTemplates: 1,
    driftMonitoring: false,
    notifications: false,
    oneClickRepair: false,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    maxTemplates: Number.POSITIVE_INFINITY,
    driftMonitoring: true,
    notifications: true,
    oneClickRepair: true,
  },
};

/**
 * What the free tier keeps, deliberately.
 *
 * Manual diffing stays free and uncrippled, including the mis-wiring
 * detection. A free tier that cannot show you the problem is a demo, not a
 * free tier — and the whole acquisition story here is someone running one
 * comparison, seeing that their client board has been writing to the wrong
 * place for three weeks, and buying on the spot. Hiding the finding behind the
 * paywall would remove the only reason anyone upgrades.
 *
 * What Pro sells is *not having to remember to check*: unlimited templates,
 * scheduled monitoring, notifications, and the repair button.
 */
export const FREE_TIER_ALWAYS_INCLUDES = [
  'Manual comparison of one template against any number of copies',
  'Every finding, at every severity, including mis-wired connect columns',
  'The full manual repair checklist with deep links',
] as const;

export interface AccountPlan {
  accountId: string;
  planId: PlanId;
  /** From monday's billing API. Null on the free tier. */
  renewsAt: string | null;
}

export function limitsFor(plan: AccountPlan): PlanLimits {
  return PLANS[plan.planId];
}

export type GateResult = { allowed: true } | { allowed: false; reason: string; upsell: string };

export function canAddTemplate(plan: AccountPlan, currentTemplateCount: number): GateResult {
  const limits = limitsFor(plan);
  if (currentTemplateCount < limits.maxTemplates) return { allowed: true };
  return {
    allowed: false,
    reason: `The Free plan covers one template board, and you already have ${currentTemplateCount}.`,
    upsell: 'Pro covers unlimited templates, scheduled drift monitoring and one-click repair.',
  };
}

export function canUseDriftMonitoring(plan: AccountPlan): GateResult {
  if (limitsFor(plan).driftMonitoring) return { allowed: true };
  return {
    allowed: false,
    reason: 'Scheduled drift monitoring is a Pro feature.',
    upsell: 'Pro re-checks your linked boards on a schedule and tells you when one drifts from its template.',
  };
}

export function canUseOneClickRepair(plan: AccountPlan, featureEnabled = false): GateResult {
  if (!featureEnabled) {
    // Not an upsell. The capability is not in this release at all, and saying
    // "upgrade for this" about something nobody can buy is a lie with a
    // price tag on it. (ADR-025.)
    return {
      allowed: false,
      reason:
        'One-click repair is not part of this release. Template Guard does not write to your boards; the repair checklist below tells you exactly what to change.',
      upsell: '',
    };
  }
  if (limitsFor(plan).oneClickRepair) return { allowed: true };
  return {
    allowed: false,
    reason: 'One-click repair is a Pro feature.',
    upsell: 'Pro applies the fixes for you. The manual checklist below stays free either way.',
  };
}

/**
 * Enforced invariant, not a comment.
 *
 * Every paid capability must be implementable against monday's **stable**
 * schema. If someone later adds a Pro feature that reads or writes automations,
 * this list is where it would show up, and this is where it gets stopped.
 */
export const PAID_FEATURES_REQUIRING_PREVIEW_SCHEMA: string[] = [];

export function assertNoPaidPreviewDependency(): void {
  if (PAID_FEATURES_REQUIRING_PREVIEW_SCHEMA.length > 0) {
    throw new Error(
      `Paid features may not depend on monday's preview schema (ADR-002). Offending: ${PAID_FEATURES_REQUIRING_PREVIEW_SCHEMA.join(', ')}`,
    );
  }
}
