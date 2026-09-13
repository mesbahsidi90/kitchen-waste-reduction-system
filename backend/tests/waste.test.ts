import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { allowLocalRequests } from "../src/auth.js";
import { createDatabase, type AppDatabase } from "../src/database.js";
import { SqliteWasteStore } from "../src/sqlite-waste-store.js";

describe("waste API", () => {
  let database: AppDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    database = await createDatabase(":memory:");
    app = createApp(new SqliteWasteStore(database), {
      corsOrigins: ["http://localhost:5173"],
      requireUser: allowLocalRequests,
      requireDevice: allowLocalRequests,
    });
  });

  afterEach(async () => {
    await database.close();
  });

  it("creates and lists a validated waste log", async () => {
    const created = await request(app).post("/api/v1/waste-logs").send({
      client_event_id: "00000000-0000-4000-8000-000000000001",
      scale_id: "SCALE_01",
      weight_kg: 1.234,
      category: "خضروات وفواكه",
      reason: "تالف",
    });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      id: 1,
      scale_id: "SCALE_01",
      weight_kg: 1.234,
    });

    const listed = await request(app).get("/api/v1/waste-logs");
    expect(listed.status).toBe(200);
    expect(listed.body.pagination).toEqual({ limit: 50, offset: 0, total: 1 });
    expect(listed.body.data).toHaveLength(1);
  });

  it("rejects invalid and negative weights", async () => {
    const response = await request(app).post("/api/v1/waste-logs").send({
      client_event_id: "00000000-0000-4000-8000-000000000002",
      scale_id: "SCALE_01",
      weight_kg: -1,
      category: "خضروات",
      reason: "تالف",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns server-side analytics", async () => {
    await request(app).post("/api/v1/waste-logs").send({
      client_event_id: "00000000-0000-4000-8000-000000000003",
      scale_id: "SCALE_01",
      weight_kg: 0.75,
      category: "مخبوزات",
      reason: "فائض",
    });

    const response = await request(app).get("/api/v1/analytics/summary");
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      total_weight_kg: 0.75,
      total_count: 1,
      categories: [{ category: "مخبوزات", weight_kg: 0.75, count: 1 }],
    });
  });

  it("replays the same device event without creating a duplicate", async () => {
    const event = {
      client_event_id: "00000000-0000-4000-8000-000000000004",
      scale_id: "SCALE_01",
      weight_kg: 0.5,
      category: "مخبوزات",
      reason: "فائض",
    };

    expect((await request(app).post("/api/v1/waste-logs").send(event)).status).toBe(201);
    const replay = await request(app).post("/api/v1/waste-logs").send(event);
    expect(replay.status).toBe(200);
    expect(replay.headers["x-idempotent-replay"]).toBe("true");

    const listed = await request(app).get("/api/v1/waste-logs");
    expect(listed.body.pagination.total).toBe(1);
  });

  it("does not expose internal details for unknown routes", async () => {
    const response = await request(app).get("/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});

describe("database migrations", () => {
  it("preserves valid records from the original MVP schema", async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "kitchen-waste-"));
    const filename = path.join(temporaryDirectory, "legacy.sqlite");

    try {
      const legacyDatabase = await open({ filename, driver: sqlite3.Database });
      await legacyDatabase.exec(`
        CREATE TABLE waste_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scale_id TEXT,
          weight_kg REAL,
          category TEXT,
          reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO waste_logs (scale_id, weight_kg, category, reason, created_at)
        VALUES ('SCALE_01', 1.25, 'مخبوزات', 'فائض', '2026-09-12 08:00:00');
      `);
      await legacyDatabase.close();

      const migratedDatabase = await createDatabase(filename);
      const row = await migratedDatabase.get<{
        weight_grams: number;
        client_event_id: string;
        created_at: string;
      }>("SELECT weight_grams, client_event_id, created_at FROM waste_logs WHERE id = 1");
      const versions = await migratedDatabase.all<Array<{ version: number }>>(
        "SELECT version FROM schema_migrations ORDER BY version",
      );

      expect(row).toEqual({
        weight_grams: 1_250,
        client_event_id: "legacy-1",
        created_at: "2026-09-12T08:00:00Z",
      });
      expect(versions.map((migration) => migration.version)).toEqual([1, 2]);
      await migratedDatabase.close();
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
