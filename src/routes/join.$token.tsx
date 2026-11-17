import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FamilyOnboardingFlow } from "@/components/onboarding/FamilyOnboardingFlow";
import { isLiveAuthConfigured } from "@/lib/auth-client";
import { loadLiveJoinFn } from "@/server/family-join";
import { loadJoinSession } from "@/services/invitations";

/**
 * Invite links from real studios are checked against the database on the server
 * (src/server/family-join.ts). Without Supabase (local demo, tests) the in-memory demo flow runs.
 */
function loadJoin(token: string) {
  return isLiveAuthConfigured() ? loadLiveJoinFn({ data: { token } }) : loadJoinSession(token);
}

export const Route = createFileRoute("/join/$token")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["join", params.token],
      queryFn: () => loadJoin(params.token),
    }),
  head: () => ({
    meta: [
      { title: "Enrolment — Keystone Music HQ" },
      { name: "description", content: "Complete your family's enrolment with Keystone Music HQ." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const { data } = useSuspenseQuery({
    queryKey: ["join", token],
    queryFn: () => loadJoin(token),
  });
  return <FamilyOnboardingFlow session={data} />;
}
