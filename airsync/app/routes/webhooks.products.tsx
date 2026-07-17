// Handles products/create, products/update and products/delete webhooks.
// Create/update upsert the product row in Airtable; delete removes it.
//
// authenticate.webhook verifies the HMAC signature (401 on forgery).
// handleProductWebhook never throws — failures are logged to SyncError and
// we always return 200 for authentic webhooks.

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { handleProductWebhook } from "../lib/sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await handleProductWebhook(shop, payload as Record<string, any>, topic);

  return new Response();
};
