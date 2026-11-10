import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";
import { resolveAccountFn } from "@/server/account";

/**
 * Which studio the calendar works on, plus a fresh access token for the server functions.
 * Live: the signed-in person's first owner/admin/teacher studio. Local demo: the in-memory studio.
 */
export type CalendarAuth = { accessToken: string; studioId: string };

const STAFF_ROLES = ["owner", "admin", "teacher"];
let cachedStudio: { userToken: string; studioId: string | null } | null = null;

export async function getCalendarAuth(): Promise<CalendarAuth> {
  if (!isLiveAuthConfigured()) return { accessToken: "", studioId: "demo" };
  const client = getAuthClient();
  const { data } = (await client?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const userId = data.session?.user.id ?? "";
  if (!cachedStudio || cachedStudio.userToken !== userId) {
    const account = await resolveAccountFn({ data: { accessToken: token } });
    const roleOrder = (role: string) => STAFF_ROLES.indexOf(role);
    const staff = account.memberships
      .filter((m) => STAFF_ROLES.includes(m.role))
      .sort((a, b) => roleOrder(a.role) - roleOrder(b.role));
    cachedStudio = { userToken: userId, studioId: staff[0]?.studioId ?? null };
  }
  if (!cachedStudio.studioId) throw new Error("The calendar is for studio staff.");
  return { accessToken: token, studioId: cachedStudio.studioId };
}
