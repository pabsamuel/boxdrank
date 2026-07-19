// Tests the Airtable client's rate limiting and retry behavior by stubbing
// global fetch — no real Airtable account is touched.
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
    return json(500, { error: { type: "SERVER_ERROR", message: "boom" } });
  }
  if (scenario === "always-422") {
    return json(422, { error: { type: "INVALID_VALUE", message: "bad field" } });
  }
  if (scenario === "delete-404") {
    return json(404, { error: { type: "NOT_FOUND", message: "gone" } });
  }
  return json(200, { id: "recMOCK123" });
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
  const at = await vite.ssrLoadModule("/app/lib/airtable.server.ts");

  // 1. Throttle: 6 concurrent writes to one base are spaced ~250ms apart
  //    (Airtable allows 5 req/s per base; we run at 4 to stay safe).
  calls.length = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      at.createRecord("tok", "appBASE1", "tblX", { n: i }),
    ),
  );
  const gaps = calls.slice(1).map((c, i) => c.t - calls[i].t);
  const minGap = Math.min(...gaps);
  check("writes spaced >=240ms", minGap >= 240, `min gap ${minGap}ms`);
  check("6 writes take >=1.2s", Date.now() - t0 >= 1200, `${Date.now() - t0}ms`);

  // 2. Different bases have independent queues.
  const t1 = Date.now();
  await Promise.all([
    at.createRecord("tok", "appBASE2", "tblX", {}),
    at.createRecord("tok", "appBASE3", "tblX", {}),
  ]);
  check("bases throttle independently", Date.now() - t1 < 240, `${Date.now() - t1}ms`);

  // 3. Server errors retry with backoff until success.
  scenario = "flaky-then-ok";
  failCount = 2;
  calls.length = 0;
  const id = await at.createRecord("tok", "appBASE4", "tblX", {});
  check("500s retried to success", id === "recMOCK123" && calls.length === 3, `${calls.length} attempts`);

  // 4. Client errors (bad token/field) fail immediately — retrying can't help.
  scenario = "always-422";
  calls.length = 0;
  let threw = false;
  try {
    await at.createRecord("tok", "appBASE5", "tblX", {});
  } catch (err) {
    threw = err.status === 422;
  }
  check("422 fails fast", threw && calls.length === 1, `${calls.length} attempt`);

  // 5. Deleting an already-deleted record is a no-op, not an error.
  scenario = "delete-404";
  await at.deleteRecord("tok", "appBASE6", "tblX", "recGONE");
  check("delete of missing record ok", true);

  console.log(results.every(Boolean) ? "throttle.test: PASS" : "throttle.test: FAIL");
  process.exitCode = results.every(Boolean) ? 0 : 1;
} finally {
  await vite.close();
}
