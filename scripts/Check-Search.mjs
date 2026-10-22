// Run inside the application container to verify the configured provider end to end.
import assert from "node:assert/strict";

const base = process.env.SPACESENSE_CHECK_URL || "http://127.0.0.1:8080";
const email = process.env.SPACESENSE_CHECK_EMAIL || process.env.SPACESENSE_DEMO_STUDENT_EMAIL || process.env.SPACESENSE_ADMIN_EMAIL;
const password = process.env.SPACESENSE_CHECK_PASSWORD || process.env.SPACESENSE_DEMO_STUDENT_PASSWORD || process.env.SPACESENSE_ADMIN_PASSWORD;
let cookie;
try {
  assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is not configured in this container.");
  assert.ok(email && password, "Provide valid check-account credentials.");
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10000),
  });
  assert.equal(login.status, 200, "Check-account sign-in failed.");
  cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "Sign-in returned no session cookie.");
  const response = await fetch(`${base}/api/search/natural`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ prompt: "Find a room for 8 people with a white board to sketch on" }),
    signal: AbortSignal.timeout(25000),
  });
  assert.equal(response.status, 200, "Natural search endpoint failed.");
  const result = await response.json();
  assert.equal(result.source, "openai+rules", "Provider extraction failed; inspect sanitized search_provider_unavailable logs and your OpenAI project.");
  assert.equal(result.interpretation.minCapacity, 8);
  assert.ok(result.interpretation.features.includes("whiteboard"), "Model did not extract the requested whiteboard.");
  console.log(JSON.stringify({ status: "passed", model: process.env.OPENAI_MODEL || "gpt-4.1-mini", source: result.source, capacity: 8, whiteboard: true }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (cookie) await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie }, signal: AbortSignal.timeout(5000) }).catch(() => {});
}
