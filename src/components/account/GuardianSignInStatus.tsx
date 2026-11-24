import { sensitiveAccessToken } from "@/lib/step-up";
import { useQueryClient } from "@tanstack/react-query";
import { liveStudioId } from "@/lib/studio-workspace";
import { accessToken, type useGuardianAccounts } from "@/lib/guardian-accounts";
import { sendGuardianSignInLinkFn, setGuardianAccessFn } from "@/server/account-links";
import { AccessToggleButton, AccountStatusBadge, SendSignInLinkButton } from "./AccountStatus";

export function GuardianSignInStatus({
  guardianId,
  accounts,
}: {
  guardianId: string;
  accounts: ReturnType<typeof useGuardianAccounts>["data"];
}) {
  const studioId = liveStudioId();
  const queryClient = useQueryClient();
  const status = accounts?.get(guardianId);
  if (!studioId || !status) return null;
  return (
    <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1">
      <AccountStatusBadge status={status} noAccountLabel="Enrolment form not finished" />
      {(status.state === "active" || status.state === "not_signed_in") && (
        <SendSignInLinkButton
          className="text-sm font-medium text-primary underline underline-offset-2 disabled:opacity-60"
          onSend={async () =>
            sendGuardianSignInLinkFn({
              data: { accessToken: await accessToken(), studioId, guardianId },
            })
          }
        />
      )}
      {status.state !== "no_account" && (
        <AccessToggleButton
          className="text-sm font-medium text-primary underline underline-offset-2 disabled:opacity-60"
          revoked={status.state === "revoked"}
          onChange={async (revoke) =>
            setGuardianAccessFn({
              data: {
                // Revoking needs the authenticator code from the last 10 minutes.
                accessToken: revoke ? await sensitiveAccessToken() : await accessToken(),
                studioId,
                guardianId,
                revoke,
              },
            })
          }
          onDone={() => void queryClient.invalidateQueries({ queryKey: ["guardian-accounts"] })}
        />
      )}
    </div>
  );
}
