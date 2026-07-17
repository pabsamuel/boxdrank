// The three mandatory GDPR/privacy compliance webhooks.
// See https://shopify.dev/docs/apps/build/privacy-law-compliance
//
// What we store, for context:
//  - No customer PII lives in our database. Order data (names/emails) goes
//    straight into the MERCHANT'S OWN Airtable base; we only keep the
//    Shopify-ID → Airtable-record-ID mapping, which contains no PII.
//
// authenticate.webhook verifies the HMAC and automatically returns 401 for
// invalid signatures — a hard requirement for compliance webhooks.

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { deleteShopData, logSyncError } from "../lib/sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} compliance webhook for ${shop}`);

  try {
    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
        // We hold no customer data to hand over — the merchant's order rows
        // live in their own Airtable base, which they control directly.
        break;
      case "CUSTOMERS_REDACT":
        // Nothing to redact locally for the same reason. The merchant is
        // responsible for their own Airtable base contents.
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
