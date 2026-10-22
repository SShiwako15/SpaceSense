import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
import { bootstrapDemo } from "../backend/src/demo.js";
import { verifyPassword } from "../backend/src/auth.js";

test("demo bootstrap creates a student, confirmed booking and approval request once", async (t) => {
  const { storage } = await fixture(t);
  const env = {
    SPACESENSE_DEMO_MODE: "true",
    SPACESENSE_DEMO_STUDENT_EMAIL: "demo@campus.example",
    SPACESENSE_DEMO_STUDENT_PASSWORD: "a-long-demo-password",
  };
  await bootstrapDemo(storage, env);
  const first = await storage.transact((state) => state);
  const student = first.accounts.find(
    (user) => user.email === env.SPACESENSE_DEMO_STUDENT_EMAIL,
  );
  assert.equal(student.role, "Student");
  const bookings = first.reservations.filter((r) => r.ownerId === student.id);
  assert.deepEqual(bookings.map((r) => r.status).sort(), [
    "confirmed",
    "pending",
  ]);
  await bootstrapDemo(storage, env);
  assert.deepEqual(await storage.transact((state) => state), first);
  const changed = {
    ...env,
    SPACESENSE_DEMO_STUDENT_PASSWORD: "a-new-demo-student-password",
    SPACESENSE_ADMIN_EMAIL: "admin@campus.example",
    SPACESENSE_ADMIN_PASSWORD: "a-new-demo-admin-password",
  };
  await bootstrapDemo(storage, changed);
  const updated = await storage.transact((state) => state);
  assert.equal(updated.accounts.length, first.accounts.length);
  assert.equal(updated.reservations.length, first.reservations.length);
  assert.equal(
    await verifyPassword(
      changed.SPACESENSE_DEMO_STUDENT_PASSWORD,
      updated.accounts.find((a) => a.id === student.id).passwordHash,
    ),
    true,
  );
  assert.equal(
    await verifyPassword(
      changed.SPACESENSE_ADMIN_PASSWORD,
      updated.accounts.find((a) => a.role === "Admin").passwordHash,
    ),
    true,
  );
  await bootstrapDemo(storage, {
    ...changed,
    SPACESENSE_DEMO_MODE: "false",
    SPACESENSE_DEMO_STUDENT_PASSWORD: "unused-password",
  });
  assert.deepEqual(await storage.transact((state) => state), updated);
});
