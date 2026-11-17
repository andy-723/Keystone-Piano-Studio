import { useState } from "react";

export type AccountStatusView = {
  state: "active" | "not_signed_in" | "no_account";
  lastSignInAt: string | null;
  invitedAt: string | null;
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
