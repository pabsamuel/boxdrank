// The three mandatory GDPR/privacy compliance webhooks.
// See https://shopify.dev/docs/apps/build/privacy-law-compliance
//
// What we store, for context:
//  - No customer PII lives in our database. Order data (names/emails) goes
//    straight into the MERCHANT'S OWN Notion workspace; we only keep the
//    Shopify-ID → Notion-page-ID mapping, which contains no PII.
//
// authenticate.webhook verifies the HMAC and returns a 401 Response for
// invalid signatures — a hard requirement for compliance webhooks, so that
// Response is allowed through. Everything else is logged and answered 200.

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { deleteShopData, logSyncError } from "../lib/sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string, topic: string;
  try {
    ({ shop, topic } = await authenticate.webhook(request));
  } catch (err) {
    if (err instanceof Response) throw err; // 401 for bad HMAC — required
    console.error("Malformed compliance webhook:", err);
    return new Response();
  }

  console.log(`Received ${topic} compliance webhook for ${shop}`);

  try {
    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
        // We hold no customer data to hand over — the merchant's order rows
        // live in their own Notion workspace, which they control directly.
        break;
      case "CUSTOMERS_REDACT":
        // Nothing to redact locally for the same reason. The merchant is
        // responsible for their own Notion workspace contents.
        break;
      case "SHOP_REDACT":
        // Sent 48h after uninstall: remove everything we hold for the shop.
        await deleteShopData(shop);
        break;
    }
  } catch (err) {
    // Log but still return 200 — Shopify will not accept a crash here.
    await logSyncError(shop, "system", (err as Error).message, { topic });
  }

  return new Response();
};
