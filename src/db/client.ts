import { DatabaseSync } from "node:sqlite";
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

const dbDir = join(homedir(), '.localdns');
mkdirSync(dbDir, { recursive: true });

const dbPath = join(dbDir, 'localdns.db');
const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export { db };
export default db;
