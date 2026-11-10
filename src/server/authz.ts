import { createServiceSupabase } from "./supabase";
import { forbidden, mfaRequired, ProblemError } from "./problem";
import { isMockOnboarding } from "./env";
import { getStudioAccess } from "./subscription-store";
import { canRead, canWrite } from "@/lib/subscription";

export type StudioRole = "owner" | "admin" | "teacher";
export type PlatformRole = "platform_admin" | "support";

/** In-memory memberships for mock mode and unit tests. Cleared between tests. */
export const mockMemberships: Array<{ userId: string; studioId: string; role: StudioRole }> = [];

/** In-memory platform staff for mock mode and unit tests. */
export const mockPlatformStaff: Array<{
  userId: string;
  role: PlatformRole;
  displayName: string;
}> = [];

export function resetMockMemberships(entries: typeof mockMemberships = []) {
  mockMemberships.splice(0, mockMemberships.length, ...entries);
}

export function resetMockPlatformStaff(entries: typeof mockPlatformStaff = []) {
  mockPlatformStaff.splice(0, mockPlatformStaff.length, ...entries);
}

function assertStaffAal(options?: { aal?: string | null }) {
  // Live callers must pass aal from the verified JWT. Mock callers may omit options.
  if (!options || !("aal" in options)) {
    if (isMockOnboarding()) return;
    throw mfaRequired();
  }
  if (options.aal !== "aal2") throw mfaRequired();
}

/**
 * Reads membership with the service client (or mock store) and throws a 403
 * problem error if the user does not hold one of the required roles.
 * Never trusts a studio_id from the browser beyond this check.
 * Live owner/admin/teacher routes must pass aal from the verified JWT (`aal2`).
 */
export function studioPaused(detail = "This studio's Keystone subscription is paused.") {
  return new ProblemError(
    402,
    "Studio paused",
    detail,
    "https://keystone.music/problems/studio-paused",
    "studio_paused",
  );
}

/**
 * Subscription gate (0006). Service-key paths bypass RLS, so they must check this too.
 * "write" (default) needs full access; "read" also lets the owner of a paused studio read
 * (MSA 12.2 read-only export); "skip" is only for billing paths that restore access.
 */
async function assertStudioAccess(
  studioId: string,
  role: StudioRole,
  access: "write" | "read" | "skip",
) {
  if (access === "skip") return;
  const { level } = await getStudioAccess(studioId);
  const allowed = access === "write" ? canWrite(level) : canRead(level, role);
  if (!allowed) throw studioPaused();
}

export async function requireStudioRole(
  userId: string,
  studioId: string,
  roles: StudioRole[],
  options?: { aal?: string | null; access?: "write" | "read" | "skip" },
): Promise<StudioRole> {
  if (!userId || !studioId) throw forbidden("Missing user or studio.");
  assertStaffAal(options);

  if (isMockOnboarding()) {
    const row = mockMemberships.find(
      (entry) => entry.userId === userId && entry.studioId === studioId,
    );
    if (!row || !roles.includes(row.role)) throw forbidden();
    await assertStudioAccess(studioId, row.role, options?.access ?? "write");
    return row.role;
  }

  // Service-key read of studio_member — guarded by this function's role check for the caller.
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("studio_member")
    .select("role")
    .eq("studio_id", studioId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new ProblemError(500, "Membership lookup failed", error.message);
  const role = data?.role as StudioRole | undefined;
  if (!role || !roles.includes(role)) throw forbidden();
  await assertStudioAccess(studioId, role, options?.access ?? "write");
  return role;
}

/**
 * Platform admin gate. Service-key read of platform_staff; requires role
 * platform_admin and aal2 from the verified JWT.
 */
export async function requirePlatformAdmin(
  userId: string,
  options?: { aal?: string | null },
): Promise<{ role: "platform_admin"; displayName: string }> {
  if (!userId) throw forbidden("Missing user.");
  assertStaffAal(options);

  if (isMockOnboarding()) {
    const row = mockPlatformStaff.find((entry) => entry.userId === userId);
    if (!row || row.role !== "platform_admin") throw forbidden("Platform admin required.");
    return { role: "platform_admin", displayName: row.displayName };
  }

  // Service-key read of platform_staff — guarded by requirePlatformAdmin.
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("platform_staff")
    .select("role, display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new ProblemError(500, "Platform staff lookup failed", error.message);
  if (!data || data.role !== "platform_admin") throw forbidden("Platform admin required.");
  return { role: "platform_admin", displayName: data.display_name as string };
}

export { ProblemError, forbidden, mfaRequired };
