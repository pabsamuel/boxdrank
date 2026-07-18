// Tests free-plan metering end-to-end against the real dev database
// (SQLite) with Notion mocked: 50 orders sync, the 51st pauses sync,
// updates stay paused, and upgrading to Pro resumes everything.
//
// Deliberately reuses ONE sync context for all orders — exactly what the
// backfill does — because metering must stay correct even when the caller
// holds a stale Shop row.
//
// Run with: npm run test:sync  — needs prisma/dev.sqlite (run
// `npx prisma migrate dev` once first). Uses a throwaway shop row and
// cleans up after itself.

import { createServer } from "vite";
import { fileURLToPath } from "node:url";

process.env.ENCRYPTION_KEY = "test-secret-key-for-test-run";

// Mock Notion: every write succeeds instantly.
let pageSeq = 0;
globalThis.fetch = async () =>
  new Response(JSON.stringify({ id: `page-test-${++pageSeq}` }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
  logLevel: "error",
});

const results = [];
const check = (label, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
};

const SHOP = "metering-test.myshopify.com";

try {
  const crypto = await vite.ssrLoadModule("/app/lib/crypto.server.ts");
  const sync = await vite.ssrLoadModule("/app/lib/sync.server.ts");
  const db = (await vite.ssrLoadModule("/app/db.server.ts")).default;

  // Fresh throwaway shop, fully "onboarded" on the free plan.
  await db.recordMap.deleteMany({ where: { shop: SHOP } });
  await db.syncError.deleteMany({ where: { shop: SHOP } });
  await db.shop.deleteMany({ where: { shop: SHOP } });
  await db.shop.create({
    data: {
      shop: SHOP,
      notionToken: crypto.encryptToken("ntn_TESTTOKEN"),
      notionParentPageId: "page-parent",
      notionParentPageName: "Test",
      ordersDbId: "db-orders",
      productsDbId: "db-products",
      plan: "free",
    },
  });

  // One context reused for every order, like the backfill does.
  const ctx = await sync.getSyncContext(SHOP);
  check("sync context loads", Boolean(ctx));

  const outcomes = [];
  for (let i = 1; i <= 52; i++) {
    outcomes.push(
      await sync.syncOrder(ctx, String(i), {
        "Order number": { title: [{ text: { content: `#${i}` } }] },
      }),
    );
  }

  const created = outcomes.filter((r) => r === "created").length;
  const blocked = outcomes.filter((r) => r === "skipped_limit").length;
  check("exactly 50 orders synced", created === 50, `created ${created}`);
  check("orders 51+ blocked", blocked === 2, `blocked ${blocked}`);

  const row = await db.shop.findUnique({ where: { shop: SHOP } });
  check("counter is 50", row.ordersThisMonth === 50, `${row.ordersThisMonth}`);
  check("limitReached flag set", row.limitReached === true);

  // Updates to already-synced orders are paused too while capped.
  const upd = await sync.syncOrder(ctx, "1", {
    "Order number": { title: [{ text: { content: "#1-edited" } }] },
  });
  check("updates paused at cap", upd === "skipped_limit", upd);

  // Upgrading to Pro resumes sync immediately — even with the stale ctx.
  await db.shop.update({ where: { shop: SHOP }, data: { plan: "pro" } });
  const afterUpgrade = await sync.syncOrder(ctx, "53", {
    "Order number": { title: [{ text: { content: "#53" } }] },
  });
  check("pro resumes new orders", afterUpgrade === "created", afterUpgrade);
  const updAfter = await sync.syncOrder(ctx, "1", {
    "Order number": { title: [{ text: { content: "#1-edited" } }] },
  });
  check("pro resumes updates", updAfter === "updated", updAfter);

  // A second sync of the same order must UPDATE the same Notion page,
  // not create a duplicate (RecordMap upsert behavior).
  const maps = await db.recordMap.count({
    where: { shop: SHOP, resourceType: "order", shopifyId: "1" },
  });
  check("no duplicate mappings", maps === 1, `${maps}`);

  // Clean up the throwaway data.
  await db.recordMap.deleteMany({ where: { shop: SHOP } });
  await db.syncError.deleteMany({ where: { shop: SHOP } });
  await db.shop.deleteMany({ where: { shop: SHOP } });

  console.log(results.every(Boolean) ? "metering.test: PASS" : "metering.test: FAIL");
  process.exitCode = results.every(Boolean) ? 0 : 1;
} finally {
  await vite.close();
}
