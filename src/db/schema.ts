import { db } from './client';

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS domains (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    domain      TEXT NOT NULL UNIQUE,
    type        TEXT NOT NULL CHECK(type IN ('subdomain', 'custom', 'wildcard')),
    target_ip   TEXT NOT NULL DEFAULT '127.0.0.1',
    port        INTEGER,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Seed settings
const seedSettings = [
  { key: 'dns_port', value: '53' },
  { key: 'upstream_dns', value: '8.8.8.8' },
  { key: 'cert_dir', value: `${process.env.HOME || process.env.USERPROFILE}/.localdns/certs` },
  { key: 'technitium_url', value: 'http://localhost:5380' },
  { key: 'caddy_admin_url', value: 'http://localhost:2019' },
  { key: 'app_domain', value: 'local.test' },
  { key: 'app_port', value: '4321' },
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const setting of seedSettings) {
  insertSetting.run(setting.key, setting.value);
}

// Seed example domains (use .local for seed subdomains)
db.prepare(`
  INSERT OR IGNORE INTO domains (domain, type, target_ip, port, active)
  VALUES
    ('local.test',  'custom', '127.0.0.1', 4321, 1)
`).run();
