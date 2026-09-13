import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { config } from "../config.js";

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument --${name}`);
  return value;
}

async function grantPlatformAdmin() {
  if (!config.supabase) throw new Error("Set DATA_PROVIDER=supabase and the Supabase environment variables first");
  const userId = z.uuid().parse(argument("user-id"));
  const client = createClient(config.supabase.url, config.supabase.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userResult = await client.auth.admin.getUserById(userId);
  if (userResult.error || !userResult.data.user) throw new Error("Supabase Auth user was not found");

  const result = await client.from("platform_admins").upsert({
    user_id: userId,
    status: "active",
  }, { onConflict: "user_id" });
  if (result.error) throw result.error;

  console.log(`Platform administrator enabled for ${userResult.data.user.email ?? userId}`);
}

grantPlatformAdmin().catch((error) => {
  console.error("Failed to grant platform administrator access", error);
  process.exit(1);
});
