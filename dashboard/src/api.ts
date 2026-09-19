import axios from "axios";

export type WasteLog = {
  id: string | number;
  scale_id: string;
  weight_kg: number;
  category: string;
  reason: string;
  created_at: string;
};

export type AnalyticsSummary = {
  total_weight_kg: number;
  total_count: number;
  categories: Array<{ category: string; weight_kg: number; count: number }>;
};

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

export type PlatformDemoRequest = {
  id: string;
  restaurant_name: string;
  contact_name: string;
  phone: string;
  email: string | null;
  city: string;
  branch_count: number;
  preferred_language: "ar" | "fr" | "en";
  message: string | null;
  status: "new" | "contacted" | "qualified" | "closed";
  created_at: string;
};

export type PlatformOverview = {
  metrics: {
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
  organizations: PlatformOrganization[];
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1",
  timeout: 10_000,
});

export async function getDashboardData(accessToken?: string) {
  const requestConfig = accessToken
    ? { headers: { Authorization: `Bearer ${accessToken}` } }
    : undefined;
  const [logsResponse, summaryResponse] = await Promise.all([
    api.get<{ data: WasteLog[] }>("/waste-logs", {
      ...requestConfig,
      params: { limit: 100 },
    }),
    api.get<{ data: AnalyticsSummary }>("/analytics/summary", requestConfig),
  ]);
  return { logs: logsResponse.data.data, summary: summaryResponse.data.data };
}

function authorization(accessToken: string) {
  return { headers: { Authorization: `Bearer ${accessToken}` } };
}

export async function getPlatformOverview(accessToken: string) {
  const response = await api.get<{ data: PlatformOverview }>("/platform/overview", authorization(accessToken));
  return response.data.data;
}

export async function getPlatformDemoRequests(
  accessToken: string,
  status?: PlatformDemoRequest["status"],
) {
  const response = await api.get<{ data: PlatformDemoRequest[] }>(
    "/platform/demo-requests",
    { ...authorization(accessToken), params: status ? { status } : undefined },
  );
  return response.data.data;
}

export async function updatePlatformDemoRequestStatus(
  accessToken: string,
  requestId: string,
  status: PlatformDemoRequest["status"],
) {
  await api.patch(
    `/platform/demo-requests/${requestId}/status`,
    { status },
    authorization(accessToken),
  );
}

export async function createPlatformOrganization(
  accessToken: string,
  input: CreatePlatformOrganizationInput,
) {
  const response = await api.post<{ data: { organization_id: string; owner_invited: boolean } }>(
    "/platform/organizations",
    input,
    authorization(accessToken),
  );
  return response.data.data;
}

export async function getPlatformOrganization(accessToken: string, organizationId: string) {
  const response = await api.get<{ data: PlatformOrganizationDetails }>(
    `/platform/organizations/${organizationId}`,
    authorization(accessToken),
  );
  return response.data.data;
}

export async function createPlatformBranch(
  accessToken: string,
  organizationId: string,
  input: { name: string; timezone: string },
) {
  const response = await api.post<{ data: { branch_id: string } }>(
    `/platform/organizations/${organizationId}/branches`,
    input,
    authorization(accessToken),
  );
  return response.data.data;
}

export async function invitePlatformMember(
  accessToken: string,
  organizationId: string,
  input: { email: string; role: PlatformMember["role"]; branchId: string | null },
) {
  const response = await api.post<{ data: { membership_id: string; invited: boolean } }>(
    `/platform/organizations/${organizationId}/members/invite`,
    input,
    authorization(accessToken),
  );
  return response.data.data;
}

export async function acceptInvitation(accessToken: string) {
  const response = await api.post<{ data: { activated_memberships: number } }>(
    "/platform/invitations/accept",
    undefined,
    authorization(accessToken),
  );
  return response.data.data;
}

export type DevicePairing = {
  device_id: string;
  device_code: string;
  pairing_code: string;
  expires_at: string;
};

export async function createTenantDevice(
  accessToken: string,
  input: { branchId: string; name: string },
) {
  const response = await api.post<{ data: DevicePairing }>(
    "/devices",
    input,
    authorization(accessToken),
  );
  return response.data.data;
}

export async function disableTenantDevice(accessToken: string, deviceId: string) {
  await api.patch(`/devices/${deviceId}/disable`, undefined, authorization(accessToken));
}

export async function getPendingInvitation(accessToken: string) {
  const response = await api.get<{ data: { organization_name: string; role: PlatformMember["role"] } }>(
    "/platform/invitations/current",
    authorization(accessToken),
  );
  return response.data.data;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
  return message ?? fallback;
}

export function isForbidden(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

export async function updateOrganizationStatus(
  accessToken: string,
  organizationId: string,
  status: PlatformOrganization["status"],
) {
  await api.patch(`/platform/organizations/${organizationId}/status`, { status }, authorization(accessToken));
}

export async function updateSubscription(
  accessToken: string,
  organizationId: string,
  input: Pick<PlatformOrganization, "subscription_plan" | "subscription_status">,
) {
  await api.patch(`/platform/subscriptions/${organizationId}`, {
    plan: input.subscription_plan,
    status: input.subscription_status,
  }, authorization(accessToken));
}
