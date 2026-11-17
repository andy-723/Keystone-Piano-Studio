import { liveStudioId } from "@/lib/studio-workspace";
import { accessToken, type useGuardianAccounts } from "@/lib/guardian-accounts";
import { sendGuardianSignInLinkFn } from "@/server/account-links";
import { AccountStatusBadge, SendSignInLinkButton } from "./AccountStatus";

export function GuardianSignInStatus({
  guardianId,
  accounts,
}: {
  guardianId: string;
  accounts: ReturnType<typeof useGuardianAccounts>["data"];
}) {
  const studioId = liveStudioId();
  const status = accounts?.get(guardianId);
  if (!studioId || !status) return null;
  return (
    <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1">
      <AccountStatusBadge status={status} noAccountLabel="Enrolment form not finished" />
      {status.state !== "no_account" && (
        <SendSignInLinkButton
          className="text-sm font-medium text-primary underline underline-offset-2 disabled:opacity-60"
          onSend={async () =>
            sendGuardianSignInLinkFn({
              data: { accessToken: await accessToken(), studioId, guardianId },
            })
          }
        />
      )}
    </div>
  );
}
