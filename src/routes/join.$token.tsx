import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FamilyOnboardingFlow } from "@/components/onboarding/FamilyOnboardingFlow";
import { loadJoinSession } from "@/services/invitations";

export const Route = createFileRoute("/join/$token")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["join", params.token],
      queryFn: () => loadJoinSession(params.token),
    }),
  head: () => ({
    meta: [
      { title: "Enrolment — Keystone Music HQ" },
      { name: "description", content: "Complete your family's enrolment with Keystone Music HQ." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const { data } = useSuspenseQuery({
    queryKey: ["join", token],
    queryFn: () => loadJoinSession(token),
  });
  return <FamilyOnboardingFlow session={data} />;
}
