import { useState } from "react";
import { isTrustRequested, setTrustRequested } from "@/lib/trust-device-client";

/**
 * "Trust this device for 30 days" tick box (sign-in, email link and code screens). Unticked by
 * default; the choice is remembered until sign-in finishes on this browser.
 */
export function TrustDeviceCheckbox({ className = "" }: { className?: string }) {
  const [checked, setChecked] = useState(isTrustRequested);
  return (
    <label
      className={`flex items-start gap-2.5 text-[14px] leading-normal text-[#15100D] ${className}`}
      data-testid="trust-device-checkbox"
    >
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-[#604A19]"
        checked={checked}
        onChange={(event) => {
          setChecked(event.target.checked);
          setTrustRequested(event.target.checked);
        }}
      />
      <span>
        <span className="font-medium">Trust this device for 30 days</span>
        <span className="block text-[13px] text-[#5A4F43]">
          Stay signed in here without a new email link or code. Signs out after 7 days unused.
          Don&apos;t tick this on a shared computer.
        </span>
      </span>
    </label>
  );
}
