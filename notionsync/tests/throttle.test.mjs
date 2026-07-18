// Tests the Notion client's rate limiting and retry behavior by stubbing
// global fetch — no real Notion account is touched.
//
// Run with: npm run test:sync

import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const calls = []; // {url, method, t}
let scenario = "ok";
let failCount = 0;

globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method ?? "GET", t: Date.now() });
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (scenario === "flaky-then-ok" && failCount > 0) {
    failCount--;
    return json(500, { code: "internal_server_error", message: "boom" });
  }
  if (scenario === "always-400") {
    return json(400, { code: "validation_error", message: "bad property" });
  }
  if (scenario === "archive-404") {
    return json(404, { code: "object_not_found", message: "gone" });
  }
  return json(200, {
    id: "page-mock-123",
    results: [],
    has_more: false,
    next_cursor: null,
  });
};

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
  const notion = await vite.ssrLoadModule("/app/lib/notion.server.ts");

  // 1. Throttle: 5 concurrent writes with one token are spaced ~350ms
  //    apart (Notion allows an average of 3 req/s per integration).
  calls.length = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      notion.createPage("tokenA", "db1", { n: { number: i } }),
    ),
  );
  const gaps = calls.slice(1).map((c, i) => c.t - calls[i].t);
  const minGap = Math.min(...gaps);
  check("writes spaced >=340ms", minGap >= 340, `min gap ${minGap}ms`);
  check("5 writes take >=1.4s", Date.now() - t0 >= 1400, `${Date.now() - t0}ms`);

  // 2. Different integrations (tokens) have independent queues.
  const t1 = Date.now();
  await Promise.all([
    notion.createPage("tokenB", "db1", {}),
    notion.createPage("tokenC", "db1", {}),
  ]);
  check("tokens throttle independently", Date.now() - t1 < 340, `${Date.now() - t1}ms`);

  // 3. Server errors retry with backoff until success.
  scenario = "flaky-then-ok";
  failCount = 2;
  calls.length = 0;
  const id = await notion.createPage("tokenD", "db1", {});
  check(
    "500s retried to success",
    id === "page-mock-123" && calls.length === 3,
    `${calls.length} attempts`,
  );

  // 4. Client errors (bad token/property) fail immediately.
  scenario = "always-400";
  calls.length = 0;
  let threw = false;
  try {
    await notion.createPage("tokenE", "db1", {});
  } catch (err) {
    threw = err.status === 400;
  }
  check("400 fails fast", threw && calls.length === 1, `${calls.length} attempt`);

  // 5. Archiving an already-gone page is a no-op, not an error.
  scenario = "archive-404";
  await notion.archivePage("tokenF", "page-gone");
  check("archive of missing page ok", true);

  // 6. isGonePageError recognizes both "page is gone" shapes.
  const err404 = new notion.NotionError(404, "object_not_found", "gone");
  const errArch = new notion.NotionError(
    400,
    "validation_error",
    "Can't update an archived page",
  );
  const errOther = new notion.NotionError(400, "validation_error", "bad property");
  check(
    "gone-page detection",
    notion.isGonePageError(err404) &&
      notion.isGonePageError(errArch) &&
      !notion.isGonePageError(errOther),
  );

  console.log(results.every(Boolean) ? "throttle.test: PASS" : "throttle.test: FAIL");
  process.exitCode = results.every(Boolean) ? 0 : 1;
} finally {
  await vite.close();
}
