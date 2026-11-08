import { createServiceSupabase } from "./supabase";
import { requireStudioRole } from "./authz";
import { isMockOnboarding } from "./env";
import { mockMemberships } from "./authz";

/** Pending notification cancellation queue (mock). Live path would enqueue a worker job. */
export const cancelledNotificationQueue: Array<{ studioId: string; userId: string; at: string }> =
  [];

/**
 * Owner/admin only: delete membership, sign the user out of all sessions, and
 * enqueue cancellation of that user's pending notifications for the studio.
 *
 * Comment: existing Realtime channels and issued signed URLs persist until their
 * expiry; the measured window is recorded in docs/security/revocation.md.
 */
export async function removeMember(studioId: string, userId: string, actorUserId: string) {
  // Service-key membership mutation — requireStudioRole(actor) must pass first.
  await requireStudioRole(actorUserId, studioId, ["owner", "admin"]);

  if (isMockOnboarding()) {
    const index = mockMemberships.findIndex(
      (entry) => entry.studioId === studioId && entry.userId === userId,
    );
    if (index < 0) throw new Error("Member not found.");
    mockMemberships.splice(index, 1);
    cancelledNotificationQueue.push({ studioId, userId, at: new Date().toISOString() });
    return { removed: true, sessionsRevoked: true };
  }

  const supabase = createServiceSupabase();

  // Service-key delete of studio_member — requireStudioRole already verified actor.
  const { error: deleteError } = await supabase
    .from("studio_member")
    .delete()
    .eq("studio_id", studioId)
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  // Service-key admin sign-out of all sessions for the removed user.
  const { error: signOutError } = await supabase.auth.admin.signOut(userId, "global");
  if (signOutError) throw new Error(signOutError.message);

  cancelledNotificationQueue.push({ studioId, userId, at: new Date().toISOString() });
  return { removed: true, sessionsRevoked: true };
}
