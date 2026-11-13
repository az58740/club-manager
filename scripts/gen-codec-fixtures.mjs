// Emits the record payloads the PWA actually puts on the wire, so the Go codec
// can be tested against its real contract instead of a hand-written guess.
//
// Fields come from src/lib/types.ts, parsed rather than transpiled: the point is
// to notice the moment the client grows a field the server does not know about.
//
//   node scripts/gen-codec-fixtures.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "backend/testdata");

/** Wire name -> the interface the client flattens for it. Mirrors flattenData(). */
const ENTITIES = [
  ["club", "ClubProfile"],
  ["teams", "Team"],
  ["players", "Player"],
  ["events", "ClubEvent"],
  ["attendance", "Attendance"],
  ["stats", "MatchStat"],
  ["invoices", "Invoice"],
  ["payments", "Payment"],
  ["categories", "FinanceCategory"],
  ["accounts", "BankAccount"],
  ["transactions", "LedgerEntry"],
  ["products", "Product"],
  ["stockMovements", "StockMovement"],
];

const DAY_FIELDS = new Set(["birthDate", "joinedAt", "date"]);
const TIME_FIELDS = new Set(["startsAt", "dueAt", "issuedAt", "paidAt", "settledAt", "createdAt"]);
const DAY = "2025-03-21";
const TIME = "2026-01-15T09:30:00.000Z";

/** Toman amounts and counts the app really writes; every money field is a whole number. */
const NUMBERS = {
  jersey: 7,
  heightCm: 188,
  monthlyFee: 8_000_000,
  durationMin: 90,
  servePoints: 21,
  attackPoints: 14,
  blockPoints: 3,
  digs: 11,
  errors: 5,
  amount: 45_000_000,
  openingBalance: 120_000_000,
  costPrice: 90_000_000,
  salePrice: 140_000_000,
  stock: 12,
  minStock: 3,
  qty: 4,
  unitPrice: 140_000_000,
  home: 25,
  away: 21,
};

const STRINGS = {
  id: "u-fixture-1",
  name: "Sample",
  fullName: "Sample Player",
  shortName: "Sample",
  title: "Sample title",
  coach: "Sample Coach",
  city: "Tehran",
  season: "1404-1405",
  founded: "1385",
  phone: "09123456789",
  sport: "volleyball",
  clubId: "c-fixture-1",
  teamId: "t-fixture-1",
  eventId: "e-fixture-1",
  playerId: "p-fixture-1",
  productId: "pr-fixture-1",
  invoiceId: "i-fixture-1",
  categoryId: "cat-fixture-1",
  accountId: "acc-fixture-1",
  ledgerId: "l-fixture-1",
  refId: "l-fixture-1",
  period: "1404/07",
  bankName: "Bank",
  bank: "Bank",
  accountNumber: "1234567890",
  cardNumber: "6037700000000000",
  iban: "IR0000000000000000000000",
  number: "11/2233",
  reference: "REF-1",
  note: "note",
  notes: "notes",
  reminderNote: "reminder",
  address: "Address line",
  party: "Party",
  sku: "SKU-1",
  size: "M",
  location: "Hall 1",
  opponent: "Opponent",
  ageGroup: "Youth",
  color: "blue",
  homeVenue: "Hall 1",
  logo: "data:image/png;base64,AAAA",
};

const source = ts.createSourceFile(
  "types.ts",
  readFileSync(resolve(root, "src/lib/types.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);

const interfaces = new Map();
const unions = new Map();

for (const statement of source.statements) {
  if (ts.isInterfaceDeclaration(statement)) {
    const fields = statement.members
      .filter(ts.isPropertySignature)
      .map((member) => ({
        name: member.name.getText(source),
        optional: Boolean(member.questionToken),
        type: member.type ? member.type.getText(source) : "unknown",
      }));
    interfaces.set(statement.name.text, fields);
  }
  if (ts.isTypeAliasDeclaration(statement) && ts.isUnionTypeNode(statement.type)) {
    const literals = statement.type.types
      .filter((node) => ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal))
      .map((node) => node.literal.text);
    if (literals.length > 0) unions.set(statement.name.text, literals);
  }
}

function valueFor(field, includeOptional) {
  if (field.optional && !includeOptional) return undefined;
  if (DAY_FIELDS.has(field.name)) return field.optional ? DAY : DAY;
  if (TIME_FIELDS.has(field.name)) return TIME;
  if (field.name in NUMBERS && /^(?:number|~number)$/.test(baseType(field.type))) return NUMBERS[field.name];
  if (field.name in STRINGS && /^string$/.test(baseType(field.type))) return STRINGS[field.name];

  const type = field.type.trim();
  const literals = unions.get(type);
  if (literals) return literals[0];
  if (/^string$/.test(type)) return `sample-${field.name}`;
  if (/^number$/.test(type)) return 1;
  if (/^boolean$/.test(type)) return true;

  const array = /^(\w+)\[\]$/.exec(type);
  if (array) return [nestedValue(array[1], includeOptional, 1)];
  const object = /^(\w+)$/.exec(type);
  if (object && interfaces.has(object[1])) return nestedValue(object[1], includeOptional, 0);
  throw new Error(`gen-codec-fixtures: no sample value rule for ${field.name}: ${type}`);
}

function baseType(type) {
  return type.replace(/\s*\|\s*(?:null|undefined)\s*/g, "").trim();
}

function nestedValue(name, includeOptional, depth) {
  const fields = interfaces.get(name);
  if (!fields) throw new Error(`gen-codec-fixtures: unknown interface ${name}`);
  const out = {};
  for (const field of fields) {
    if (field.name === "id") continue;
    const value = valueFor(field, includeOptional);
    if (value !== undefined) out[field.name] = value;
  }
  if (depth > 4) throw new Error("gen-codec-fixtures: interface references cycle");
  return out;
}

function payloadFor(entity, interfaceName, includeOptional) {
  const fields = interfaces.get(interfaceName);
  if (!fields) throw new Error(`gen-codec-fixtures: unknown interface ${interfaceName}`);
  const out = {};
  for (const field of fields) {
    const value = valueFor(field, includeOptional);
    if (value !== undefined) out[field.name] = value;
  }
  // Distinct per row so a projected column can never borrow another entity's id.
  if ("id" in out) out.id = `r-${entity}`;
  return out;
}

const payloads = {};
const shapes = {};

for (const [entity, interfaceName] of ENTITIES) {
  payloads[entity] = [
    { case: "full", payload: payloadFor(entity, interfaceName, true) },
    { case: "bare", payload: payloadFor(entity, interfaceName, false) },
  ];
  shapes[entity] = { interface: interfaceName, fields: interfaces.get(interfaceName) };
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "payloads.json"), `${JSON.stringify(payloads, null, 2)}\n`);
writeFileSync(resolve(outDir, "client-fields.json"), `${JSON.stringify(shapes, null, 2)}\n`);

const counted = Object.entries(payloads).map(([entity, rows]) => `${entity}:${rows.length}`);
console.log(`wrote backend/testdata (payloads.json, client-fields.json) for ${counted.length} entities`);
console.log(counted.join(" "));
