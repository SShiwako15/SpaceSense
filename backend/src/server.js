import { createStorage } from "./storage.js";
import { createApp, bootstrap } from "./app.js";
import { bootstrapDemo } from "./demo.js";
import { validateRuntime } from "./security.js";

validateRuntime();
const storage = await createStorage();
try {
  await bootstrap(storage);
  await bootstrapDemo(storage);
} catch (error) {
  await storage.close();
  throw error;
}
const port = Number(process.env.PORT || 5080),
  host = process.env.HOST || "0.0.0.0";
const server = createApp(storage).listen(port, host, () =>
  console.log(
    `SpaceSense Node.js API listening on http://${host}:${server.address().port} (${storage.kind})`,
  ),
);
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 15_000);
  deadline.unref();
  server.close(async () => {
    try { await storage.close(); process.exitCode = 0; }
    catch { process.exitCode = 1; }
    finally { clearTimeout(deadline); }
  });
  server.closeIdleConnections();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
