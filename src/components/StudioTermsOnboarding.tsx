import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FocusLayout } from "@/components/onboarding/FocusLayout";
import { visibleOnboardingSteps, type StudioTermsOnboardingStep } from "@/lib/studio-terms-onboarding-steps";
import type { TermsOptionalSwitch } from "@/mocks/legal-template-au";
import type { TermsScope } from "@/mocks/terms";
import { STUDIO_STATES } from "@/mocks/setup";
import { getStudioTermsDraft, saveStudioTermsDraft } from "@/services/terms";
import { toast } from "sonner";

const fieldClass = "mt-3 min-h-14 text-lg";

function readField(
  step: StudioTermsOnboardingStep,
  studio: Record<string, unknown>,
  switches: Partial<Record<TermsOptionalSwitch, boolean>>,
  teacher: { childSafety?: { state: string; type: string; number: string; expiry: string } | null },
): string | boolean | number {
  if (step.field === "childSafety") return "";
  if (step.field.startsWith("switch.")) {
    const key = step.field.slice("switch.".length) as TermsOptionalSwitch;
    return Boolean(switches[key]);
  }
  if (step.field.startsWith("billing.")) {
    const path = step.field.slice("billing.".length);
    const billing = (studio["billing"] ?? {}) as Record<string, unknown>;
    if (path.startsWith("paymentDiscount.")) {
      const discount = (billing["paymentDiscount"] ?? {}) as Record<string, unknown>;
      return String(discount[path.slice("paymentDiscount.".length)] ?? "");
    }
    return String(billing[path] ?? "");
  }
  if (step.field.startsWith("policies.")) {
    const policies = (studio["policies"] ?? {}) as Record<string, unknown>;
    return String(policies[step.field.slice("policies.".length)] ?? "");
  }
  if (step.field.startsWith("services.")) {
    const services = (studio["services"] ?? {}) as Record<string, unknown>;
    return String(services[step.field.slice("services.".length)] ?? "");
  }
  if (step.field === "childSafety") return teacher.childSafety?.number ?? "";
  return String(studio[step.field] ?? "");
}

export function StudioTermsOnboarding({
  scope = "new-studio",
  onComplete,
  plan,
}: {
  scope?: TermsScope;
  onComplete?: () => void;
  plan?: string;
}) {
  const client = useQueryClient();
  const draftQuery = useQuery({ queryKey: ["terms-draft", scope], queryFn: () => getStudioTermsDraft(scope) });
  const [stepIndex, setStepIndex] = useState(0);
  const [value, setValue] = useState("");
  const [switchValue, setSwitchValue] = useState(false);
  const [safety, setSafety] = useState({ state: "VIC", type: "Working with Children Check", number: "", expiry: "" });
  const headingRef = useRef<HTMLHeadingElement>(null);

  const switches = draftQuery.data?.switches ?? {};
  const steps = useMemo(() => visibleOnboardingSteps(switches, plan ?? draftQuery.data?.studio?.plan), [switches, plan, draftQuery.data?.studio?.plan]);
  const step = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))];
  const progress = steps.length <= 1 ? 0 : stepIndex / (steps.length - 1);

  useEffect(() => {
    if (!draftQuery.data || !step) return;
    const studio = draftQuery.data.studio as unknown as Record<string, unknown>;
    if (step.kind === "switch") {
      setSwitchValue(Boolean(readField(step, studio, draftQuery.data.switches, draftQuery.data.teacher)));
    } else if (step.kind === "childSafety") {
      const existing = draftQuery.data.teacher.childSafety;
      setSafety({
        state: existing?.state ?? (String(studio["state"] ?? "VIC")),
        type: existing?.type ?? "Working with Children Check",
        number: existing?.number ?? "",
        expiry: existing?.expiry ?? "",
      });
    } else {
      setValue(String(readField(step, studio, draftQuery.data.switches, draftQuery.data.teacher) ?? ""));
    }
    headingRef.current?.focus();
  }, [step?.id, draftQuery.data]);

  const save = useMutation({
    mutationFn: async (input: Parameters<typeof saveStudioTermsDraft>[1]) => saveStudioTermsDraft(scope, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["terms-draft", scope] }),
    onError: (error: Error) => toast.error(error.message),
  });

  if (draftQuery.isLoading || !draftQuery.data || !step) {
    return <p className="p-6">Opening studio terms setup…</p>;
  }

  const studioName = String(draftQuery.data.studio.name || "Your studio");

  const buildPayload = (): Parameters<typeof saveStudioTermsDraft>[1] => {
    if (step.kind === "switch" && step.field.startsWith("switch.")) {
      const key = step.field.slice("switch.".length) as TermsOptionalSwitch;
      return { switches: { [key]: switchValue }, onboardingStep: step.id };
    }
    if (step.kind === "childSafety") {
      return {
        studio: { childSafety: { ...safety } },
        onboardingStep: step.id,
      };
    }
    const numeric = step.kind === "number" ? Number(value) : value;
    if (step.field.startsWith("billing.")) {
      const path = step.field.slice("billing.".length);
      const billing = { ...(draftQuery.data.studio.billing ?? {}) } as Record<string, unknown>;
      if (path.startsWith("paymentDiscount.")) {
        const key = path.slice("paymentDiscount.".length);
        billing["paymentDiscount"] = {
          ...((billing["paymentDiscount"] as object) ?? { enabled: true }),
          [key]: step.kind === "number" ? Number(value) : value,
          enabled: true,
        };
      } else {
        billing[path] = numeric;
      }
      return { studio: { billing: billing as NonNullable<typeof draftQuery.data.studio.billing> }, onboardingStep: step.id };
    }
    if (step.field.startsWith("policies.")) {
      const key = step.field.slice("policies.".length);
      return {
        studio: {
          policies: {
            ...(draftQuery.data.studio.policies as object),
            [key]: numeric,
          } as NonNullable<typeof draftQuery.data.studio.policies>,
        },
        onboardingStep: step.id,
      };
    }
    if (step.field.startsWith("services.")) {
      const key = step.field.slice("services.".length);
      return {
        studio: {
          services: {
            ...(draftQuery.data.studio.services as object),
            [key]: value,
          } as NonNullable<typeof draftQuery.data.studio.services>,
        },
        onboardingStep: step.id,
      };
    }
    return {
      studio: { [step.field]: numeric } as Parameters<typeof saveStudioTermsDraft>[1]["studio"],
      onboardingStep: step.id,
    };
  };

  const canContinue = () => {
    if (step.kind === "switch") return true;
    if (step.kind === "childSafety") return Boolean(safety.state && safety.type && safety.number.trim() && safety.expiry);
    if (step.required === false) return true;
    return String(value).trim().length > 0;
  };

  const goNext = async () => {
    await save.mutateAsync(buildPayload());
    if (stepIndex >= steps.length - 1) {
      await save.mutateAsync({ onboardingCompleted: true, onboardingStep: "done" });
      toast.success("Studio terms details saved");
      onComplete?.();
      return;
    }
    setStepIndex((index) => index + 1);
  };

  return (
    <FocusLayout studioName={studioName} progress={progress} lang="en" onLangChange={() => undefined}>
      <p className="text-base text-muted-foreground">Studio terms · {stepIndex + 1} of {steps.length}</p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-3xl font-semibold outline-none">
        {step.title}
      </h1>
      {step.help && <p className="mt-3 text-base text-muted-foreground">{step.help}</p>}

      <div className="mt-8 space-y-4">
        {step.kind === "text" && (
          <Input className={fieldClass} value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
        )}
        {step.kind === "number" && (
          <Input type="number" className={fieldClass} value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
        )}
        {step.kind === "textarea" && (
          <textarea className="mt-3 min-h-32 w-full rounded-md border border-input bg-card px-3 py-2 text-lg" value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
        )}
        {step.kind === "select" && (
          <select className="mt-3 min-h-14 w-full rounded-md border border-input bg-card px-3 text-lg" value={value} onChange={(event) => setValue(event.target.value)} autoFocus>
            <option value="">Choose</option>
            {(step.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
        {step.kind === "switch" && (
          <label className="flex items-center justify-between gap-5 border-y border-border py-5">
            <span className="text-lg font-semibold">{switchValue ? "Yes" : "No"}</span>
            <Switch checked={switchValue} onCheckedChange={setSwitchValue} className="h-12 w-20 shrink-0 [&>span]:size-10 [&>span]:data-[state=checked]:translate-x-8" />
          </label>
        )}
        {step.kind === "childSafety" && (
          <div className="space-y-4">
            <label className="block font-semibold">State
              <select className="mt-2 min-h-14 w-full rounded-md border border-input bg-card px-3 text-lg" value={safety.state} onChange={(event) => setSafety({ ...safety, state: event.target.value })}>
                {STUDIO_STATES.map((state) => <option key={state}>{state}</option>)}
              </select>
            </label>
            <label className="block font-semibold">Check type
              <Input className={fieldClass} value={safety.type} onChange={(event) => setSafety({ ...safety, type: event.target.value })} />
            </label>
            <label className="block font-semibold">Check number (kept private)
              <Input className={fieldClass} value={safety.number} onChange={(event) => setSafety({ ...safety, number: event.target.value })} />
            </label>
            <label className="block font-semibold">Expiry
              <Input type="date" className={fieldClass} value={safety.expiry} onChange={(event) => setSafety({ ...safety, expiry: event.target.value })} />
            </label>
          </div>
        )}
      </div>

      <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-border pt-6">
        {stepIndex > 0 ? (
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setStepIndex((index) => Math.max(0, index - 1))}>
            <ArrowLeft aria-hidden />Back
          </Button>
        ) : <span />}
        <Button type="button" className="min-h-14" disabled={!canContinue() || save.isPending} onClick={() => void goNext()}>
          {stepIndex >= steps.length - 1 ? "Save and continue" : "Continue"}
          <ArrowRight aria-hidden />
        </Button>
      </footer>
      <p className="mt-6 text-sm text-muted-foreground">Australian template for Keystone Music HQ studios. Publishing stays blocked until required fields are filled.</p>
    </FocusLayout>
  );
}
