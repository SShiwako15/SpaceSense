import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resources, seedReservations, id } from "./seeds.js";
import { isProduction } from "./security.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Explicit mappings preserve the existing EF Core PostgreSQL schema.
export const tables = {
  resources: [
    "resources",
    {
      id: "id",
      name: "name",
      type: "type",
      building: "building",
      capacity: "capacity",
      features: "features",
      accessible: "accessible",
      description: "description",
      requiresApproval: "requires_approval",
    },
  ],
  accounts: [
    "accounts",
    {
      id: "id",
      email: "email",
      normalizedEmail: "normalized_email",
      displayName: "display_name",
      passwordHash: "password_hash",
      role: "role",
      createdAt: "created_at",
    },
  ],
  reservations: [
    "reservations",
    {
      id: "id",
      resourceId: "resource_id",
      title: "title",
      organizer: "organizer",
      start: "start_time",
      end: "end_time",
      attendees: "attendees",
      status: "status",
      seriesId: "series_id",
      ownerId: "owner_id",
    },
  ],
  maintenance: [
    "maintenance_windows",
    {
      id: "id",
      resourceId: "resource_id",
      start: "start_time",
      end: "end_time",
      reason: "reason",
    },
  ],
  waitlist: [
    "waitlist_entries",
    {
      id: "id",
      resourceId: "resource_id",
      title: "title",
      organizer: "organizer",
      start: "start_time",
      end: "end_time",
      attendees: "attendees",
      createdAt: "created_at",
      status: "status",
      ownerId: "user_id",
    },
  ],
  notifications: [
    "notifications",
    {
      id: "id",
      type: "type",
      title: "title",
      message: "message",
      createdAt: "created_at",
      isRead: "is_read",
      reservationId: "reservation_id",
      seriesId: "series_id",
      waitlistId: "waitlist_id",
      userId: "user_id",
      audienceRole: "audience_role",
    },
  ],
  sessions: [
    "sessions",
    { id: "id", accountId: "account_id", expiresAt: "expires_at" },
  ],
};

function camel(value) {
  if (Array.isArray(value)) return value.map(camel);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key[0].toLowerCase() + key.slice(1),
        camel(v),
      ]),
    );
  return value;
}
async function json(path) {
  try {
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}
async function legacyState(directory) {
  const state = {};
  for (const key of Object.keys(tables)) {
    const loaded =
      key === "sessions" ? [] : await json(resolve(directory, `${key}.json`));
    if (loaded !== undefined && !Array.isArray(loaded))
      throw new Error(
        `Invalid legacy data: ${key}.json must contain an array.`,
      );
    state[key] =
      loaded === undefined
        ? key === "resources"
          ? isProduction() ? [] : structuredClone(resources)
          : key === "reservations"
            ? isProduction() ? [] : seedReservations()
            : []
        : camel(loaded);
  }
  return state;
}
export async function atomicWrite(path, state) {
  const temporary = `${path}.${id()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(state, null, 2));
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
export class JsonStorage {
  constructor(
    directory = process.env.SPACESENSE_DATA_DIR || resolve(root, "Data"),
  ) {
    this.directory = resolve(directory);
    this.path = resolve(this.directory, "state.json");
    this.queue = Promise.resolve();
    this.kind = "local-json";
  }
  async init() {
    await mkdir(this.directory, { recursive: true });
    this.state = (await json(this.path)) ?? (await legacyState(this.directory));
    for (const key of Object.keys(tables))
      if (!Array.isArray(this.state[key]))
        throw new Error(`Invalid state collection: ${key}`);
    await atomicWrite(this.path, this.state);
    return this;
  }
  async transact(work) {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.state);
      const result = await work(next);
      if (JSON.stringify(next) !== JSON.stringify(this.state)) {
        await atomicWrite(this.path, next);
        this.state = next;
      }
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async close() {
    await this.queue;
  }
}

export function pgConfig(connection) {
  if (/^postgres(?:ql)?:\/\//i.test(connection))
    return { connectionString: connection };
  const aliases = {
    host: "host",
    port: "port",
    database: "database",
    username: "user",
    "user id": "user",
    password: "password",
    timeout: "connectionTimeoutMillis",
  };
  const config = {};
  for (const pair of connection.split(";").filter(Boolean)) {
    const split = pair.indexOf("=");
    const key = pair.slice(0, split).trim().toLowerCase(),
      value = pair.slice(split + 1).trim();
    if (key === "ssl mode") {
      if (value.toLowerCase() === "disable") config.ssl = false;
      else if (
        ["require", "verify-ca", "verify-full"].includes(value.toLowerCase())
      )
        config.ssl = { rejectUnauthorized: true };
      else
        throw new Error(
          "Use a PostgreSQL URL with an explicit sslmode for this SSL mode.",
        );
    } else if (aliases[key])
      config[aliases[key]] =
        key === "port"
          ? Number(value)
          : key === "timeout"
            ? Number(value) * 1000
            : value;
    else
      throw new Error(
        `Unsupported legacy connection option: ${key}. Use DATABASE_URL instead.`,
      );
  }
  return config;
}
export class PostgresStorage {
  constructor(
    connection,
    directory = process.env.SPACESENSE_DATA_DIR || resolve(root, "Data"),
  ) {
    this.pool = new pg.Pool({ connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, max: 10, statement_timeout: 15000, lock_timeout: 5000, ...pgConfig(connection) });
    this.pool.on("error", () => console.error(JSON.stringify({ event: "database_pool_error" })));
    this.directory = directory;
    this.kind = "postgresql";
  }
  async load(client) {
    const state = {};
    for (const [key, [table, mapping]] of Object.entries(tables)) {
      const { rows } = await client.query(`SELECT * FROM ${table}`);
      state[key] = rows.map((row) =>
        Object.fromEntries(
          Object.entries(mapping).map(([field, column]) => [
            field,
            row[column] instanceof Date
              ? row[column].toISOString()
              : row[column],
          ]),
        ),
      );
    }
    return state;
  }
  async check() {
    await this.pool.query("SELECT 1");
  }
  async persist(client, before, after) {
    for (const [key, [table, mapping]] of Object.entries(tables)) {
      const old = new Map(before[key].map((row) => [row.id, row]));
      const next = new Map(after[key].map((row) => [row.id, row]));
      const changed = (row) =>
        !old.has(row.id) ||
        JSON.stringify(old.get(row.id)) !== JSON.stringify(row);
      // Remove replaced rows together before inserting so a shifted series cannot collide with itself.
      const removed = before[key]
        .filter(
          (row) =>
            !next.has(row.id) ||
            JSON.stringify(next.get(row.id)) !== JSON.stringify(row),
        )
        .map((row) => row.id);
      if (removed.length)
        await client.query(`DELETE FROM ${table} WHERE id = ANY($1::text[])`, [
          removed,
        ]);
      const fields = Object.keys(mapping),
        columns = Object.values(mapping).join(",");
      for (const row of after[key].filter(changed)) {
        await client.query(
          `INSERT INTO ${table} (${columns}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(",")})`,
          fields.map((field) => row[field] ?? null),
        );
      }
    }
  }
  async init() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(90731)");
      await client.query(await readFile(resolve(root, "schema.sql"), "utf8"));
      // A marker prevents cancelled/deleted collections from being reseeded on restart.
      const marker = await client.query(
        "SELECT id FROM spacesense_migrations WHERE id = 'node-initialized'",
      );
      if (!marker.rowCount) {
        const before = await this.load(client),
          imported =
            (await json(resolve(this.directory, "state.json"))) ??
            (await legacyState(this.directory));
        const after = structuredClone(before);
        for (const key of Object.keys(tables))
          if (key !== "sessions" && !after[key].length)
            after[key] = imported[key];
        await this.persist(client, before, after);
        await client.query(
          "INSERT INTO spacesense_migrations (id) VALUES ('node-initialized')",
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this;
  }
  async transact(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(90731)");
      const before = await this.load(client),
        after = structuredClone(before);
      const result = await work(after);
      await this.persist(client, before, after);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async close() {
    this.closing ??= this.pool.end();
    await this.closing;
  }
}
export async function createStorage() {
  const connection =
    process.env.DATABASE_URL || process.env.ConnectionStrings__SpaceSense;
  const storage = connection
    ? new PostgresStorage(connection)
    : new JsonStorage();
  try {
    return await storage.init();
  } catch (error) {
    await storage.close();
    throw error;
  }
}
