// Thin Notion client used everywhere the app talks to Notion.
//
// Plain REST calls (fetch) against the Notion API — one throttled code path
// for everything: token validation, listing parent pages, creating the
// Orders/Products databases, and page (row) upserts.
//
// Reliability rules implemented here:
//  - Throttle: Notion allows an average of 3 requests/second per
//    integration. We space request starts 350ms apart per token (~2.8/sec)
//    to stay safely under the limit.
//  - Retry: failed requests are retried 3 times with exponential backoff
//    (1s, 2s, 4s). 429s honor Notion's Retry-After header (min 2s).

import crypto from "node:crypto";

const API = "https://api.notion.com/v1";
// Pinned Notion API version — bump deliberately, testing the changelog.
const NOTION_VERSION = "2022-06-28";

// ---------------------------------------------------------------------------
// Throttle queue: one promise chain per integration token (Notion's rate
// limit is per integration, not per database). Keyed by a hash so the token
// itself never sits in a Map key.
// ---------------------------------------------------------------------------

const MIN_GAP_MS = 350;
const queueTails = new Map<string, Promise<void>>();

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function queueKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
}

async function throttled<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const tail = queueTails.get(key) ?? Promise.resolve();
  let release: () => void;
  const gate = new Promise<void>((r) => (release = r));
  // The next caller waits until we've *started* and 350ms have passed.
  queueTails.set(
    key,
    tail.then(() => gate).then(() => sleep(MIN_GAP_MS)),
  );
  await tail;
  release!();
  return fn();
}

// ---------------------------------------------------------------------------
// Core request helper with retries. Never logs the token.
// ---------------------------------------------------------------------------

export class NotionError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_RETRIES = 3;

async function request<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const key = queueKey(token);
  let lastError: Error = new Error("Notion request failed");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const is429 = lastError instanceof NotionError && lastError.status === 429;
      await sleep(is429 ? 2_000 * attempt : 1000 * 2 ** (attempt - 1));
    }

    try {
      return await throttled(key, async () => {
        const res = await fetch(`${API}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

        if (res.ok) return (await res.json()) as T;

        // Read Notion's error body so failures are debuggable.
        let code = "unknown";
        let detail = res.statusText;
        try {
          const errBody = (await res.json()) as { code?: string; message?: string };
          code = errBody.code ?? code;
          detail = errBody.message ?? detail;
        } catch {
          // non-JSON error body — keep statusText
        }
        throw new NotionError(res.status, code, `Notion ${res.status}: ${detail}`);
      });
    } catch (err) {
      lastError = err as Error;
      const status = err instanceof NotionError ? err.status : 0;
      // Retry on rate limits (429), server errors (5xx), and network
      // failures (status 0). Any other 4xx (bad token, missing page,
      // invalid property) won't fix itself, so fail immediately.
      const retryable = status === 429 || status >= 500 || status === 0;
      if (!retryable) throw err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Token validation + parent page listing
// ---------------------------------------------------------------------------

// Cheapest way to check a token is valid. Throws NotionError(401) if not.
export async function validateToken(token: string): Promise<void> {
  await request(token, "GET", "/users/me");
}

export type NotionPage = { id: string; title: string };

// Extracts a page's plain-text title. Notion buries it in whichever
// property has type "title" (usually named "title" on plain pages).
function pageTitle(page: any): string {
  const props = page.properties ?? {};
  for (const prop of Object.values<any>(props)) {
    if (prop?.type === "title") {
      const text = (prop.title ?? [])
        .map((t: any) => t.plain_text ?? "")
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return "Untitled";
}

// Lists pages the integration was given access to (the merchant must
// "share"/connect a page with the integration in Notion). These are the
// candidate parents for the Orders/Products databases.
export async function listParentPages(token: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await request<{
      results: any[];
      has_more: boolean;
      next_cursor: string | null;
    }>(token, "POST", "/search", {
      filter: { value: "page", property: "object" },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const page of res.results) {
      pages.push({ id: page.id, title: pageTitle(page) });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return pages;
}

// ---------------------------------------------------------------------------
// Database creation. The fixed schemas for the two databases we create.
// The "title" property is the row's primary text in Notion.
// ---------------------------------------------------------------------------

export const ORDERS_DB_PROPERTIES: Record<string, unknown> = {
  "Order number": { title: {} },
  "Created at": { date: {} },
  "Customer name": { rich_text: {} },
  "Customer email": { email: {} },
  "Total price": { number: { format: "number" } },
  Currency: { rich_text: {} },
  "Financial status": { select: {} },
  "Fulfillment status": { select: {} },
  "Line items": { rich_text: {} },
  "Shipping country": { rich_text: {} },
  Tags: { rich_text: {} },
  "Shopify order URL": { url: {} },
};

export const PRODUCTS_DB_PROPERTIES: Record<string, unknown> = {
  Title: { title: {} },
  Status: { select: {} },
  Vendor: { rich_text: {} },
  "Product type": { rich_text: {} },
  Price: { number: { format: "number" } },
  "Total inventory": { number: { format: "number" } },
  Tags: { rich_text: {} },
  "Created at": { date: {} },
  "Shopify product URL": { url: {} },
};

// Creates the Orders and Products databases under the chosen parent page.
// (Notion has no "list child databases" shortcut worth relying on, and
// database titles aren't unique — so unlike AirSync we always create.
// Re-running just makes fresh, empty databases; the old ones keep their
// data and the app simply starts writing to the new ones.)
export async function createSyncDatabases(
  token: string,
  parentPageId: string,
): Promise<{ ordersDbId: string; productsDbId: string }> {
  async function createDb(
    title: string,
    properties: Record<string, unknown>,
  ): Promise<string> {
    const res = await request<{ id: string }>(token, "POST", "/databases", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: title } }],
      properties,
    });
    return res.id;
  }

  const ordersDbId = await createDb("Orders", ORDERS_DB_PROPERTIES);
  const productsDbId = await createDb("Products", PRODUCTS_DB_PROPERTIES);
  return { ordersDbId, productsDbId };
}

// ---------------------------------------------------------------------------
// Page (row) operations — all throttled per integration.
// ---------------------------------------------------------------------------

export async function createPage(
  token: string,
  databaseId: string,
  properties: Record<string, unknown>,
): Promise<string> {
  const res = await request<{ id: string }>(token, "POST", "/pages", {
    parent: { database_id: databaseId },
    properties,
  });
  return res.id;
}

export async function updatePage(
  token: string,
  pageId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  await request(token, "PATCH", `/pages/${pageId}`, { properties });
}

// "Deleting" in the Notion API means archiving (moves the page to trash).
export async function archivePage(token: string, pageId: string): Promise<void> {
  try {
    await request(token, "PATCH", `/pages/${pageId}`, { archived: true });
  } catch (err) {
    // Already gone/archived — that's fine, we wanted it removed anyway.
    if (err instanceof NotionError && (err.status === 404 || err.status === 400)) {
      return;
    }
    throw err;
  }
}

// True when an update failed because the target page no longer exists (the
// merchant deleted/archived the row by hand) — callers recreate it then.
export function isGonePageError(err: unknown): boolean {
  return (
    err instanceof NotionError &&
    (err.status === 404 ||
      (err.status === 400 && /archiv/i.test(err.message)))
  );
}
