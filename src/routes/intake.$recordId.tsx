import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FamilyOnboardingFlow } from "@/components/onboarding/FamilyOnboardingFlow";
import { loadJoinSessionByDraft } from "@/services/invitations";

export const Route = createFileRoute("/intake/$recordId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["intake-join", params.recordId],
      queryFn: () => loadJoinSessionByDraft(params.recordId),
    }),
  head: () => ({
    meta: [
      { title: "Family intake — Keystone Music HQ" },
      { name: "description", content: "Complete your family’s piano student intake." },
      { property: "og:title", content: "Family intake — Keystone Music HQ" },
      { property: "og:description", content: "Complete your family’s piano student intake." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntakePage,
});

function IntakePage() {
  const { recordId } = Route.useParams();
  const { data } = useSuspenseQuery({
    queryKey: ["intake-join", recordId],
    queryFn: () => loadJoinSessionByDraft(recordId),
  });
  return <FamilyOnboardingFlow session={data} />;
}
