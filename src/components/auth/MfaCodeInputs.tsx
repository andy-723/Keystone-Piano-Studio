import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (digits: string) => void;
  onComplete: (digits: string) => void;
  disabled?: boolean;
  error?: string | null;
};

/** Six single-digit inputs; accepts paste of a full 6-digit code; auto-submits on the sixth digit. */
export function MfaCodeInputs({ value, onChange, onComplete, disabled, error }: Props) {
  const digits = value.padEnd(6, " ").slice(0, 6).split("");
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function setDigit(index: number, char: string) {
    const clean = char.replace(/\D/g, "").slice(-1);
    const next = digits.map((d, i) => (i === index ? clean || " " : d));
    const joined = next.join("").replace(/ /g, "");
    onChange(joined);
    if (clean && index < 5) refs.current[index + 1]?.focus();
    if (joined.length === 6) onComplete(joined);
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    onChange(pasted);
    if (pasted.length === 6) onComplete(pasted);
    else refs.current[pasted.length]?.focus();
  }

  return (
    <div>
      <div className="flex gap-2" role="group" aria-label="Authenticator code">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={digit.trim()}
            aria-label={`Digit ${index + 1}`}
            onChange={(e) => setDigit(index, e.target.value)}
            onKeyDown={(e) => onKeyDown(index, e)}
            onPaste={onPaste}
            className="h-12 w-11 rounded-[10px] border border-[#CDBF9F] bg-white text-center text-lg font-semibold text-[#15100D] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#604A19]"
          />
        ))}
      </div>
      {error && (
        <p className="mt-3 text-sm text-[#8B1E1E]" role="status" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
