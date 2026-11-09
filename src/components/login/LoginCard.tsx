import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { TurnstileField } from "./TurnstileField";
import { maskEmail } from "@/lib/auth-paths";
import { getAuthClient, isLiveAuthConfigured } from "@/lib/auth-client";

const GoogleMark = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

const MicrosoftMark = () => (
  <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden="true">
    <rect x="0" y="0" width="10" height="10" fill="#F25022" />
    <rect x="12" y="0" width="10" height="10" fill="#7FBA00" />
    <rect x="0" y="12" width="10" height="10" fill="#00A4EF" />
    <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"
      stroke="#604A19"
      strokeWidth="1.6"
      fill="#F5EBD6"
    />
  </svg>
);

function Sunburst() {
  return (
    <svg className="orn mb-1.5 block" width="72" height="36" viewBox="0 0 72 36" aria-hidden="true">
      <line x1="36" y1="34" x2="66.9" y2="25.7" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="63.7" y2="18.0" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="58.6" y2="11.4" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="52.0" y2="6.3" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="44.3" y2="3.1" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="36.0" y2="2.0" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="27.7" y2="3.1" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="20.0" y2="6.3" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="13.4" y2="11.4" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="8.3" y2="18.0" stroke="#C2A259" strokeWidth="1.4" />
      <line x1="36" y1="34" x2="5.1" y2="25.7" stroke="#C2A259" strokeWidth="1.4" />
      <path d="M8,34 A28,28 0 0 1 64,34" stroke="#604A19" strokeWidth="1.6" fill="none" />
      <line x1="0" y1="34.5" x2="72" y2="34.5" stroke="#604A19" strokeWidth="1.6" />
    </svg>
  );
}

const btnSecondary =
  "flex w-full min-h-12 items-center justify-center gap-3 rounded-[10px] border border-[#CDBF9F] bg-white text-[15px] font-medium text-[#15100D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#604A19]";
const btnPrimary =
  "min-h-[50px] w-full rounded-[10px] border-0 bg-[#604A19] text-[15px] font-semibold text-[#FBF7EE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#604A19] disabled:opacity-60";

type Props = {
  nextPath?: string | null;
  siteKey?: string;
};

export function LoginCard({ nextPath, siteKey = "" }: Props) {
  const live = isLiveAuthConfigured();
  const [email, setEmail] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`
      : "/auth/callback";

  async function oauth(provider: "google" | "azure") {
    setError(null);
    if (!live) {
      window.location.href = nextPath || "/";
      return;
    }
    const client = getAuthClient();
    if (!client) return;
    setBusy(true);
    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        ...(provider === "azure" ? { scopes: "email" } : {}),
      },
    });
    setBusy(false);
    if (oauthError) setError("Sign-in could not start. Try again.");
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = email.trim().toLowerCase();
    if (!value) {
      setError("Enter your email address.");
      return;
    }
    if (!live) {
      setSentTo(value);
      return;
    }
    if (!captcha) {
      setError("Complete the security check.");
      return;
    }
    const client = getAuthClient();
    if (!client) return;
    setBusy(true);
    // Always show the same success message — do not reveal whether the email is registered.
    await client.auth.signInWithOtp({
      email: value,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
        captchaToken: captcha,
      },
    });
    setBusy(false);
    setSentTo(value);
  }

  if (sentTo) {
    return (
      <div className="flex w-full max-w-[360px] flex-col gap-5" data-testid="login-check-inbox">
        <Sunburst />
        <div>
          <h1 className="m-0 font-[family-name:var(--font-login-serif)] text-[34px] font-semibold leading-[1.15] tracking-[-0.2px] text-[#15100D]">
            Check your inbox
          </h1>
          <p className="mt-2 text-[15px] leading-normal text-[#5A4F43]" aria-live="polite">
            If there is a Keystone Music HQ account for {maskEmail(sentTo)}, we sent a sign-in link.
            Open it on this device.
          </p>
        </div>
        <button type="button" className={btnSecondary} onClick={() => setSentTo(null)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-5" data-testid="login-card">
      <div>
        <Sunburst />
        <h1 className="m-0 font-[family-name:var(--font-login-serif)] text-[34px] font-semibold leading-[1.15] tracking-[-0.2px] text-[#15100D]">
          Welcome back
        </h1>
        <p className="mt-0 text-[15px] leading-normal text-[#5A4F43]">
          Sign in to keep the music going.
        </p>
      </div>

      {!live && (
        <p
          className="m-0 rounded-[10px] bg-[#F5EBD6] px-3 py-2 text-sm text-[#5A4F43]"
          role="status"
        >
          Demo mode: no real sign-in
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          className={btnSecondary}
          disabled={busy}
          onClick={() => oauth("google")}
        >
          <GoogleMark />
          <span>Continue with Google</span>
        </button>
        <button
          type="button"
          className={btnSecondary}
          disabled={busy}
          onClick={() => oauth("azure")}
        >
          <MicrosoftMark />
          <span>Continue with Microsoft</span>
        </button>
      </div>

      <div className="flex items-center gap-3 text-[13px] text-[#6B6052]">
        <span className="h-px flex-1 bg-[#DDD0B4]" />
        <span>or sign in with email</span>
        <span className="h-px flex-1 bg-[#DDD0B4]" />
      </div>

      <form className="flex flex-col gap-4" onSubmit={onEmail}>
        <div className="flex flex-col gap-2">
          <label htmlFor="login-email" className="text-sm font-medium text-[#15100D]">
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@yourstudio.com.au"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="box-border min-h-12 rounded-[10px] border border-[#CDBF9F] bg-white px-3.5 text-[15px] text-[#15100D] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#604A19]"
          />
        </div>

        <TurnstileField siteKey={siteKey} mock={!live || !siteKey} onToken={setCaptcha} />

        <button type="submit" className={btnPrimary} disabled={busy}>
          Continue with email
        </button>
      </form>

      {error && (
        <p className="m-0 text-sm text-[#8B1E1E]" role="status" aria-live="polite">
          {error}
        </p>
      )}

      <p className="m-0 flex items-start gap-2.5 text-[13px] leading-normal text-[#5A4F43]">
        <ShieldIcon />
        <span>
          Next we&apos;ll ask for the 6-digit code from your authenticator app. Two-step sign-in
          keeps student records safe.
        </span>
      </p>

      <div className="h-px bg-[#DDD0B4]" />

      <p className="m-0 text-[13px] leading-normal text-[#5A4F43]">
        Running a studio?{" "}
        <Link
          to="/studio-enquiry"
          className="font-medium text-[#604A19] underline-offset-2 hover:text-[#15100D] hover:underline"
        >
          Set up your studio
        </Link>
        . Families and students join from the invite their teacher sends.
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#6B6052]">
        <a href="mailto:support@example.com" className="text-[#604A19] hover:text-[#15100D]">
          Help
        </a>
        <Link to="/settings/terms" className="text-[#604A19] hover:text-[#15100D]">
          Privacy
        </Link>
        <Link to="/settings/terms" className="text-[#604A19] hover:text-[#15100D]">
          Terms
        </Link>
        <span>Data hosted in Sydney, Australia</span>
      </div>
    </div>
  );
}
