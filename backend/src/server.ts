import { createApp } from "./app.js";
import {
  allowLocalRequests,
  requireDeviceToken,
  requireSupabaseUser,
} from "./auth.js";
import { config } from "./config.js";
import { SupabaseWasteStore } from "./supabase-waste-store.js";
import { SupabasePlatformAdminService, type PlatformAdminService } from "./platform-admin.js";
import type { WasteStore } from "./waste-store.js";

async function start() {
  let store: WasteStore;
  let requireUser = allowLocalRequests;
  let requireDevice = allowLocalRequests;
  let platformAdminService: PlatformAdminService | undefined;

  if (config.dataProvider === "supabase") {
    const supabaseStore = new SupabaseWasteStore(config.supabase!);
    store = supabaseStore;
    requireUser = requireSupabaseUser(supabaseStore.authClient);
    requireDevice = requireDeviceToken;
    platformAdminService = new SupabasePlatformAdminService({
      url: config.supabase!.url,
      secretKey: config.supabase!.secretKey,
      inviteRedirectUrl: config.authInviteRedirectUrl,
    });
  } else {
    const [{ createDatabase }, { SqliteWasteStore }] = await Promise.all([
      import("./database.js"),
      import("./sqlite-waste-store.js"),
    ]);
    store = new SqliteWasteStore(await createDatabase(config.databasePath));
  }

  await store.ready();
  const app = createApp(store, {
    corsOrigins: config.corsOrigins,
    requireUser,
    requireDevice,
    platformAdminService,
  });
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Kitzon API listening on port ${config.port}`);
  });

  async function shutdown(signal: string) {
    console.log(`${signal} received; shutting down`);
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
