// Handles orders/create, orders/updated and orders/cancelled webhooks.
// All three upsert the order row in Airtable (a cancellation is just an
// update that changes the financial/fulfillment status).
//
// authenticate.webhook verifies the HMAC signature and rejects forgeries
// with a 401 Response before we ever touch the payload — we let that
// Response through. Any OTHER failure (malformed body, Airtable outage)
// must never crash: it's logged and we return 200 so Shopify doesn't
// retry-storm us.

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { handleOrderWebhook } from "../lib/sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string, topic: string, payload: unknown;
  try {
    ({ shop, topic, payload } = await authenticate.webhook(request));
  } catch (err) {
    if (err instanceof Response) throw err; // 401 for bad HMAC — required
    console.error("Malformed order webhook:", err);
    return new Response();
  }

  console.log(`Received ${topic} webhook for ${shop}`);
  await handleOrderWebhook(shop, payload as Record<string, any>, topic);

  return new Response();
};
