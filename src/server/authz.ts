import { createServiceSupabase } from "./supabase";
import { forbidden, ProblemError } from "./problem";
import { isMockOnboarding } from "./env";

export type StudioRole = "owner" | "admin" | "teacher";

/** In-memory memberships for mock mode and unit tests. Cleared between tests. */
export const mockMemberships: Array<{ userId: string; studioId: string; role: StudioRole }> = [];

export function resetMockMemberships(entries: typeof mockMemberships = []) {
  mockMemberships.splice(0, mockMemberships.length, ...entries);
}

/**
 * Reads membership with the service client (or mock store) and throws a 403
 * problem error if the user does not hold one of the required roles.
 * Never trusts a studio_id from the browser beyond this check.
 */
export async function requireStudioRole(
  userId: string,
  studioId: string,
  roles: StudioRole[],
): Promise<StudioRole> {
  if (!userId || !studioId) throw forbidden("Missing user or studio.");

  if (isMockOnboarding()) {
    const row = mockMemberships.find(
      (entry) => entry.userId === userId && entry.studioId === studioId,
    );
    if (!row || !roles.includes(row.role)) throw forbidden();
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
  return role;
}

export { ProblemError, forbidden };
