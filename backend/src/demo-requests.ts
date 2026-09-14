import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Router, type Request } from "express";
import { z } from "zod";
import type { AppDatabase } from "./database.js";
import { ApplicationError } from "./waste-store.js";

const requestSchema = z.object({
  restaurantName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(24).regex(/^[+\d\s().-]+$/),
  email: z.union([z.email().max(254), z.literal("")]).optional(),
  city: z.string().trim().min(2).max(100),
  branchCount: z.coerce.number().int().min(1).max(1000).default(1),
  preferredLanguage: z.enum(["ar", "fr", "en"]).default("ar"),
  message: z.string().trim().max(1000).optional(),
  website: z.string().max(0).optional(),
});

export type DemoRequestInput = z.infer<typeof requestSchema>;

export interface DemoRequestService {
  create(input: DemoRequestInput): Promise<string>;
}

export class SupabaseDemoRequestService implements DemoRequestService {
  private readonly client: SupabaseClient;

  constructor(options: { url: string; secretKey: string }) {
    this.client = createClient(options.url, options.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async create(input: DemoRequestInput) {
    const { data, error } = await this.client.from("demo_requests").insert({
      restaurant_name: input.restaurantName,
      contact_name: input.contactName,
      phone: input.phone,
      email: input.email || null,
      city: input.city,
      branch_count: input.branchCount,
      preferred_language: input.preferredLanguage,
      message: input.message || null,
    }).select("id").single();
    if (error || !data) throw new ApplicationError(503, "DEMO_REQUEST_FAILED", "تعذر حفظ طلب العرض حاليًا");
    return data.id as string;
  }
}

export class SqliteDemoRequestService implements DemoRequestService {
  constructor(private readonly database: AppDatabase) {}

  async create(input: DemoRequestInput) {
    const id = crypto.randomUUID();
    await this.database.run(
      `insert into demo_requests
        (id, restaurant_name, contact_name, phone, email, city, branch_count, preferred_language, message)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, input.restaurantName, input.contactName, input.phone, input.email || null,
      input.city, input.branchCount, input.preferredLanguage, input.message || null,
    );
    return id;
  }
}

function clientAddress(request: Request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

export function createDemoRequestsRouter(service: DemoRequestService) {
  const router = Router();
  const attempts = new Map<string, number[]>();

  router.post("/", async (request, response, next) => {
    try {
      const address = clientAddress(request);
      const cutoff = Date.now() - 60 * 60 * 1000;
      const recent = (attempts.get(address) ?? []).filter((time) => time > cutoff);
      if (recent.length >= 5) throw new ApplicationError(429, "RATE_LIMITED", "تم إرسال عدد كبير من الطلبات. حاول لاحقًا");
      recent.push(Date.now());
      attempts.set(address, recent);

      const input = requestSchema.parse(request.body);
      const id = await service.create(input);
      response.status(201).json({ id, status: "received" });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
