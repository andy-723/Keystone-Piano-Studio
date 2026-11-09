export type BootstrapDeps = {
  getEnv: (name: string) => string | undefined;
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  inviteUserByEmail: (email: string, redirectTo: string) => Promise<{ id: string }>;
  listPlatformAdmins: () => Promise<Array<{ userId: string }>>;
  getPlatformStaff: (userId: string) => Promise<{ role: string } | null>;
  insertPlatformAdmin: (input: { userId: string; displayName: string }) => Promise<void>;
  writeBootstrapAudit: (userId: string) => Promise<void>;
  appUrl: string;
  print: (message: string) => void;
};

export function maskEmailForLog(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}

/**
 * Idempotent one-time platform admin bootstrap. Pure logic for unit tests.
 * Never prints keys or tokens.
 */
export async function bootstrapPlatformAdmin(deps: BootstrapDeps): Promise<{ ok: true }> {
  const url = deps.getEnv("SUPABASE_URL");
  const key = deps.getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const email = deps.getEnv("PLATFORM_ADMIN_EMAIL")?.trim().toLowerCase();
  const name = deps.getEnv("PLATFORM_ADMIN_NAME")?.trim();
  if (!url || !key || !email || !name) {
    throw new Error(
      "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PLATFORM_ADMIN_EMAIL or PLATFORM_ADMIN_NAME",
    );
  }

  const admins = await deps.listPlatformAdmins();
  let user = await deps.findUserByEmail(email);

  if (admins.length > 0) {
    const existing = user ? await deps.getPlatformStaff(user.id) : null;
    if (existing?.role === "platform_admin") {
      deps.print(`Platform admin ready: ${maskEmailForLog(email)}`);
      return { ok: true };
    }
    deps.print("Add further staff from /admin");
    return { ok: true };
  }

  if (!user) {
    user = await deps.inviteUserByEmail(email, `${deps.appUrl}/auth/callback`);
  }

  const staff = await deps.getPlatformStaff(user.id);
  if (!staff) {
    await deps.insertPlatformAdmin({ userId: user.id, displayName: name });
    await deps.writeBootstrapAudit(user.id);
  }

  deps.print(`Platform admin ready: ${maskEmailForLog(email)}`);
  return { ok: true };
}
