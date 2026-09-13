import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requireDeviceToken, requireSupabaseUser } from "../src/auth.js";

describe("Supabase authentication middleware", () => {
  it("rejects a missing user access token", async () => {
    const authClient = { auth: { getClaims: vi.fn() } };
    const app = express().get("/private", requireSupabaseUser(authClient as never), (_request, response) => response.sendStatus(204));

    const response = await request(app).get("/private");
    expect(response.status).toBe(401);
    expect(authClient.auth.getClaims).not.toHaveBeenCalled();
  });

  it("accepts a verified Supabase JWT and forwards its access token", async () => {
    const authClient = {
      auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null }) },
    };
    const app = express().get("/private", requireSupabaseUser(authClient as never), (_request, response) => {
      response.json({ userId: response.locals.userId, accessToken: response.locals.accessToken });
    });

    const response = await request(app).get("/private").set("Authorization", "Bearer access-token");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: "user-1", accessToken: "access-token" });
  });

  it("requires the dedicated Device authorization scheme for kiosk writes", async () => {
    const app = express().post("/ingest", requireDeviceToken, (_request, response) => {
      response.json({ token: response.locals.deviceToken });
    });

    expect((await request(app).post("/ingest")).status).toBe(401);
    const accepted = await request(app).post("/ingest").set("Authorization", "Device device-id.secret");
    expect(accepted.body).toEqual({ token: "device-id.secret" });
  });
});
