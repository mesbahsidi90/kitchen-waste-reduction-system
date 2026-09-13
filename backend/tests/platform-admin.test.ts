import { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { PlatformAdminService } from "../src/platform-admin.js";
import type { WasteStore } from "../src/waste-store.js";

const authenticatedUser: RequestHandler = (_request, response, next) => {
  response.locals.userId = "00000000-0000-4000-8000-000000000001";
  next();
};

function fakeService(overrides: Partial<PlatformAdminService> = {}): PlatformAdminService {
  return {
    isPlatformAdmin: vi.fn().mockResolvedValue(true),
    overview: vi.fn().mockResolvedValue({
      metrics: {
        organization_count: 1,
        branch_count: 2,
        device_count: 3,
        active_member_count: 4,
        waste_event_count: 5,
        waste_weight_grams: 6000,
        active_subscription_count: 1,
        trial_subscription_count: 0,
        past_due_subscription_count: 0,
      },
      organizations: [],
    }),
    organizationDetails: vi.fn().mockResolvedValue({
      organization: {
        id: "00000000-0000-4000-8000-000000000100",
        name: "مطاعم النور",
        slug: "al-noor",
        contact_email: null,
        status: "trial",
        created_at: "2026-09-13T00:00:00.000Z",
        branch_count: 1,
        device_count: 0,
        member_count: 0,
        waste_event_count: 0,
        waste_weight_grams: 0,
        subscription_plan: "trial",
        subscription_status: "trialing",
        branch_limit: 1,
        device_limit: 2,
        current_period_end: null,
      },
      branches: [],
      members: [],
    }),
    createOrganization: vi.fn().mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000100",
      ownerInvited: true,
    }),
    createBranch: vi.fn().mockResolvedValue({ branchId: "00000000-0000-4000-8000-000000000200" }),
    inviteMember: vi.fn().mockResolvedValue({ membershipId: "00000000-0000-4000-8000-000000000300" }),
    getPendingInvitation: vi.fn().mockResolvedValue({ organizationName: "مطاعم النور", role: "branch_manager" }),
    acceptInvitation: vi.fn().mockResolvedValue({ activatedMemberships: 1 }),
    updateOrganizationStatus: vi.fn().mockResolvedValue(undefined),
    updateSubscription: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function testApp(service: PlatformAdminService) {
  const store: WasteStore = {
    create: vi.fn(),
    list: vi.fn(),
    summary: vi.fn(),
    ready: vi.fn(),
    close: vi.fn(),
  } as unknown as WasteStore;
  return createApp(store, {
    corsOrigins: ["http://localhost:5173"],
    requireUser: authenticatedUser,
    requireDevice: authenticatedUser,
    platformAdminService: service,
  });
}

describe("platform administrator API", () => {
  it("rejects authenticated tenant users without a platform role", async () => {
    const service = fakeService({ isPlatformAdmin: vi.fn().mockResolvedValue(false) });
    const response = await request(testApp(service)).get("/api/v1/platform/overview");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("returns the global overview to a platform administrator", async () => {
    const response = await request(testApp(fakeService())).get("/api/v1/platform/overview");
    expect(response.status).toBe(200);
    expect(response.body.data.metrics).toMatchObject({ organization_count: 1, device_count: 3 });
  });

  it("allows an invited user to activate only their own authenticated membership", async () => {
    const service = fakeService({ isPlatformAdmin: vi.fn().mockResolvedValue(false) });
    const response = await request(testApp(service)).post("/api/v1/platform/invitations/accept");
    expect(response.status).toBe(200);
    expect(response.body.data.activated_memberships).toBe(1);
    expect(service.acceptInvitation).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(service.isPlatformAdmin).not.toHaveBeenCalled();
  });

  it("returns only the pending invitation of the authenticated user", async () => {
    const service = fakeService({ isPlatformAdmin: vi.fn().mockResolvedValue(false) });
    const response = await request(testApp(service)).get("/api/v1/platform/invitations/current");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ organization_name: "مطاعم النور", role: "branch_manager" });
    expect(service.getPendingInvitation).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    expect(service.isPlatformAdmin).not.toHaveBeenCalled();
  });

  it("validates organization ids before changing status", async () => {
    const service = fakeService();
    const response = await request(testApp(service))
      .patch("/api/v1/platform/organizations/not-a-uuid/status")
      .send({ status: "suspended" });
    expect(response.status).toBe(400);
    expect(service.updateOrganizationStatus).not.toHaveBeenCalled();
  });

  it("creates an organization shell with validated onboarding data", async () => {
    const service = fakeService();
    const response = await request(testApp(service))
      .post("/api/v1/platform/organizations")
      .send({
        name: "مطاعم النور",
        slug: "al-noor",
        ownerEmail: "owner@example.com",
        branchName: "الفرع الرئيسي",
        timezone: "Europe/Istanbul",
        plan: "growth",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ owner_invited: true });
    expect(service.createOrganization).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({ slug: "al-noor", plan: "growth" }),
    );
  });

  it("rejects invalid organization slugs before onboarding", async () => {
    const service = fakeService();
    const response = await request(testApp(service))
      .post("/api/v1/platform/organizations")
      .send({
        name: "مطاعم النور",
        slug: "معرف عربي",
        ownerEmail: "owner@example.com",
        branchName: "الفرع الرئيسي",
        timezone: "Europe/Istanbul",
        plan: "trial",
      });

    expect(response.status).toBe(400);
    expect(service.createOrganization).not.toHaveBeenCalled();
  });

  it("returns organization details", async () => {
    const service = fakeService();
    const response = await request(testApp(service))
      .get("/api/v1/platform/organizations/00000000-0000-4000-8000-000000000100");
    expect(response.status).toBe(200);
    expect(response.body.data.organization.slug).toBe("al-noor");
  });

  it("creates a branch with validated data", async () => {
    const service = fakeService();
    const response = await request(testApp(service))
      .post("/api/v1/platform/organizations/00000000-0000-4000-8000-000000000100/branches")
      .send({ name: "فرع المطار", timezone: "Asia/Riyadh" });
    expect(response.status).toBe(201);
    expect(service.createBranch).toHaveBeenCalled();
  });

  it("requires a branch for a branch manager invitation", async () => {
    const service = fakeService();
    const response = await request(testApp(service))
      .post("/api/v1/platform/organizations/00000000-0000-4000-8000-000000000100/members/invite")
      .send({ email: "manager@example.com", role: "branch_manager", branchId: null });
    expect(response.status).toBe(400);
    expect(service.inviteMember).not.toHaveBeenCalled();
  });
});
