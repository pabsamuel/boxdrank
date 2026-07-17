// Handles orders/create, orders/updated and orders/cancelled webhooks.
// All three upsert the order row in Airtable (a cancellation is just an
// update that changes the financial/fulfillment status).
//
// authenticate.webhook verifies the HMAC signature and rejects forgeries
// with a 401 before we ever touch the payload. handleOrderWebhook never
// throws — a malformed payload or Airtable outage is logged to SyncError
// and we still return 200 so Shopify doesn't retry-storm us.

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { handleOrderWebhook } from "../lib/sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await handleOrderWebhook(shop, payload as Record<string, any>, topic);

  return new Response();
};
