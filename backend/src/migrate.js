import { createStorage } from "./storage.js";

const storage = await createStorage();
try {
  const counts = await storage.transact((state) =>
    Object.fromEntries(
      Object.entries(state).map(([name, records]) => [name, records.length]),
    ),
  );
  console.log(`SpaceSense ${storage.kind} storage is ready.`, counts);
} finally {
  await storage.close();
}
