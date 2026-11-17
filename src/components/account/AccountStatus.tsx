import { useState } from "react";

export type AccountStatusView = {
  state: "active" | "not_signed_in" | "no_account" | "revoked";
  lastSignInAt: string | null;
  invitedAt: string | null;
  revokedAt?: string | null;
};

function shortDate(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** "Active" / "Not signed in yet" label for staff, owners and parents. */
export function AccountStatusBadge({
  status,
  noAccountLabel = "No sign-in account yet",
}: {
  status: AccountStatusView;
  noAccountLabel?: string;
}) {
  if (status.state === "revoked") {
    const when = shortDate(status.revokedAt ?? null);
    return (
      <span className="inline-flex flex-col">
        <span className="inline-flex w-fit items-center rounded-full bg-[#F4D9D6] px-2.5 py-0.5 text-xs font-semibold text-[#8B1E1E]">
          Access revoked
        </span>
        {when && <span className="mt-0.5 text-xs text-[#5A4F43]">Since {when}</span>}
      </span>
    );
  }
  if (status.state === "active") {
    const last = shortDate(status.lastSignInAt);
    return (
      <span className="inline-flex flex-col">
        <span className="inline-flex w-fit items-center rounded-full bg-[#E3EFD9] px-2.5 py-0.5 text-xs font-semibold text-[#2F5A1E]">
          Active
        </span>
        {last && <span className="mt-0.5 text-xs text-[#5A4F43]">Last sign-in {last}</span>}
      </span>
    );
  }
  if (status.state === "not_signed_in") {
    const sent = shortDate(status.invitedAt);
    return (
      <span className="inline-flex flex-col">
        <span className="inline-flex w-fit items-center rounded-full bg-[#F6E3C2] px-2.5 py-0.5 text-xs font-semibold text-[#6B4A0E]">
          Not signed in yet
        </span>
        {sent && <span className="mt-0.5 text-xs text-[#5A4F43]">Invited {sent}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-[#EDE6D6] px-2.5 py-0.5 text-xs font-semibold text-[#5A4F43]">
      {noAccountLabel}
    </span>
  );
}

/** Sends a fresh one-time sign-in link and says where it went. */
export function SendSignInLinkButton({
  onSend,
  className = "ks-btn ks-btn-link",
}: {
  onSend: () => Promise<{ emailMasked: string }>;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className={className}
        disabled={state === "sending"}
        onClick={() => {
          setState("sending");
          setNote(null);
          onSend()
            .then((result) => {
              setState("sent");
              setNote(`Link sent to ${result.emailMasked}`);
            })
            .catch((e: unknown) => {
              setState("error");
              setNote(e instanceof Error ? e.message : "Could not send the link.");
            });
        }}
      >
        {state === "sending" ? "Sending…" : state === "sent" ? "Send again" : "Send sign-in link"}
      </button>
      {note && (
        <span
          role="status"
          className={`text-xs ${state === "error" ? "text-[#8B1E1E]" : "text-[#5A4F43]"}`}
        >
          {note}
        </span>
      )}
    </span>
  );
}

/**
 * Revoke needs a second press ("Confirm revoke") so a stray tap can't lock someone out.
 * Restore is one press. No browser dialogs.
 */
export function AccessToggleButton({
  revoked,
  onChange,
  onDone,
  className = "ks-btn ks-btn-link",
}: {
  revoked: boolean;
  onChange: (revoke: boolean) => Promise<unknown>;
  onDone?: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(revoke: boolean) {
    setBusy(true);
    setError(null);
    onChange(revoke)
      .then(() => {
        setConfirming(false);
        onDone?.();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not change access."))
      .finally(() => setBusy(false));
  }

  return (
    <span className="inline-flex flex-col">
      {revoked ? (
        <button type="button" className={className} disabled={busy} onClick={() => run(false)}>
          {busy ? "Restoring…" : "Restore access"}
        </button>
      ) : confirming ? (
        <span className="inline-flex flex-wrap gap-3">
          <button
            type="button"
            className={`${className} text-[#8B1E1E]`}
            disabled={busy}
            onClick={() => run(true)}
          >
            {busy ? "Revoking…" : "Confirm revoke"}
          </button>
          <button
            type="button"
            className={className}
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          className={`${className} text-[#8B1E1E]`}
          onClick={() => setConfirming(true)}
        >
          Revoke access
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-[#8B1E1E]">
          {error}
        </span>
      )}
    </span>
  );
}
