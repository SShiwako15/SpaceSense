import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStorage, pgConfig } from "../backend/src/storage.js";
import { verifyPassword, hashPassword } from "../backend/src/auth.js";

test("ASP.NET Identity V2 and V3 hashes remain valid alongside new scrypt hashes", async () => {
  const password = "existing-campus-password",
    salt = randomBytes(16);
  const v2 = Buffer.concat([
    Buffer.from([0]),
    salt,
    pbkdf2Sync(password, salt, 1000, 32, "sha1"),
  ]).toString("base64");
  const header = Buffer.alloc(13);
  header[0] = 1;
  header.writeUInt32BE(2, 1);
  header.writeUInt32BE(100000, 5);
  header.writeUInt32BE(16, 9);
  const v3 = Buffer.concat([
    header,
    salt,
    pbkdf2Sync(password, salt, 100000, 32, "sha512"),
  ]).toString("base64");
  for (const hash of [v2, v3, await hashPassword(password)]) {
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword("wrong", hash), false);
  }
  assert.equal(await verifyPassword(password, "malformed"), false);
});
test("legacy PascalCase JSON imports all stores without modifying originals or reseeding empty stores", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "spacesense-migration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacy = {
    accounts: [
      {
        Id: "owner",
        Email: "test@campus.example",
        NormalizedEmail: "TEST@CAMPUS.EXAMPLE",
        DisplayName: "Test",
        Role: "Student",
        PasswordHash: "legacy",
        CreatedAt: "2026-10-20T12:00:00Z",
      },
    ],
    resources: [],
    reservations: [
      {
        Id: "reservation",
        ResourceId: "class-306",
        Title: "Existing",
        Organizer: "Test",
        Start: "2026-10-21T09:00:00-04:00",
        End: "2026-10-21T10:00:00-04:00",
        Attendees: 1,
        Status: "confirmed",
        SeriesId: "weekly",
        OwnerId: "owner",
      },
    ],
    maintenance: [
      {
        Id: "maintenance",
        ResourceId: "class-306",
        Start: "2026-10-22T09:00:00Z",
        End: "2026-10-22T10:00:00Z",
        Reason: "Repair",
      },
    ],
    waitlist: [{ Id: "wait", OwnerId: "owner", Status: "waiting" }],
    notifications: [{ Id: "notice", UserId: "owner", IsRead: false }],
  };
  for (const [key, rows] of Object.entries(legacy))
    await writeFile(join(directory, `${key}.json`), JSON.stringify(rows));
  const storage = await new JsonStorage(directory).init();
  const state = await storage.transact((s) => s);
  assert.equal(state.accounts[0].normalizedEmail, "TEST@CAMPUS.EXAMPLE");
  assert.equal(state.reservations[0].seriesId, "weekly");
  assert.equal(state.reservations[0].ownerId, "owner");
  assert.equal(state.waitlist[0].ownerId, "owner");
  assert.equal(state.notifications[0].isRead, false);
  assert.equal(state.maintenance[0].reason, "Repair");
  assert.equal(state.resources.length, 0);
  await assert.rejects(
    storage.transact((s) => {
      s.reservations = [];
      throw new Error("rollback");
    }),
  );
  assert.equal((await storage.transact((s) => s.reservations)).length, 1);
  await storage.transact((s) => {
    s.reservations = [];
  });
  await storage.close();
  const reopened = await new JsonStorage(directory).init();
  assert.equal((await reopened.transact((s) => s.reservations)).length, 0);
  await reopened.close();
  assert.deepEqual(
    JSON.parse(await readFile(join(directory, "reservations.json"), "utf8")),
    legacy.reservations,
  );
});
test("PostgreSQL accepts existing connection settings and PostgreSQL URLs", () => {
  assert.deepEqual(
    pgConfig(
      "Host=localhost;Port=5432;Database=spacesense;Username=user;Password=secret;SSL Mode=Disable",
    ),
    {
      host: "localhost",
      port: 5432,
      database: "spacesense",
      user: "user",
      password: "secret",
      ssl: false,
    },
  );
  assert.deepEqual(pgConfig("postgresql://user:secret@localhost/spacesense"), {
    connectionString: "postgresql://user:secret@localhost/spacesense",
  });
});
