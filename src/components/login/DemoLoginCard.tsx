import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { TurnstileField } from "./TurnstileField";
import { btnPrimary, Sunburst } from "./LoginCard";
import { getAuthClient, isDemoModeAllowed, isLiveAuthConfigured } from "@/lib/auth-client";
import { clearVerifiedAccess } from "@/lib/live-auth-cache";
import { DEMO_LOGIN_REFUSED_MESSAGE } from "@/lib/post-login";
import { resolveAccountFn } from "@/server/account";

const inputClass =
  "box-border min-h-12 rounded-[10px] border border-[#CDBF9F] bg-white px-3.5 text-[15px] text-[#15100D] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#604A19]";

/**
 * Demo sign-in (ADR-062): email + password for the one demo account, which belongs only to the
 * demo studio (studio.is_demo) and only ever sees the in-browser Clarke fixtures. Any other
 * account that signs in here is signed straight back out with the same message, so the page
 * never reveals which emails exist or have a password.
 */
export function DemoLoginCard({ siteKey = "" }: { siteKey?: string }) {
  const live = isLiveAuthConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  // Turnstile tokens are single use: remount the widget after each attempt.
  const [captchaKey, setCaptchaKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refuse(message = DEMO_LOGIN_REFUSED_MESSAGE) {
    setError(message);
    setCaptcha(null);
    setCaptchaKey((key) => key + 1);
    setBusy(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!live) {
      if (isDemoModeAllowed()) {
        window.location.href = "/";
      } else {
        setError("Sign-in is unavailable right now. Please try again shortly.");
      }
      return;
    }
    const value = email.trim().toLowerCase();
    if (!value || !password) {
      setError("Enter the demo email and password.");
      return;
    }
    if (siteKey && !captcha) {
      setError("Complete the security check.");
      return;
    }
    const client = getAuthClient();
    if (!client) return;
    setBusy(true);
    const { data, error: signInError } = await client.auth.signInWithPassword({
      email: value,
      password,
      ...(captcha ? { options: { captchaToken: captcha } } : {}),
    });
    if (signInError || !data.session) {
      refuse();
      return;
    }
    try {
      const account = await resolveAccountFn({
        data: { accessToken: data.session.access_token },
      });
      if (!account.demoOnly) {
        clearVerifiedAccess();
        await client.auth.signOut({ scope: "local" });
        refuse();
        return;
      }
    } catch {
      clearVerifiedAccess();
      await client.auth.signOut({ scope: "local" });
      refuse("The demo couldn't open right now. Please try again shortly.");
      return;
    }
    window.location.replace("/");
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-5" data-testid="demo-login-card">
      <div>
        <Sunburst />
        <h1 className="m-0 font-[family-name:var(--font-login-serif)] text-[34px] font-semibold leading-[1.15] tracking-[-0.2px] text-[#15100D]">
          Demo studio
        </h1>
        <p className="mt-0 text-[15px] leading-normal text-[#5A4F43]">
          Sign in to the Clarke Piano Studio demo. It shows sample students and families only.
        </p>
      </div>

      {!live && isDemoModeAllowed() && (
        <p
          className="m-0 rounded-[10px] bg-[#F5EBD6] px-3 py-2 text-sm text-[#5A4F43]"
          role="status"
        >
          Demo mode: no real sign-in
        </p>
      )}

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-2">
          <label htmlFor="demo-email" className="text-sm font-medium text-[#15100D]">
            Demo email
          </label>
          <input
            id="demo-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="demo-password" className="text-sm font-medium text-[#15100D]">
            Password
          </label>
          <input
            id="demo-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <TurnstileField
          key={captchaKey}
          siteKey={siteKey}
          mock={!live || !siteKey}
          onToken={setCaptcha}
        />

        <button type="submit" className={btnPrimary} disabled={busy}>
          Open the demo
        </button>
      </form>

      {error && (
        <p className="m-0 text-sm text-[#8B1E1E]" role="status" aria-live="polite">
          {error}
        </p>
      )}

      <div className="h-px bg-[#DDD0B4]" />

      <p className="m-0 text-[13px] leading-normal text-[#5A4F43]">
        Studio owners and families{" "}
        <Link
          to="/login"
          search={{ next: undefined }}
          className="font-medium text-[#604A19] underline-offset-2 hover:text-[#15100D] hover:underline"
        >
          sign in here
        </Link>
        .
      </p>
    </div>
  );
}
