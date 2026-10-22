import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test(
  "server entrypoint serves the UI and keeps sessions and bookings after restart",
  { timeout: 20000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "spacesense-startup-"));
    const staticDirectory = join(directory, "wwwroot");
    await mkdir(staticDirectory);
    await writeFile(
      join(staticDirectory, "index.html"),
      '<!doctype html><div id="root">SpaceSense</div>',
    );
    await writeFile(
      join(staticDirectory, "app.js"),
      "window.spacesense = true;",
    );
    const env = {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: "0",
      SPACESENSE_DATA_DIR: join(directory, "Data"),
      SPACESENSE_STATIC_DIR: staticDirectory,
      SPACESENSE_ADMIN_EMAIL: "admin@campus.example",
      SPACESENSE_ADMIN_PASSWORD: "a-long-admin-password",
    };
    delete env.DATABASE_URL;
    delete env.ConnectionStrings__SpaceSense;
    let child;
    async function stop() {
      if (!child || child.exitCode !== null || child.signalCode !== null)
        return;
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    t.after(async () => {
      await stop();
      await rm(directory, { recursive: true, force: true });
    });
    async function start() {
      child = spawn(
        process.execPath,
        [fileURLToPath(new URL("../backend/src/server.js", import.meta.url))],
        { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      return new Promise((resolve, reject) => {
        let output = "";
        child.on("error", reject);
        child.once("exit", (code) =>
          reject(new Error(`API exited before startup (${code}): ${output}`)),
        );
        child.stderr.on("data", (data) => {
          output += data;
        });
        child.stdout.on("data", (data) => {
          output += data;
          const address = output.match(
            /listening on (http:\/\/127\.0\.0\.1:\d+)/,
          );
          if (address) resolve(address[1]);
        });
      });
    }
    let base = await start();
    assert.equal(
      (await fetch(`${base}/api/health`).then((r) => r.json())).storage,
      "local-json",
    );
    for (const path of ["/", "/reservations/calendar"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /SpaceSense/);
    }
    assert.match(
      await fetch(`${base}/app.js`).then((r) => r.text()),
      /window.spacesense/,
    );
    const unknown = await fetch(`${base}/api/missing`);
    assert.equal(unknown.status, 404);
    assert.match(unknown.headers.get("content-type"), /application\/json/);
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: env.SPACESENSE_ADMIN_EMAIL,
        password: env.SPACESENSE_ADMIN_PASSWORD,
      }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    const created = await fetch(`${base}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        resourceId: "class-306",
        title: "Restart check",
        organizer: "Test",
        start: "2030-10-21T18:00:00-04:00",
        end: "2030-10-21T19:00:00-04:00",
        attendees: 1,
      }),
    });
    assert.equal(created.status, 201);
    const booking = await created.json();
    await stop();
    base = await start();
    const me = await fetch(`${base}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).email, env.SPACESENSE_ADMIN_EMAIL);
    const reservations = await fetch(`${base}/api/reservations`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json());
    assert.equal(
      reservations.find((r) => r.id === booking.id).title,
      "Restart check",
    );
  },
);
