// Initial sync: backfills the last 90 days of orders and ALL products from
// Shopify into Airtable.
//
// How it runs: the settings page action calls startBackfill(), which kicks
// the work off in the background and returns immediately (the page then
// polls the status). This is fine on a long-running host like Railway —
// the process stays alive between requests.
//
// Rate limits: Shopify's GraphQL API is cost-based, so we fetch small pages
// (well under the 1000-point query budget) and pause briefly between pages.
// Airtable writes go through the throttled client (max ~4 req/s per base),
// which is the real bottleneck anyway.

import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  getSyncContext,
  logSyncError,
  mapOrderFromGraphql,
  mapProductFromGraphql,
  syncOrder,
  syncProduct,
} from "./sync.server";

const PAGE_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setStatus(shopDomain: string, status: string, message: string) {
  await db.shop.update({
    where: { shop: shopDomain },
    data: { backfillStatus: status, backfillMessage: message },
  });
}

// Kicks off the backfill in the background. Returns an error string if it
// couldn't start, or null on success.
export async function startBackfill(shopDomain: string): Promise<string | null> {
  const shopRow = await db.shop.findUnique({ where: { shop: shopDomain } });
  if (!shopRow) return "Shop not found — reload the page and try again.";
  if (shopRow.backfillStatus === "running") {
    return "A sync is already running.";
  }
  const ctx = await getSyncContext(shopDomain);
  if (!ctx) {
    return "Connect Airtable and create the tables before running a sync.";
  }

  await setStatus(shopDomain, "running", "Starting…");

  // Deliberately NOT awaited: the work continues after this request returns.
  runBackfill(shopDomain).catch(async (err) => {
    console.error(`Backfill crashed for ${shopDomain}:`, err);
    await setStatus(shopDomain, "error", (err as Error).message.slice(0, 500));
    await logSyncError(shopDomain, "system", (err as Error).message, {
      topic: "backfill",
    });
  });

  return null;
}

// Runs a GraphQL query against the shop's Admin API with simple retry
// (Shopify throttles cost-based; a short wait restores budget).
async function adminQuery(
  graphql: (q: string, opts?: any) => Promise<Response>,
  query: string,
  variables: Record<string, unknown>,
): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await graphql(query, { variables });
      const body = await response.json();
      if (body.errors?.length) {
        throw new Error(body.errors.map((e: any) => e.message).join("; "));
      }
      return body.data;
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(2000 * (attempt + 1)); // 2s, 4s, 6s
    }
  }
}

const ORDERS_QUERY = `#graphql
  query BackfillOrders($cursor: String, $search: String) {
    orders(first: 10, after: $cursor, query: $search, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        legacyResourceId
        name
        createdAt
        email
        customer { displayName email }
        totalPriceSet { shopMoney { amount currencyCode } }
        displayFinancialStatus
        displayFulfillmentStatus
        lineItems(first: 25) { nodes { quantity title } }
        shippingAddress { country }
        tags
      }
    }
  }`;

const PRODUCTS_QUERY = `#graphql
  query BackfillProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        legacyResourceId
        title
        status
        vendor
        productType
        totalInventory
        tags
        createdAt
        variants(first: 1) { nodes { price } }
      }
    }
  }`;

async function runBackfill(shopDomain: string): Promise<void> {
  // Fresh context each run (token/base could have changed since startup).
  const ctx = await getSyncContext(shopDomain);
  if (!ctx) throw new Error("Airtable connection is not configured");

  // Offline admin client — works outside a browser request, which is what
  // a background job needs.
  const { admin } = await unauthenticated.admin(shopDomain);
  const graphql = (q: string, opts?: any) => admin.graphql(q, opts);

  let orders = 0;
  let products = 0;
  let failures = 0;
  let hitPlanLimit = false;

  // ---- Orders: last 90 days -------------------------------------------
  if (ctx.shopRow.syncOrders) {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    let cursor: string | null = null;
    let hasNext = true;

    while (hasNext && !hitPlanLimit) {
      const data = await adminQuery(graphql, ORDERS_QUERY, {
        cursor,
        search: `created_at:>=${since}`,
      });
      const page = data.orders;

      for (const node of page.nodes) {
        try {
          const result = await syncOrder(
            ctx,
            String(node.legacyResourceId),
            mapOrderFromGraphql(node, shopDomain),
          );
          if (result === "created" || result === "updated") orders++;
          if (result === "skipped_limit") {
            hitPlanLimit = true;
            break; // free-plan cap reached — stop pulling more orders
          }
        } catch (err) {
          failures++;
          await logSyncError(shopDomain, "order", (err as Error).message, {
            shopifyId: String(node.legacyResourceId),
            topic: "backfill",
          });
        }
      }

      hasNext = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor;
      await setStatus(shopDomain, "running", `Synced ${orders} orders…`);
      await sleep(PAGE_DELAY_MS);
    }
  }

  // ---- Products: all of them ------------------------------------------
  if (ctx.shopRow.syncProducts) {
    let cursor: string | null = null;
    let hasNext = true;

    while (hasNext) {
      const data = await adminQuery(graphql, PRODUCTS_QUERY, { cursor });
      const page = data.products;

      for (const node of page.nodes) {
        try {
          const result = await syncProduct(
            ctx,
            String(node.legacyResourceId),
            mapProductFromGraphql(node, shopDomain),
          );
          if (result === "created" || result === "updated") products++;
        } catch (err) {
          failures++;
          await logSyncError(shopDomain, "product", (err as Error).message, {
            shopifyId: String(node.legacyResourceId),
            topic: "backfill",
          });
        }
      }

      hasNext = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor;
      await setStatus(
        shopDomain,
        "running",
        `Synced ${orders} orders, ${products} products…`,
      );
      await sleep(PAGE_DELAY_MS);
    }
  }

  // ---- Wrap up ---------------------------------------------------------
  let summary = `Synced ${orders} orders and ${products} products.`;
  if (failures > 0) summary += ` ${failures} failed — see errors below.`;
  if (hitPlanLimit) {
    summary += ` Stopped at the free plan limit — upgrade to Pro to sync everything.`;
  }
  await setStatus(shopDomain, "done", summary);
}
