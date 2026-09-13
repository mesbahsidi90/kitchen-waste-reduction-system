import fs from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";

export type AppDatabase = Database<sqlite3.Database, sqlite3.Statement>;

async function tableExists(db: AppDatabase, tableName: string) {
  const row = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName,
  );
  return Boolean(row);
}

async function migrate(db: AppDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const migration = await db.get<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version = 1",
  );
  if (!migration) {
    await db.exec("BEGIN IMMEDIATE");
    try {
      const hasLegacyTable = await tableExists(db, "waste_logs");
      if (hasLegacyTable) {
        await db.exec("ALTER TABLE waste_logs RENAME TO waste_logs_legacy");
      }

      await db.exec(`
        CREATE TABLE waste_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scale_id TEXT NOT NULL CHECK (length(trim(scale_id)) BETWEEN 1 AND 64),
          weight_grams INTEGER NOT NULL CHECK (weight_grams > 0),
          category TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 100),
          reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 100),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX idx_waste_logs_created_at ON waste_logs(created_at DESC);
        CREATE INDEX idx_waste_logs_category_created_at
          ON waste_logs(category, created_at DESC);
      `);

      if (hasLegacyTable) {
        await db.exec(`
          INSERT INTO waste_logs (id, scale_id, weight_grams, category, reason, created_at)
          SELECT id, trim(scale_id), CAST(round(weight_kg * 1000) AS INTEGER),
            trim(category), trim(reason),
            CASE WHEN created_at LIKE '%Z' THEN created_at ELSE replace(created_at, ' ', 'T') || 'Z' END
          FROM waste_logs_legacy
          WHERE length(trim(scale_id)) BETWEEN 1 AND 64 AND weight_kg > 0
            AND length(trim(category)) BETWEEN 1 AND 100
            AND length(trim(reason)) BETWEEN 1 AND 100;
          DROP TABLE waste_logs_legacy;
        `);
      }

      await db.run("INSERT INTO schema_migrations (version) VALUES (1)");
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }

  const idempotencyMigration = await db.get<{ version: number }>(
    "SELECT version FROM schema_migrations WHERE version = 2",
  );
  if (!idempotencyMigration) {
    await db.exec("BEGIN IMMEDIATE");
    try {
      await db.exec(`
        ALTER TABLE waste_logs ADD COLUMN client_event_id TEXT;
        UPDATE waste_logs SET client_event_id = 'legacy-' || id WHERE client_event_id IS NULL;
        CREATE UNIQUE INDEX idx_waste_logs_device_event
          ON waste_logs(scale_id, client_event_id);
      `);
      await db.run("INSERT INTO schema_migrations (version) VALUES (2)");
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
}

export async function createDatabase(filename: string): Promise<AppDatabase> {
  if (filename !== ":memory:") {
    await fs.mkdir(path.dirname(filename), { recursive: true });
  }

  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  await migrate(db);
  return db;
}
