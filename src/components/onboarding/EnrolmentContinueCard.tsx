import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parentIntakesQuery } from "@/lib/onboarding-queries";
import { getFamilyInvitationStatus } from "@/services/invitations";
import { getParentSession } from "@/services/parent";
import { useParentLanguage } from "@/i18n/parent";
import { tOnboarding } from "@/i18n/onboarding";
import { queryOptions } from "@tanstack/react-query";

const inviteQuery = queryOptions({
  queryKey: ["parent", "invitation-status"],
  queryFn: async () => {
    const session = await getParentSession();
    return getFamilyInvitationStatus(session.family.id);
  },
});

export function EnrolmentContinueCard() {
  const { data: intakes } = useSuspenseQuery(parentIntakesQuery);
  const { data: invite } = useSuspenseQuery(inviteQuery);
  const { lang } = useParentLanguage();
  const pending = intakes.find((entry) => entry.status === "intake_sent");
  if (
    !pending &&
    (!invite ||
      invite.status === "completed" ||
      invite.status === "expired" ||
      invite.status === "revoked")
  )
    return null;
  const child = pending?.studentName ?? "your child";
  const draftId = pending?.id ?? invite?.enrolmentDraftIds[0];
  if (!draftId) return null;
  const href = `/intake/${draftId}`;
  return (
    <section
      className="mt-6 border-y border-border py-6"
      aria-label={tOnboarding(lang, "finishCard", { child })}
    >
      <h2 className="text-2xl font-semibold">{tOnboarding(lang, "finishCard", { child })}</h2>
      <Button asChild className="mt-4 min-h-12">
        <a href={href}>
          {tOnboarding(lang, "finishContinue")}
          <ArrowRight aria-hidden />
        </a>
      </Button>
    </section>
  );
}
