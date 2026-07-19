// Tests the pure logic: token encryption round-trip, order/product field
// mapping (both webhook and GraphQL shapes), and that every mapped field
// exists in the Airtable table schemas we create.
//
// Run with: npm run test:sync   (no Shopify/Airtable accounts needed)

import { createServer } from "vite";
import { fileURLToPath } from "node:url";

process.env.ENCRYPTION_KEY = "test-secret-key-for-test-run";

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

try {
  const crypto = await vite.ssrLoadModule("/app/lib/crypto.server.ts");
  const sync = await vite.ssrLoadModule("/app/lib/sync.server.ts");
  const airtable = await vite.ssrLoadModule("/app/lib/airtable.server.ts");

  // 1. Crypto round-trip; ciphertext must not leak the token.
  const secret = "patAbC123.xyzSECRET";
  const enc = crypto.encryptToken(secret);
  check("crypto round-trip", crypto.decryptToken(enc) === secret);
  check("token not visible in ciphertext", !enc.includes(secret));

  // 2. Order webhook mapping.
  const order = sync.mapOrderFromWebhook(
    {
      id: 5678,
      name: "#1001",
      created_at: "2026-07-17T10:00:00Z",
      customer: { first_name: "Ada", last_name: "Lovelace", email: "ada@x.com" },
      email: "ada@x.com",
      total_price: "49.90",
      currency: "USD",
      financial_status: "paid",
      fulfillment_status: null,
      line_items: [
        { quantity: 2, title: "Blue Shirt" },
        { quantity: 1, title: "Mug" },
      ],
      shipping_address: { country: "Germany" },
      tags: "vip, wholesale",
    },
    "my-store.myshopify.com",
  );
  check("line items summary", order["Line items"] === "2x Blue Shirt, 1x Mug");
  check("customer name", order["Customer name"] === "Ada Lovelace");
  check(
    "admin deep link",
    order["Shopify order URL"] === "https://admin.shopify.com/store/my-store/orders/5678",
  );
  check("price is numeric", order["Total price"] === 49.9);

  // 3. A nearly-empty payload maps without throwing.
  const weird = sync.mapOrderFromWebhook({ id: 1 }, "s.myshopify.com");
  check("malformed order handled", weird["Fulfillment status"] === "unfulfilled");

  // 4. Product mapping: inventory summed, first-variant price.
  const product = sync.mapProductFromWebhook(
    {
      id: 42,
      title: "Mug",
      status: "active",
      vendor: "ACME",
      product_type: "Kitchen",
      variants: [
        { price: "9.99", inventory_quantity: 3 },
        { price: "12.99", inventory_quantity: 4 },
      ],
      tags: "new",
      created_at: "2026-07-01T00:00:00Z",
    },
    "my-store.myshopify.com",
  );
  check("inventory summed", product["Total inventory"] === 7);
  check("first-variant price", product["Price"] === 9.99);

  // 5. GraphQL (backfill) order shape.
  const gqlOrder = sync.mapOrderFromGraphql(
    {
      legacyResourceId: "999",
      name: "#1002",
      createdAt: "2026-05-01T00:00:00Z",
      customer: { displayName: "Bob T", email: "bob@x.com" },
      email: null,
      totalPriceSet: { shopMoney: { amount: "10.00", currencyCode: "EUR" } },
      displayFinancialStatus: "PAID",
      displayFulfillmentStatus: "FULFILLED",
      lineItems: { nodes: [{ quantity: 1, title: "Thing" }] },
      shippingAddress: { country: "France" },
      tags: ["a", "b"],
    },
    "my-store.myshopify.com",
  );
  check("gql email fallback", gqlOrder["Customer email"] === "bob@x.com");
  check("gql tags joined", gqlOrder["Tags"] === "a, b");

  // 6. Every mapped field must exist in the created-table schemas, or the
  //    Airtable write would silently drop it (typecast) or fail.
  const orderFields = airtable.ORDERS_TABLE_FIELDS.map((f) => f.name);
  const productFields = airtable.PRODUCTS_TABLE_FIELDS.map((f) => f.name);
  check(
    "order fields all in table schema",
    Object.keys(order).every((k) => orderFields.includes(k)),
  );
  check(
    "product fields all in table schema",
    Object.keys(product).every((k) => productFields.includes(k)),
  );

  console.log(results.every(Boolean) ? "mapping.test: PASS" : "mapping.test: FAIL");
  process.exitCode = results.every(Boolean) ? 0 : 1;
} finally {
  await vite.close();
}
