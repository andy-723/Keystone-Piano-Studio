import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";
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

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Keystone admin — Keystone Music HQ" }] }),
});

type Tab = "studios" | "new" | "team" | "audit";

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
    const client = getAuthClient();
    await client?.auth.signOut({ scope: "local" });
    window.location.href = "/login";
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
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-11 rounded-[10px] border border-[#CDBF9F] bg-white px-4 text-sm font-medium"
        >
          Sign out
        </button>
      </header>

      <nav className="flex flex-wrap gap-2 px-4 py-3" aria-label="Admin sections">
        {(
          [
            ["studios", "Studios"],
            ["new", "New studio"],
            ["team", "Team"],
            ["audit", "Audit"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-[10px] px-4 text-sm font-medium ${
              tab === id
                ? "bg-[#604A19] text-[#FBF7EE]"
                : "bg-[#FBF7EE] text-[#15100D] border border-[#CDBF9F]"
            }`}
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
        {token && tab === "team" && <TeamTab token={token} onError={setError} />}
        {token && tab === "audit" && <AuditTab token={token} onError={setError} />}
        <p className="mt-8 text-sm text-[#5A4F43]">
          <Link to="/login" className="text-[#604A19] hover:underline">
            Sign-in page
          </Link>
        </p>
      </main>
    </div>
  );
}

function StudiosTab({ token, onError }: { token: string; onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      name: string;
      createdAt: string;
      memberCount: number;
      ownerEmailMasked: string;
      status: string;
    }>
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        const result = await listStudiosFn({ data: { accessToken: token } });
        setRows(result.studios);
        onError(null);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Could not load studios");
      }
    })();
  }, [token, onError]);

  return (
    <div className="overflow-x-auto rounded-[16px] border border-[#D9C79E] bg-[#FBF7EE]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[#D9C79E] text-[#5A4F43]">
          <tr>
            <th className="px-3 py-3 font-medium">Studio</th>
            <th className="px-3 py-3 font-medium">Created</th>
            <th className="px-3 py-3 font-medium">Owner</th>
            <th className="px-3 py-3 font-medium">Members</th>
            <th className="px-3 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[#E8DCC0]">
              <td className="px-3 py-3 font-medium">{row.name}</td>
              <td className="px-3 py-3">{new Date(row.createdAt).toLocaleDateString("en-AU")}</td>
              <td className="px-3 py-3">{row.ownerEmailMasked}</td>
              <td className="px-3 py-3">{row.memberCount}</td>
              <td className="px-3 py-3">{row.status}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-[#5A4F43]" colSpan={5}>
                No studios yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function NewStudioTab({ token, onError }: { token: string; onError: (m: string | null) => void }) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Australia/Melbourne");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
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
          userAgent: navigator.userAgent,
        },
      });
      setDone(`Invite sent to ${result.inviteSentTo}`);
      onError(null);
      setName("");
      setOwnerName("");
      setOwnerEmail("");
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
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-[10px] bg-[#604A19] px-4 text-sm font-semibold text-[#FBF7EE] disabled:opacity-60"
      >
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
                    className="min-h-11 text-[#604A19] underline-offset-2 hover:underline"
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
        <button
          type="submit"
          className="min-h-11 rounded-[10px] bg-[#604A19] px-4 text-sm font-semibold text-[#FBF7EE]"
        >
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
        <button
          type="submit"
          className="min-h-11 rounded-[10px] border border-[#8B1E1E] px-4 text-sm font-semibold text-[#8B1E1E]"
        >
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
          className="min-h-11 rounded-[10px] border border-[#CDBF9F] bg-[#FBF7EE] px-4 text-sm disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          className="min-h-11 rounded-[10px] border border-[#CDBF9F] bg-[#FBF7EE] px-4 text-sm"
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
