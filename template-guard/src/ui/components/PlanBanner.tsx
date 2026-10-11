import { Button, Flex, Text } from 'monday-ui-react-core';
import { PLANS, limitsFor, type AccountPlan } from '../../billing/tiers.js';

/**
 * The plan surface.
 *
 * Not a billing UI — there is no payment form here and there never will be.
 * monday collects the money; this app never sees a card. That is the largest
 * single reduction in security-review surface available to a marketplace app,
 * and giving it up to render our own checkout would be a bad trade.
 *
 * So this does two things: says which plan the account is on, and opens
 * monday's own upgrade page. What it deliberately does **not** do is nag. The
 * free tier shows every finding at every severity, mis-wiring included, and an
 * upsell that interrupts someone reading a real finding is an upsell that
 * teaches them to close the panel.
 */

export function planUpgradeUrl(accountSlug: string | null, appId: string | null): string {
  // monday's in-product upgrade flow. Falls back to the account's apps page,
  // which is one click further but never a dead link.
  if (accountSlug && appId) {
    return `https://${accountSlug}.monday.com/apps/installed_apps/${appId}`;
  }
  if (accountSlug) return `https://${accountSlug}.monday.com/apps/installed_apps`;
  return 'https://monday.com/marketplace';
}

export function PlanBanner({
  plan,
  accountSlug,
  appId,
  templateCount,
}: {
  plan: AccountPlan | null;
  accountSlug?: string | null;
  appId?: string | null;
  templateCount: number;
}) {
  if (!plan) return null;

  const limits = limitsFor(plan);
  const isPro = plan.planId === 'pro';

  if (isPro) {
    return (
      <Flex gap={Flex.gaps.SMALL} align={Flex.align.CENTER}>
        <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY}>
          {PLANS.pro.label} · {templateCount} template{templateCount === 1 ? '' : 's'} · scheduled
          monitoring on
          {plan.renewsAt ? ` · renews ${new Date(plan.renewsAt).toLocaleDateString()}` : ''}
        </Text>
      </Flex>
    );
  }

  const atLimit = templateCount >= limits.maxTemplates;

  return (
    <Flex gap={Flex.gaps.SMALL} align={Flex.align.CENTER} wrap>
      <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY}>
        {atLimit
          ? `Free plan — you are using your ${limits.maxTemplates} template. Pro adds unlimited templates, scheduled monitoring and one-click repair.`
          : `Free plan — every finding, every severity, unlimited comparisons. Pro adds scheduled monitoring so you do not have to remember to check.`}
      </Text>
      <Button
        kind={Button.kinds.TERTIARY}
        size={Button.sizes.SMALL}
        onClick={() => window.open(planUpgradeUrl(accountSlug ?? null, appId ?? null), '_blank', 'noopener')}
      >
        See Pro
      </Button>
    </Flex>
  );
}
