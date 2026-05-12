#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${LOCALDNS_DB_PATH:-$HOME/.localdns/localdns.db}"

export LOCALDNS_DB_PATH="$DB_PATH"

node --input-type=module <<'NODE'
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.env.LOCALDNS_DB_PATH ?? join(homedir(), '.localdns', 'localdns.db');

if (!existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

db.exec('BEGIN');
db.exec('DELETE FROM domains');
db.exec('DELETE FROM settings');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('domains', 'settings')");
db.exec('COMMIT');
db.exec('VACUUM');

console.log(`Cleared all entries in ${dbPath}`);
NODE