// Tests the pure logic: token encryption round-trip, order/product mapping
// into Notion property-value objects (webhook + GraphQL shapes), and that
// every mapped property exists in the database schemas we create.
//
// Run with: npm run test:sync   (no Shopify/Notion accounts needed)

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
  const notion = await vite.ssrLoadModule("/app/lib/notion.server.ts");

  // 1. Crypto round-trip; ciphertext must not leak the token.
  const secret = "ntn_Abc123SECRET";
  const enc = crypto.encryptToken(secret);
  check("crypto round-trip", crypto.decryptToken(enc) === secret);
  check("token not visible in ciphertext", !enc.includes(secret));

  // 2. Order webhook mapping → Notion property values.
  const order = sync.mapOrderFromWebhook(
    {
      id: 5678,
      name: "#1001",
      created_at: "2026-07-17T10:00:00Z",
      customer: { first_name: "Ada", last_name: "Lovelace", email: "ada@x.com" },
      email: "ada@x.com",
      total_price: "49.90",
      currency: "USD",
      financial_status: "partially_refunded, disputed",
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
  check(
    "order number is the title property",
    order["Order number"].title[0].text.content === "#1001",
  );
  check(
    "line items summary",
    order["Line items"].rich_text[0].text.content === "2x Blue Shirt, 1x Mug",
  );
  check(
    "customer name",
    order["Customer name"].rich_text[0].text.content === "Ada Lovelace",
  );
  check("email property", order["Customer email"].email === "ada@x.com");
  check("price is a plain number", order["Total price"].number === 49.9);
  check(
    "select names have no commas (Notion rule)",
    !order["Financial status"].select.name.includes(","),
    order["Financial status"].select.name,
  );
  check(
    "admin deep link",
    order["Shopify order URL"].url ===
      "https://admin.shopify.com/store/my-store/orders/5678",
  );
  check("date property", order["Created at"].date.start === "2026-07-17T10:00:00Z");

  // 3. A nearly-empty payload maps without throwing, with valid empties
  //    (Notion rejects empty-string email/url — they must be null).
  const weird = sync.mapOrderFromWebhook({ id: 1 }, "s.myshopify.com");
  check(
    "default fulfillment select",
    weird["Fulfillment status"].select.name === "unfulfilled",
  );
  check("empty email is null", weird["Customer email"].email === null);
  check("empty rich_text is []", weird["Shipping country"].rich_text.length === 0);

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
  check("inventory summed", product["Total inventory"].number === 7);
  check("first-variant price", product["Price"].number === 9.99);
  check("status select", product["Status"].select.name === "active");

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
  check("gql email fallback", gqlOrder["Customer email"].email === "bob@x.com");
  check("gql tags joined", gqlOrder["Tags"].rich_text[0].text.content === "a, b");
  check("gql status lowercased", gqlOrder["Financial status"].select.name === "paid");

  // 6. Every mapped property must exist in the created-database schemas,
  //    or the Notion write would 400 on an unknown property.
  const orderProps = Object.keys(notion.ORDERS_DB_PROPERTIES);
  const productProps = Object.keys(notion.PRODUCTS_DB_PROPERTIES);
  check(
    "order props all in DB schema",
    Object.keys(order).every((k) => orderProps.includes(k)),
  );
  check(
    "product props all in DB schema",
    Object.keys(product).every((k) => productProps.includes(k)),
  );

  console.log(results.every(Boolean) ? "mapping.test: PASS" : "mapping.test: FAIL");
  process.exitCode = results.every(Boolean) ? 0 : 1;
} finally {
  await vite.close();
}
