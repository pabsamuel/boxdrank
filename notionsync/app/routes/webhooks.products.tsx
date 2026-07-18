// Handles products/create, products/update and products/delete webhooks.
// Create/update upsert the product row in Notion; delete removes it.
//
// authenticate.webhook verifies the HMAC (401 Response on forgery — we let
// that through). Any other failure is logged and we still return 200.

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { handleProductWebhook } from "../lib/sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string, topic: string, payload: unknown;
  try {
    ({ shop, topic, payload } = await authenticate.webhook(request));
  } catch (err) {
    if (err instanceof Response) throw err; // 401 for bad HMAC — required
    console.error("Malformed product webhook:", err);
    return new Response();
  }

  console.log(`Received ${topic} webhook for ${shop}`);
  await handleProductWebhook(shop, payload as Record<string, any>, topic);

  return new Response();
};
