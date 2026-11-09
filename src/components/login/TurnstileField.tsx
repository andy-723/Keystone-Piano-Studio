import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: string;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
  mock?: boolean;
};

/** Cloudflare Turnstile widget. Loads the script once; no npm dependency. */
export function TurnstileField({ siteKey, onToken, mock }: Props) {
  const hostId = useId().replace(/:/g, "");
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (mock || !siteKey) return;

    const render = () => {
      const el = document.getElementById(`cf-turnstile-${hostId}`);
      if (!el || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(el, {
        sitekey: siteKey,
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
        theme: "light",
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src*="challenges.cloudflare.com/turnstile"]',
      );
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = () => render();
        document.head.appendChild(script);
      } else {
        existing.addEventListener("load", render);
      }
    }

    return () => {
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          // ignore
        }
        widgetId.current = null;
      }
    };
  }, [hostId, mock, siteKey]);

  if (mock || !siteKey) {
    return (
      <div
        className="flex min-h-12 items-center justify-between gap-3 rounded-[10px] border border-dashed border-[#BFAE88] bg-[#F5EBD6] px-3.5 py-3"
        data-testid="turnstile-mock"
      >
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            className="size-[22px] accent-[#604A19]"
            onChange={(e) => onToken(e.target.checked ? "mock-ok" : null)}
          />
          Security check
        </label>
        <span className="text-xs text-[#5A4F43]">Demo mode</span>
      </div>
    );
  }

  return <div id={`cf-turnstile-${hostId}`} className="min-h-16" data-testid="turnstile-widget" />;
}
