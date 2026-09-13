import cors from "cors";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { createWasteRouter } from "./waste.js";
import { createPlatformAdminRouter, type PlatformAdminService } from "./platform-admin.js";
import { ApplicationError, type WasteStore } from "./waste-store.js";

type AppOptions = {
  corsOrigins: string[];
  requireUser: RequestHandler;
  requireDevice: RequestHandler;
  platformAdminService?: PlatformAdminService;
};

export function createApp(store: WasteStore, options: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || options.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed"));
      },
    }),
  );
  app.use(express.json({ limit: "32kb" }));

  app.get("/health/live", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.get("/health/ready", async (_request, response, next) => {
    try {
      await store.ready();
      response.json({ status: "ready" });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/v1", createWasteRouter(store, options));
  if (options.platformAdminService) {
    app.use("/api/v1/platform", createPlatformAdminRouter(options.platformAdminService, options.requireUser));
  }
  app.use((_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "المسار غير موجود" } });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "بيانات الطلب غير صالحة",
          fields: error.flatten().fieldErrors,
        },
      });
      return;
    }

    if (error instanceof ApplicationError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }

    console.error(error);
    response.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "حدث خطأ داخلي" },
    });
  };
  app.use(errorHandler);
  return app;
}
