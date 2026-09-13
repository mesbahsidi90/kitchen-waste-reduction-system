import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

function argument(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (!value) throw new Error(`Missing required argument --${name}`);
  return value;
}

async function bootstrap() {
  if (!config.supabase) throw new Error("Set DATA_PROVIDER=supabase and the Supabase environment variables first");
  const userId = argument("user-id");
  const organizationName = argument("organization-name");
  const organizationSlug = argument("organization-slug");
  const branchName = argument("branch-name");
  const deviceCode = argument("device-code", "SCALE_01");
  const client = createClient(config.supabase.url, config.supabase.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const organizationResult = await client
    .from("organizations")
    .insert({ name: organizationName, slug: organizationSlug, status: "active" })
    .select("id")
    .single();
  if (organizationResult.error) throw organizationResult.error;

  const branchResult = await client
    .from("branches")
    .insert({ organization_id: organizationResult.data.id, name: branchName })
    .select("id")
    .single();
  if (branchResult.error) throw branchResult.error;

  const membershipResult = await client.from("memberships").insert({
    user_id: userId,
    organization_id: organizationResult.data.id,
    branch_id: null,
    role: "organization_owner",
    status: "active",
  });
  if (membershipResult.error) throw membershipResult.error;

  const categories = [
    { name: "خضروات وفواكه", color: "#2e7d32" },
    { name: "لحوم ودواجن", color: "#c62828" },
    { name: "مخبوزات", color: "#f57c00" },
    { name: "وجبات مطبوخة", color: "#1565c0" },
  ].map((item) => ({
    ...item,
    organization_id: organizationResult.data.id,
    branch_id: branchResult.data.id,
  }));
  const reasons = [
    "تالف / منتهي الصلاحية",
    "بقايا تحضير (Trim)",
    "بقايا صحون الزبائن",
    "خطأ طهي",
  ].map((name) => ({
    name,
    organization_id: organizationResult.data.id,
    branch_id: branchResult.data.id,
  }));
  const [categoryResult, reasonResult] = await Promise.all([
    client.from("categories").insert(categories),
    client.from("waste_reasons").insert(reasons),
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (reasonResult.error) throw reasonResult.error;

  const secret = randomBytes(32).toString("base64url");
  const deviceResult = await client
    .from("devices")
    .insert({
      organization_id: organizationResult.data.id,
      branch_id: branchResult.data.id,
      code: deviceCode,
      name: deviceCode,
      api_key_hash: createHash("sha256").update(secret).digest("hex"),
      status: "active",
    })
    .select("id")
    .single();
  if (deviceResult.error) throw deviceResult.error;

  console.log("Supabase tenant created successfully.");
  console.log(`Organization ID: ${organizationResult.data.id}`);
  console.log(`Branch ID: ${branchResult.data.id}`);
  console.log(`Device token (shown once): ${deviceResult.data.id}.${secret}`);
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
