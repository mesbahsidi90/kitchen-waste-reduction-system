import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ApplicationError,
  type DeviceCatalog,
  type ListWasteLogsQuery,
  type RequestContext,
  type WasteLog,
  type WasteLogInput,
  type WasteStore,
  type WasteSummary,
} from "./waste-store.js";

type SupabaseWasteStoreOptions = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

type Device = {
  id: string;
  organization_id: string;
  branch_id: string;
  code: string;
};

type CatalogItem = { id: string; name: string };

type WasteEventRow = {
  id: string;
  client_event_id: string;
  weight_grams: number;
  occurred_at: string;
  devices: { code: string } | Array<{ code: string }> | null;
  categories: { name: string } | Array<{ name: string }> | null;
  waste_reasons: { name: string } | Array<{ name: string }> | null;
};

const eventSelection = `
  id,
  client_event_id,
  weight_grams,
  occurred_at,
  devices!waste_events_device_fk(code),
  categories!waste_events_category_fk(name),
  waste_reasons!waste_events_reason_fk(name)
`;

function relationValue(
  relation: { name?: string; code?: string } | Array<{ name?: string; code?: string }> | null,
  key: "name" | "code",
) {
  const value = Array.isArray(relation) ? relation[0]?.[key] : relation?.[key];
  return value ?? "غير معروف";
}

function toWasteLog(row: WasteEventRow): WasteLog {
  return {
    id: row.id,
    client_event_id: row.client_event_id,
    scale_id: relationValue(row.devices, "code"),
    weight_kg: row.weight_grams / 1_000,
    category: relationValue(row.categories, "name"),
    reason: relationValue(row.waste_reasons, "name"),
    created_at: row.occurred_at,
  };
}

function requireContextValue(value: string | undefined, message: string) {
  if (!value) throw new ApplicationError(401, "UNAUTHORIZED", message);
  return value;
}

export class SupabaseWasteStore implements WasteStore {
  readonly authClient: SupabaseClient;
  private readonly adminClient: SupabaseClient;

  constructor(private readonly options: SupabaseWasteStoreOptions) {
    const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
    this.authClient = createClient(options.url, options.publishableKey, authOptions);
    this.adminClient = createClient(options.url, options.secretKey, authOptions);
  }

  private userClient(accessToken: string) {
    return createClient(this.options.url, this.options.publishableKey, {
      accessToken: async () => accessToken,
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private async authenticateDevice(deviceToken: string): Promise<Device> {
    const separator = deviceToken.indexOf(".");
    const deviceId = separator > 0 ? deviceToken.slice(0, separator) : "";
    const secret = separator > 0 ? deviceToken.slice(separator + 1) : "";
    if (!/^[0-9a-f-]{36}$/i.test(deviceId) || secret.length < 32) {
      throw new ApplicationError(401, "INVALID_DEVICE_TOKEN", "بيانات اعتماد الجهاز غير صالحة");
    }

    const apiKeyHash = createHash("sha256").update(secret).digest("hex");
    const { data, error } = await this.adminClient
      .from("devices")
      .select("id, organization_id, branch_id, code")
      .eq("id", deviceId)
      .eq("api_key_hash", apiKeyHash)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new ApplicationError(503, "DATABASE_ERROR", "تعذر التحقق من الجهاز");
    if (!data) throw new ApplicationError(401, "INVALID_DEVICE_TOKEN", "الجهاز غير معتمد أو معطل");
    return data as Device;
  }

  private async catalogItem(
    table: "categories" | "waste_reasons",
    device: Device,
    name: string,
  ): Promise<CatalogItem> {
    const { data, error } = await this.adminClient
      .from(table)
      .select("id, name")
      .eq("organization_id", device.organization_id)
      .eq("branch_id", device.branch_id)
      .eq("name", name)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new ApplicationError(503, "DATABASE_ERROR", "تعذر قراءة قائمة الفرع");
    if (!data) {
      throw new ApplicationError(409, "CATALOG_ITEM_NOT_FOUND", `العنصر «${name}» غير مفعّل في هذا الفرع`);
    }
    return data as CatalogItem;
  }

  async create(input: WasteLogInput, context: RequestContext) {
    const deviceToken = requireContextValue(context.deviceToken, "بيانات اعتماد الجهاز مطلوبة");
    const device = await this.authenticateDevice(deviceToken);
    if (input.scale_id !== device.code) {
      throw new ApplicationError(400, "DEVICE_MISMATCH", "معرف الميزان لا يطابق الجهاز المعتمد");
    }

    const [category, reason] = await Promise.all([
      this.catalogItem("categories", device, input.category),
      this.catalogItem("waste_reasons", device, input.reason),
    ]);
    const event = {
      organization_id: device.organization_id,
      branch_id: device.branch_id,
      device_id: device.id,
      client_event_id: input.client_event_id,
      category_id: category.id,
      reason_id: reason.id,
      weight_grams: Math.round(input.weight_kg * 1_000),
      source: "serial",
    };

    const inserted = await this.adminClient
      .from("waste_events")
      .upsert(event, { onConflict: "branch_id,client_event_id", ignoreDuplicates: true })
      .select("id, client_event_id, weight_grams, occurred_at");
    if (inserted.error) throw new ApplicationError(503, "DATABASE_ERROR", "تعذر تسجيل الهدر");

    const replayed = (inserted.data?.length ?? 0) === 0;
    const stored = replayed
      ? await this.adminClient
          .from("waste_events")
          .select("id, client_event_id, weight_grams, occurred_at")
          .eq("branch_id", device.branch_id)
          .eq("client_event_id", input.client_event_id)
          .single()
      : { data: inserted.data![0], error: null };
    if (stored.error || !stored.data) {
      throw new ApplicationError(503, "DATABASE_ERROR", "تعذر تأكيد تسجيل الهدر");
    }

    await this.adminClient
      .from("devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", device.id);

    return {
      replayed,
      log: {
        id: stored.data.id as string,
        client_event_id: stored.data.client_event_id as string,
        scale_id: device.code,
        weight_kg: (stored.data.weight_grams as number) / 1_000,
        category: category.name,
        reason: reason.name,
        created_at: stored.data.occurred_at as string,
      },
    };
  }

  async list(query: ListWasteLogsQuery, context: RequestContext) {
    const accessToken = requireContextValue(context.accessToken, "يلزم تسجيل الدخول");
    const result = await this.userClient(accessToken)
      .from("waste_events")
      .select(eventSelection, { count: "exact" })
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (result.error) throw new ApplicationError(503, "DATABASE_ERROR", "تعذر قراءة سجلات الهدر");
    return {
      logs: (result.data as unknown as WasteEventRow[]).map(toWasteLog),
      total: result.count ?? 0,
    };
  }

  async summary(context: RequestContext): Promise<WasteSummary> {
    const accessToken = requireContextValue(context.accessToken, "يلزم تسجيل الدخول");
    const { data, error } = await this.userClient(accessToken).rpc("get_waste_summary");
    if (error || !data) throw new ApplicationError(503, "DATABASE_ERROR", "تعذر حساب الإحصائيات");
    return data as WasteSummary;
  }

  async catalog(context: RequestContext): Promise<DeviceCatalog> {
    const deviceToken = requireContextValue(context.deviceToken, "بيانات اعتماد الجهاز مطلوبة");
    const device = await this.authenticateDevice(deviceToken);
    const [categoriesResult, reasonsResult] = await Promise.all([
      this.adminClient
        .from("categories")
        .select("id, name, color")
        .eq("organization_id", device.organization_id)
        .eq("branch_id", device.branch_id)
        .eq("is_active", true)
        .order("name"),
      this.adminClient
        .from("waste_reasons")
        .select("id, name")
        .eq("organization_id", device.organization_id)
        .eq("branch_id", device.branch_id)
        .eq("is_active", true)
        .order("name"),
    ]);

    if (categoriesResult.error || reasonsResult.error) {
      throw new ApplicationError(503, "DATABASE_ERROR", "تعذر قراءة قائمة الفرع");
    }

    await this.adminClient
      .from("devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", device.id);

    return {
      scale_id: device.code,
      categories: categoriesResult.data ?? [],
      reasons: reasonsResult.data ?? [],
    };
  }

  async ready() {
    const { error } = await this.adminClient
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) throw error;
  }

  async close() {}
}
