import { isSupabaseAuthEnabled, supabase } from "./supabase";

export type TenantRole = "organization_owner" | "branch_manager" | "worker";
export type WorkspaceRole = TenantRole | "platform_super_admin";

export type Branch = {
  id: string;
  name: string;
  timezone: string;
  status: "active" | "inactive";
};

export type Device = {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  status: "pending" | "active" | "disabled";
  last_seen_at: string | null;
};

export type CatalogItem = {
  id: string;
  branch_id: string;
  name: string;
  is_active: boolean;
  color?: string;
};

export type ThresholdRule = {
  id: string;
  branch_id: string;
  category_id: string | null;
  period: "day" | "week" | "month";
  limit_grams: number;
  cooldown_minutes: number;
  is_active: boolean;
  current_grams: number;
};

export type WorkspaceData = {
  organization: { id: string; name: string; status: string };
  role: WorkspaceRole;
  assignedBranchId: string | null;
  branches: Branch[];
  devices: Device[];
  categories: CatalogItem[];
  reasons: CatalogItem[];
  thresholds: ThresholdRule[];
};

const previewWorkspace: WorkspaceData = {
  organization: { id: "preview", name: "بيئة العرض", status: "active" },
  role: "organization_owner",
  assignedBranchId: null,
  branches: [],
  devices: [],
  categories: [],
  reasons: [],
  thresholds: [],
};

export const platformWorkspace: WorkspaceData = {
  organization: { id: "platform", name: "إدارة المنصة", status: "active" },
  role: "platform_super_admin",
  assignedBranchId: null,
  branches: [],
  devices: [],
  categories: [],
  reasons: [],
  thresholds: [],
};

export async function getWorkspaceData(): Promise<WorkspaceData> {
  if (!isSupabaseAuthEnabled || !supabase) return previewWorkspace;

  const membershipResult = await supabase
    .from("memberships")
    .select("organization_id, branch_id, role")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipResult.error) throw membershipResult.error;
  if (!membershipResult.data) {
    throw new Error("لا توجد عضوية نشطة مرتبطة بهذا الحساب");
  }

  const membership = membershipResult.data as {
    organization_id: string;
    branch_id: string | null;
    role: TenantRole;
  };

  const [organizationResult, branchesResult, devicesResult, categoriesResult, reasonsResult, thresholdsResult] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, status")
        .eq("id", membership.organization_id)
        .single(),
      supabase
        .from("branches")
        .select("id, name, timezone, status")
        .eq("organization_id", membership.organization_id)
        .order("name"),
      supabase
        .from("devices")
        .select("id, branch_id, code, name, status, last_seen_at")
        .eq("organization_id", membership.organization_id)
        .order("name"),
      supabase
        .from("categories")
        .select("id, branch_id, name, color, is_active")
        .eq("organization_id", membership.organization_id)
        .order("name"),
      supabase
        .from("waste_reasons")
        .select("id, branch_id, name, is_active")
        .eq("organization_id", membership.organization_id)
        .order("name"),
      supabase.rpc("get_threshold_statuses"),
    ]);

  const firstError = [
    organizationResult.error,
    branchesResult.error,
    devicesResult.error,
    categoriesResult.error,
    reasonsResult.error,
    thresholdsResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  return {
    organization: organizationResult.data as WorkspaceData["organization"],
    role: membership.role,
    assignedBranchId: membership.branch_id,
    branches: (branchesResult.data ?? []) as Branch[],
    devices: (devicesResult.data ?? []) as Device[],
    categories: (categoriesResult.data ?? []) as CatalogItem[],
    reasons: (reasonsResult.data ?? []) as CatalogItem[],
    thresholds: (thresholdsResult.data ?? []) as ThresholdRule[],
  };
}

function requireSupabaseClient() {
  if (!supabase) throw new Error("إدارة القوائم متاحة بعد تسجيل الدخول فقط");
  return supabase;
}

export async function createCategory(
  workspace: WorkspaceData,
  input: { branchId: string; name: string; color: string },
) {
  const branch = workspace.branches.find((item) => item.id === input.branchId && item.status === "active");
  if (!branch) throw new Error("اختر فرعًا نشطًا");

  const name = input.name.trim();
  if (!name || name.length > 100) throw new Error("اسم الصنف يجب أن يكون بين 1 و100 حرف");

  const { error } = await requireSupabaseClient().from("categories").insert({
    organization_id: workspace.organization.id,
    branch_id: branch.id,
    name,
    color: input.color,
  });
  if (error?.code === "23505") throw new Error("هذا الصنف موجود بالفعل في الفرع");
  if (error) throw new Error("تعذر إضافة الصنف");
}

export async function setCategoryActive(workspace: WorkspaceData, categoryId: string, isActive: boolean) {
  const category = workspace.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error("الصنف غير موجود");

  const { error } = await requireSupabaseClient()
    .from("categories")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", category.id)
    .eq("organization_id", workspace.organization.id);
  if (error) throw new Error("تعذر تحديث حالة الصنف");
}

export async function createWasteReason(
  workspace: WorkspaceData,
  input: { branchId: string; name: string },
) {
  const branch = workspace.branches.find((item) => item.id === input.branchId && item.status === "active");
  if (!branch) throw new Error("اختر فرعًا نشطًا");

  const name = input.name.trim();
  if (!name || name.length > 100) throw new Error("اسم السبب يجب أن يكون بين 1 و100 حرف");

  const { error } = await requireSupabaseClient().from("waste_reasons").insert({
    organization_id: workspace.organization.id,
    branch_id: branch.id,
    name,
  });
  if (error?.code === "23505") throw new Error("هذا السبب موجود بالفعل في الفرع");
  if (error) throw new Error("تعذر إضافة سبب الهدر");
}

export async function setWasteReasonActive(workspace: WorkspaceData, reasonId: string, isActive: boolean) {
  const reason = workspace.reasons.find((item) => item.id === reasonId);
  if (!reason) throw new Error("سبب الهدر غير موجود");

  const { error } = await requireSupabaseClient()
    .from("waste_reasons")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", reason.id)
    .eq("organization_id", workspace.organization.id);
  if (error) throw new Error("تعذر تحديث حالة سبب الهدر");
}

export type ThresholdRuleInput = {
  branchId: string;
  categoryId: string | null;
  period: ThresholdRule["period"];
  limitKg: number;
  cooldownMinutes: number;
};

function validateThresholdInput(workspace: WorkspaceData, input: ThresholdRuleInput) {
  const branch = workspace.branches.find((item) => item.id === input.branchId && item.status === "active");
  if (!branch) throw new Error("اختر فرعًا نشطًا");

  if (input.categoryId) {
    const category = workspace.categories.find(
      (item) => item.id === input.categoryId && item.branch_id === branch.id && item.is_active,
    );
    if (!category) throw new Error("اختر صنفًا نشطًا من الفرع");
  }

  const limitGrams = Math.round(input.limitKg * 1_000);
  if (!Number.isFinite(limitGrams) || limitGrams < 1 || limitGrams > 1_000_000_000) {
    throw new Error("حد الهدر يجب أن يكون أكبر من صفر");
  }
  if (!Number.isInteger(input.cooldownMinutes) || input.cooldownMinutes < 5 || input.cooldownMinutes > 10_080) {
    throw new Error("مهلة تكرار التنبيه يجب أن تكون بين 5 دقائق و7 أيام");
  }

  return { branch, limitGrams };
}

export async function createThresholdRule(workspace: WorkspaceData, input: ThresholdRuleInput) {
  const { branch, limitGrams } = validateThresholdInput(workspace, input);
  const { error } = await requireSupabaseClient().from("threshold_rules").insert({
    organization_id: workspace.organization.id,
    branch_id: branch.id,
    category_id: input.categoryId,
    period: input.period,
    limit_grams: limitGrams,
    cooldown_minutes: input.cooldownMinutes,
  });
  if (error?.code === "23505") throw new Error("توجد قاعدة لنفس النطاق والفترة بالفعل");
  if (error) throw new Error("تعذر إضافة حد التنبيه");
}

export async function updateThresholdRule(
  workspace: WorkspaceData,
  ruleId: string,
  input: ThresholdRuleInput,
) {
  const rule = workspace.thresholds.find((item) => item.id === ruleId);
  if (!rule) throw new Error("قاعدة التنبيه غير موجودة");
  if (rule.branch_id !== input.branchId) throw new Error("لا يمكن نقل القاعدة إلى فرع آخر");

  const { limitGrams } = validateThresholdInput(workspace, input);
  const { error } = await requireSupabaseClient()
    .from("threshold_rules")
    .update({
      category_id: input.categoryId,
      period: input.period,
      limit_grams: limitGrams,
      cooldown_minutes: input.cooldownMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rule.id)
    .eq("organization_id", workspace.organization.id);
  if (error?.code === "23505") throw new Error("توجد قاعدة لنفس النطاق والفترة بالفعل");
  if (error) throw new Error("تعذر تحديث حد التنبيه");
}

export async function setThresholdRuleActive(workspace: WorkspaceData, ruleId: string, isActive: boolean) {
  const rule = workspace.thresholds.find((item) => item.id === ruleId);
  if (!rule) throw new Error("قاعدة التنبيه غير موجودة");

  const { error } = await requireSupabaseClient()
    .from("threshold_rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", rule.id)
    .eq("organization_id", workspace.organization.id);
  if (error) throw new Error("تعذر تحديث حالة حد التنبيه");
}
