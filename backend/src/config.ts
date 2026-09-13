import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const backendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryDirectory = path.resolve(backendDirectory, "..");
dotenv.config({ path: path.join(repositoryDirectory, ".env") });

const environmentSchema = z.object({
  DATA_PROVIDER: z.enum(["sqlite", "supabase"]).default("sqlite"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5000),
  DATABASE_PATH: z.string().min(1).optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  AUTH_INVITE_REDIRECT_URL: z
    .url()
    .default("http://localhost:5173/accept-invite"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:5174"),
});

const environment = environmentSchema.parse(process.env);
if (
  environment.DATA_PROVIDER === "supabase" &&
  (!environment.SUPABASE_URL ||
    !environment.SUPABASE_PUBLISHABLE_KEY ||
    !environment.SUPABASE_SECRET_KEY)
) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required when DATA_PROVIDER=supabase",
  );
}

export const config = {
  dataProvider: environment.DATA_PROVIDER,
  port: environment.PORT,
  databasePath: environment.DATABASE_PATH
    ? path.resolve(repositoryDirectory, environment.DATABASE_PATH)
    : path.join(backendDirectory, "data", "database.sqlite"),
  corsOrigins: environment.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  authInviteRedirectUrl: environment.AUTH_INVITE_REDIRECT_URL,
  supabase:
    environment.DATA_PROVIDER === "supabase"
      ? {
          url: environment.SUPABASE_URL!,
          publishableKey: environment.SUPABASE_PUBLISHABLE_KEY!,
          secretKey: environment.SUPABASE_SECRET_KEY!,
        }
      : undefined,
};
