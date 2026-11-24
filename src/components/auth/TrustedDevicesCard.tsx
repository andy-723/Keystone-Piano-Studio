import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";
import { getSessionTrustedUntil, setSessionTrustedUntil } from "@/lib/session-timeout";
import { trustThisDevice } from "@/lib/trust-device-client";
import { TRUST_DAYS } from "@/lib/trusted-device";

type Device = {
  id: string;
  label: string;
  lastSeenAt: string;
  expiresAt: string;
  thisDevice: boolean;
};

async function currentToken(): Promise<string> {
  const { data } = (await getAuthClient()?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error("Session expired. Sign in again.");
  return token;
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/**
 * Settings (studio) and the family portal: is this browser trusted for 30 days, which other
 * browsers are, and "Sign out other devices". Live sign-ins only.
 */
export function TrustedDevicesCard({ variant = "section" }: { variant?: "section" | "card" }) {
  const live = isLiveAuthConfigured();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(() => getSessionTrustedUntil());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { listTrustedDevicesFn } = await import("@/server/trusted-device");
      const result = await listTrustedDevicesFn({ data: { accessToken: await currentToken() } });
      setDevices(result.devices);
      const here = result.devices.find((device) => device.thisDevice);
      setSessionTrustedUntil(here ? here.expiresAt : null);
      setTrustedUntil(here ? Date.parse(here.expiresAt) : null);
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    if (live) void load();
  }, [live, load]);

  if (!live) return null;

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const others = (devices ?? []).filter((device) => !device.thisDevice);
  const wrapper =
    variant === "card"
      ? "mb-4 rounded-xl border border-border bg-card p-4"
      : "border-b border-border py-6";

  return (
    <section className={wrapper} aria-label="Signed-in devices" data-testid="trusted-devices-card">
      <h2
        className={`flex items-center gap-3 font-semibold ${variant === "card" ? "text-lg" : "text-2xl"}`}
      >
        <MonitorSmartphone aria-hidden className="size-6 text-primary" />
        Signed-in devices
      </h2>
      <p className="mt-2 text-base text-muted-foreground">
        {trustedUntil
          ? `This device is trusted until ${dateLabel(new Date(trustedUntil).toISOString())}. It signs out after 7 days without use.`
          : `This device signs out after 30 minutes without use, or 8 hours at most. Trust it to stay signed in for ${TRUST_DAYS} days.`}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {trustedUntil ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { forgetThisDevice } = await import("@/lib/trust-device-client");
                await forgetThisDevice(await currentToken());
                setTrustedUntil(null);
              }, "This device is no longer trusted")
            }
          >
            Stop trusting this device
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const expiresAt = await trustThisDevice(await currentToken());
                setTrustedUntil(Date.parse(expiresAt));
              }, `This device is trusted for ${TRUST_DAYS} days`)
            }
          >
            Trust this device for {TRUST_DAYS} days
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const { forgetOtherDevicesFn } = await import("@/server/trusted-device");
              await forgetOtherDevicesFn({ data: { accessToken: await currentToken() } });
              // Ends every other Supabase session too, trusted or not.
              await getAuthClient()?.auth.signOut({ scope: "others" });
            }, "Signed out on your other devices")
          }
          data-testid="sign-out-other-devices"
        >
          Sign out other devices
        </Button>
      </div>
      {others.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          {others.map((device) => (
            <li key={device.id}>
              {device.label} · last used {dateLabel(device.lastSeenAt)} · trusted until{" "}
              {dateLabel(device.expiresAt)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
