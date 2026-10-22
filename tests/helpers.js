import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import assert from "node:assert/strict";
import { JsonStorage } from "../backend/src/storage.js";
import { bootstrap, createApp } from "../backend/src/app.js";

export async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "spacesense-node-"));
  const storage = options.storage ?? (await new JsonStorage(directory).init());
  await bootstrap(storage, {
    NODE_ENV: "production",
    SPACESENSE_ADMIN_EMAIL: "admin@campus.example",
    SPACESENSE_ADMIN_PASSWORD: "a-long-admin-password",
  });
  const server = createApp(storage, {
    extractor: async () => null,
    logger: {
      error(error) {
        throw error;
      },
    },
    ...options,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = "";
    const request = async (method, path, body) => {
      const response = await fetch(`${base}/api${path}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const updated = response.headers.get("set-cookie");
      if (updated) cookie = updated.split(";")[0];
      const text = await response.text();
      return {
        status: response.status,
        body: text ? JSON.parse(text) : null,
        headers: response.headers,
      };
    };
    return {
      request,
      get: (path) => request("GET", path),
      post: (path, body) => request("POST", path, body),
      put: (path, body) => request("PUT", path, body),
      delete: (path) => request("DELETE", path),
    };
  };
  const admin = client();
  assert.equal(
    (
      await admin.post("/auth/login", {
        email: "admin@campus.example",
        password: "a-long-admin-password",
      })
    ).status,
    200,
  );
  const student = async (email = "student@campus.example") => {
    const c = client(),
      registered = await c.post("/auth/register", {
        email,
        password: "a-long-student-password",
        displayName: email.split("@")[0],
        role: "Admin",
      });
    assert.equal(registered.status, 200);
    assert.equal(registered.body.role, "Student");
    assert.equal(
      (
        await c.post("/auth/login", {
          email,
          password: "a-long-student-password",
        })
      ).status,
      200,
    );
    return { ...c, user: registered.body };
  };
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await storage.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, storage, client, admin, student, base };
}
export const booking = (extra = {}) => ({
  resourceId: "class-306",
  title: "Test booking",
  organizer: "Test organizer",
  start: "2030-10-21T18:00:00-04:00",
  end: "2030-10-21T19:00:00-04:00",
  attendees: 12,
  ...extra,
});
