import {
  randomBytes,
  scrypt as scryptCallback,
  pbkdf2 as pbkdf2Callback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { id } from "./seeds.js";

const scrypt = promisify(scryptCallback),
  pbkdf2 = promisify(pbkdf2Callback);
export const view = ({ id, email, displayName, role }) => ({
  id,
  email,
  displayName,
  role,
});
export const normalizeEmail = (email) => email.trim().toUpperCase();
export const validEmail = (email) =>
  typeof email === "string" && email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
export async function verifyPassword(password, encoded) {
  try {
    let expected, actual;
    if (encoded.startsWith("scrypt$")) {
      const [, salt, hash] = encoded.split("$");
      expected = Buffer.from(hash, "base64");
      if (expected.length !== 64) return false;
      actual = await scrypt(password, Buffer.from(salt, "base64"), 64);
    } else {
      // ASP.NET Identity V2/V3 stores the algorithm, iteration count and salt in the payload.
      const payload = Buffer.from(encoded, "base64");
      if (payload[0] === 0 && payload.length === 49) {
        expected = payload.subarray(17);
        actual = await pbkdf2(
          password,
          payload.subarray(1, 17),
          1000,
          32,
          "sha1",
        );
      } else if (payload[0] === 1 && payload.length >= 45) {
        const algorithm = ["sha1", "sha256", "sha512"][payload.readUInt32BE(1)];
        const iterations = payload.readUInt32BE(5),
          saltLength = payload.readUInt32BE(9);
        if (
          !algorithm ||
          iterations < 1 ||
          iterations > 10_000_000 ||
          saltLength < 16 ||
          saltLength > payload.length - 29
        )
          return false;
        expected = payload.subarray(13 + saltLength);
        actual = await pbkdf2(
          password,
          payload.subarray(13, 13 + saltLength),
          iterations,
          expected.length,
          algorithm,
        );
      } else return false;
    }
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
export async function account(email, password, displayName, role = "Student") {
  return {
    id: id(),
    email: email.trim(),
    normalizedEmail: normalizeEmail(email),
    displayName: displayName.trim(),
    role,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
}
export const sessionHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export function sessionToken(req) {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("SpaceSense.Auth="));
  return cookie ? cookie.slice("SpaceSense.Auth=".length) : "";
}
export const sessionCookie = (req) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: Boolean(req.app?.locals.secureCookies || req.secure),
  path: "/",
  maxAge: 10 * 60 * 60 * 1000,
});
export function createSession(state, user, req, res) {
  const token = randomBytes(32).toString("base64url");
  state.sessions = state.sessions.filter(
    (s) =>
      s.id !== sessionHash(sessionToken(req)) &&
      Date.parse(s.expiresAt) > Date.now(),
  );
  state.sessions.push({
    id: sessionHash(token),
    accountId: user.id,
    expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
  });
  res.cookie("SpaceSense.Auth", token, sessionCookie(req));
}
