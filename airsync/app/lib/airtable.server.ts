// Thin Airtable client used everywhere the app talks to Airtable.
//
// Uses plain REST calls (fetch) instead of the `airtable` npm package because
// the package does not support the Meta API (listing bases / creating tables),
// and this way all Airtable traffic goes through one throttled code path.
//
// Reliability rules implemented here:
//  - Throttle: Airtable allows 5 requests/second per base. We space request
//    starts 250ms apart per base (4/sec) to stay safely under the limit.
//  - Retry: failed requests are retried 3 times with exponential backoff
//    (1s, 2s, 4s). 429s wait at least 30s, as Airtable's docs require.

const API = "https://api.airtable.com/v0";

// ---------------------------------------------------------------------------
// Throttle queue: one promise chain per Airtable base. Each request awaits the
// previous one's start time + 250ms, so bursts of webhooks get spread out.
// ---------------------------------------------------------------------------

const MIN_GAP_MS = 250;
const queueTails = new Map<string, Promise<void>>();

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function throttled<T>(baseKey: string, fn: () => Promise<T>): Promise<T> {
  const tail = queueTails.get(baseKey) ?? Promise.resolve();
  let release: () => void;
  const gate = new Promise<void>((r) => (release = r));
  // The next caller waits until we've *started* and 250ms have passed.
  queueTails.set(
    baseKey,
    tail.then(() => gate).then(() => sleep(MIN_GAP_MS)),
  );
  await tail;
  release!();
  return fn();
}

// ---------------------------------------------------------------------------
// Core request helper with retries. Never logs the token.
// ---------------------------------------------------------------------------

export class AirtableError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_RETRIES = 3;

async function request<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  baseKey = "meta",
): Promise<T> {
  let lastError: Error = new Error("Airtable request failed");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // 1s, 2s, 4s backoff; a 429 tells us to wait at least 30s.
      const is429 = lastError instanceof AirtableError && lastError.status === 429;
      await sleep(is429 ? 30_000 : 1000 * 2 ** (attempt - 1));
    }

    try {
      return await throttled(baseKey, async () => {
        const res = await fetch(`${API}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

        if (res.ok) return (await res.json()) as T;

        // Read Airtable's error message so failures are debuggable.
        let detail = res.statusText;
        try {
          const errBody = (await res.json()) as {
            error?: { type?: string; message?: string } | string;
          };
          if (typeof errBody.error === "string") detail = errBody.error;
          else if (errBody.error?.message)
            detail = `${errBody.error.type ?? ""} ${errBody.error.message}`.trim();
        } catch {
          // non-JSON error body — keep statusText
        }
        throw new AirtableError(res.status, `Airtable ${res.status}: ${detail}`);
      });
    } catch (err) {
      lastError = err as Error;
      const status = err instanceof AirtableError ? err.status : 0;
      // Retry on rate limits (429), server errors (5xx), and network
      // failures (status 0). Any other 4xx (bad token, missing base,
      // invalid field) won't fix itself, so fail immediately.
      const retryable = status === 429 || status >= 500 || status === 0;
      if (!retryable) throw err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Meta API: token validation, listing bases, creating tables
// ---------------------------------------------------------------------------

// Cheapest way to check a token is valid. Throws AirtableError(401) if not.
export async function validateToken(token: string): Promise<void> {
  await request(token, "GET", "/meta/whoami");
}

export type AirtableBase = { id: string; name: string };

// Lists every base the token can see. Requires the `schema.bases:read` scope.
export async function listBases(token: string): Promise<AirtableBase[]> {
  const bases: AirtableBase[] = [];
  let offset: string | undefined;
  do {
    const page = await request<{
      bases: { id: string; name: string; permissionLevel: string }[];
      offset?: string;
    }>(token, "GET", `/meta/bases${offset ? `?offset=${offset}` : ""}`);
    for (const b of page.bases) bases.push({ id: b.id, name: b.name });
    offset = page.offset;
  } while (offset);
  return bases;
}

export type AirtableTable = { id: string; name: string };

// Lists tables in a base, so "Create tables for me" can reuse existing ones.
export async function listTables(
  token: string,
  baseId: string,
): Promise<AirtableTable[]> {
  const res = await request<{ tables: { id: string; name: string }[] }>(
    token,
    "GET",
    `/meta/bases/${baseId}/tables`,
  );
  return res.tables.map((t) => ({ id: t.id, name: t.name }));
}

// The fixed schemas for the two tables we create. The first field becomes the
// table's primary field in Airtable.
const DATE_OPTS = {
  timeZone: "utc",
  dateFormat: { name: "iso" },
  timeFormat: { name: "24hour" },
} as const;

export const ORDERS_TABLE_FIELDS = [
  { name: "Order number", type: "singleLineText" },
  { name: "Created at", type: "dateTime", options: DATE_OPTS },
  { name: "Customer name", type: "singleLineText" },
  { name: "Customer email", type: "email" },
  { name: "Total price", type: "number", options: { precision: 2 } },
  { name: "Currency", type: "singleLineText" },
  { name: "Financial status", type: "singleLineText" },
  { name: "Fulfillment status", type: "singleLineText" },
  { name: "Line items", type: "multilineText" },
  { name: "Shipping country", type: "singleLineText" },
  { name: "Tags", type: "singleLineText" },
  { name: "Shopify order URL", type: "url" },
];

export const PRODUCTS_TABLE_FIELDS = [
  { name: "Title", type: "singleLineText" },
  { name: "Status", type: "singleLineText" },
  { name: "Vendor", type: "singleLineText" },
  { name: "Product type", type: "singleLineText" },
  { name: "Price", type: "number", options: { precision: 2 } },
  { name: "Total inventory", type: "number", options: { precision: 0 } },
  { name: "Tags", type: "singleLineText" },
  { name: "Created at", type: "dateTime", options: DATE_OPTS },
  { name: "Shopify product URL", type: "url" },
];

// Creates the Orders and Products tables in the chosen base (skipping any
// that already exist by name). Requires the `schema.bases:write` scope.
// Returns the table IDs to store on the Shop row.
export async function createSyncTables(
  token: string,
  baseId: string,
): Promise<{ ordersTableId: string; productsTableId: string }> {
  const existing = await listTables(token, baseId);
  const byName = new Map(existing.map((t) => [t.name, t.id]));

  async function ensureTable(name: string, fields: unknown[]): Promise<string> {
    const found = byName.get(name);
    if (found) return found;
    const created = await request<{ id: string }>(
      token,
      "POST",
      `/meta/bases/${baseId}/tables`,
      { name, fields },
      baseId,
    );
    return created.id;
  }

  const ordersTableId = await ensureTable("Orders", ORDERS_TABLE_FIELDS);
  const productsTableId = await ensureTable("Products", PRODUCTS_TABLE_FIELDS);
  return { ordersTableId, productsTableId };
}

// ---------------------------------------------------------------------------
// Record operations (throttled per base). `typecast: true` lets Airtable
// coerce values (e.g. a number arriving as a string) instead of erroring.
// ---------------------------------------------------------------------------

export async function createRecord(
  token: string,
  baseId: string,
  tableId: string,
  fields: Record<string, unknown>,
): Promise<string> {
  const res = await request<{ id: string }>(
    token,
    "POST",
    `/${baseId}/${tableId}`,
    { fields, typecast: true },
    baseId,
  );
  return res.id;
}

export async function updateRecord(
  token: string,
  baseId: string,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await request(
    token,
    "PATCH",
    `/${baseId}/${tableId}/${recordId}`,
    { fields, typecast: true },
    baseId,
  );
}

export async function deleteRecord(
  token: string,
  baseId: string,
  tableId: string,
  recordId: string,
): Promise<void> {
  try {
    await request(token, "DELETE", `/${baseId}/${tableId}/${recordId}`, undefined, baseId);
  } catch (err) {
    // Already gone in Airtable — that's fine, we wanted it deleted anyway.
    if (err instanceof AirtableError && err.status === 404) return;
    throw err;
  }
}
