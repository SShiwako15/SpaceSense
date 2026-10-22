import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const base = "http://127.0.0.1:8080";
let cookie = "";
async function request(method, path, body) {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { "Content-Type": "application/json", Cookie: cookie, Origin: process.env.SPACESENSE_PUBLIC_URL },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}
const health = await request("GET", "/health");
assert.equal(health.response.status, 200);
assert.equal(health.body.storage, "postgresql");
assert.equal((await request("GET", "/resources")).response.status, 401);
const login = await request("POST", "/auth/login", {
  email: process.env.SPACESENSE_ADMIN_EMAIL, password: process.env.SPACESENSE_ADMIN_PASSWORD,
});
assert.equal(login.response.status, 200);
assert.match(login.response.headers.get("set-cookie"), /; Secure/);
assert.ok(login.response.headers.get("strict-transport-security"));
cookie = login.response.headers.get("set-cookie").split(";")[0];
assert.deepEqual((await request("GET", "/resources")).body, []);
assert.deepEqual((await request("GET", "/reservations")).body, []);
const adminCookie = cookie;
const resource = { id: "production-check", name: "Production Check Room", type: "classroom", building: "Check Hall", capacity: 20, features: ["whiteboard"], accessible: true, description: "Temporary verification resource", requiresApproval: false };
assert.equal((await request("POST", "/admin/resources", resource)).response.status, 201);
const password = randomBytes(24).toString("hex");
cookie = "";
assert.equal((await request("POST", "/auth/register", { email: "student@production-check.example", displayName: "Check Student", password })).response.status, 200);
const studentLogin = await request("POST", "/auth/login", { email: "student@production-check.example", password });
assert.equal(studentLogin.response.status, 200);
cookie = studentLogin.response.headers.get("set-cookie").split(";")[0];
assert.equal((await request("GET", "/admin/resources")).response.status, 403);
const start = new Date(Date.now() + 7 * 86400000);
start.setMinutes(0, 0, 0);
const booking = { resourceId: resource.id, title: "Production verification", organizer: "Check Student", start: start.toISOString(), end: new Date(+start + 3600000).toISOString(), attendees: 8 };
const saved = await request("POST", "/reservations", booking);
assert.equal(saved.response.status, 201);
assert.equal((await request("POST", "/reservations", booking)).response.status, 409);
assert.equal((await request("PUT", `/reservations/${saved.body.id}`, { ...booking, title: "Updated verification" })).response.status, 200);
assert.equal((await request("GET", "/reservations")).body[0].title, "Updated verification");
assert.equal((await request("DELETE", `/reservations/${saved.body.id}`)).response.status, 204);
assert.equal((await request("POST", "/reservations", { ...booking, title: "Backup verification" })).response.status, 201);
await request("POST", "/auth/logout");
cookie = adminCookie;
assert.equal((await request("DELETE", `/admin/resources/${resource.id}`)).response.status, 409);
console.log(JSON.stringify({ status: "passed", freshCatalogEmpty: true, freshBookingsEmpty: true, secureCookies: true, catalogAndBookingWorkflow: true }));
