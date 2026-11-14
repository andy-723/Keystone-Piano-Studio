import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { AppLanguageSwitcher } from "@/components/AppLanguageSwitcher";
import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";
import { signOutLocal } from "@/lib/sign-out";
import {
  AU_TIMEZONES,
  addPlatformStaffFn,
  createStudioFn,
  listPlatformAuditFn,
  listPlatformStaffFn,
  listStudiosFn,
  removePlatformStaffFn,
  resetMfaFn,
} from "@/server/platform";
import { setStudioAccessFn } from "@/server/subscription";
import {
  listSupportRequestsFn,
  setSupportRequestStatusFn,
  type SupportListRow,
} from "@/server/support";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Keystone admin — Keystone Music HQ" }] }),
});

type Tab = "studios" | "new" | "support" | "team" | "audit";

function AdminPage() {
  const live = isLiveAuthConfigured();
  const [tab, setTab] = useState<Tab>("studios");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    void (async () => {
      const client = getAuthClient();
      if (!client) {
        setToken(null);
        return;
      }
      const { data } = await client.auth.getSession();
      setToken(data.session?.access_token ?? null);
    })();
  }, [live]);

  async function signOut() {
    await signOutLocal({ redirectTo: "/login" });
  }

  if (!live) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#F5EBD6] px-4 text-[#15100D]">
        <p className="text-lg">Admin console needs live mode</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F5EBD6] text-[#15100D]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D9C79E] bg-[#FBF7EE] px-4 py-3">
        <div className="flex items-center gap-3">
          <BrandLogo variant="horizontal" alt="Keystone Music HQ" />
          <span className="text-sm font-semibold text-[#604A19]">Keystone admin</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AppLanguageSwitcher />
          {/* Platform staff with no studio role see the Clarke demo studio at "/". */}
          <a href="/" className="ks-btn ks-btn-secondary">
            Open demo studio
          </a>
          <button type="button" onClick={() => void signOut()} className="ks-btn ks-btn-secondary">
            Sign out
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 px-4 py-3" aria-label="Admin sections">
        {(
          [
            ["studios", "Studios"],
            ["new", "New studio"],
            ["support", "Support"],
            ["team", "Team"],
            ["audit", "Audit"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className="ks-btn ks-btn-tab"
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-5xl px-4 pb-12">
        {error && (
          <p className="mb-4 text-sm text-[#8B1E1E]" role="status" aria-live="polite">
            {error}
          </p>
        )}
        {!token && <p className="text-sm text-[#5A4F43]">Checking session…</p>}
        {token && tab === "studios" && <StudiosTab token={token} onError={setError} />}
        {token && tab === "new" && <NewStudioTab token={token} onError={setError} />}
        {token && tab === "support" && <SupportTab token={token} onError={setError} />}
        {token && tab === "team" && <TeamTab token={token} onError={setError} />}
        {token && tab === "audit" && <AuditTab token={token} onError={setError} />}
        <p className="mt-8 text-sm text-[#5A4F43]">
          <Link to="/login" search={{ next: undefined, reason: undefined }} className="text-[#604A19] hover:underline">
            Sign-in page
          </Link>
        </p>
      </main>
    </div>
  );
}

type StudioRow = {
  id: string;
  name: string;
  createdAt: string;
  memberCount: number;
  ownerEmailMasked: string;
  status: string;
  plan?: "base" | "pro" | null;
  accessEndsAt?: string | null;
  disputeHold?: boolean;
  access?: string;
  paidThroughStripe?: boolean;
};

function StudiosTab({ token, onError }: { token: string; onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<StudioRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const result = await listStudiosFn({ data: { accessToken: token } });
        setRows(result.studios as StudioRow[]);
        onError(null);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Could not load studios");
      }
    })();
  }, [token, onError, version]);

  return (
    <div className="overflow-x-auto rounded-[16px] border border-[#D9C79E] bg-[#FBF7EE]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[#D9C79E] text-[#5A4F43]">
          <tr>
            <th className="px-3 py-3 font-medium">Studio</th>
            <th className="px-3 py-3 font-medium">Created</th>
            <th className="px-3 py-3 font-medium">Owner</th>
            <th className="px-3 py-3 font-medium">Members</th>
            <th className="px-3 py-3 font-medium">Plan</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Access</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="border-t border-[#E8DCC0]">
                <td className="px-3 py-3 font-medium">{row.name}</td>
                <td className="px-3 py-3">{new Date(row.createdAt).toLocaleDateString("en-AU")}</td>
                <td className="px-3 py-3">{row.ownerEmailMasked}</td>
                <td className="px-3 py-3">{row.memberCount}</td>
                <td className="px-3 py-3">
                  {row.plan === "pro" ? "Pro" : row.plan === "base" ? "Base" : "—"}
                </td>
                <td className="px-3 py-3">
                  {row.status}
                  {row.accessEndsAt && (
                    <span className="block text-xs text-[#5A4F43]">
                      until {new Date(row.accessEndsAt).toLocaleDateString("en-AU")}
                    </span>
                  )}
                  {row.disputeHold && (
                    <span className="block text-xs text-[#8B1E1E]">Dispute hold</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === row.id ? null : row.id)}
                    className="ks-btn ks-btn-secondary px-3"
                  >
                    {editing === row.id ? "Close" : "Change"}
                  </button>
                </td>
              </tr>
              {editing === row.id && (
                <tr>
                  <td colSpan={7} className="bg-[#F5EBD6] px-3 py-4">
                    <StudioAccessForm
                      token={token}
                      row={row}
                      onError={onError}
                      onSaved={() => {
                        setEditing(null);
                        setVersion((v) => v + 1);
                      }}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-[#5A4F43]" colSpan={7}>
                No studios yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Pilot / complimentary access, plan and dispute hold (MSA 3.5 and 5.8). Paid plans come from Stripe. */
function StudioAccessForm({
  token,
  row,
  onError,
  onSaved,
}: {
  token: string;
  row: StudioRow;
  onError: (m: string | null) => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<"" | "pilot" | "comp">("");
  const [plan, setPlan] = useState<"base" | "pro">(row.plan ?? "pro");
  const [endsOn, setEndsOn] = useState(row.accessEndsAt ? row.accessEndsAt.slice(0, 10) : "");
  const [disputeHold, setDisputeHold] = useState(Boolean(row.disputeHold));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await setStudioAccessFn({
        data: {
          accessToken: token,
          studioId: row.id,
          update: {
            ...(status ? { status } : {}),
            plan,
            accessEndsOn: endsOn || null,
            disputeHold,
            ...(note.trim() ? { note } : {}),
          },
        },
      });
      onError(null);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save access");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">
        Free access
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | "pilot" | "comp")}
          className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
          disabled={row.paidThroughStripe}
        >
          <option value="">Keep current status</option>
          <option value="pilot">Pilot (Order Form, free until end date)</option>
          <option value="comp">Complimentary</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Plan
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as "base" | "pro")}
          className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
        >
          <option value="base">Base (up to 30 students)</option>
          <option value="pro">Pro (unlimited students)</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Free access ends on (last day, blank = no end)
        <input
          type="date"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={disputeHold}
          onChange={(e) => setDisputeHold(e.target.checked)}
        />
        Dispute hold (don&apos;t suspend for non-payment, MSA 5.8)
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Note (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
        />
      </label>
      {row.paidThroughStripe && (
        <p className="text-sm text-[#5A4F43] sm:col-span-2">
          This studio pays through Stripe, so its status comes from Stripe. Plan changes for paying
          studios should be made in Stripe too.
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="ks-btn ks-btn-primary">
          Save access
        </button>
      </div>
    </form>
  );
}

function NewStudioTab({ token, onError }: { token: string; onError: (m: string | null) => void }) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Australia/Melbourne");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [accessStatus, setAccessStatus] = useState<"pilot" | "comp" | "none">("comp");
  const [accessPlan, setAccessPlan] = useState<"base" | "pro">("pro");
  const [accessEndsOn, setAccessEndsOn] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setDone(null);
    try {
      const result = await createStudioFn({
        data: {
          accessToken: token,
          name,
          timezone,
          ownerName,
          ownerEmail,
          startingAccess: {
            status: accessStatus,
            plan: accessPlan,
            accessEndsOn: accessEndsOn || null,
          },
          userAgent: navigator.userAgent,
        },
      });
      setDone(
        result.welcomeEmailError
          ? `Studio created and sign-in invite sent to ${result.inviteSentTo}, but the welcome email failed: ${result.welcomeEmailError}. Don't create the studio again.`
          : `Invite sent to ${result.inviteSentTo}`,
      );
      onError(null);
      setName("");
      setOwnerName("");
      setOwnerEmail("");
      setAccessEndsOn("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create studio");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="max-w-lg space-y-4 rounded-[16px] border border-[#D9C79E] bg-[#FBF7EE] p-6"
    >
      <div>
        <label htmlFor="studio-name" className="text-sm font-medium">
          Studio name
        </label>
        <input
          id="studio-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
        />
      </div>
      <div>
        <label htmlFor="studio-tz" className="text-sm font-medium">
          Timezone
        </label>
        <select
          id="studio-tz"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
        >
          {AU_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="owner-name" className="text-sm font-medium">
          Owner name
        </label>
        <input
          id="owner-name"
          required
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
        />
      </div>
      <div>
        <label htmlFor="owner-email" className="text-sm font-medium">
          Owner email
        </label>
        <input
          id="owner-email"
          type="email"
          required
          autoComplete="email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
        />
      </div>
      <fieldset className="space-y-3 border-t border-[#D9C79E] pt-4">
        <legend className="text-sm font-medium">Starting access</legend>
        <label className="block text-sm font-medium">
          Free access
          <select
            value={accessStatus}
            onChange={(e) => setAccessStatus(e.target.value as "pilot" | "comp" | "none")}
            className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
          >
            <option value="comp">Complimentary (test or internal studio)</option>
            <option value="pilot">Pilot (Order Form, free until end date)</option>
            <option value="none">None, the studio pays before it can use Keystone</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Plan
          <select
            value={accessPlan}
            onChange={(e) => setAccessPlan(e.target.value as "base" | "pro")}
            className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
          >
            <option value="pro">Pro (unlimited students)</option>
            <option value="base">Base (up to 30 students)</option>
          </select>
        </label>
        {accessStatus !== "none" && (
          <label className="block text-sm font-medium">
            Free access ends on {accessStatus === "pilot" ? "(required)" : "(blank = no end)"}
            <input
              type="date"
              required={accessStatus === "pilot"}
              value={accessEndsOn}
              onChange={(e) => setAccessEndsOn(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[10px] border border-[#CDBF9F] bg-white px-3"
            />
          </label>
        )}
        {accessStatus === "none" && (
          <p className="text-sm text-[#5A4F43]">
            The owner can sign in but sees their studio as paused until a subscription starts.
          </p>
        )}
      </fieldset>
      <button type="submit" disabled={busy} className="ks-btn ks-btn-primary">
        Create studio and invite owner
      </button>
      {done && (
        <p className="text-sm text-[#5A4F43]" role="status" aria-live="polite">
          {done}
        </p>
      )}
    </form>
  );
}

function TeamTab({ token, onError }: { token: string; onError: (m: string | null) => void }) {
  const [staff, setStaff] = useState<
    Array<{ userId: string; role: string; displayName: string; emailMasked: string }>
  >([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"platform_admin" | "support">("support");
  const [resetUserId, setResetUserId] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");

  async function reload() {
    const result = await listPlatformStaffFn({ data: { accessToken: token } });
    setStaff(result.staff);
  }

  useEffect(() => {
    void listPlatformStaffFn({ data: { accessToken: token } })
      .then((result) => setStaff(result.staff))
      .catch((e) => onError(e instanceof Error ? e.message : "Staff load failed"));
  }, [token, onError]);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-[16px] border border-[#D9C79E] bg-[#FBF7EE]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#D9C79E] text-[#5A4F43]">
            <tr>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((row) => (
              <tr key={row.userId} className="border-t border-[#E8DCC0]">
                <td className="px-3 py-3">{row.displayName}</td>
                <td className="px-3 py-3">{row.emailMasked}</td>
                <td className="px-3 py-3">{row.role}</td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="ks-btn ks-btn-link"
                    onClick={() =>
                      void removePlatformStaffFn({
                        data: { accessToken: token, targetUserId: row.userId },
                      })
                        .then(() => reload())
                        .catch((e) => onError(e instanceof Error ? e.message : "Remove failed"))
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        className="max-w-lg space-y-3 rounded-[16px] border border-[#D9C79E] bg-[#FBF7EE] p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void addPlatformStaffFn({
            data: { accessToken: token, email, displayName, role },
          })
            .then(() => {
              setEmail("");
              setDisplayName("");
              return reload();
            })
            .catch((err) => onError(err instanceof Error ? err.message : "Add failed"));
        }}
      >
        <h2 className="text-lg font-semibold">Add staff</h2>
        <input
          required
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="min-h-11 w-full rounded-[10px] border border-[#CDBF9F] px-3"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 w-full rounded-[10px] border border-[#CDBF9F] px-3"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "platform_admin" | "support")}
          className="min-h-11 w-full rounded-[10px] border border-[#CDBF9F] px-3"
        >
          <option value="support">support</option>
          <option value="platform_admin">platform_admin</option>
        </select>
        <button type="submit" className="ks-btn ks-btn-primary">
          Invite staff
        </button>
      </form>

      <form
        className="max-w-lg space-y-3 rounded-[16px] border border-[#D9C79E] bg-[#FBF7EE] p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void resetMfaFn({
            data: {
              accessToken: token,
              targetUserId: resetUserId,
              confirmEmail,
            },
          })
            .then(() => {
              setResetUserId("");
              setConfirmEmail("");
              onError(null);
            })
            .catch((err) => onError(err instanceof Error ? err.message : "MFA reset failed"));
        }}
      >
        <h2 className="text-lg font-semibold">Reset two-step sign-in</h2>
        <p className="text-sm text-[#5A4F43]">
          Deletes TOTP factors and signs the user out everywhere. Type their email to confirm.
        </p>
        <input
          required
          placeholder="User id"
          value={resetUserId}
          onChange={(e) => setResetUserId(e.target.value)}
          className="min-h-11 w-full rounded-[10px] border border-[#CDBF9F] px-3"
        />
        <input
          required
          type="email"
          placeholder="Confirm email"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          className="min-h-11 w-full rounded-[10px] border border-[#CDBF9F] px-3"
        />
        <button type="submit" className="ks-btn ks-btn-danger">
          Reset authenticator
        </button>
      </form>
    </div>
  );
}

function AuditTab({ token, onError }: { token: string; onError: (m: string | null) => void }) {
  const [event, setEvent] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<
    Array<{ id: string; event: string; at: string; actor_user_id: string | null }>
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await listPlatformAuditFn({
          data: {
            accessToken: token,
            event: event || undefined,
            from: from || undefined,
            to: to || undefined,
            page,
          },
        });
        setRows(result.rows as typeof rows);
        onError(null);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Audit load failed");
      }
    })();
  }, [token, event, from, to, page, onError]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={event}
          onChange={(e) => {
            setPage(1);
            setEvent(e.target.value);
          }}
          className="min-h-11 rounded-[10px] border border-[#CDBF9F] bg-[#FBF7EE] px-3 text-sm"
        >
          <option value="">All events</option>
          {[
            "bootstrap_admin",
            "sign_in",
            "sign_in_no_account",
            "mfa_enrolled",
            "mfa_reset",
            "studio_created",
            "owner_invited",
            "staff_added",
            "staff_removed",
          ].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setPage(1);
            setFrom(e.target.value);
          }}
          className="min-h-11 rounded-[10px] border border-[#CDBF9F] bg-[#FBF7EE] px-3 text-sm"
          aria-label="From date"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setPage(1);
            setTo(e.target.value);
          }}
          className="min-h-11 rounded-[10px] border border-[#CDBF9F] bg-[#FBF7EE] px-3 text-sm"
          aria-label="To date"
        />
      </div>
      <div className="overflow-x-auto rounded-[16px] border border-[#D9C79E] bg-[#FBF7EE]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#D9C79E] text-[#5A4F43]">
            <tr>
              <th className="px-3 py-3">When</th>
              <th className="px-3 py-3">Event</th>
              <th className="px-3 py-3">Actor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[#E8DCC0]">
                <td className="px-3 py-3">{new Date(row.at).toLocaleString("en-AU")}</td>
                <td className="px-3 py-3">{row.event}</td>
                <td className="px-3 py-3 font-mono text-xs">{row.actor_user_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="ks-btn ks-btn-paper"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <button type="button" className="ks-btn ks-btn-paper" onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

/** Support requests from the help centre. Each one was also emailed to SUPPORT_EMAIL. */
function SupportTab({ token, onError }: { token: string; onError: (m: string | null) => void }) {
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [rows, setRows] = useState<SupportListRow[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const result = await listSupportRequestsFn({ data: { accessToken: token, status } });
        setRows(result.rows);
        onError(null);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Support requests failed to load");
      }
    })();
  }, [token, status, reload, onError]);

  async function setRowStatus(id: string, next: "open" | "closed") {
    try {
      await setSupportRequestStatusFn({ data: { accessToken: token, id, status: next } });
      setReload((n) => n + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="min-h-11 rounded-[10px] border border-[#CDBF9F] bg-[#FBF7EE] px-3 text-sm"
          aria-label="Status"
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
        <p className="text-sm text-[#5A4F43]">
          Reply from your email: each request was sent there with Reply-To set to the requester.
        </p>
      </div>
      {rows.length === 0 && <p className="text-sm text-[#5A4F43]">No support requests.</p>}
      {rows.map((row) => (
        <article key={row.id} className="rounded-[16px] border border-[#D9C79E] bg-[#FBF7EE] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {row.urgent && (
                <span className="mr-2 rounded bg-[#8B1E1E] px-2 py-0.5 text-xs text-white">
                  URGENT
                </span>
              )}
              {row.reference} · {row.subject}
            </p>
            <button
              type="button"
              className="ks-btn ks-btn-secondary"
              onClick={() => void setRowStatus(row.id, row.status === "open" ? "closed" : "open")}
            >
              {row.status === "open" ? "Close" : "Reopen"}
            </button>
          </div>
          <p className="mt-1 text-xs text-[#5A4F43]">
            {new Date(row.createdAt).toLocaleString("en-AU")} · {row.audience} · {row.category} ·{" "}
            {row.role} · {row.requesterEmail}
            {row.studioId ? ` · studio ${row.studioId}` : ""}
            {row.emailSentAt ? "" : " · email NOT sent"}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm">{row.message}</p>
        </article>
      ))}
    </div>
  );
}
