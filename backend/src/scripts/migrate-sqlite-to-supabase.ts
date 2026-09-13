import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { createDatabase } from "../database.js";

type LegacyRow = {
  id: number;
  client_event_id: string;
  scale_id: string;
  weight_grams: number;
  category: string;
  reason: string;
  created_at: string;
};

function argument(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (!value) throw new Error(`Missing required argument --${name}`);
  return value;
}

function stableEventId(value: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function migrate() {
  if (!config.supabase) throw new Error("Set DATA_PROVIDER=supabase and the Supabase environment variables first");
  const organizationId = argument("organization-id");
  const branchId = argument("branch-id");
  const deviceId = argument("device-id");
  const databasePath = argument("database", config.databasePath);
  const client = createClient(config.supabase.url, config.supabase.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const deviceResult = await client
    .from("devices")
    .select("id, code")
    .eq("id", deviceId)
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .single();
  if (deviceResult.error) throw new Error(`Target device was not found in this tenant: ${deviceResult.error.message}`);

  const database = await createDatabase(databasePath);
  let rows: LegacyRow[];
  try {
    rows = await database.all<LegacyRow[]>(`
      SELECT id, client_event_id, scale_id, weight_grams, category, reason, created_at
      FROM waste_logs ORDER BY id
    `);
  } finally {
    await database.close();
  }

  const unexpectedScales = [...new Set(rows.map((row) => row.scale_id))]
    .filter((code) => code !== deviceResult.data.code);
  if (unexpectedScales.length > 0) {
    throw new Error(`SQLite contains scale IDs that do not match the target device: ${unexpectedScales.join(", ")}`);
  }
  if (rows.length === 0) {
    console.log("SQLite contains no waste events to migrate.");
    return;
  }

  const categoryNames = [...new Set(rows.map((row) => row.category))];
  const reasonNames = [...new Set(rows.map((row) => row.reason))];
  const [categoryResult, reasonResult] = await Promise.all([
    client.from("categories").upsert(
      categoryNames.map((name) => ({ organization_id: organizationId, branch_id: branchId, name })),
      { onConflict: "organization_id,branch_id,name" },
    ).select("id, name"),
    client.from("waste_reasons").upsert(
      reasonNames.map((name) => ({ organization_id: organizationId, branch_id: branchId, name })),
      { onConflict: "organization_id,branch_id,name" },
    ).select("id, name"),
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (reasonResult.error) throw reasonResult.error;

  const categories = new Map(categoryResult.data.map((item) => [item.name, item.id]));
  const reasons = new Map(reasonResult.data.map((item) => [item.name, item.id]));
  const events = rows.map((row) => ({
    organization_id: organizationId,
    branch_id: branchId,
    device_id: deviceId,
    client_event_id: stableEventId(`sqlite:${branchId}:${row.scale_id}:${row.client_event_id}`),
    category_id: categories.get(row.category)!,
    reason_id: reasons.get(row.reason)!,
    weight_grams: row.weight_grams,
    source: "serial",
    occurred_at: row.created_at,
  }));

  for (let offset = 0; offset < events.length; offset += 500) {
    const result = await client.from("waste_events").upsert(events.slice(offset, offset + 500), {
      onConflict: "branch_id,client_event_id",
      ignoreDuplicates: true,
    });
    if (result.error) throw result.error;
  }

  console.log(`Migrated ${events.length} SQLite waste events to Supabase.`);
}

migrate().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
