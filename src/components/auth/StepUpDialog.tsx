import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MfaCodeInputs } from "./MfaCodeInputs";
import { cancelStepUp, isStepUpOpen, submitStepUpCode, subscribeStepUp } from "@/lib/step-up";

/** "Enter your code again" prompt for sensitive actions. Mounted once by LiveAuthGuard. */
export function StepUpDialog() {
  const [open, setOpen] = useState(isStepUpOpen);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeStepUp((next) => {
        setOpen(next);
        if (next) {
          setCode("");
          setError(null);
        }
      }),
    [],
  );

  async function verify(digits: string) {
    setBusy(true);
    setError(null);
    try {
      await submitStepUpCode(digits);
    } catch (err) {
      setCode("");
      setError(err instanceof Error ? err.message : "That code didn't match.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? cancelStepUp() : undefined)}>
      <DialogContent data-testid="step-up-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-5 text-primary" />
            Enter your authenticator code
          </DialogTitle>
          <DialogDescription>
            This change needs your 6-digit code again, even on a trusted device. It keeps payment
            details and people&apos;s access safe.
          </DialogDescription>
        </DialogHeader>
        <MfaCodeInputs
          value={code}
          onChange={setCode}
          onComplete={(digits) => void verify(digits)}
          disabled={busy}
          error={error}
        />
        <Button variant="ghost" className="mt-2 self-start" onClick={() => cancelStepUp()}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
