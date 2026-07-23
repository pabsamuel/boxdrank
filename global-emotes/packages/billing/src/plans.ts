import {
  CREATOR_PLAN_LIMITS,
  FAN_PLAN_LIMITS,
  type CreatorPlan,
  type FanPlan,
} from '@global-emotes/config';

/**
 * Plan resolution and server-side limit enforcement. Entitlements derive from
 * billing state — never from client claims (master spec §19).
 */

export interface SubscriptionRow {
  productKey: string;
  status: string;
  currentPeriodEnd: Date | null;
}

/** Statuses that keep paid features on. `past_due` keeps access during dunning. */
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function resolveFanPlan(subscriptions: SubscriptionRow[], now = new Date()): FanPlan {
  const entitled = subscriptions.some(
    (s) =>
      s.productKey === 'fan_plus' &&
      ENTITLED_STATUSES.has(s.status) &&
      (!s.currentPeriodEnd || s.currentPeriodEnd > now),
  );
  return entitled ? 'fan_plus' : 'fan_free';
}

export function resolveCreatorPlan(subscriptions: SubscriptionRow[], now = new Date()): CreatorPlan {
  const has = (key: string) =>
    subscriptions.some(
      (s) =>
        s.productKey === key &&
        ENTITLED_STATUSES.has(s.status) &&
        (!s.currentPeriodEnd || s.currentPeriodEnd > now),
    );
  if (has('creator_business')) return 'creator_business';
  if (has('creator_pro')) return 'creator_pro';
  return 'creator_free';
}

export class PlanLimitError extends Error {
  constructor(
    public readonly limit: string,
    public readonly plan: CreatorPlan | FanPlan,
    message: string,
  ) {
    super(message);
    this.name = 'PlanLimitError';
  }
}

export function assertCanCreatePack(plan: CreatorPlan, currentPackCount: number): void {
  const max = CREATOR_PLAN_LIMITS[plan].maxPacks;
  if (currentPackCount >= max) {
    throw new PlanLimitError('maxPacks', plan, `plan ${plan} allows ${max} packs`);
  }
}

export function assertCanAddEmote(plan: CreatorPlan, currentEmoteCount: number): void {
  const max = CREATOR_PLAN_LIMITS[plan].maxEmotes;
  if (currentEmoteCount >= max) {
    throw new PlanLimitError('maxEmotes', plan, `plan ${plan} allows ${max} emotes`);
  }
}

export function assertCanUploadAnimated(plan: CreatorPlan): void {
  if (!CREATOR_PLAN_LIMITS[plan].animatedAllowed) {
    throw new PlanLimitError('animatedAllowed', plan, `plan ${plan} does not include animated emotes`);
  }
}

export function assertCanConnectProvider(plan: CreatorPlan, currentConnections: number): void {
  const max = CREATOR_PLAN_LIMITS[plan].maxProviderConnections;
  if (currentConnections >= max) {
    throw new PlanLimitError('maxProviderConnections', plan, `plan ${plan} allows ${max} connections`);
  }
}

export function assertFavoriteCapacity(plan: FanPlan, currentFavorites: number): void {
  const max = FAN_PLAN_LIMITS[plan].maxFavorites;
  if (currentFavorites >= max) {
    throw new PlanLimitError('maxFavorites', plan, `plan ${plan} allows ${max} favorites`);
  }
}
