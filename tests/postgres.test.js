import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, pbkdf2Sync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgresStorage } from "../backend/src/storage.js";
import { fixture, booking } from "./helpers.js";

const require = createRequire(
  new URL("../backend/package.json", import.meta.url),
);
const { Pool } = require("pg");
test(
  "PostgreSQL retains schema data, persists sessions, coordinates two API instances and enforces booking constraints",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const schema = `spacesense_test_${randomUUID().replaceAll("-", "")}`;
    await pool.query("CREATE EXTENSION IF NOT EXISTS btree_gist");
    await pool.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set("options", `-c search_path=${schema},public`);
    const directory = await mkdtemp(join(tmpdir(), "spacesense-postgres-"));
    const storage = new PostgresStorage(url.toString(), directory);
    const second = new PostgresStorage(url.toString(), directory);
    // Closing is idempotent because both fixtures and this cleanup own storage handles.
    t.after(async () => {
      await storage.close();
      await second.close();
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    });
    await storage.init();
    // Recreate a database from before the Node migration: business tables and
    // constraints already exist, but sessions and the setup marker do not.
    const legacyPassword = "existing-campus-password";
    const salt = randomBytes(16);
    const header = Buffer.alloc(13);
    header[0] = 1;
    header.writeUInt32BE(2, 1);
    header.writeUInt32BE(100000, 5);
    header.writeUInt32BE(16, 9);
    const legacyHash = Buffer.concat([
      header,
      salt,
      pbkdf2Sync(legacyPassword, salt, 100000, 32, "sha512"),
    ]).toString("base64");
    const legacyClient = await pool.connect();
    try {
      await legacyClient.query(`SET search_path TO ${schema},public`);
      await legacyClient.query("DROP TABLE sessions, spacesense_migrations");
      await legacyClient.query(
        "INSERT INTO accounts (id,email,normalized_email,display_name,password_hash,role,created_at) VALUES ('legacy-owner','legacy@campus.example','LEGACY@CAMPUS.EXAMPLE','Existing Student',$1,'Student',now())",
        [legacyHash],
      );
      await legacyClient.query(
        "INSERT INTO reservations (id,resource_id,title,organizer,start_time,end_time,attendees,status,owner_id) VALUES ('legacy-reservation','class-306','Existing reservation','Existing Student','2031-10-21T18:00:00-04:00','2031-10-21T19:00:00-04:00',1,'confirmed','legacy-owner')",
      );
    } finally {
      legacyClient.release();
    }
    await second.init();
    const firstApp = await fixture(t, { storage });
    const secondApp = await fixture(t, { storage: second });
    const legacyUser = firstApp.client();
    assert.equal(
      (
        await legacyUser.post("/auth/login", {
          email: "LEGACY@campus.example",
          password: legacyPassword,
        })
      ).status,
      200,
    );
    assert.equal(
      (await legacyUser.get("/reservations")).body[0].id,
      "legacy-reservation",
    );
    const student = await firstApp.student();
    const login = await secondApp.client().post("/auth/login", {
      email: student.user.email,
      password: "a-long-student-password",
    });
    assert.equal(login.status, 200);
    const other = secondApp.client();
    await other.post("/auth/login", {
      email: student.user.email,
      password: "a-long-student-password",
    });
    const result = await Promise.all([
      student.post("/reservations", booking()),
      other.post("/reservations", booking()),
    ]);
    assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
    const saved = result.find((r) => r.status === 201).body;
    // Bypass the application to verify PostgreSQL independently rejects overlaps.
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema},public`);
      await assert.rejects(
        client.query(
          "INSERT INTO reservations (id,resource_id,title,organizer,start_time,end_time,attendees,status) VALUES ('direct-conflict','class-306','Direct','Test',$1,$2,1,'confirmed')",
          [booking().start, booking().end],
        ),
        (error) => error.code === "23P01",
      );
      await assert.rejects(
        client.query(
          "INSERT INTO maintenance_windows (id,resource_id,start_time,end_time,reason) VALUES ('direct-maintenance','class-306',$1,$2,'Test')",
          [booking().start, booking().end],
        ),
        (error) => error.code === "23P01",
      );
      await client.query(
        "INSERT INTO maintenance_windows (id,resource_id,start_time,end_time,reason) VALUES ('maintenance','class-202',$1,$2,'Test')",
        [booking().start, booking().end],
      );
      await assert.rejects(
        client.query(
          "INSERT INTO reservations (id,resource_id,title,organizer,start_time,end_time,attendees,status) VALUES ('direct-maintenance-conflict','class-202','Direct','Test',$1,$2,1,'pending')",
          [booking().start, booking().end],
        ),
        (error) => error.code === "23P01",
      );
    } finally {
      client.release();
    }
    assert.equal(
      (await student.get("/reservations")).body.find((r) => r.id === saved.id)
        .ownerId,
      student.user.id,
    );
    const seriesInput = booking({
      resourceId: "class-201",
      start: "2030-10-28T18:00:00-04:00",
      end: "2030-10-28T19:00:00-04:00",
      repeatWeeks: 3,
    });
    const series = await student.post("/reservations", seriesInput);
    assert.equal(series.status, 201);
    const updated = await student.put(
      `/reservations/series/${series.body.seriesId}`,
      {
        ...seriesInput,
        start: "2030-11-04T18:00:00-05:00",
        end: "2030-11-04T19:00:00-05:00",
      },
    );
    assert.equal(updated.status, 200);
    const counts = await storage.transact((s) => ({
      accounts: s.accounts.length,
      sessions: s.sessions.length,
      reservations: s.reservations.length,
    }));
    await second.init();
    assert.deepEqual(
      await second.transact((s) => ({
        accounts: s.accounts.length,
        sessions: s.sessions.length,
        reservations: s.reservations.length,
      })),
      counts,
    );
  },
);
