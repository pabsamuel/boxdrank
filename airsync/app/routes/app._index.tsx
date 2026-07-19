// The one and only screen of AirSync: onboarding + settings + sync status.
// Embedded in the Shopify admin, built with Polaris so it looks native.
//
// The page walks the merchant through three steps:
//   1. Connect Airtable (paste a Personal Access Token)
//   2. Pick a base and create the Orders/Products tables
//   3. Choose what to sync and run the initial 90-day sync
// plus a status column (plan, last sync, record counts, recent errors).

import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  Link,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticate, isBillingTest, PRO_PLAN } from "../shopify.server";
import db from "../db.server";
import { encryptToken, decryptToken } from "../lib/crypto.server";
import {
  createSyncTables,
  listBases,
  validateToken,
  type AirtableBase,
} from "../lib/airtable.server";
import { FREE_PLAN_ORDER_LIMIT } from "../lib/constants";
import { startBackfill } from "../lib/backfill.server";

// ---------------------------------------------------------------------------
// Loader: everything the page needs to render.
// ---------------------------------------------------------------------------

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Make sure this shop has a settings row (first visit creates it).
  let shopRow = await db.shop.upsert({
    where: { shop: shopDomain },
    create: { shop: shopDomain },
    update: {},
  });

  // Ask Shopify's billing API whether a Pro subscription is active, and keep
  // our cached copy in sync (billing is the source of truth). If the billing
  // API hiccups, fall back to the cached plan instead of crashing the page.
  let plan = shopRow.plan;
  try {
    const { hasActivePayment } = await billing.check({
      plans: [PRO_PLAN],
      isTest: isBillingTest,
    });
    plan = hasActivePayment ? "pro" : "free";
    if (plan !== shopRow.plan) {
      shopRow = await db.shop.update({
        where: { shop: shopDomain },
        data: { plan },
      });
    }
  } catch (err) {
    console.error("Billing check failed:", err);
  }

  // If Airtable is connected, load the list of bases for the picker.
  let bases: AirtableBase[] = [];
  let airtableError: string | null = null;
  if (shopRow.airtableToken) {
    try {
      bases = await listBases(decryptToken(shopRow.airtableToken));
    } catch (err) {
      airtableError =
        "Could not reach Airtable with the saved token. It may have been revoked — try reconnecting. " +
        `(${(err as Error).message})`;
    }
  }

  const [orderCount, productCount, recentErrors] = await Promise.all([
    db.recordMap.count({ where: { shop: shopDomain, resourceType: "order" } }),
    db.recordMap.count({
      where: { shop: shopDomain, resourceType: "product" },
    }),
    db.syncError.findMany({
      where: { shop: shopDomain },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    hasToken: Boolean(shopRow.airtableToken),
    baseId: shopRow.airtableBaseId,
    baseName: shopRow.airtableBaseName,
    tablesReady: Boolean(shopRow.ordersTableId && shopRow.productsTableId),
    syncOrders: shopRow.syncOrders,
    syncProducts: shopRow.syncProducts,
    plan,
    ordersThisMonth: shopRow.ordersThisMonth,
    limitReached: shopRow.limitReached,
    backfillStatus: shopRow.backfillStatus,
    backfillMessage: shopRow.backfillMessage,
    lastSyncAt: shopRow.lastSyncAt?.toISOString() ?? null,
    orderCount,
    productCount,
    bases,
    airtableError,
    recentErrors: recentErrors.map((e) => ({
      id: e.id,
      message: e.message,
      resourceType: e.resourceType,
      createdAt: e.createdAt.toISOString(),
    })),
  };
};

// ---------------------------------------------------------------------------
// Action: every button on the page posts here with an "intent" field.
// ---------------------------------------------------------------------------

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent"));

  const fail = (message: string) => ({ ok: false as const, message });
  const succeed = (message: string) => ({ ok: true as const, message });

  switch (intent) {
    // Step 1: validate the pasted token against Airtable, then store it
    // encrypted. The plain token never touches the DB or the logs.
    case "save-token": {
      const token = String(form.get("token") ?? "").trim();
      if (!token)
        return fail("Paste your Airtable Personal Access Token first.");
      try {
        await validateToken(token);
      } catch {
        return fail(
          "Airtable rejected that token. Check it was copied fully and hasn't been revoked.",
        );
      }
      await db.shop.update({
        where: { shop: shopDomain },
        data: { airtableToken: encryptToken(token) },
      });
      return succeed("Airtable connected.");
    }

    // Forget the token (and everything that depended on it).
    case "disconnect": {
      await db.shop.update({
        where: { shop: shopDomain },
        data: {
          airtableToken: null,
          airtableBaseId: null,
          airtableBaseName: null,
          ordersTableId: null,
          productsTableId: null,
        },
      });
      return succeed("Airtable disconnected.");
    }

    // Step 2a: remember which base to sync into. Changing base resets the
    // table IDs, since those belonged to the old base.
    case "choose-base": {
      const baseId = String(form.get("baseId") ?? "");
      const baseName = String(form.get("baseName") ?? "");
      if (!baseId) return fail("Pick a base first.");
      await db.shop.update({
        where: { shop: shopDomain },
        data: {
          airtableBaseId: baseId,
          airtableBaseName: baseName,
          ordersTableId: null,
          productsTableId: null,
        },
      });
      return succeed(`Base "${baseName}" selected. Now create the tables.`);
    }

    // Step 2b: create the Orders + Products tables (reuses same-named
    // tables if they already exist in the base).
    case "create-tables": {
      const shopRow = await db.shop.findUnique({ where: { shop: shopDomain } });
      if (!shopRow?.airtableToken || !shopRow.airtableBaseId) {
        return fail("Connect Airtable and pick a base first.");
      }
      try {
        const ids = await createSyncTables(
          decryptToken(shopRow.airtableToken),
          shopRow.airtableBaseId,
        );
        await db.shop.update({
          where: { shop: shopDomain },
          data: {
            ordersTableId: ids.ordersTableId,
            productsTableId: ids.productsTableId,
          },
        });
        return succeed("Orders and Products tables are ready.");
      } catch (err) {
        return fail(
          `Could not create tables: ${(err as Error).message}. ` +
            "Make sure your token has the schema.bases:write scope for this base.",
        );
      }
    }

    // Step 3: the two sync toggles (auto-saved when clicked).
    case "save-toggles": {
      await db.shop.update({
        where: { shop: shopDomain },
        data: {
          syncOrders: form.get("syncOrders") === "true",
          syncProducts: form.get("syncProducts") === "true",
        },
      });
      return succeed("Sync settings saved.");
    }

    // Step 3: kick off the 90-day backfill (runs in the background).
    case "run-backfill": {
      const error = await startBackfill(shopDomain);
      return error ? fail(error) : succeed("Initial sync started.");
    }

    // Status column: clear the error list.
    case "clear-errors": {
      await db.syncError.deleteMany({ where: { shop: shopDomain } });
      return succeed("Errors cleared.");
    }

    // Upgrade button: send the merchant to Shopify's subscription
    // confirmation screen. billing.request redirects the whole admin.
    case "upgrade": {
      await billing.request({ plan: PRO_PLAN, isTest: isBillingTest });
      return null; // unreachable — billing.request always redirects
    }

    default:
      return fail("Unknown action.");
  }
};

// ---------------------------------------------------------------------------
// The page itself.
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();

  const [tokenInput, setTokenInput] = useState("");
  const [selectedBase, setSelectedBase] = useState(data.baseId ?? "");

  const busy = fetcher.state !== "idle";
  const backfillRunning = data.backfillStatus === "running";

  // Show a toast whenever an action finishes.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  // While the initial sync runs, refresh the page data every few seconds so
  // the progress message and counts stay live.
  useEffect(() => {
    if (!backfillRunning) return;
    const id = setInterval(() => revalidator.revalidate(), 3000);
    return () => clearInterval(id);
  }, [backfillRunning, revalidator]);

  const submit = (fields: Record<string, string>) =>
    fetcher.submit(fields, { method: "post" });

  const baseOptions = [
    { label: "Select a base…", value: "" },
    ...data.bases.map((b) => ({ label: b.name, value: b.id })),
  ];

  return (
    <Page>
      <TitleBar title="AirSync — Airtable Order & Product Sync" />
      <BlockStack gap="500">
        {/* Upgrade nag: only when the free-plan cap has paused order sync. */}
        {data.limitReached && data.plan === "free" && (
          <Banner
            title={`Order sync is paused — you reached the free plan limit of ${FREE_PLAN_ORDER_LIMIT} orders this month`}
            tone="warning"
            action={{
              content: "Upgrade to Pro — $14.99/mo, 7-day free trial",
              onAction: () => submit({ intent: "upgrade" }),
            }}
          >
            <p>
              Upgrade to Pro for unlimited order sync. Sync resumes
              automatically after upgrading (or when a new month starts).
            </p>
          </Banner>
        )}

        {data.airtableError && (
          <Banner title="Airtable connection problem" tone="critical">
            <p>{data.airtableError}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {/* ---- Step 1: connect Airtable ---- */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Step 1 — Connect Airtable
                    </Text>
                    {data.hasToken && <Badge tone="success">Connected</Badge>}
                  </InlineStack>

                  {data.hasToken ? (
                    <InlineStack gap="300" blockAlign="center">
                      <Text as="p" tone="subdued">
                        Your Airtable token is saved (encrypted).
                      </Text>
                      <Button
                        variant="plain"
                        tone="critical"
                        onClick={() => submit({ intent: "disconnect" })}
                        disabled={busy}
                      >
                        Disconnect
                      </Button>
                    </InlineStack>
                  ) : (
                    <BlockStack gap="300">
                      <Text as="p">
                        Create a{" "}
                        <Link
                          url="https://airtable.com/create/tokens"
                          target="_blank"
                        >
                          Personal Access Token
                        </Link>{" "}
                        with these scopes: <b>data.records:read</b>,{" "}
                        <b>data.records:write</b>, <b>schema.bases:read</b>,{" "}
                        <b>schema.bases:write</b> — and give it access to the
                        workspace or base you want to sync into.
                      </Text>
                      <TextField
                        label="Airtable Personal Access Token"
                        type="password"
                        value={tokenInput}
                        onChange={setTokenInput}
                        autoComplete="off"
                        placeholder="pat…"
                        helpText="Stored encrypted. Never shared or logged."
                      />
                      <InlineStack>
                        <Button
                          variant="primary"
                          loading={busy}
                          onClick={() => {
                            submit({ intent: "save-token", token: tokenInput });
                            setTokenInput("");
                          }}
                        >
                          Connect Airtable
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* ---- Step 2: pick base + create tables ---- */}
              {data.hasToken && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="h2" variant="headingMd">
                        Step 2 — Choose a base and create tables
                      </Text>
                      {data.tablesReady && (
                        <Badge tone="success">Tables ready</Badge>
                      )}
                    </InlineStack>

                    <Select
                      label="Airtable base"
                      options={baseOptions}
                      value={selectedBase}
                      onChange={(value) => {
                        setSelectedBase(value);
                        if (value) {
                          const name =
                            data.bases.find((b) => b.id === value)?.name ?? "";
                          submit({
                            intent: "choose-base",
                            baseId: value,
                            baseName: name,
                          });
                        }
                      }}
                      helpText={
                        data.baseName
                          ? `Syncing into "${data.baseName}".`
                          : "Bases your token can access."
                      }
                    />

                    <InlineStack gap="300">
                      <Button
                        variant="primary"
                        disabled={!data.baseId || busy}
                        loading={busy}
                        onClick={() => submit({ intent: "create-tables" })}
                      >
                        Create tables for me
                      </Button>
                      <Text as="p" tone="subdued">
                        Creates “Orders” and “Products” tables (existing ones
                        with those names are reused).
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Card>
              )}

              {/* ---- Step 3: toggles + initial sync ---- */}
              {data.tablesReady && (
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Step 3 — What to sync
                    </Text>

                    <Checkbox
                      label="Sync orders"
                      checked={data.syncOrders}
                      disabled={busy}
                      onChange={(checked) =>
                        submit({
                          intent: "save-toggles",
                          syncOrders: String(checked),
                          syncProducts: String(data.syncProducts),
                        })
                      }
                      helpText="New and updated orders appear in the Orders table within seconds."
                    />
                    <Checkbox
                      label="Sync products"
                      checked={data.syncProducts}
                      disabled={busy}
                      onChange={(checked) =>
                        submit({
                          intent: "save-toggles",
                          syncOrders: String(data.syncOrders),
                          syncProducts: String(checked),
                        })
                      }
                      helpText="Product creates, updates and deletes are mirrored in the Products table."
                    />

                    <Divider />

                    <InlineStack gap="300" blockAlign="center">
                      <Button
                        variant="primary"
                        loading={backfillRunning}
                        disabled={busy || backfillRunning}
                        onClick={() => submit({ intent: "run-backfill" })}
                      >
                        {backfillRunning ? "Syncing…" : "Run initial sync"}
                      </Button>
                      <Text as="p" tone="subdued">
                        Backfills the last 90 days of orders and all products.
                      </Text>
                    </InlineStack>

                    {data.backfillMessage && (
                      <Text
                        as="p"
                        tone={
                          data.backfillStatus === "error"
                            ? "critical"
                            : "subdued"
                        }
                      >
                        {data.backfillMessage}
                      </Text>
                    )}
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>

          {/* ---- Status column ---- */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Status
                  </Text>

                  <InlineStack align="space-between">
                    <Text as="p">Plan</Text>
                    {data.plan === "pro" ? (
                      <Badge tone="success">Pro</Badge>
                    ) : (
                      <Badge>Free</Badge>
                    )}
                  </InlineStack>

                  {data.plan === "free" && (
                    <>
                      <InlineStack align="space-between">
                        <Text as="p">Orders this month</Text>
                        <Text as="p">
                          {data.ordersThisMonth} / {FREE_PLAN_ORDER_LIMIT}
                        </Text>
                      </InlineStack>
                      <Button
                        onClick={() => submit({ intent: "upgrade" })}
                        disabled={busy}
                      >
                        Upgrade to Pro — $14.99/mo
                      </Button>
                      <Text as="p" tone="subdued">
                        7-day free trial, unlimited orders.
                      </Text>
                    </>
                  )}

                  <Divider />

                  <InlineStack align="space-between">
                    <Text as="p">Last sync</Text>
                    <Text as="p" tone="subdued">
                      {data.lastSyncAt
                        ? new Date(data.lastSyncAt).toLocaleString()
                        : "Never"}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p">Orders synced</Text>
                    <Text as="p">{data.orderCount}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p">Products synced</Text>
                    <Text as="p">{data.productCount}</Text>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Recent errors
                    </Text>
                    {data.recentErrors.length > 0 && (
                      <Button
                        variant="plain"
                        onClick={() => submit({ intent: "clear-errors" })}
                        disabled={busy}
                      >
                        Clear
                      </Button>
                    )}
                  </InlineStack>

                  {data.recentErrors.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No sync errors. 🎉
                    </Text>
                  ) : (
                    <BlockStack gap="200">
                      {data.recentErrors.map((err) => (
                        <Box
                          key={err.id}
                          padding="200"
                          background="bg-surface-critical"
                          borderRadius="200"
                        >
                          <Text as="p" variant="bodySm">
                            <b>{err.resourceType}</b> ·{" "}
                            {new Date(err.createdAt).toLocaleString()}
                            <br />
                            {err.message}
                          </Text>
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
