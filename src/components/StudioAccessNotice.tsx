import { useState } from "react";
import { getAuthClient } from "@/lib/auth-client";
import { createBillingSessionFn } from "@/server/subscription";

async function openBilling(studioId: string, setError: (m: string | null) => void) {
  try {
    const client = getAuthClient();
    const { data } = (await client?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) {
      window.location.replace("/login");
      return;
    }
    const result = await createBillingSessionFn({ data: { accessToken: token, studioId } });
    window.location.assign(result.url);
  } catch (error) {
    setError(error instanceof Error ? error.message : "Could not open billing.");
  }
}

function PayButton({ studioId, label }: { studioId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void openBilling(studioId, setError).finally(() => setBusy(false));
        }}
        className="ks-btn ks-btn-primary"
      >
        {label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-[#8B1E1E]" role="status" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}

/** Full-screen notice when nobody in this account can use their studio (0006, MSA 12.2). */
export function StudioPausedScreen({
  ownerStudioId,
  ended,
  supportEmail,
}: {
  ownerStudioId: string | null;
  ended: boolean;
  supportEmail?: string;
}) {
  async function signOut() {
    await getAuthClient()?.auth.signOut({ scope: "local" });
    window.location.href = "/login";
  }
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5EBD6] px-4 text-center text-[#15100D]">
      <h1 className="text-2xl font-semibold">
        {ended ? "This studio's subscription has ended" : "This studio is paused"}
      </h1>
      <p className="mt-3 max-w-md text-base text-[#5A4F43]" role="status">
        {ownerStudioId
          ? ended
            ? "The 30-day window to export your studio data has passed. Start a new subscription to use Keystone Music HQ again."
            : "Your Keystone Music HQ subscription needs attention. Pay to restore access for your teachers and families."
          : "Your studio's Keystone Music HQ account is paused. Please contact your teacher or studio owner."}
      </p>
      {ownerStudioId && (
        <div className="mt-6">
          <PayButton
            studioId={ownerStudioId}
            label={ended ? "Start a subscription" : "Pay and restore access"}
          />
        </div>
      )}
      {supportEmail && <p className="mt-6 text-sm text-[#5A4F43]">Questions? {supportEmail}</p>}
      <button type="button" onClick={() => void signOut()} className="ks-btn ks-btn-link mt-6">
        Sign out
      </button>
    </main>
  );
}

/** Banner for an owner whose studio is paused: read-only access so they can export. */
export function StudioReadOnlyBanner({ studioId }: { studioId: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D9C79E] bg-[#FFF4D6] px-4 py-3 text-[#15100D]"
      role="status"
    >
      <p className="text-sm">
        <strong>Read-only.</strong> Your studio is paused, so teachers and families can&apos;t sign
        in. You can still view and export your data.
      </p>
      <PayButton studioId={studioId} label="Pay and restore access" />
    </div>
  );
}
