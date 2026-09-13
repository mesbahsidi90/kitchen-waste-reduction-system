import { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { DeviceProvisioningService } from "../src/device-provisioning.js";
import type { WasteStore } from "../src/waste-store.js";

const userId = "00000000-0000-4000-8000-000000000001";
const branchId = "00000000-0000-4000-8000-000000000002";
const deviceId = "00000000-0000-4000-8000-000000000003";
const authenticatedUser: RequestHandler = (_request, response, next) => {
  response.locals.userId = userId;
  next();
};

function fakeService(): DeviceProvisioningService {
  return {
    createDevice: vi.fn().mockResolvedValue({
      deviceId,
      deviceCode: "KIOSK_ABC123",
      pairingCode: "ABCD-EFGH",
      expiresAt: "2026-09-13T21:00:00.000Z",
    }),
    claimDevice: vi.fn().mockResolvedValue({
      deviceToken: `${deviceId}.secret`,
      deviceCode: "KIOSK_ABC123",
      deviceName: "كيوسك التحضير",
    }),
    disableDevice: vi.fn().mockResolvedValue(undefined),
  };
}

function testApp(service: DeviceProvisioningService) {
  const store = {
    create: vi.fn(), list: vi.fn(), summary: vi.fn(), catalog: vi.fn(), ready: vi.fn(), close: vi.fn(),
  } as unknown as WasteStore;
  return createApp(store, {
    corsOrigins: ["http://localhost:5173"],
    requireUser: authenticatedUser,
    requireDevice: authenticatedUser,
    deviceProvisioningService: service,
  });
}

describe("device provisioning API", () => {
  it("creates a branch-bound device for the authenticated manager", async () => {
    const service = fakeService();
    const response = await request(testApp(service))
      .post("/api/v1/devices")
      .send({ branchId, name: "كيوسك التحضير" });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ pairing_code: "ABCD-EFGH", device_code: "KIOSK_ABC123" });
    expect(service.createDevice).toHaveBeenCalledWith(userId, { branchId, name: "كيوسك التحضير" });
  });

  it("rejects invalid device input before calling the service", async () => {
    const service = fakeService();
    const response = await request(testApp(service)).post("/api/v1/devices").send({ branchId: "invalid", name: "" });
    expect(response.status).toBe(400);
    expect(service.createDevice).not.toHaveBeenCalled();
  });

  it("allows a kiosk to claim a one-time code without a user session", async () => {
    const service = fakeService();
    const response = await request(testApp(service))
      .post("/api/v1/devices/claim")
      .send({ pairingCode: "ABCD-EFGH" });

    expect(response.status).toBe(200);
    expect(response.body.data.device_token).toBe(`${deviceId}.secret`);
    expect(service.claimDevice).toHaveBeenCalledWith("ABCD-EFGH");
  });

  it("disables only the requested device through the authenticated service", async () => {
    const service = fakeService();
    const response = await request(testApp(service)).patch(`/api/v1/devices/${deviceId}/disable`);
    expect(response.status).toBe(204);
    expect(service.disableDevice).toHaveBeenCalledWith(userId, deviceId);
  });
});
