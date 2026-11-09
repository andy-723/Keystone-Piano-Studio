/**
 * One-time local bootstrap for the first platform admin.
 * Usage: bun scripts/bootstrap-platform-admin.ts
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_NAME.
 */
import { createClient } from "@supabase/supabase-js";
import { bootstrapPlatformAdmin } from "../src/lib/bootstrap-platform-admin";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

  const supabase =
    url && key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;

  await bootstrapPlatformAdmin({
    getEnv: (name) => process.env[name],
    appUrl,
    print: (message) => console.log(message),
    findUserByEmail: async (email) => {
      if (!supabase) return null;
      const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      const user = data.users.find((entry) => entry.email?.toLowerCase() === email);
      return user ? { id: user.id } : null;
    },
    inviteUserByEmail: async (email, redirectTo) => {
      if (!supabase) throw new Error("Supabase client unavailable");
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error || !data.user) throw new Error(error?.message ?? "Invite failed");
      return { id: data.user.id };
    },
    listPlatformAdmins: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("platform_staff")
        .select("user_id")
        .eq("role", "platform_admin");
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({ userId: row.user_id as string }));
    },
    getPlatformStaff: async (userId) => {
      if (!supabase) return null;
      const { data } = await supabase
        .from("platform_staff")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      return data ? { role: data.role as string } : null;
    },
    insertPlatformAdmin: async ({ userId, displayName }) => {
      if (!supabase) throw new Error("Supabase client unavailable");
      // Service-key insert — bootstrap script only; created_by is null for the first row.
      const { error } = await supabase.from("platform_staff").insert({
        user_id: userId,
        role: "platform_admin",
        display_name: displayName,
        created_by: null,
      });
      if (error) throw new Error(error.message);
    },
    writeBootstrapAudit: async (userId) => {
      if (!supabase) return;
      await supabase.from("platform_audit").insert({
        actor_user_id: userId,
        event: "bootstrap_admin",
        target_user_id: userId,
        detail: {},
      });
    },
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed");
  process.exit(1);
});
