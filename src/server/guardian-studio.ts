import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMockOnboarding } from "./env";
import { ProblemError } from "./problem";
import { verifyAccessToken } from "./session";
import { createServiceSupabase } from "./supabase";

/**
 * The studio a signed-in parent belongs to, for the family portal.
 *
 * Parents have no RLS read on `studio` (0003 lets only studio members read it), so the
 * browser can't load the studio row itself. Before this, a parent's studio lookup came back
 * empty and the app fell back to the demo studio's fixtures. The studio comes from the
 * parent's own guardian row (guardian.user_id = the verified user), never from the browser,
 * and only family-facing fields go back: the owner's terms draft stays on the server.
 */
export type GuardianStudio = {
  id: string;
  name: string;
  is_demo: boolean;
  /** studio.profile jsonb without termsDraft (see StudioProfile in studio-store). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>;
  guardianId: string;
};

export async function guardianStudioForUser(
  supabase: SupabaseClient,
  userId: string,
  preferredStudioId?: string,
): Promise<GuardianStudio | null> {
  const { data: guardians, error } = await supabase
    .from("guardian")
    .select("id, studio_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new ProblemError(500, "Family lookup failed", error.message);
  const rows = (guardians ?? []) as Array<{ id: string; studio_id: string }>;
  const guardian =
    (preferredStudioId && rows.find((row) => row.studio_id === preferredStudioId)) || rows[0];
  if (!guardian) return null;
  const { data: studio, error: studioError } = await supabase
    .from("studio")
    .select("id, name, is_demo, profile")
    .eq("id", guardian.studio_id)
    .maybeSingle();
  if (studioError) throw new ProblemError(500, "Studio lookup failed", studioError.message);
  if (!studio) return null;
  const { termsDraft: _draft, ...profile } = (studio.profile ?? {}) as Record<string, unknown>;
  return {
    id: studio.id as string,
    name: studio.name as string,
    is_demo: Boolean(studio.is_demo),
    profile,
    guardianId: guardian.id,
  };
}

export const guardianStudioFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; studioId?: string }) => data)
  .handler(async ({ data }) => {
    if (isMockOnboarding()) return { studio: null };
    const session = await verifyAccessToken(data.accessToken);
    // Service-key read, scoped to the verified user's own guardian rows.
    const studio = await guardianStudioForUser(
      createServiceSupabase(),
      session.userId,
      data.studioId,
    );
    return { studio };
  });
