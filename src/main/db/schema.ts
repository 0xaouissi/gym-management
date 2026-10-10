import type { Db } from './database'

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN','RECEPTIONIST')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    date_of_birth TEXT,
    address TEXT,
    photo TEXT,
    notes TEXT,
    rfid_uid TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','BLOCKED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_clients_name ON clients(last_name, first_name);
  CREATE INDEX idx_clients_phone ON clients(phone);
  CREATE INDEX idx_clients_rfid ON clients(rfid_uid);

  CREATE TABLE subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    duration_value INTEGER NOT NULL CHECK (duration_value > 0),
    duration_unit TEXT NOT NULL CHECK (duration_unit IN ('DAYS','WEEKS','MONTHS')),
    price REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE rfid_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL,
    card_number TEXT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','BLOCKED','LOST','REVOKED')),
    issued_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_rfid_uid_live ON rfid_cards(uid) WHERE status != 'REVOKED';
  CREATE INDEX idx_rfid_client ON rfid_cards(client_id);

  CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED','SUSPENDED')),
    price REAL NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('PAID','PARTIAL','UNPAID')),
    is_renewal INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_sub_client ON subscriptions(client_id);
  CREATE INDEX idx_sub_end ON subscriptions(end_date);
  CREATE INDEX idx_sub_status ON subscriptions(status);

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    payment_date TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH','CARD','BANK_TRANSFER','OTHER')),
    reference TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_pay_client ON payments(client_id);
  CREATE INDEX idx_pay_sub ON payments(subscription_id);
  CREATE INDEX idx_pay_date ON payments(payment_date);

  CREATE TABLE access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    client_name TEXT,
    rfid_uid TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('ALLOWED','DENIED')),
    reason TEXT NOT NULL,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
    device_id TEXT
  );
  CREATE INDEX idx_access_ts ON access_logs(timestamp);
  CREATE INDEX idx_access_client ON access_logs(client_id);
  CREATE INDEX idx_access_result ON access_logs(result);

  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    timestamp TEXT NOT NULL
  );
  CREATE INDEX idx_audit_ts ON audit_logs(timestamp);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  INSERT INTO subscription_plans (name, description, duration_value, duration_unit, price, is_active, created_at, updated_at) VALUES
    ('13 Sessions / Month', '13 sessions per month (3 per week)', 1, 'MONTHS', 1800, 1, datetime('now'), datetime('now')),
    ('17 Sessions / Month', '17 sessions per month (4 per week)', 1, 'MONTHS', 2000, 1, datetime('now'), datetime('now')),
    ('22 Sessions / Month', '22 sessions per month (5 per week)', 1, 'MONTHS', 2200, 1, datetime('now'), datetime('now'));
  `,
  `
  INSERT INTO subscription_plans (name, description, duration_value, duration_unit, price, is_active, created_at, updated_at)
    SELECT '13 Sessions / Month', '13 sessions per month (3 per week)', 1, 'MONTHS', 1800, 1, datetime('now'), datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = '13 Sessions / Month');

  INSERT INTO subscription_plans (name, description, duration_value, duration_unit, price, is_active, created_at, updated_at)
    SELECT '17 Sessions / Month', '17 sessions per month (4 per week)', 1, 'MONTHS', 2000, 1, datetime('now'), datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = '17 Sessions / Month');

  INSERT INTO subscription_plans (name, description, duration_value, duration_unit, price, is_active, created_at, updated_at)
    SELECT '22 Sessions / Month', '22 sessions per month (5 per week)', 1, 'MONTHS', 2200, 1, datetime('now'), datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = '22 Sessions / Month');

  UPDATE subscription_plans SET is_active = 0, updated_at = datetime('now')
    WHERE name IN ('1 Week', '4 Weeks', '1 Month', '3 Months', '6 Months', '12 Months') AND is_active = 1;
  `
]

export function migrate(db: Db): void {
  const row = db.get<{ user_version: number }>('PRAGMA user_version')
  const current = row?.user_version ?? 0
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[version])
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // ignore rollback failure
      }
      throw error
    }
  }
}
