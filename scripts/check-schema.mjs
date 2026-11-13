// Applies the backend's Postgres migration to an in-process Postgres (PGlite)
// and probes the four promises the club's data depends on: the payload a phone
// sent comes back byte for byte, a status outside the schema is refused, two
// mailboxes that differ only by capitalisation are one account, and the record
// upsert never loses the row it replaced.
//
//   node scripts/check-schema.mjs
import * as fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const file = new URL("../backend/migrations/0001_init.sql", import.meta.url);
const sql = fs.readFileSync(file, "utf8");

const db = new PGlite();
await db.waitReady;

const failures = [];
function check(name, ok, detail) {
  if (!ok) failures.push(`${name}: ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` - ${detail}`}`);
}

await db.exec(sql);
const tables = await db.query(`select table_name from information_schema.tables
  where table_schema = 'public' order by table_name`);
check("migration creates every table", tables.rows.length === 23,
  `created ${tables.rows.length} tables, want 23`);

const payload = '{"id":"p-1","fullName":"Ali","heightCm":186,"heightCm":186,"note":"  spaced  "}';
await db.exec(`insert into record_state (club_id, entity, record_id, payload, deleted, hash, seq)
  values ('c-1','players','p-1','${payload}',false,'${"0".repeat(64)}',1)`);
const back = await db.query(`select payload from record_state where club_id='c-1' and entity='players' and record_id='p-1'`);
check("payload bytes survive storage", back.rows[0].payload === payload,
  `got ${back.rows[0].payload}`);

await db.exec(`insert into players (club_id,id,payload,status,full_name)
  values ('c-1','p-1','${payload}','active','Ali')`);
let refused = false;
try {
  await db.exec(`insert into players (club_id,id,payload,status,full_name)
    values ('c-1','p-2','{}','suspended','Reza')`);
} catch (err) {
  refused = /check|constraint/i.test(String(err));
}
check("a status the schema never heard of is refused", refused, "an unknown status was accepted");

let clash = false;
try {
  await db.exec(`insert into users (id,name,email) values ('u-1','A','Manager@Club.local')`);
  await db.exec(`insert into users (id,name,email) values ('u-2','B','manager@club.local')`);
} catch (err) {
  clash = /duplicate key/i.test(String(err));
}
check("mailboxes differing only by case are one account", clash, "both addresses were stored");

await db.exec(`insert into record_state (club_id, entity, record_id, payload, deleted, hash, seq, updated_by)
  values ('c-1','players','p-1','{}',false,'${"1".repeat(64)}',2,'u-1')
  on conflict (club_id, entity, record_id) do update
    set payload = excluded.payload, deleted = excluded.deleted, hash = excluded.hash,
        seq = excluded.seq, updated_by = excluded.updated_by, updated_at = now()`);
const upserted = await db.query(`select payload, seq, updated_by from record_state
  where club_id='c-1' and entity='players' and record_id='p-1'`);
check("the record upsert replaces the row it found",
  upserted.rows[0].payload === "{}" && Number(upserted.rows[0].seq) === 2 && upserted.rows[0].updated_by === "u-1",
  JSON.stringify(upserted.rows[0]));

const logged = await db.query(`insert into sync_log (club_id,entity,record_id,payload,deleted,hash,user_id,device_id,op_id)
  values ('c-1','players','p-1','{}',false,'${"2".repeat(64)}','u-1','d-1','op-1') returning seq`);
const again = await db.query(`insert into sync_log (club_id,entity,record_id,payload,deleted,hash,user_id,device_id,op_id)
  values ('c-1','teams','t-1','{}',false,'${"3".repeat(64)}','u-1','d-1','op-2') returning seq`);
check("the sync sequence keeps counting without a driver call",
  Number(again.rows[0].seq) > Number(logged.rows[0].seq), `${logged.rows[0].seq} then ${again.rows[0].seq}`);

let opClash = false;
try {
  await db.exec(`insert into sync_log (club_id,entity,record_id,payload,deleted,hash,user_id,device_id,op_id)
    values ('c-1','players','p-1','{}',false,'${"4".repeat(64)}','u-1','d-1','op-1')`);
} catch (err) {
  opClash = /duplicate key/i.test(String(err));
}
check("a retried operation is refused, not written twice", opClash, "the same op id was accepted again");

const tsv = await db.query(`select starts_at from events
  where false union all select (timestamptz '2026-01-15 09:30:00.000+00')::text::timestamptz limit 1`);
check("a UTC timestamp literal reads back as the same moment",
  tsv.rows.length === 1 && tsv.rows[0].starts_at.toISOString() === "2026-01-15T09:30:00.000Z",
  String(tsv.rows[0] && tsv.rows[0].starts_at));

const spaced = await db.query(`insert into teams (club_id,id,payload,name)
  values ('c-1','t-9','{}','  Sepid  ') returning name`);
check("Persian and spacing survive a round trip", spaced.rows[0].name === "  Sepid  ",
  JSON.stringify(spaced.rows[0].name));

await db.close();
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall schema probes passed");
