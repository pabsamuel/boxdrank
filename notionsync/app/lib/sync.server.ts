// The sync engine: turns Shopify orders/products into Notion database rows.
//
// - Field mapping is fixed (see mapOrder* / mapProduct* below). Values are
//   Notion "property value" objects (title / rich_text / number / select /
//   date / url / email).
// - Upserts use the RecordMap table so an update modifies the existing
//   Notion page instead of creating a duplicate.
// - Free-plan metering: 50 new orders per calendar month, then order sync
//   pauses until the merchant upgrades (or the month rolls over).
// - Webhook-facing functions NEVER throw — failures are logged to the
//   SyncError table and surfaced on the settings page.

import type { Shop } from "@prisma/client";
import db from "../db.server";
import { decryptToken } from "./crypto.server";
import { FREE_PLAN_ORDER_LIMIT } from "./constants";
import {
  archivePage,
  createPage,
  isGonePageError,
  updatePage,
} from "./notion.server";

export { FREE_PLAN_ORDER_LIMIT };

// ---------------------------------------------------------------------------
// Notion property value builders. Notion is picky: empty strings are invalid
// for email/url/select, rich text blocks max out at 2000 chars, and select
// option names can't contain commas.
// ---------------------------------------------------------------------------

const asTitle = (s: string) => ({
  title: [{ text: { content: String(s).slice(0, 2000) } }],
});
const asText = (s: string) => ({
  rich_text: s ? [{ text: { content: String(s).slice(0, 2000) } }] : [],
});
const asNumber = (n: number) => ({
  number: Number.isFinite(n) ? n : null,
});
const asSelect = (s: string) => ({
  select: s ? { name: String(s).replace(/,/g, ";").slice(0, 100) } : null,
});
const asDate = (iso: string | null | undefined) => ({
  date: iso ? { start: iso } : null,
});
const asUrl = (u: string) => ({ url: u || null });
const asEmail = (e: string) => ({ email: e || null });

// ---------------------------------------------------------------------------
// Field mapping — Orders
// ---------------------------------------------------------------------------

export type OrderFields = Record<string, unknown>;

// "my-store.myshopify.com" → "my-store" (used to build admin deep links)
function storeHandle(shopDomain: string): string {
  return shopDomain.replace(".myshopify.com", "");
}

function lineItemSummary(items: { quantity: number; title: string }[]): string {
  return items.map((i) => `${i.quantity}x ${i.title}`).join(", ");
}

// Maps an order webhook payload (Shopify's REST-shaped JSON) to Notion properties.
export function mapOrderFromWebhook(
  payload: Record<string, any>,
  shopDomain: string,
): OrderFields {
  const customer = payload.customer ?? {};
  const customerName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    payload.billing_address?.name ||
    "";
  const items: { quantity: number; title: string }[] = (
    payload.line_items ?? []
  ).map((li: any) => ({ quantity: li.quantity ?? 1, title: li.title ?? li.name ?? "?" }));

  return {
    "Order number": asTitle(payload.name ?? String(payload.id)),
    "Created at": asDate(payload.created_at),
    "Customer name": asText(customerName),
    "Customer email": asEmail(
      payload.email ?? payload.contact_email ?? customer.email ?? "",
    ),
    "Total price": asNumber(Number(payload.total_price ?? 0)),
    Currency: asText(payload.currency ?? ""),
    "Financial status": asSelect(payload.financial_status ?? ""),
    "Fulfillment status": asSelect(payload.fulfillment_status ?? "unfulfilled"),
    "Line items": asText(lineItemSummary(items)),
    "Shipping country": asText(payload.shipping_address?.country ?? ""),
    Tags: asText(payload.tags ?? ""),
    "Shopify order URL": asUrl(
      `https://admin.shopify.com/store/${storeHandle(shopDomain)}/orders/${payload.id}`,
    ),
  };
}

// Maps an order node from the GraphQL Admin API (used by the backfill).
export function mapOrderFromGraphql(
  node: Record<string, any>,
  shopDomain: string,
): OrderFields {
  const items: { quantity: number; title: string }[] = (
    node.lineItems?.nodes ?? []
  ).map((li: any) => ({ quantity: li.quantity ?? 1, title: li.title ?? "?" }));

  return {
    "Order number": asTitle(node.name ?? ""),
    "Created at": asDate(node.createdAt),
    "Customer name": asText(node.customer?.displayName ?? ""),
    "Customer email": asEmail(node.email ?? node.customer?.email ?? ""),
    "Total price": asNumber(Number(node.totalPriceSet?.shopMoney?.amount ?? 0)),
    Currency: asText(node.totalPriceSet?.shopMoney?.currencyCode ?? ""),
    "Financial status": asSelect(
      (node.displayFinancialStatus ?? "").toLowerCase(),
    ),
    "Fulfillment status": asSelect(
      (node.displayFulfillmentStatus ?? "").toLowerCase(),
    ),
    "Line items": asText(lineItemSummary(items)),
    "Shipping country": asText(node.shippingAddress?.country ?? ""),
    Tags: asText(Array.isArray(node.tags) ? node.tags.join(", ") : ""),
    "Shopify order URL": asUrl(
      `https://admin.shopify.com/store/${storeHandle(shopDomain)}/orders/${node.legacyResourceId}`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Field mapping — Products
// ---------------------------------------------------------------------------

export type ProductFields = Record<string, unknown>;

export function mapProductFromWebhook(
  payload: Record<string, any>,
  shopDomain: string,
): ProductFields {
  const variants: any[] = payload.variants ?? [];
  const totalInventory = variants.reduce(
    (sum, v) => sum + (Number(v.inventory_quantity) || 0),
    0,
  );
  return {
    Title: asTitle(payload.title ?? ""),
    Status: asSelect(payload.status ?? ""),
    Vendor: asText(payload.vendor ?? ""),
    "Product type": asText(payload.product_type ?? ""),
    Price: asNumber(Number(variants[0]?.price ?? 0)),
    "Total inventory": asNumber(totalInventory),
    Tags: asText(payload.tags ?? ""),
    "Created at": asDate(payload.created_at),
    "Shopify product URL": asUrl(
      `https://admin.shopify.com/store/${storeHandle(shopDomain)}/products/${payload.id}`,
    ),
  };
}

export function mapProductFromGraphql(
  node: Record<string, any>,
  shopDomain: string,
): ProductFields {
  return {
    Title: asTitle(node.title ?? ""),
    Status: asSelect((node.status ?? "").toLowerCase()),
    Vendor: asText(node.vendor ?? ""),
    "Product type": asText(node.productType ?? ""),
    Price: asNumber(Number(node.variants?.nodes?.[0]?.price ?? 0)),
    "Total inventory": asNumber(Number(node.totalInventory ?? 0)),
    Tags: asText(Array.isArray(node.tags) ? node.tags.join(", ") : ""),
    "Created at": asDate(node.createdAt),
    "Shopify product URL": asUrl(
      `https://admin.shopify.com/store/${storeHandle(shopDomain)}/products/${node.legacyResourceId}`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Sync context: the Shop row + decrypted token, or null if not set up yet.
// ---------------------------------------------------------------------------

export type SyncContext = { shopRow: Shop; token: string };

export async function getSyncContext(
  shopDomain: string,
): Promise<SyncContext | null> {
  const shopRow = await db.shop.findUnique({ where: { shop: shopDomain } });
  if (
    !shopRow ||
    !shopRow.notionToken ||
    !shopRow.notionParentPageId ||
    !shopRow.ordersDbId ||
    !shopRow.productsDbId
  ) {
    return null; // merchant hasn't finished onboarding — nothing to sync into
  }
  return { shopRow, token: decryptToken(shopRow.notionToken) };
}

export async function logSyncError(
  shopDomain: string,
  resourceType: string,
  message: string,
  opts: { shopifyId?: string; topic?: string } = {},
): Promise<void> {
  try {
    await db.syncError.create({
      data: {
        shop: shopDomain,
        resourceType,
        shopifyId: opts.shopifyId,
        topic: opts.topic,
        message: message.slice(0, 2000),
      },
    });
  } catch (e) {
    // Even error logging must never crash a webhook handler.
    console.error(`Failed to record SyncError for ${shopDomain}:`, e);
  }
}

async function markSynced(shopDomain: string): Promise<void> {
  await db.shop.update({
    where: { shop: shopDomain },
    data: { lastSyncAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Free-plan metering
// ---------------------------------------------------------------------------

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // "2026-07"
}

// Re-reads the Shop row and rolls the monthly counter if the calendar month
// changed. Always fetches fresh from the DB — callers (especially the
// backfill) may be holding a Shop row loaded minutes ago, and metering
// against a stale counter would let the free-plan cap slip.
async function rollMonth(shopRow: Shop): Promise<Shop> {
  const monthKey = currentMonthKey();
  const fresh =
    (await db.shop.findUnique({ where: { id: shopRow.id } })) ?? shopRow;
  if (fresh.monthKey === monthKey) return fresh;
  return db.shop.update({
    where: { id: fresh.id },
    data: { monthKey, ordersThisMonth: 0, limitReached: false },
  });
}

// Called before syncing a NEW order on the free plan. Returns true if the
// order may sync (and counts it); false if the cap is hit (and pauses sync).
async function countNewOrderAllowed(shopRow: Shop): Promise<boolean> {
  const fresh = await rollMonth(shopRow);
  if (fresh.plan === "pro") return true;
  if (fresh.ordersThisMonth >= FREE_PLAN_ORDER_LIMIT) {
    if (!fresh.limitReached) {
      await db.shop.update({
        where: { id: fresh.id },
        data: { limitReached: true },
      });
      await logSyncError(
        fresh.shop,
        "system",
        `Free plan limit reached (${FREE_PLAN_ORDER_LIMIT} orders this month). Order sync is paused — upgrade to Pro to resume.`,
        { topic: "plan-limit" },
      );
    }
    return false;
  }
  await db.shop.update({
    where: { id: fresh.id },
    data: { ordersThisMonth: { increment: 1 } },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Core upsert: RecordMap decides create vs. update. If the Notion page was
// deleted/archived by hand, the update fails and we transparently recreate.
// ---------------------------------------------------------------------------

async function upsertRecord(
  ctx: SyncContext,
  resourceType: "order" | "product",
  databaseId: string,
  shopifyId: string,
  fields: Record<string, unknown>,
): Promise<"created" | "updated"> {
  const { shopRow, token } = ctx;
  const where = {
    shop_resourceType_shopifyId: {
      shop: shopRow.shop,
      resourceType,
      shopifyId,
    },
  };
  const existing = await db.recordMap.findUnique({ where });

  if (existing) {
    try {
      await updatePage(token, existing.notionPageId, fields);
      await db.recordMap.update({ where, data: { updatedAt: new Date() } });
      return "updated";
    } catch (err) {
      if (!isGonePageError(err)) throw err;
      // Page vanished in Notion — fall through and recreate it.
    }
  }

  const pageId = await createPage(token, databaseId, fields);
  await db.recordMap.upsert({
    where,
    create: {
      shop: shopRow.shop,
      resourceType,
      shopifyId,
      notionPageId: pageId,
    },
    update: { notionPageId: pageId },
  });
  return "created";
}

// ---------------------------------------------------------------------------
// Order / product sync entry points. Used by both webhooks and the backfill.
// Return value says what happened (useful for backfill progress counts).
// ---------------------------------------------------------------------------

export type SyncResult =
  | "created"
  | "updated"
  | "deleted"
  | "skipped_limit"
  | "skipped_disabled";

export async function syncOrder(
  ctx: SyncContext,
  shopifyId: string,
  fields: OrderFields,
): Promise<SyncResult> {
  if (!ctx.shopRow.syncOrders) return "skipped_disabled";

  const isNew = !(await db.recordMap.findUnique({
    where: {
      shop_resourceType_shopifyId: {
        shop: ctx.shopRow.shop,
        resourceType: "order",
        shopifyId,
      },
    },
  }));

  if (isNew) {
    // New orders count against the free-plan cap.
    if (!(await countNewOrderAllowed(ctx.shopRow))) return "skipped_limit";
  } else {
    // Updates to already-synced orders are paused too once the cap is hit.
    const fresh = await rollMonth(ctx.shopRow);
    if (fresh.plan !== "pro" && fresh.limitReached) return "skipped_limit";
  }

  const result = await upsertRecord(
    ctx,
    "order",
    ctx.shopRow.ordersDbId!,
    shopifyId,
    fields,
  );
  await markSynced(ctx.shopRow.shop);
  return result;
}

export async function syncProduct(
  ctx: SyncContext,
  shopifyId: string,
  fields: ProductFields,
): Promise<SyncResult> {
  if (!ctx.shopRow.syncProducts) return "skipped_disabled";
  const result = await upsertRecord(
    ctx,
    "product",
    ctx.shopRow.productsDbId!,
    shopifyId,
    fields,
  );
  await markSynced(ctx.shopRow.shop);
  return result;
}

export async function removeProduct(
  ctx: SyncContext,
  shopifyId: string,
): Promise<SyncResult> {
  if (!ctx.shopRow.syncProducts) return "skipped_disabled";
  const where = {
    shop_resourceType_shopifyId: {
      shop: ctx.shopRow.shop,
      resourceType: "product",
      shopifyId,
    },
  };
  const existing = await db.recordMap.findUnique({ where });
  if (existing) {
    await archivePage(ctx.token, existing.notionPageId);
    await db.recordMap.delete({ where });
    await markSynced(ctx.shopRow.shop);
  }
  return "deleted";
}

// ---------------------------------------------------------------------------
// Webhook-facing wrappers: load context, map payload, sync, swallow errors.
// These are what the webhook routes call — they must never throw, so a bad
// payload or a Notion outage can never make Shopify retry-storm us.
// ---------------------------------------------------------------------------

export async function handleOrderWebhook(
  shopDomain: string,
  payload: Record<string, any>,
  topic: string,
): Promise<void> {
  const shopifyId = String(payload?.id ?? "");
  try {
    if (!shopifyId) throw new Error("Webhook payload has no order id");
    const ctx = await getSyncContext(shopDomain);
    if (!ctx) return; // app not set up yet — nothing to do
    await syncOrder(ctx, shopifyId, mapOrderFromWebhook(payload, shopDomain));
  } catch (err) {
    await logSyncError(shopDomain, "order", (err as Error).message, {
      shopifyId,
      topic,
    });
  }
}

export async function handleProductWebhook(
  shopDomain: string,
  payload: Record<string, any>,
  topic: string,
): Promise<void> {
  const shopifyId = String(payload?.id ?? "");
  try {
    if (!shopifyId) throw new Error("Webhook payload has no product id");
    const ctx = await getSyncContext(shopDomain);
    if (!ctx) return;
    // Topic arrives as "PRODUCTS_DELETE" from the webhook library.
    if (/delete/i.test(topic)) {
      await removeProduct(ctx, shopifyId);
    } else {
      await syncProduct(
        ctx,
        shopifyId,
        mapProductFromWebhook(payload, shopDomain),
      );
    }
  } catch (err) {
    await logSyncError(shopDomain, "product", (err as Error).message, {
      shopifyId,
      topic,
    });
  }
}

// Deletes everything we hold for a shop. Used by app/uninstalled and the
// shop/redact GDPR webhook. (The merchant's Notion workspace is theirs — we
// only remove OUR copies: sessions, settings, the token, and mappings.)
export async function deleteShopData(shopDomain: string): Promise<void> {
  await db.session.deleteMany({ where: { shop: shopDomain } });
  await db.recordMap.deleteMany({ where: { shop: shopDomain } });
  await db.syncError.deleteMany({ where: { shop: shopDomain } });
  await db.shop.deleteMany({ where: { shop: shopDomain } });
}
