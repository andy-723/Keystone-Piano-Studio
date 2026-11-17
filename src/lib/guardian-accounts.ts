import { useQuery } from "@tanstack/react-query";
import { getAuthClient } from "@/lib/auth-client";
import { isLiveStudio, liveStudioId } from "@/lib/studio-workspace";
import { listGuardianAccountsFn } from "@/server/account-links";

export async function accessToken() {
  const session = (await getAuthClient()?.auth.getSession())?.data.session;
  if (!session?.access_token) throw new Error("Sign in again to continue.");
  return session.access_token;
}

/**
 * Real studios only: whether each parent of a family has signed in ("Active"), and a button
 * to email a fresh sign-in link when their first one expired.
 */
export function useGuardianAccounts(familyId: string | undefined) {
  const studioId = liveStudioId();
  return useQuery({
    queryKey: ["guardian-accounts", studioId, familyId],
    enabled: Boolean(isLiveStudio() && studioId && familyId),
    staleTime: 30_000,
    queryFn: async () => {
      const result = await listGuardianAccountsFn({
        data: { accessToken: await accessToken(), studioId: studioId!, familyId: familyId! },
      });
      return new Map(result.guardians.map((row) => [row.guardianId, row]));
    },
  });
}
