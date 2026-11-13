-- =====================================================================
--  باشگاه | Postgres 15+ (Supabase) schema, migration 0001
--
--  Every record table is keyed by (club_id, id): the device-generated id is the
--  merge token between offline phones, so a surrogate key would add a
--  translation step to every write, and a bare id key would let one club's row
--  collide with another's. payload keeps the exact bytes the device sent; the
--  projected columns beside it are a queryable view, never the only copy.
--
--  payload is text, not jsonb, on purpose. jsonb rewrites what it stores:
--  keys are reordered, whitespace disappears and a duplicated key is silently
--  dropped. The hash a phone computes and the bytes it gets back on a pull have
--  to be the same document, or a re-sync looks like a conflict on every row.
--
--  MySQL ENUMs became text + CHECK so the allowed values stay readable by the
--  codec round-trip test, and every boolean is a real boolean.
-- =====================================================================

-- ------------------------------- accounts -------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(40)  NOT NULL,
  club_id       VARCHAR(40),
  name          VARCHAR(160) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  role          text         NOT NULL DEFAULT 'player' CHECK (role IN ('manager','coach','player')),
  status        text         NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','rejected')),
  team_id       VARCHAR(40),
  player_id     VARCHAR(40),
  request_note  text,
  photo         text,
  email_seen    boolean      NOT NULL DEFAULT false,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  reviewed_by   VARCHAR(40),
  reviewed_at   timestamptz,
  PRIMARY KEY (id)
);

-- Case does not make two addresses: the old MySQL column was case-insensitive,
-- so the unique index keeps that meaning on lower(email).
CREATE UNIQUE INDEX users_email ON users (lower(email));
CREATE INDEX users_club ON users (club_id, status);

CREATE TABLE IF NOT EXISTS credentials (
  user_id     VARCHAR(40)  NOT NULL,
  algo        VARCHAR(24)  NOT NULL,
  salt        bytea        NOT NULL,
  secret_hash bytea        NOT NULL,
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

-- Access and refresh tokens are stored hashed and the refresh token rotates on
-- every use, so a copied refresh token dies the moment the real device talks
-- to the server again.
CREATE TABLE IF NOT EXISTS sessions (
  id           VARCHAR(40)   NOT NULL,
  user_id      VARCHAR(40)   NOT NULL,
  device_id    VARCHAR(64)   NOT NULL DEFAULT '',
  access_hash  bytea         NOT NULL,
  refresh_hash bytea         NOT NULL,
  access_at    timestamptz   NOT NULL,
  refresh_at   timestamptz   NOT NULL,
  expires_at   timestamptz   NOT NULL,
  revoked_at   timestamptz,
  PRIMARY KEY (id),
  UNIQUE (access_hash)
);

CREATE INDEX sessions_refresh ON sessions (refresh_hash);
CREATE INDEX sessions_user ON sessions (user_id);

-- Passkeys: the browser ceremony is checked against this public key, so a
-- fingerprint unlock means exactly as much to the server as a password does.
CREATE TABLE IF NOT EXISTS passkeys (
  id           VARCHAR(255) NOT NULL,
  user_id      VARCHAR(40)  NOT NULL,
  public_key   bytea        NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  PRIMARY KEY (id)
);

CREATE INDEX passkeys_user ON passkeys (user_id);

CREATE TABLE IF NOT EXISTS email_tokens (
  id         VARCHAR(40)   NOT NULL,
  user_id    VARCHAR(40)   NOT NULL,
  purpose    text          NOT NULL CHECK (purpose IN ('verify','reset')),
  token_hash bytea         NOT NULL,
  created_at timestamptz   NOT NULL DEFAULT now(),
  used_at    timestamptz,
  expires_at timestamptz   NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (token_hash)
);

CREATE INDEX email_token_user ON email_tokens (user_id, purpose);

-- --------------------------------- clubs --------------------------------
CREATE TABLE IF NOT EXISTS clubs (
  id          VARCHAR(40)  NOT NULL,
  name        VARCHAR(160) NOT NULL DEFAULT '',
  short_name  VARCHAR(64)  NOT NULL DEFAULT '',
  sport       VARCHAR(24)  NOT NULL DEFAULT 'volleyball',
  invite_code VARCHAR(16)  NOT NULL,
  city        VARCHAR(80)  NOT NULL DEFAULT '',
  founded     VARCHAR(16)  NOT NULL DEFAULT '',
  phone       VARCHAR(32)  NOT NULL DEFAULT '',
  season      VARCHAR(24)  NOT NULL DEFAULT '',
  logo        text,
  payload     text,
  created_by  VARCHAR(40),
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (invite_code)
);

CREATE TABLE IF NOT EXISTS coach_invites (
  id         VARCHAR(40)   NOT NULL,
  club_id    VARCHAR(40)   NOT NULL,
  full_name  VARCHAR(160)  NOT NULL,
  email      VARCHAR(255)  NOT NULL,
  code       VARCHAR(16)   NOT NULL,
  team_id    VARCHAR(40),
  created_by VARCHAR(40),
  created_at timestamptz   NOT NULL DEFAULT now(),
  expires_at timestamptz   NOT NULL DEFAULT (now() + interval '30 days'),
  used_at    timestamptz,
  used_by    VARCHAR(40),
  PRIMARY KEY (id),
  UNIQUE (code)
);

CREATE INDEX coach_invite_email ON coach_invites (club_id, email);

-- ------------------------------ record tables ----------------------------
-- No ON UPDATE trigger anywhere: the write path sets updated_at itself, so a
-- row cannot move without the log that describes the move.
CREATE TABLE IF NOT EXISTS teams (
  club_id     VARCHAR(40)  NOT NULL,
  id          VARCHAR(40)  NOT NULL,
  payload     text         NOT NULL,
  name        VARCHAR(120) NOT NULL DEFAULT '',
  age_group   VARCHAR(80)  NOT NULL DEFAULT '',
  coach       VARCHAR(120) NOT NULL DEFAULT '',
  color       VARCHAR(24)  NOT NULL DEFAULT 'blue',
  season      VARCHAR(24)  NOT NULL DEFAULT '',
  home_venue  VARCHAR(160) NOT NULL DEFAULT '',
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  VARCHAR(40),
  deleted_at  timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX teams_id ON teams (id);

CREATE TABLE IF NOT EXISTS players (
  club_id     VARCHAR(40)  NOT NULL,
  id          VARCHAR(40)  NOT NULL,
  payload     text         NOT NULL,
  full_name   VARCHAR(160) NOT NULL DEFAULT '',
  phone       VARCHAR(32)  NOT NULL DEFAULT '',
  team_id     VARCHAR(40),
  position    VARCHAR(32)  NOT NULL DEFAULT '',
  jersey      smallint     NOT NULL DEFAULT 0,
  birth_date  date,
  height_cm   smallint,
  status      text         NOT NULL DEFAULT 'active' CHECK (status IN ('active','injured','inactive')),
  joined_at   date,
  monthly_fee bigint       NOT NULL DEFAULT 0,
  note        text,
  address     VARCHAR(500),
  insured     boolean      NOT NULL DEFAULT false,
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  VARCHAR(40),
  deleted_at  timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX players_id ON players (id);
CREATE INDEX players_club_team ON players (club_id, team_id);
CREATE INDEX players_club_status ON players (club_id, status);

CREATE TABLE IF NOT EXISTS events (
  club_id       VARCHAR(40)  NOT NULL,
  id            VARCHAR(40)  NOT NULL,
  payload       text         NOT NULL,
  type          text         NOT NULL DEFAULT 'training' CHECK (type IN ('training','match')),
  team_id       VARCHAR(40),
  title         VARCHAR(200) NOT NULL DEFAULT '',
  opponent      VARCHAR(160),
  location      VARCHAR(200) NOT NULL DEFAULT '',
  starts_at     timestamptz,
  duration_min  smallint     NOT NULL DEFAULT 0,
  status        text         NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','canceled')),
  notes         text,
  reminder_note text,
  sets          text,
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  updated_by    VARCHAR(40),
  deleted_at    timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX events_id ON events (id);
CREATE INDEX events_club_team ON events (club_id, team_id, starts_at);

-- No unique (event_id, player_id) here on purpose: the phone is the author of
-- those rows, and a unique key would silently merge two records that differ
-- only in the payload instead of keeping both and letting the last write win.
CREATE TABLE IF NOT EXISTS attendance (
  club_id    VARCHAR(40) NOT NULL,
  id         VARCHAR(40) NOT NULL,
  payload    text        NOT NULL,
  event_id   VARCHAR(40) NOT NULL,
  player_id  VARCHAR(40) NOT NULL,
  status     text        NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','excused')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by VARCHAR(40),
  deleted_at timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX attendance_id ON attendance (id);
CREATE INDEX attendance_event ON attendance (club_id, event_id);
CREATE INDEX attendance_player ON attendance (club_id, player_id);

CREATE TABLE IF NOT EXISTS match_stats (
  club_id       VARCHAR(40) NOT NULL,
  id            VARCHAR(40) NOT NULL,
  payload       text        NOT NULL,
  event_id      VARCHAR(40) NOT NULL,
  player_id     VARCHAR(40) NOT NULL,
  serve_points  integer     NOT NULL DEFAULT 0,
  attack_points integer     NOT NULL DEFAULT 0,
  block_points  integer     NOT NULL DEFAULT 0,
  digs          integer     NOT NULL DEFAULT 0,
  errors        integer     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    VARCHAR(40),
  deleted_at    timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX stats_id ON match_stats (id);
CREATE INDEX stats_event ON match_stats (club_id, event_id);

CREATE TABLE IF NOT EXISTS invoices (
  club_id    VARCHAR(40)  NOT NULL,
  id         VARCHAR(40)  NOT NULL,
  payload    text         NOT NULL,
  player_id  VARCHAR(40)  NOT NULL,
  kind       text         NOT NULL DEFAULT 'tuition' CHECK (kind IN ('tuition','tax')),
  period     VARCHAR(32)  NOT NULL DEFAULT '',
  title      VARCHAR(200) NOT NULL DEFAULT '',
  amount     bigint       NOT NULL DEFAULT 0,
  due_at     timestamptz,
  issued_at  timestamptz,
  updated_at timestamptz  NOT NULL DEFAULT now(),
  updated_by VARCHAR(40),
  deleted_at timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX invoices_id ON invoices (id);
CREATE INDEX invoices_player ON invoices (club_id, player_id);

CREATE TABLE IF NOT EXISTS payments (
  club_id    VARCHAR(40)  NOT NULL,
  id         VARCHAR(40)  NOT NULL,
  payload    text         NOT NULL,
  invoice_id VARCHAR(40)  NOT NULL,
  player_id  VARCHAR(40)  NOT NULL,
  amount     bigint       NOT NULL DEFAULT 0,
  paid_at    timestamptz,
  method     text         NOT NULL DEFAULT 'card' CHECK (method IN ('card','cash','gateway','transfer')),
  account_id VARCHAR(40),
  reference  VARCHAR(120),
  updated_at timestamptz  NOT NULL DEFAULT now(),
  updated_by VARCHAR(40),
  deleted_at timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX payments_id ON payments (id);
CREATE INDEX payments_invoice ON payments (club_id, invoice_id);
CREATE INDEX payments_player ON payments (club_id, player_id);

CREATE TABLE IF NOT EXISTS finance_categories (
  club_id    VARCHAR(40)  NOT NULL,
  id         VARCHAR(40)  NOT NULL,
  payload    text         NOT NULL,
  name       VARCHAR(120) NOT NULL DEFAULT '',
  kind       text         NOT NULL DEFAULT 'expense' CHECK (kind IN ('income','expense')),
  system     boolean      NOT NULL DEFAULT false,
  updated_at timestamptz  NOT NULL DEFAULT now(),
  updated_by VARCHAR(40),
  deleted_at timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX categories_id ON finance_categories (id);
CREATE INDEX categories_club ON finance_categories (club_id, kind);

CREATE TABLE IF NOT EXISTS accounts (
  club_id         VARCHAR(40)  NOT NULL,
  id              VARCHAR(40)  NOT NULL,
  payload         text         NOT NULL,
  name            VARCHAR(120) NOT NULL DEFAULT '',
  kind            text         NOT NULL DEFAULT 'cash' CHECK (kind IN ('cash','bank')),
  bank_name       VARCHAR(120),
  account_number  VARCHAR(40),
  card_number     VARCHAR(24),
  iban            VARCHAR(34),
  opening_balance bigint       NOT NULL DEFAULT 0,
  active          boolean      NOT NULL DEFAULT true,
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  updated_by      VARCHAR(40),
  deleted_at      timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX accounts_id ON accounts (id);
CREATE INDEX accounts_club ON accounts (club_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  club_id       VARCHAR(40)   NOT NULL,
  id            VARCHAR(40)   NOT NULL,
  payload       text          NOT NULL,
  kind          text          NOT NULL DEFAULT 'expense' CHECK (kind IN ('income','expense')),
  category_id   VARCHAR(40),
  account_id    VARCHAR(40),
  amount        bigint        NOT NULL DEFAULT 0,
  method        text          NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','card','cheque','transfer','credit')),
  entry_date    date,
  title         VARCHAR(240)  NOT NULL DEFAULT '',
  party         VARCHAR(160),
  player_id     VARCHAR(40),
  source        text          NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','tuition','sale','purchase')),
  ref_id        VARCHAR(40),
  cheque_number VARCHAR(40),
  cheque_bank   VARCHAR(120),
  cheque_due_at timestamptz,
  cheque_status text          CHECK (cheque_status IN ('pending','cleared','bounced')),
  note          text,
  credit        boolean       NOT NULL DEFAULT false,
  settled       boolean       NOT NULL DEFAULT false,
  settled_at    timestamptz,
  recorded_at   timestamptz,
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  updated_by    VARCHAR(40),
  deleted_at    timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX ledger_id ON ledger_entries (id);
CREATE INDEX ledger_club_date ON ledger_entries (club_id, entry_date);
CREATE INDEX ledger_account ON ledger_entries (club_id, account_id);
CREATE INDEX ledger_player ON ledger_entries (club_id, player_id);

CREATE TABLE IF NOT EXISTS products (
  club_id    VARCHAR(40)  NOT NULL,
  id         VARCHAR(40)  NOT NULL,
  payload    text         NOT NULL,
  name       VARCHAR(160) NOT NULL DEFAULT '',
  category   VARCHAR(32)  NOT NULL DEFAULT 'other',
  sku        VARCHAR(64),
  size       VARCHAR(32),
  cost_price bigint       NOT NULL DEFAULT 0,
  sale_price bigint       NOT NULL DEFAULT 0,
  stock      integer      NOT NULL DEFAULT 0,
  min_stock  integer      NOT NULL DEFAULT 0,
  active     boolean      NOT NULL DEFAULT true,
  updated_at timestamptz  NOT NULL DEFAULT now(),
  updated_by VARCHAR(40),
  deleted_at timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX products_id ON products (id);
CREATE INDEX products_club ON products (club_id, category);

CREATE TABLE IF NOT EXISTS stock_movements (
  club_id       VARCHAR(40)  NOT NULL,
  id            VARCHAR(40)  NOT NULL,
  payload       text         NOT NULL,
  product_id    VARCHAR(40)  NOT NULL,
  kind          text         NOT NULL DEFAULT 'sale' CHECK (kind IN ('purchase','sale','adjustment')),
  qty           integer      NOT NULL DEFAULT 0,
  unit_price    bigint       NOT NULL DEFAULT 0,
  entry_date    date,
  party         VARCHAR(160),
  account_id    VARCHAR(40),
  method        VARCHAR(16),
  cheque_number VARCHAR(40),
  cheque_bank   VARCHAR(120),
  cheque_due_at timestamptz,
  cheque_status VARCHAR(16),
  ledger_id     VARCHAR(40),
  note          text,
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  updated_by    VARCHAR(40),
  deleted_at    timestamptz,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX movements_id ON stock_movements (id);
CREATE INDEX movements_product ON stock_movements (club_id, product_id, entry_date);

-- ------------------------------- sync spine ------------------------------
-- The pull cursor is this sequence, never a wall clock: two writes in the same
-- millisecond must not reorder or go missing for a phone that reconnects.
CREATE TABLE IF NOT EXISTS sync_log (
  seq        BIGINT      NOT NULL GENERATED ALWAYS AS IDENTITY,
  club_id    VARCHAR(40) NOT NULL,
  entity     VARCHAR(24) NOT NULL,
  record_id  VARCHAR(40) NOT NULL,
  payload    text        NOT NULL,
  deleted    boolean     NOT NULL DEFAULT false,
  hash       VARCHAR(64) NOT NULL,
  base_hash  VARCHAR(64),
  user_id    VARCHAR(40) NOT NULL,
  device_id  VARCHAR(64) NOT NULL DEFAULT '',
  op_id      VARCHAR(64) NOT NULL,
  scope      VARCHAR(8)  NOT NULL DEFAULT 'staff' CHECK (scope IN ('club','team','player','staff')),
  player_id  VARCHAR(40) NOT NULL DEFAULT '',
  team_id    VARCHAR(40) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (seq),
  UNIQUE (club_id, op_id)
);

CREATE INDEX sync_pull ON sync_log (club_id, seq);

-- The current version of every record, kept in one place so a conflict check,
-- a first-time snapshot and a pull cursor all read the same row without walking
-- thirteen tables. payload here is the wire truth; the projection tables are
-- derived and only for queries.
CREATE TABLE IF NOT EXISTS record_state (
  club_id    VARCHAR(40) NOT NULL,
  entity     VARCHAR(24) NOT NULL,
  record_id  VARCHAR(40) NOT NULL,
  payload    text        NOT NULL,
  deleted    boolean     NOT NULL DEFAULT false,
  hash       VARCHAR(64) NOT NULL,
  seq        bigint      NOT NULL,
  -- Who may read this row. The API filters on it and so does the row level
  -- policy a live subscription is checked against, so both answer alike.
  scope      VARCHAR(8)  NOT NULL DEFAULT 'staff' CHECK (scope IN ('club','team','player','staff')),
  player_id  VARCHAR(40) NOT NULL DEFAULT '',
  team_id    VARCHAR(40) NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by VARCHAR(40),
  PRIMARY KEY (club_id, entity, record_id)
);

CREATE INDEX record_state_seq ON record_state (club_id, seq);

-- Last applied sequence per device, so a reconnecting phone knows where to read
-- from without the client storing server internals.
CREATE TABLE IF NOT EXISTS device_cursors (
  club_id   VARCHAR(40) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  seq       bigint      NOT NULL DEFAULT 0,
  seen_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, device_id)
);

-- Applied migrations. Every boot runs the same command, so the runner must be
-- able to say "already done" without side effects.
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       VARCHAR(191) NOT NULL,
  applied_at timestamptz  NOT NULL DEFAULT now(),
  checksum   VARCHAR(64)  NOT NULL,
  PRIMARY KEY (name)
);
