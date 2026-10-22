import { randomUUID } from "node:crypto";

export const isProduction = (env = process.env) => env.NODE_ENV === "production" && env.SPACESENSE_DEMO_MODE !== "true";

export function validateRuntime(env = process.env) {
  if (!isProduction(env)) return;
  if (!env.DATABASE_URL) throw new Error("Production requires DATABASE_URL with persistent PostgreSQL storage.");
  let url;
  try { url = new URL(env.SPACESENSE_PUBLIC_URL); }
  catch { throw new Error("SPACESENSE_PUBLIC_URL must be the public HTTPS origin in production."); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("SPACESENSE_PUBLIC_URL must be the public HTTPS origin in production.");
}

export function rateLimit({ limit, windowMs, clock = Date.now }) {
  const entries = new Map();
  return (req, res, next) => {
    const timestamp = clock();
    if (entries.size >= 10000) {
      for (const [key, value] of entries) if (value.reset <= timestamp) entries.delete(key);
    }
    const key = req.ip;
    let entry = entries.get(key);
    if (!entry || entry.reset <= timestamp) {
      if (entries.size >= 10000 && !entry) return res.status(429).json({ error: "Too many requests. Try again later." });
      entry = { count: 0, reset: timestamp + windowMs };
      entries.set(key, entry);
    }
    if (++entry.count > limit) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((entry.reset - timestamp) / 1000))));
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }
    next();
  };
}

export function applySecurity(app, env = process.env) {
  const production = isProduction(env);
  const proxy = env.SPACESENSE_TRUST_PROXY;
  app.set("trust proxy", proxy && /^\d+$/.test(proxy) ? Number(proxy) : proxy || false);
  app.locals.secureCookies = production;
  const publicOrigin = env.SPACESENSE_PUBLIC_URL ? new URL(env.SPACESENSE_PUBLIC_URL).origin : null;
  const devOrigins = production ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set({
      "X-Request-Id": req.requestId,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    });
    if (production) res.set("Strict-Transport-Security", "max-age=31536000");
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    const origin = req.headers.origin;
    const ownOrigin = publicOrigin || `${req.protocol}://${req.get("host")}`;
    const allowed = !origin || origin === ownOrigin || devOrigins.includes(origin);
    if (origin && allowed) {
      res.set("Access-Control-Allow-Origin", origin);
      res.vary("Origin");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    }
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (req.path.startsWith("/api/") && mutation) {
      if (!allowed || req.headers["sec-fetch-site"] === "cross-site")
        return res.status(403).json({ error: "Cross-site requests are not allowed." });
      if (req.headers["content-length"] !== "0" && (req.headers["content-length"] || req.headers["transfer-encoding"]) && !req.is("application/json"))
        return res.status(415).json({ error: "Use application/json for API requests." });
    }
    if (req.method === "OPTIONS") return allowed ? res.sendStatus(204) : res.sendStatus(403);
    next();
  });
  const configuredLimit = Number(env.SPACESENSE_AUTH_RATE_LIMIT || 20);
  if (!Number.isInteger(configuredLimit) || configuredLimit < 1 || configuredLimit > 1000)
    throw new Error("SPACESENSE_AUTH_RATE_LIMIT must be an integer between 1 and 1000.");
  app.use("/api/auth/login", rateLimit({ limit: configuredLimit, windowMs: 15 * 60_000 }));
  app.use("/api/auth/register", rateLimit({ limit: 10, windowMs: 60 * 60_000 }));
  app.use("/api/search/natural", rateLimit({ limit: 30, windowMs: 60_000 }));
}
