import { KEYSTONE_PRICE_GST_LINE } from "@/lib/tax-copy";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Check, CreditCard, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { planBillingQuery } from "@/lib/plan-queries";
import { baseStudentLimitExceeded } from "@/lib/plans";
import { openStripeBillingSession } from "@/lib/open-stripe-billing";
import { setStudioPlan } from "@/services/plans";
import { getStudioWorkspace, isLiveStudio } from "@/lib/studio-workspace";
import { getStripeBillingStatusFn } from "@/server/subscription";
import type { IntegrationScope } from "@/mocks/integrations";
import { formatAUD } from "@/lib/format";

const baseFeatures = [
  "Scheduling and make-ups",
  "Family chat",
  "Tax invoices with GST",
  "PayTo, BECS and card payments",
  "Parent portal in English and Chinese",
  "Curriculum",
  "Welcome lesson",
  "Assignments and marking",
  "Practice logs",
  "Up to 30 students",
];
const proFeatures = [
  "Everything in Base",
  "Video lessons and recordings",
  "The review queue",
  "Red Risk",
  "Board rules",
  "Xero sync",
  "Unlimited students",
];

export function PlanBilling({ scope = "demo" }: { scope?: IntegrationScope }) {
  const { data } = useSuspenseQuery(planBillingQuery(scope));
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const base = data.plan === "base";
  // A real studio's plan is its Keystone subscription, not a switch on this page.
  const live = scope === "demo" && isLiveStudio();
  const workspace = getStudioWorkspace();
  const studioId = workspace.mode === "live" ? workspace.studioId : null;
  const canManageStripe = live && workspace.mode === "live" && workspace.role === "owner" && studioId;
  const { data: stripeStatus } = useQuery({
    queryKey: ["stripe-billing-status"],
    queryFn: () => getStripeBillingStatusFn(),
    enabled: Boolean(canManageStripe),
  });
  const label = data.plan === "academy" ? "Academy" : base ? "Base" : "Pro";
  const change = useMutation({
    mutationFn: () => setStudioPlan(base ? "pro" : "base", scope),
    onSuccess: async () => {
      setConfirm(false);
      // Remove protected cached reviews before active observers refetch on Base.
      client.removeQueries({ queryKey: ["review-queue"], type: "inactive" });
      await Promise.all(
        [
          "plan-billing",
          "studio",
          "studio-settings",
          "assignment-settings",
          "assignment-editor",
          "parent",
          "integrations",
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    },
  });

  function startStripeBilling(plan?: "base" | "pro") {
    if (!studioId) return;
    setBillingError(null);
    setBillingBusy(true);
    void openStripeBillingSession(studioId, plan)
      .catch((err) =>
        setBillingError(err instanceof Error ? err.message : "Could not open Stripe billing."),
      )
      .finally(() => setBillingBusy(false));
  }

  return (
    <section id="plan-and-billing" className="scroll-mt-6 border-b border-border py-8" aria-label="Plan and billing">
      <h2 className="text-2xl font-semibold" data-tour="settings-plan">
        Plan and billing
      </h2>
      <div className="mt-5 rounded-md border border-border bg-card p-5 md:p-7">
        <p className="text-2xl font-semibold">You're on the {label} plan</p>
        {data.plan !== "academy" && (
          <p className="mt-3 text-lg">
            A${base ? "29" : "49"} a month.
            {KEYSTONE_PRICE_GST_LINE && ` ${KEYSTONE_PRICE_GST_LINE}`}
          </p>
        )}
        {data.renewal && <p className="mt-3">Renews {data.renewal}</p>}
        {data.card && (
          <p className="mt-3 flex items-center gap-3">
            <CreditCard aria-hidden className="size-6 text-muted-foreground" />
            {data.card}
          </p>
        )}
        {!live && (
          <Button
            className="mt-5"
            onClick={() => {
              change.reset();
              setConfirm(true);
            }}
          >
            {base ? "Upgrade to Pro" : "Switch to Base"}
            <ArrowRight aria-hidden />
          </Button>
        )}
        {canManageStripe && stripeStatus?.checkoutReady && (
          <Button className="mt-5" disabled={billingBusy} onClick={() => startStripeBilling()}>
            <CreditCard aria-hidden />
            {billingBusy ? "Opening Stripe…" : "Manage billing in Stripe"}
          </Button>
        )}
        {canManageStripe && stripeStatus && !stripeStatus.checkoutReady && (
          <p className="mt-5 text-base text-muted-foreground" role="status">
            Stripe billing is not configured on the server yet. Add the Keystone billing secrets
            (see the live Stripe setup checklist), then use Manage billing here.
          </p>
        )}
        {billingError && (
          <p role="alert" className="mt-3 text-destructive">
            {billingError}
          </p>
        )}
      </div>
      <p className="mt-3 text-base text-muted-foreground">
        {live
          ? canManageStripe && stripeStatus?.checkoutReady
            ? "Your plan is billed by Keystone Music HQ through Stripe. Card updates, invoices and cancellation use the Stripe customer portal."
            : "Your plan comes from your Keystone Music HQ subscription."
          : "Prototype: plan changes are simulated. No charge is made."}
      </p>
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        {(["base", "pro"] as const).map((plan) => (
          <article
            key={plan}
            className={`min-w-0 rounded-md border bg-card p-5 ${data.plan === plan ? "border-primary" : "border-border"}`}
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-2xl font-semibold">{plan === "base" ? "Base" : "Pro"}</h3>
              {data.plan === plan && <Badge className="text-base">Current plan</Badge>}
            </header>
            <p className="mt-3 font-semibold">A${plan === "base" ? "29" : "49"} a month</p>
            <ul className="mt-5 space-y-3">
              {(plan === "base" ? baseFeatures : proFeatures).map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check aria-hidden className="mt-1 size-5 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {canManageStripe && stripeStatus?.checkoutReady && data.plan !== plan && (
              <Button
                className="mt-5 w-full"
                variant="outline"
                disabled={billingBusy}
                onClick={() => startStripeBilling(plan)}
              >
                {billingBusy ? "Opening Stripe…" : `Subscribe to ${plan === "base" ? "Base" : "Pro"}`}
              </Button>
            )}
          </article>
        ))}
      </div>
      <h3 className="mt-8 text-xl font-semibold">Invoices from Keystone Music HQ</h3>
      {data.invoices.length === 0 && (
        <p className="mt-3 text-muted-foreground">No Keystone Music HQ invoices yet.</p>
      )}
      <ul className="mt-3 divide-y divide-border">
        {data.invoices.map((invoice) => (
          <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <span>
              {invoice.month} · Pro
            </span>
            <span className="flex items-center gap-3">
              {`A$${formatAUD(invoice.amountCents)}`}
              <Badge variant="secondary" className="text-base">
                {invoice.status}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
      <Sheet open={confirm} onOpenChange={setConfirm}>
        <SheetContent className="w-full max-w-full overflow-y-auto pt-8 sm:max-w-lg [&>button:first-child]:hidden">
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              <X aria-hidden />
              Close
            </Button>
          </div>
          <SheetTitle className="mt-4 text-2xl">
            {base ? "Upgrade to Pro" : "Switch to Base"}?
          </SheetTitle>
          <SheetDescription className="mt-4 text-base">
            {base
              ? "Pro is A$49 a month. Recordings, video lessons, the review queue, Red Risk, board rules and Xero sync will be turned on."
              : "Base is A$29 a month. Recordings, Red Risk and Xero sync will be turned off. Nothing is deleted."}
          </SheetDescription>
          {!base && (
            <p className="mt-4">
              Video lessons, the review queue and board rules also become unavailable. Base includes
              up to 30 students; no students are removed or blocked.
            </p>
          )}
          <p className="mt-4 text-muted-foreground">No charge is made.</p>
          <Button className="mt-6 w-full" disabled={change.isPending} onClick={() => change.mutate()}>
            <Check aria-hidden />
            Confirm {base ? "upgrade to Pro" : "switch to Base"}
          </Button>
          {change.error && (
            <p role="alert" className="mt-3 text-destructive">
              {change.error.message}
            </p>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export function StudentLimitBanner({ activeStudents }: { activeStudents: number }) {
  const { data } = useSuspenseQuery(planBillingQuery());
  if (!baseStudentLimitExceeded(data.plan, activeStudents)) return null;
  return (
    <div role="status" className="mt-5 border-l-4 border-warning bg-warning-soft p-5">
      <p>
        Base includes up to 30 students. You have {activeStudents}. Upgrade to Pro for unlimited
        students.
      </p>
      <Button asChild variant="outline" className="mt-3">
        <Link to="/settings" hash="plan-and-billing">
          Plan and billing
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
