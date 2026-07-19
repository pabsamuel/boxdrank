// app/uninstalled: the merchant removed the app. Clean up everything we
// store for the shop — sessions, settings (including the encrypted Airtable
// token), record mappings and sync errors. Their Airtable base is untouched.

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { deleteShopData } from "../lib/sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string, topic: string, session: unknown;
  try {
    ({ shop, topic, session } = await authenticate.webhook(request));
  } catch (err) {
    if (err instanceof Response) throw err; // 401 for bad HMAC — required
    console.error("Malformed uninstall webhook:", err);
    return new Response();
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  // This webhook can fire more than once; deleteMany-based cleanup is
  // idempotent so a second delivery is harmless.
  if (session) {
    await deleteShopData(shop);
  }

  return new Response();
};
