import type { RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

function unauthorized(message: string) {
  return { error: { code: "UNAUTHORIZED", message } };
}

export const allowLocalRequests: RequestHandler = (_request, _response, next) => next();

export function requireSupabaseUser(authClient: SupabaseClient): RequestHandler {
  return async (request, response, next) => {
    const authorization = request.header("authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {
      response.status(401).json(unauthorized("يلزم تسجيل الدخول"));
      return;
    }

    try {
      const { data, error } = await authClient.auth.getClaims(accessToken);
      if (error || typeof data?.claims?.sub !== "string") {
        response.status(401).json(unauthorized("جلسة المستخدم غير صالحة"));
        return;
      }
      response.locals.accessToken = accessToken;
      response.locals.userId = data.claims.sub;
      next();
    } catch {
      response.status(401).json(unauthorized("تعذر التحقق من الجلسة"));
    }
  };
}

export const requireDeviceToken: RequestHandler = (request, response, next) => {
  const authorization = request.header("authorization");
  const deviceToken = authorization?.match(/^Device\s+(.+)$/i)?.[1];
  if (!deviceToken) {
    response.status(401).json(unauthorized("بيانات اعتماد الجهاز مطلوبة"));
    return;
  }
  response.locals.deviceToken = deviceToken;
  next();
};
