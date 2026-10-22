import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { fixture, booking } from "./helpers.js";
import { createApp } from "../backend/src/app.js";
import { validateRuntime } from "../backend/src/security.js";
import { extract, interpret } from "../backend/src/natural-search.js";

test("production startup requires persistent storage and an HTTPS origin", () => {
  const env = { NODE_ENV: "production" };
  assert.throws(() => validateRuntime(env), /DATABASE_URL/);
  env.DATABASE_URL = "postgresql://localhost/spacesense";
  for (const value of [undefined, "http://booking.example.com", "https://booking.example.com/path", "https://user:pass@booking.example.com"])
    assert.throws(() => validateRuntime({ ...env, SPACESENSE_PUBLIC_URL: value }), /HTTPS origin/);
  validateRuntime({ ...env, SPACESENSE_PUBLIC_URL: "https://booking.example.com" });
  validateRuntime({ NODE_ENV: "production", SPACESENSE_DEMO_MODE: "true" });
});

test("production cookies, origin protection, headers, body limits and login throttling", async (t) => {
  const f = await fixture(t, { env: { NODE_ENV: "production", SPACESENSE_PUBLIC_URL: "https://booking.example.com", SPACESENSE_AUTH_RATE_LIMIT: "3" } });
  const login = await f.client().post("/auth/login", { email: "admin@campus.example", password: "a-long-admin-password" });
  assert.match(login.headers.get("set-cookie"), /; Secure/);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(login.headers.get("cache-control"), "no-store");
  assert.match(login.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(login.headers.get("x-content-type-options"), "nosniff");
  assert.match(login.headers.get("strict-transport-security"), /31536000/);
  assert.ok(login.headers.get("x-request-id"));
  const cookie = login.headers.get("set-cookie").split(";")[0];
  for (const headers of [{ Origin: "https://attacker.example" }, { "Sec-Fetch-Site": "cross-site" }]) {
    const rejected = await fetch(`${f.base}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie, ...headers } });
    assert.equal(rejected.status, 403);
  }
  const text = await fetch(`${f.base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  assert.equal(text.status, 415);
  const huge = await fetch(`${f.base}/api/reservations`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ title: "x".repeat(270000) }) });
  assert.equal(huge.status, 413);
  assert.equal((await f.client().post("/auth/login", { email: "absent@campus.example", password: "incorrect" })).status, 401);
  const throttled = await fetch(`${f.base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.5" }, body: "{}" });
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get("retry-after")) > 0);
  const logout = await fetch(`${f.base}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie, Origin: "https://booking.example.com" } });
  assert.equal(logout.status, 204);
});

test("slow model requests release storage and recheck authentication before returning", async (t) => {
  let release, started;
  const pending = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { started = resolve; });
  const f = await fixture(t, { extractor: async () => { started(); await pending; return null; } });
  const student = await f.student();
  const searching = student.post("/search/natural", { prompt: "a room for 12 people" });
  await entered;
  try {
    const saved = await Promise.race([
      f.admin.post("/reservations", booking()),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Search blocked booking storage")), 2000); timer.unref(); }),
    ]);
    assert.equal(saved.status, 201);
    assert.equal((await student.post("/auth/logout")).status, 204);
  } finally { release(); }
  assert.equal((await searching).status, 401);
});

test("database health failures return 503 without leaking database details", async (t) => {
  const server = createApp({ kind: "postgresql", check: async () => { throw Error("secret connection details"); } }, { env: {} }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
});

test("provider requests disable response storage, use strict schemas and fall back on incomplete output", async () => {
  let request;
  const failures = [];
  const result = await extract("room for 12 people", interpret("room for 12 people"), [], {
    key: "test-only", model: "gpt-6-luna", onFailure: (reason) => failures.push(reason),
    fetcher: async (_, options) => {
      request = JSON.parse(options.body);
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, json: async () => ({ status: "incomplete" }) };
    },
  });
  assert.equal(result, null);
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.additionalProperties, false);
  assert.equal(request.reasoning.effort, "none");
  assert.deepEqual(failures, ["incomplete_response"]);
});
