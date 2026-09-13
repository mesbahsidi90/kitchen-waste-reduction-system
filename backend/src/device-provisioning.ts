import { createHmac, createHash, randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ApplicationError } from "./waste-store.js";

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_LENGTH = 8;
const PAIRING_LIFETIME_MS = 15 * 60 * 1_000;

const createDeviceSchema = z.object({
  branchId: z.uuid(),
  name: z.string().trim().min(1).max(120),
});
const claimDeviceSchema = z.object({
  pairingCode: z.string().trim().min(8).max(12),
});
const deviceIdSchema = z.uuid();

export type DevicePairing = {
  deviceId: string;
  deviceCode: string;
  pairingCode: string;
  expiresAt: string;
};

export type ClaimedDevice = {
  deviceToken: string;
  deviceCode: string;
  deviceName: string;
};

export interface DeviceProvisioningService {
  createDevice(userId: string, input: { branchId: string; name: string }): Promise<DevicePairing>;
  claimDevice(pairingCode: string): Promise<ClaimedDevice>;
  disableDevice(userId: string, deviceId: string): Promise<void>;
}

type SupabaseOptions = { url: string; secretKey: string };

export class SupabaseDeviceProvisioningService implements DeviceProvisioningService {
  private readonly client: SupabaseClient;
  private readonly pairingPepper: string;

  constructor(options: SupabaseOptions) {
    this.pairingPepper = options.secretKey;
    this.client = createClient(options.url, options.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private pairingHash(code: string) {
    return createHmac("sha256", this.pairingPepper).update(normalizePairingCode(code)).digest("hex");
  }

  private async managedBranch(userId: string, branchId: string) {
    const branchResult = await this.client
      .from("branches")
      .select("id, organization_id, status")
      .eq("id", branchId)
      .maybeSingle();
    if (branchResult.error) throw databaseError();
    if (!branchResult.data || branchResult.data.status !== "active") {
      throw new ApplicationError(404, "BRANCH_NOT_FOUND", "الفرع غير موجود أو غير نشط");
    }

    const membershipResult = await this.client
      .from("memberships")
      .select("role, branch_id")
      .eq("user_id", userId)
      .eq("organization_id", branchResult.data.organization_id)
      .eq("status", "active");
    if (membershipResult.error) throw databaseError();

    const allowed = (membershipResult.data ?? []).some((membership) =>
      membership.role === "organization_owner"
      || (membership.role === "branch_manager" && membership.branch_id === branchId));
    if (!allowed) {
      throw new ApplicationError(403, "FORBIDDEN", "لا تملك صلاحية إدارة أجهزة هذا الفرع");
    }
    return branchResult.data as { id: string; organization_id: string; status: string };
  }

  async createDevice(userId: string, input: { branchId: string; name: string }) {
    const branch = await this.managedBranch(userId, input.branchId);
    const [organizationResult, subscriptionResult, countResult] = await Promise.all([
      this.client.from("organizations").select("status").eq("id", branch.organization_id).single(),
      this.client.from("subscriptions").select("status, device_limit").eq("organization_id", branch.organization_id).single(),
      this.client.from("devices").select("id", { count: "exact", head: true }).eq("organization_id", branch.organization_id).neq("status", "disabled"),
    ]);
    if (organizationResult.error || subscriptionResult.error || countResult.error) throw databaseError();
    if (!organizationResult.data || !["trial", "active"].includes(organizationResult.data.status)) {
      throw new ApplicationError(403, "ORGANIZATION_INACTIVE", "المؤسسة غير نشطة");
    }
    if (!subscriptionResult.data || !["trialing", "active"].includes(subscriptionResult.data.status)) {
      throw new ApplicationError(403, "SUBSCRIPTION_INACTIVE", "الاشتراك غير نشط");
    }
    if ((countResult.count ?? 0) >= subscriptionResult.data.device_limit) {
      throw new ApplicationError(409, "DEVICE_LIMIT_REACHED", "تم بلوغ الحد الأقصى للأجهزة في الاشتراك");
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const deviceCode = `KIOSK_${randomBytes(3).toString("hex").toUpperCase()}`;
      const pairingCode = generatePairingCode();
      const expiresAt = new Date(Date.now() + PAIRING_LIFETIME_MS).toISOString();
      const result = await this.client.rpc("create_device_pairing", {
        p_organization_id: branch.organization_id,
        p_branch_id: branch.id,
        p_device_code: deviceCode,
        p_device_name: input.name,
        p_placeholder_api_key_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        p_pairing_code_hash: this.pairingHash(pairingCode),
        p_expires_at: expiresAt,
        p_created_by: userId,
      });
      if (!result.error && typeof result.data === "string") {
        return { deviceId: result.data, deviceCode, pairingCode: formatPairingCode(pairingCode), expiresAt };
      }
      if (result.error?.code !== "23505") throw databaseError();
    }
    throw new ApplicationError(503, "PAIRING_CODE_UNAVAILABLE", "تعذر إنشاء رمز اقتران فريد، حاول مجددًا");
  }

  async claimDevice(pairingCode: string) {
    const normalizedCode = normalizePairingCode(pairingCode);
    if (normalizedCode.length !== PAIRING_CODE_LENGTH || [...normalizedCode].some((character) => !PAIRING_ALPHABET.includes(character))) {
      throw new ApplicationError(400, "INVALID_PAIRING_CODE", "رمز الاقتران غير صالح");
    }

    const secret = randomBytes(32).toString("base64url");
    const result = await this.client.rpc("claim_device_pairing", {
      p_pairing_code_hash: this.pairingHash(normalizedCode),
      p_api_key_hash: createHash("sha256").update(secret).digest("hex"),
    });
    if (result.error) {
      if (result.error.code === "P0002") {
        throw new ApplicationError(409, "DEVICE_UNAVAILABLE", "الجهاز لم يعد متاحًا للتفعيل");
      }
      throw databaseError();
    }
    const claimed = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!claimed) {
      throw new ApplicationError(404, "PAIRING_CODE_NOT_FOUND", "رمز الاقتران منتهي أو سبق استخدامه");
    }
    return {
      deviceToken: `${claimed.device_id}.${secret}`,
      deviceCode: claimed.device_code,
      deviceName: claimed.device_name,
    };
  }

  async disableDevice(userId: string, deviceId: string) {
    const deviceResult = await this.client
      .from("devices")
      .select("id, branch_id, status")
      .eq("id", deviceId)
      .maybeSingle();
    if (deviceResult.error) throw databaseError();
    if (!deviceResult.data) throw new ApplicationError(404, "DEVICE_NOT_FOUND", "الجهاز غير موجود");
    await this.managedBranch(userId, deviceResult.data.branch_id);
    const result = await this.client
      .from("devices")
      .update({ status: "disabled", updated_at: new Date().toISOString() })
      .eq("id", deviceId);
    if (result.error) throw databaseError();
  }
}

function normalizePairingCode(code: string) {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function generatePairingCode() {
  return Array.from({ length: PAIRING_CODE_LENGTH }, () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]).join("");
}

function formatPairingCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function databaseError() {
  return new ApplicationError(503, "DATABASE_ERROR", "تعذر إكمال العملية في قاعدة البيانات");
}

export function createDeviceProvisioningRouter(
  service: DeviceProvisioningService,
  requireUser: RequestHandler,
) {
  const router = Router();

  router.post("/claim", async (request, response, next) => {
    try {
      const input = claimDeviceSchema.parse(request.body);
      const claimed = await service.claimDevice(input.pairingCode);
      response.json({
        data: {
          device_token: claimed.deviceToken,
          device_code: claimed.deviceCode,
          device_name: claimed.deviceName,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requireUser, async (request, response, next) => {
    try {
      const input = createDeviceSchema.parse(request.body);
      const pairing = await service.createDevice(response.locals.userId, input);
      response.status(201).json({
        data: {
          device_id: pairing.deviceId,
          device_code: pairing.deviceCode,
          pairing_code: pairing.pairingCode,
          expires_at: pairing.expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:deviceId/disable", requireUser, async (request, response, next) => {
    try {
      const deviceId = deviceIdSchema.parse(request.params.deviceId);
      await service.disableDevice(response.locals.userId, deviceId);
      response.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
