// Starts an in-process Postgres (PGlite) and speaks the wire protocol on a TCP
// port, so the Go adapters can be tested against a real database with no
// Docker and no Supabase project.
//
//	node scripts/pglite-server.mjs [port] [dataDir]
//
// Without a dataDir the database is empty on every start, which is what the
// tests want: migrations run from scratch each time.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.argv[2] || 55432);
const dataDir = process.argv[3];

const db = dataDir ? new PGlite(dataDir) : new PGlite();
await db.waitReady;

const server = new PGLiteSocketServer({
  db,
  port,
  host: "127.0.0.1",
  maxConnections: 20,
});
await server.start();
console.log(`pglite listening on 127.0.0.1:${port}${dataDir ? ` data=${dataDir}` : " (in memory)"}`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
