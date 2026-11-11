import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";
import { getStudioWorkspace } from "@/lib/studio-workspace";
import { DEMO_CALENDAR_STUDIO } from "@/server/calendar-store";

/**
 * Which studio the calendar works on. It follows the same choice as every other studio screen
 * (LiveAuthGuard's workspace):
 *   live studio  the signed-in staff member's studio, through the server with a fresh token.
 *   demo         the demo studio (studio.is_demo), platform staff, and local mock mode. The demo
 *                calendar runs in the browser tab on the demo fixtures (`local: true`).
 */
export type CalendarAuth = { accessToken: string; studioId: string; local?: boolean };

export async function getCalendarAuth(): Promise<CalendarAuth> {
  const workspace = getStudioWorkspace();
  if (!isLiveAuthConfigured() || workspace.mode === "mock") {
    return { accessToken: "", studioId: DEMO_CALENDAR_STUDIO, local: true };
  }
  if (workspace.role === "guardian") throw new Error("The calendar is for studio staff.");
  const client = getAuthClient();
  const { data } = (await client?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  return { accessToken: token, studioId: workspace.studioId };
}
