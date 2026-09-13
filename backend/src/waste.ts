import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { RequestContext, WasteStore } from "./waste-store.js";

const createWasteLogSchema = z.object({
  client_event_id: z.uuid(),
  scale_id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  weight_kg: z.number().positive().max(1_000),
  category: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(100),
});

const listWasteLogsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type WasteRouterOptions = {
  requireUser: RequestHandler;
  requireDevice: RequestHandler;
};

function requestContext(response: Parameters<RequestHandler>[1]): RequestContext {
  return {
    accessToken: response.locals.accessToken as string | undefined,
    deviceToken: response.locals.deviceToken as string | undefined,
  };
}

export function createWasteRouter(store: WasteStore, options: WasteRouterOptions) {
  const router = Router();

  router.get("/catalog", options.requireDevice, async (_request, response, next) => {
    try {
      response.json({ data: await store.catalog(requestContext(response)) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/waste-logs", options.requireDevice, async (request, response, next) => {
    try {
      const input = createWasteLogSchema.parse(request.body);
      const result = await store.create(input, requestContext(response));
      if (result.replayed) response.setHeader("X-Idempotent-Replay", "true");
      response.status(result.replayed ? 200 : 201).json({ data: result.log });
    } catch (error) {
      next(error);
    }
  });

  router.get("/waste-logs", options.requireUser, async (request, response, next) => {
    try {
      const query = listWasteLogsSchema.parse(request.query);
      const result = await store.list(query, requestContext(response));
      response.json({
        data: result.logs,
        pagination: { ...query, total: result.total },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/analytics/summary", options.requireUser, async (_request, response, next) => {
    try {
      response.json({ data: await store.summary(requestContext(response)) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
