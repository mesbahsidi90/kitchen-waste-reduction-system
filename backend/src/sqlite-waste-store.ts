import type { AppDatabase } from "./database.js";
import type {
  ListWasteLogsQuery,
  DeviceCatalog,
  RequestContext,
  WasteLog,
  WasteLogInput,
  WasteStore,
  WasteSummary,
} from "./waste-store.js";

type StoredWasteLog = {
  id: number;
  scale_id: string;
  weight_grams: number;
  category: string;
  reason: string;
  client_event_id: string;
  created_at: string;
};

function toWasteLog(row: StoredWasteLog): WasteLog {
  return {
    id: row.id,
    scale_id: row.scale_id,
    weight_kg: row.weight_grams / 1_000,
    category: row.category,
    reason: row.reason,
    client_event_id: row.client_event_id,
    created_at: row.created_at,
  };
}

export class SqliteWasteStore implements WasteStore {
  constructor(private readonly db: AppDatabase) {}

  async create(input: WasteLogInput, _context: RequestContext) {
    const result = await this.db.run(
      `INSERT INTO waste_logs (scale_id, weight_grams, category, reason, client_event_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scale_id, client_event_id) DO NOTHING`,
      input.scale_id,
      Math.round(input.weight_kg * 1_000),
      input.category,
      input.reason,
      input.client_event_id,
    );
    const row = await this.db.get<StoredWasteLog>(
      "SELECT * FROM waste_logs WHERE scale_id = ? AND client_event_id = ?",
      input.scale_id,
      input.client_event_id,
    );
    return { log: toWasteLog(row!), replayed: result.changes === 0 };
  }

  async list(query: ListWasteLogsQuery, _context: RequestContext) {
    const [rows, count] = await Promise.all([
      this.db.all<StoredWasteLog[]>(
        "SELECT * FROM waste_logs ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        query.limit,
        query.offset,
      ),
      this.db.get<{ total: number }>("SELECT count(*) AS total FROM waste_logs"),
    ]);
    return { logs: rows.map(toWasteLog), total: count?.total ?? 0 };
  }

  async summary(_context: RequestContext): Promise<WasteSummary> {
    const totals = await this.db.get<{ total_grams: number; total_count: number }>(`
      SELECT coalesce(sum(weight_grams), 0) AS total_grams, count(*) AS total_count
      FROM waste_logs
    `);
    const categories = await this.db.all<
      Array<{ category: string; weight_grams: number; count: number }>
    >(`
      SELECT category, sum(weight_grams) AS weight_grams, count(*) AS count
      FROM waste_logs GROUP BY category ORDER BY weight_grams DESC
    `);
    return {
      total_weight_kg: (totals?.total_grams ?? 0) / 1_000,
      total_count: totals?.total_count ?? 0,
      categories: categories.map((row) => ({
        category: row.category,
        weight_kg: row.weight_grams / 1_000,
        count: row.count,
      })),
    };
  }

  async catalog(_context: RequestContext): Promise<DeviceCatalog> {
    return {
      scale_id: "SCALE_01",
      categories: [
        { id: "vegetables", name: "خضروات وفواكه", color: "#16865b" },
        { id: "meat", name: "لحوم ودواجن", color: "#b94747" },
        { id: "bakery", name: "مخبوزات", color: "#c97924" },
        { id: "cooked", name: "وجبات مطبوخة", color: "#347cc1" },
      ],
      reasons: [
        { id: "expired", name: "تالف / منتهي الصلاحية" },
        { id: "trim", name: "بقايا تحضير (Trim)" },
        { id: "plates", name: "بقايا صحون الزبائن" },
        { id: "cooking", name: "خطأ طهي" },
      ],
    };
  }

  async ready() {
    await this.db.get("SELECT 1");
  }

  async close() {
    await this.db.close();
  }
}
