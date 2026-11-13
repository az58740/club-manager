// Talks to a running club API and proves the Postgres conversion end to end:
// a club is created, a player row goes through the sync spine and comes back
// with its bytes — including the Persian text — untouched.
//
//	node scripts/smoke-api.mjs [baseURL]
import { randomUUID } from "node:crypto";

const base = process.argv[2] || "http://127.0.0.1:8099";
const stamp = Date.now();
const email = "smoke-manager@club.example";

async function call(method, path, { token, body, tolerate } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok && !tolerate) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return { ok: res.ok, status: res.status, ...json };
}

const health = await call("GET", "/v1/health");
console.log("health:", JSON.stringify(health));

const account = {
  email,
  password: "Sup3r-Secret-Passphrase",
  fullName: "مدیر باشگاه",
  clubName: "باشگاه والیبال نمونه",
  sport: "volleyball",
  deviceId: `smoke-${stamp}`,
};

// A second run against a database that already has a club signs in instead of
// refusing to start over, so the script is repeatable.
const created = await call("POST", "/v1/auth/bootstrap", { body: account, tolerate: true });
let token;
if (created.ok) {
  token = created.session.accessToken;
  console.log("club:", created.club.name, "| invite:", created.club.inviteCode);
} else {
  console.log("bootstrap refused:", created.error);
  const signedIn = await call("POST", "/v1/auth/sign-in", {
    body: { email, password: account.password, deviceId: account.deviceId },
  });
  token = signedIn.session.accessToken;
  console.log("signed in as", signedIn.session.user?.email ?? email);
}

const team = {
  id: `t-${randomUUID()}`,
  name: "تیم جوانان",
  ageGroup: "۱۸-۲۰",
  coach: "مربی نمونه",
  color: "blue",
  season: "1404-1405",
  homeVenue: "سالن مرکزی",
};

const player = {
  id: `p-${randomUUID()}`,
  fullName: "علی رضایی‌پور",
  phone: "09123456789",
  teamId: team.id,
  position: "setter",
  jersey: 7,
  birthDate: "2005-03-21",
  heightCm: 188,
  status: "active",
  joinedAt: "2025-03-21",
  monthlyFee: 8000000,
  note: "یادداشت:  دو فاصله  و \"گیومه\"",
  address: "تهران، خیابان ولیعصر",
  insured: true,
};

const pushed = await call("POST", "/v1/sync/push", {
  token,
  body: {
    changes: [
      { entity: "teams", id: team.id, payload: team, opId: `op-team-${stamp}` },
      { entity: "players", id: player.id, payload: player, opId: `op-${stamp}` },
    ],
  },
});
console.log("push:", JSON.stringify(pushed));

const pulled = await call("GET", "/v1/sync/pull?cursor=0&limit=50", { token });
const row = pulled.records.find((r) => r.id === player.id);
if (!row) throw new Error(`pull returned no player row: ${JSON.stringify(pulled).slice(0, 300)}`);

const sent = JSON.stringify(player);
const got = JSON.stringify(row.payload);
console.log("bytes identical:", sent === got);
if (sent !== got) console.log("sent:", sent, "\ngot: ", got);

const snapshot = await call("GET", "/v1/sync/snapshot", { token });
console.log("snapshot rows:", snapshot.records.length, "cursor:", snapshot.cursor, "hash:", row.hash.slice(0, 12));

const me = await call("GET", "/v1/me", { token });
console.log("me:", JSON.stringify(me.user ?? me));

const again = await call("POST", "/v1/sync/push", {
  token,
  body: { changes: [{ entity: "players", id: player.id, payload: player, opId: `op-${stamp}` }] },
});
console.log("replay of the same op:", JSON.stringify(again));
