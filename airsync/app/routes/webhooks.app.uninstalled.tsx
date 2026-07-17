// app/uninstalled: the merchant removed the app. Clean up everything we
// store for the shop — sessions, settings (including the encrypted Airtable
// token), record mappings and sync errors. Their Airtable base is untouched.

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { deleteShopData } from "../lib/sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // This webhook can fire more than once; deleteMany-based cleanup is
  // idempotent so a second delivery is harmless.
  if (session) {
    await deleteShopData(shop);
  }

  return new Response();
};
