import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ApplicationError } from "./waste-store.js";

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  contact_email: string | null;
  status: "trial" | "active" | "suspended" | "closed";
  created_at: string;
  branch_count: number;
  device_count: number;
  member_count: number;
  waste_event_count: number;
  waste_weight_grams: number;
  subscription_plan: "trial" | "starter" | "growth" | "enterprise";
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  branch_limit: number;
  device_limit: number;
  current_period_end: string | null;
};

export type CreatePlatformOrganizationInput = {
  name: string;
  slug: string;
  ownerEmail?: string;
  branchName: string;
  timezone: string;
  plan: PlatformOrganization["subscription_plan"];
};

export type PlatformBranch = {
  id: string;
  name: string;
  timezone: string;
  status: "active" | "inactive";
  created_at: string;
};

export type PlatformMember = {
  id: string;
  user_id: string;
  email: string | null;
  branch_id: string | null;
  role: "organization_owner" | "branch_manager" | "worker";
  status: "invited" | "active" | "suspended";
  email_confirmed: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

export type PlatformOrganizationDetails = {
  organization: PlatformOrganization;
  branches: PlatformBranch[];
  members: PlatformMember[];
};

export type InvitePlatformMemberInput = {
  email: string;
  role: PlatformMember["role"];
  branchId: string | null;
};

export type PendingInvitation = {
  organizationName: string;
  role: PlatformMember["role"];
};

export type PlatformMetrics = {
  organization_count: number;
  branch_count: number;
  device_count: number;
  active_member_count: number;
  waste_event_count: number;
  waste_weight_grams: number;
  active_subscription_count: number;
  trial_subscription_count: number;
  past_due_subscription_count: number;
};

export interface PlatformAdminService {
  isPlatformAdmin(userId: string): Promise<boolean>;
  overview(): Promise<{ metrics: PlatformMetrics; organizations: PlatformOrganization[] }>;
  organizationDetails(organizationId: string): Promise<PlatformOrganizationDetails>;
  createOrganization(userId: string, input: CreatePlatformOrganizationInput): Promise<{ organizationId: string; ownerInvited: boolean }>;
  createBranch(userId: string, organizationId: string, input: { name: string; timezone: string }): Promise<{ branchId: string }>;
  inviteMember(userId: string, organizationId: string, input: InvitePlatformMemberInput): Promise<{ membershipId: string }>;
  getPendingInvitation(userId: string): Promise<PendingInvitation>;
  acceptInvitation(userId: string): Promise<{ activatedMemberships: number }>;
  updateOrganizationStatus(userId: string, organizationId: string, status: PlatformOrganization["status"]): Promise<void>;
  updateSubscription(
    userId: string,
    organizationId: string,
    input: { plan: PlatformOrganization["subscription_plan"]; status: PlatformOrganization["subscription_status"] },
  ): Promise<void>;
}

type SupabaseOptions = { url: string; secretKey: string; inviteRedirectUrl: string };

export class SupabasePlatformAdminService implements PlatformAdminService {
  private readonly client: SupabaseClient;
  private readonly inviteRedirectUrl: string;

  constructor(options: SupabaseOptions) {
    this.inviteRedirectUrl = options.inviteRedirectUrl;
    this.client = createClient(options.url, options.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async isPlatformAdmin(userId: string) {
    const result = await this.client
      .from("platform_admins")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (result.error) throw new ApplicationError(503, "DATABASE_ERROR", "تعذر التحقق من صلاحية إدارة المنصة");
    return Boolean(result.data);
  }

  async overview() {
    const [metricsResult, organizationsResult] = await Promise.all([
      this.client.from("platform_overview").select("*").single(),
      this.client.from("platform_organization_summary").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (metricsResult.error || organizationsResult.error) {
      throw new ApplicationError(503, "DATABASE_ERROR", "تعذر تحميل لوحة إدارة المنصة");
    }
    return {
      metrics: metricsResult.data as PlatformMetrics,
      organizations: (organizationsResult.data ?? []) as PlatformOrganization[],
    };
  }

  async organizationDetails(organizationId: string): Promise<PlatformOrganizationDetails> {
    const [organizationResult, branchesResult, membershipsResult] = await Promise.all([
      this.client.from("platform_organization_summary").select("*").eq("id", organizationId).maybeSingle(),
      this.client.from("branches").select("id, name, timezone, status, created_at").eq("organization_id", organizationId).order("created_at"),
      this.client.from("memberships").select("id, user_id, branch_id, role, status, created_at").eq("organization_id", organizationId).order("created_at"),
    ]);
    if (organizationResult.error || branchesResult.error || membershipsResult.error) {
      throw new ApplicationError(503, "DATABASE_ERROR", "تعذر تحميل تفاصيل المؤسسة");
    }
    if (!organizationResult.data) {
      throw new ApplicationError(404, "ORGANIZATION_NOT_FOUND", "المؤسسة غير موجودة");
    }

    const members = await Promise.all((membershipsResult.data ?? []).map(async (membership) => {
      const userResult = await this.client.auth.admin.getUserById(membership.user_id);
      const authUser = userResult.error ? null : userResult.data.user;
      return {
        ...membership,
        email: authUser?.email ?? null,
        email_confirmed: Boolean(authUser?.email_confirmed_at),
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
      } as PlatformMember;
    }));

    return {
      organization: organizationResult.data as PlatformOrganization,
      branches: (branchesResult.data ?? []) as PlatformBranch[],
      members,
    };
  }

  async createOrganization(userId: string, input: CreatePlatformOrganizationInput) {
    let invitedUserId: string | null = null;
    if (input.ownerEmail) {
      const inviteResult = await this.client.auth.admin.inviteUserByEmail(input.ownerEmail, {
        data: { organization_name: input.name },
        redirectTo: this.inviteRedirectUrl,
      });
      if (inviteResult.error || !inviteResult.data.user) {
        const isExistingUser = inviteResult.error?.message.toLowerCase().includes("already");
        throw new ApplicationError(
          isExistingUser ? 409 : 503,
          isExistingUser ? "OWNER_EMAIL_EXISTS" : "OWNER_INVITE_FAILED",
          isExistingUser
            ? "البريد الإلكتروني مرتبط بحساب موجود؛ استخدم بريدًا جديدًا للدعوة"
            : "تعذر إرسال دعوة مالك المؤسسة؛ يمكنك إنشاء المؤسسة دون بريد وإضافة المالك لاحقًا",
        );
      }
      invitedUserId = inviteResult.data.user.id;
    }

    const limits = subscriptionLimits(input.plan);
    const result = await this.client.rpc("platform_create_organization", {
      p_actor_user_id: userId,
      p_owner_user_id: invitedUserId,
      p_name: input.name,
      p_slug: input.slug,
      p_contact_email: input.ownerEmail || null,
      p_branch_name: input.branchName,
      p_timezone: input.timezone,
      p_plan: input.plan,
      p_branch_limit: limits.branchLimit,
      p_device_limit: limits.deviceLimit,
      p_trial_days: 14,
    });

    if (result.error || typeof result.data !== "string") {
      if (invitedUserId) await this.client.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
      const duplicateSlug = result.error?.code === "23505";
      throw new ApplicationError(
        duplicateSlug ? 409 : 503,
        duplicateSlug ? "ORGANIZATION_SLUG_EXISTS" : "DATABASE_ERROR",
        duplicateSlug ? "المعرّف المختصر مستخدم من مؤسسة أخرى" : "تعذر إنشاء المؤسسة",
      );
    }

    return { organizationId: result.data, ownerInvited: Boolean(invitedUserId) };
  }

  async createBranch(userId: string, organizationId: string, input: { name: string; timezone: string }) {
    const result = await this.client.rpc("platform_create_branch", {
      p_actor_user_id: userId,
      p_organization_id: organizationId,
      p_name: input.name,
      p_timezone: input.timezone,
    });
    if (result.error || typeof result.data !== "string") {
      const limitReached = result.error?.message.includes("BRANCH_LIMIT_REACHED");
      const missing = result.error?.message.includes("ORGANIZATION_NOT_FOUND");
      throw new ApplicationError(
        limitReached ? 409 : missing ? 404 : 503,
        limitReached ? "BRANCH_LIMIT_REACHED" : missing ? "ORGANIZATION_NOT_FOUND" : "DATABASE_ERROR",
        limitReached ? "وصلت المؤسسة إلى الحد الأقصى للفروع في خطتها" : missing ? "المؤسسة غير موجودة" : "تعذر إنشاء الفرع",
      );
    }
    return { branchId: result.data };
  }

  async inviteMember(userId: string, organizationId: string, input: InvitePlatformMemberInput) {
    const organizationResult = await this.client
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();
    if (organizationResult.error) throw new ApplicationError(503, "DATABASE_ERROR", "تعذر التحقق من المؤسسة");
    if (!organizationResult.data) throw new ApplicationError(404, "ORGANIZATION_NOT_FOUND", "المؤسسة غير موجودة");

    const inviteResult = await this.client.auth.admin.inviteUserByEmail(input.email, {
      data: { organization_name: organizationResult.data.name },
      redirectTo: this.inviteRedirectUrl,
    });
    if (inviteResult.error || !inviteResult.data.user) {
      const existing = inviteResult.error?.message.toLowerCase().includes("already");
      throw new ApplicationError(
        existing ? 409 : 503,
        existing ? "MEMBER_EMAIL_EXISTS" : "MEMBER_INVITE_FAILED",
        existing
          ? "البريد مرتبط بحساب موجود ولا يمكن دعوته مرة أخرى من هذه الشاشة"
          : "تعذر إرسال الدعوة؛ تحقق من إعدادات SMTP وعنوان البريد",
      );
    }

    const result = await this.client.rpc("platform_add_membership", {
      p_actor_user_id: userId,
      p_user_id: inviteResult.data.user.id,
      p_organization_id: organizationId,
      p_branch_id: input.branchId,
      p_role: input.role,
    });
    if (result.error || typeof result.data !== "string") {
      await this.client.auth.admin.deleteUser(inviteResult.data.user.id).catch(() => undefined);
      throw new ApplicationError(503, "DATABASE_ERROR", "تعذر ربط المستخدم بالمؤسسة");
    }
    return { membershipId: result.data };
  }

  async acceptInvitation(userId: string) {
    const userResult = await this.client.auth.admin.getUserById(userId);
    if (userResult.error || !userResult.data.user) {
      throw new ApplicationError(401, "INVALID_INVITATION_SESSION", "جلسة الدعوة غير صالحة");
    }
    if (!userResult.data.user.email_confirmed_at) {
      throw new ApplicationError(403, "EMAIL_NOT_CONFIRMED", "يجب تأكيد البريد الإلكتروني من رابط الدعوة أولًا");
    }

    const result = await this.client
      .from("memberships")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "invited")
      .select("id");
    if (result.error) {
      throw new ApplicationError(503, "DATABASE_ERROR", "تم تعيين كلمة المرور لكن تعذر تفعيل العضوية");
    }
    const activatedMemberships = result.data?.length ?? 0;
    if (activatedMemberships === 0) {
      throw new ApplicationError(409, "INVITATION_NOT_FOUND", "لا توجد دعوة معلّقة لهذا الحساب");
    }
    return { activatedMemberships };
  }

  async getPendingInvitation(userId: string): Promise<PendingInvitation> {
    const membershipResult = await this.client
      .from("memberships")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("status", "invited")
      .limit(1)
      .maybeSingle();
    if (membershipResult.error) {
      throw new ApplicationError(503, "DATABASE_ERROR", "تعذر التحقق من الدعوة");
    }
    if (!membershipResult.data) {
      throw new ApplicationError(404, "INVITATION_NOT_FOUND", "لا توجد دعوة معلّقة لهذا الحساب");
    }

    const organizationResult = await this.client
      .from("organizations")
      .select("name")
      .eq("id", membershipResult.data.organization_id)
      .maybeSingle();
    if (organizationResult.error || !organizationResult.data) {
      throw new ApplicationError(503, "DATABASE_ERROR", "تعذر تحميل المؤسسة المرتبطة بالدعوة");
    }
    return {
      organizationName: organizationResult.data.name,
      role: membershipResult.data.role as PlatformMember["role"],
    };
  }

  async updateOrganizationStatus(userId: string, organizationId: string, status: PlatformOrganization["status"]) {
    const result = await this.client
      .from("organizations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", organizationId)
      .select("id")
      .maybeSingle();
    if (result.error) throw new ApplicationError(503, "DATABASE_ERROR", "تعذر تحديث حالة المؤسسة");
    if (!result.data) throw new ApplicationError(404, "ORGANIZATION_NOT_FOUND", "المؤسسة غير موجودة");
    await this.audit(userId, "platform.organization.status_updated", "organization", organizationId, { status });
  }

  async updateSubscription(
    userId: string,
    organizationId: string,
    input: { plan: PlatformOrganization["subscription_plan"]; status: PlatformOrganization["subscription_status"] },
  ) {
    const limits = subscriptionLimits(input.plan);
    const result = await this.client.from("subscriptions").upsert({
      organization_id: organizationId,
      plan: input.plan,
      status: input.status,
      branch_limit: limits.branchLimit,
      device_limit: limits.deviceLimit,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id" });
    if (result.error) throw new ApplicationError(503, "DATABASE_ERROR", "تعذر تحديث الاشتراك");
    await this.audit(userId, "platform.subscription.updated", "subscription", organizationId, input);
  }

  private async audit(userId: string, action: string, entityType: string, entityId: string, metadata: object) {
    const result = await this.client.from("audit_logs").insert({
      actor_user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
    if (result.error) throw new ApplicationError(503, "AUDIT_ERROR", "تم التحديث لكن تعذر تسجيله في سجل التدقيق");
  }
}

function subscriptionLimits(plan: PlatformOrganization["subscription_plan"]) {
  switch (plan) {
    case "starter": return { branchLimit: 2, deviceLimit: 5 };
    case "growth": return { branchLimit: 10, deviceLimit: 30 };
    case "enterprise": return { branchLimit: 100, deviceLimit: 500 };
    default: return { branchLimit: 1, deviceLimit: 2 };
  }
}

const organizationStatusSchema = z.object({
  status: z.enum(["trial", "active", "suspended", "closed"]),
});
const subscriptionSchema = z.object({
  plan: z.enum(["trial", "starter", "growth", "enterprise"]),
  status: z.enum(["trialing", "active", "past_due", "canceled"]),
});
const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  ownerEmail: z.union([z.email().trim().toLowerCase(), z.literal("")]).optional()
    .transform((value) => value || undefined),
  branchName: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).max(64),
  plan: z.enum(["trial", "starter", "growth", "enterprise"]),
});
const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).max(64),
});
const inviteMemberSchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(["organization_owner", "branch_manager", "worker"]),
  branchId: z.uuid().nullable().default(null),
}).superRefine((value, context) => {
  const requiresBranch = value.role !== "organization_owner";
  if (requiresBranch !== Boolean(value.branchId)) {
    context.addIssue({ code: "custom", path: ["branchId"], message: "نطاق الفرع غير متوافق مع الدور" });
  }
});
const idSchema = z.uuid();

function requirePlatformAdmin(service: PlatformAdminService): RequestHandler {
  return async (_request, response, next) => {
    try {
      const userId = response.locals.userId as string | undefined;
      if (!userId || !(await service.isPlatformAdmin(userId))) {
        response.status(403).json({ error: { code: "FORBIDDEN", message: "هذه الصفحة مخصصة لإدارة المنصة" } });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createPlatformAdminRouter(service: PlatformAdminService, requireUser: RequestHandler) {
  const router = Router();
  router.get("/invitations/current", requireUser, async (_request, response, next) => {
    try {
      const invitation = await service.getPendingInvitation(response.locals.userId as string);
      response.json({ data: { organization_name: invitation.organizationName, role: invitation.role } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/invitations/accept", requireUser, async (_request, response, next) => {
    try {
      const result = await service.acceptInvitation(response.locals.userId as string);
      response.json({ data: { activated_memberships: result.activatedMemberships } });
    } catch (error) {
      next(error);
    }
  });

  router.use(requireUser, requirePlatformAdmin(service));

  router.get("/overview", async (_request, response, next) => {
    try {
      response.json({ data: await service.overview() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/organizations", async (request, response, next) => {
    try {
      const input = createOrganizationSchema.parse(request.body);
      const result = await service.createOrganization(response.locals.userId as string, input);
      response.status(201).json({ data: { organization_id: result.organizationId, owner_invited: result.ownerInvited } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/organizations/:organizationId", async (request, response, next) => {
    try {
      const organizationId = idSchema.parse(request.params.organizationId);
      response.json({ data: await service.organizationDetails(organizationId) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/organizations/:organizationId/branches", async (request, response, next) => {
    try {
      const organizationId = idSchema.parse(request.params.organizationId);
      const input = createBranchSchema.parse(request.body);
      const result = await service.createBranch(response.locals.userId as string, organizationId, input);
      response.status(201).json({ data: { branch_id: result.branchId } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/organizations/:organizationId/members/invite", async (request, response, next) => {
    try {
      const organizationId = idSchema.parse(request.params.organizationId);
      const input = inviteMemberSchema.parse(request.body);
      const result = await service.inviteMember(response.locals.userId as string, organizationId, input);
      response.status(201).json({ data: { membership_id: result.membershipId, invited: true } });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/organizations/:organizationId/status", async (request, response, next) => {
    try {
      const organizationId = idSchema.parse(request.params.organizationId);
      const { status } = organizationStatusSchema.parse(request.body);
      await service.updateOrganizationStatus(response.locals.userId as string, organizationId, status);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.patch("/subscriptions/:organizationId", async (request, response, next) => {
    try {
      const organizationId = idSchema.parse(request.params.organizationId);
      const input = subscriptionSchema.parse(request.body);
      await service.updateSubscription(response.locals.userId as string, organizationId, input);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
