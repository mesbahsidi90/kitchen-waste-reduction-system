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
      supabase
        .from("threshold_rules")
        .select("id, branch_id, category_id, period, limit_grams, cooldown_minutes, is_active")
        .eq("organization_id", membership.organization_id)
        .order("created_at", { ascending: false }),
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
  if (!supabase) throw new Error("إدارة الأصناف متاحة بعد تسجيل الدخول فقط");
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
