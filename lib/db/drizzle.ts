import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const sqlitePath = process.env.SQLITE_PATH || './sqlite.db';
export const client = new Database(sqlitePath);
export const db = drizzle(client, { schema });
