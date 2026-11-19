import { NO_SURCHARGE_NOTE, XERO_DISCLOSURE } from "@/lib/tax-copy";
import { ProSheet } from "./ProSheet";
import { planBillingQuery } from "@/lib/plan-queries";
import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CreditCard, Landmark, Link2, Unplug, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { integrationsQuery } from "@/lib/integration-queries";
import {
  connectStripe,
  connectXero,
  disconnectStripe,
  disconnectXero,
  startLiveStripeOnboarding,
} from "@/services/integrations";
import type { IntegrationScope } from "@/mocks/integrations";

export function Integrations({
  scope = "demo",
  studioName = "",
  stripeOnly = false,
}: {
  scope?: IntegrationScope;
  studioName?: string;
  stripeOnly?: boolean;
}) {
  const { data } = useSuspenseQuery(integrationsQuery(scope));
  const { data: subscription } = useSuspenseQuery(planBillingQuery(scope));
  const [proOpen, setProOpen] = useState(false);
  const client = useQueryClient();
  const [stripeOpen, setStripeOpen] = useState(false);
  const [xeroOpen, setXeroOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "hosted" | "done">("choose");
  const [path, setPath] = useState<"existing" | "create" | null>(null);
  const [businessName, setBusinessName] = useState(studioName || "Your music studio");
  const refresh = () => client.invalidateQueries({ queryKey: ["integrations", scope] });
  const action = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: refresh,
    onError: () => toast.error("Connection could not be updated. Please try again."),
  });
  const live = Boolean(data.stripe.live);
  // Real studios: Stripe-hosted onboarding on the studio's own account (no simulation).
  const goToStripe = useMutation({
    mutationFn: startLiveStripeOnboarding,
    onSuccess: (url) => window.location.assign(url),
    onError: (error) =>
      toast.error(error instanceof Error && error.message ? error.message : "Stripe could not be opened. Please try again."),
  });
  const begin = () => {
    if (live) {
      goToStripe.mutate();
      return;
    }
    setStep("choose");
    setPath(null);
    setStripeOpen(true);
    action.mutate(() => connectStripe({ stage: "start" }, scope));
  };
  const finishStripe = () =>
    action.mutate(() => connectStripe({ stage: "complete", businessName }, scope), {
      onSuccess: () => setStep("done"),
    });
  const stripeStatus =
    data.stripe.status === "connected"
      ? "Connected"
      : data.stripe.status === "setting_up"
        ? "Setting up"
        : "Not connected";
  const syncedTime = data.xero.lastSyncedAt
    ? new Intl.DateTimeFormat("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Australia/Melbourne",
      }).format(new Date(data.xero.lastSyncedAt))
    : "Never";
  return (
    <section aria-label="Integrations" className="mt-8">
      <h2 className="text-2xl font-semibold" data-tour="settings-integrations">
        Integrations
      </h2>
      <div className="mt-5 grid gap-5">
        <article
          id="stripe-integration"
          className="min-w-0 rounded-md border border-border bg-card p-5 md:p-7"
          aria-label="Stripe integration"
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-3 text-2xl font-semibold">
              <CreditCard aria-hidden className="size-7 text-primary" />
              Stripe
            </h3>
            <Badge variant="secondary" className="text-base">
              {stripeStatus}
            </Badge>
          </header>
          <p className="mt-3 text-lg">
            {live
              ? "Families pay your studio directly through your own Stripe account. Money goes straight to you; Stripe charges you its standard fees and Keystone takes nothing."
              : "Families pay your studio directly through your own Stripe account. Online payments are not switched on yet."}
          </p>
          {live && data.stripe.configured === false && (
            <p role="status" className="mt-3 text-base text-muted-foreground">
              Online payments are being switched on for Keystone. You can link Stripe soon.
            </p>
          )}
          {live && data.stripe.status === "setting_up" && (
            <p role="status" className="mt-3 text-base text-muted-foreground">
              Stripe still needs some details or is checking them. Continue setup to finish; families see bank details until then.
            </p>
          )}
          <p className="mt-2 text-base text-muted-foreground">{NO_SURCHARGE_NOTE}</p>
          {data.stripe.status === "connected" && (
            <p role="status" className="mt-4 flex items-start gap-2 text-lg text-success">
              <Check aria-hidden className="mt-1 size-5 shrink-0" />
              Connected{data.stripe.businessName ? ` · ${data.stripe.businessName}` : ""}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            {data.stripe.status === "connected" ? (
              <>
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => action.mutate(() => disconnectStripe(scope))}
                >
                  <Unplug aria-hidden />
                  Disconnect Stripe
                </Button>
                {live ? (
                  <Button variant="outline" asChild>
                    <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                      Open Stripe Dashboard
                    </a>
                  </Button>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button variant="outline" disabled aria-disabled="true">
                            Open Stripe Dashboard
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Opens your Stripe Dashboard once live</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            ) : (
              <Button
                disabled={
                  action.isPending ||
                  goToStripe.isPending ||
                  goToStripe.isSuccess ||
                  (live && data.stripe.configured === false)
                }
                onClick={begin}
              >
                <Link2 aria-hidden />
                {goToStripe.isPending || goToStripe.isSuccess
                  ? "Opening Stripe…"
                  : data.stripe.status === "setting_up"
                    ? "Continue Stripe setup"
                    : "Connect with Stripe"}
              </Button>
            )}
          </div>
        </article>
        {!stripeOnly && (
          <article
            className="min-w-0 rounded-md border border-border bg-card p-5 md:p-7"
            aria-label="Xero integration"
          >
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-3 text-2xl font-semibold">
                <Landmark aria-hidden className="size-7 text-primary" />
                Xero
              </h3>
              <Badge variant="outline" className="text-base">
                Pro plan
              </Badge>
            </header>
            <p className="mt-3 text-lg">Send invoices and payments to Xero automatically</p>
            <p className="mt-2 text-base text-muted-foreground">{XERO_DISCLOSURE}</p>
            <p
              role="status"
              className={`mt-4 text-lg ${data.xero.status === "connected" ? "text-success" : "text-muted-foreground"}`}
            >
              {data.xero.status === "connected"
                ? `Connected to ${data.xero.organisationName} (Xero)`
                : "Not connected"}
            </p>
            {data.xero.status === "connected" && (
              <p className="mt-2 text-base text-muted-foreground">Last synced: {syncedTime}</p>
            )}
            {subscription.plan === "base" && (
              <p className="mt-3 text-muted-foreground">
                Xero sync is paused on Base. Nothing is deleted.
              </p>
            )}
            <div className="mt-5">
              {data.xero.status === "connected" ? (
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => action.mutate(() => disconnectXero(scope))}
                >
                  <Unplug aria-hidden />
                  Disconnect
                </Button>
              ) : live ? (
                <p role="status" className="text-base text-muted-foreground">
                  Xero connection is coming soon.
                </p>
              ) : (
                <Button
                  disabled={action.isPending}
                  onClick={() =>
                    subscription.plan === "base" ? setProOpen(true) : setXeroOpen(true)
                  }
                >
                  <Link2 aria-hidden />
                  Connect Xero
                </Button>
              )}
            </div>
          </article>
        )}
      </div>
      <Sheet open={stripeOpen} onOpenChange={setStripeOpen}>
        <SheetContent
          side="right"
          className="w-full max-w-full overflow-y-auto pb-8 pt-8 sm:w-full sm:max-w-lg [&>button:first-child]:hidden"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-base text-muted-foreground">Stripe · Simulated</p>
            <Button
              variant="ghost"
              aria-label="Close Stripe setup"
              disabled={action.isPending}
              onClick={() => setStripeOpen(false)}
            >
              <X aria-hidden />
              Close
            </Button>
          </div>
          <SheetTitle className="mt-5 text-2xl">
            {step === "choose"
              ? "Connect with Stripe"
              : step === "hosted"
                ? "Stripe-hosted step"
                : "Connected"}
          </SheetTitle>
          <SheetDescription className="mt-3 text-base">
            Demo connection only. No real Stripe account is created.
          </SheetDescription>
          <div className="mt-7">
            {step === "choose" ? (
              <div className="space-y-4">
                <Button
                  className="w-full whitespace-normal"
                  variant={path === "existing" ? "secondary" : "outline"}
                  onClick={() => setPath("existing")}
                >
                  I already use Stripe
                </Button>
                <Button
                  className="w-full whitespace-normal"
                  variant={path === "create" ? "secondary" : "outline"}
                  onClick={() => setPath("create")}
                >
                  Create a Stripe account
                </Button>
                <Button className="mt-4 w-full" disabled={!path} onClick={() => setStep("hosted")}>
                  Continue
                  <ArrowRight aria-hidden />
                </Button>
              </div>
            ) : step === "hosted" ? (
              <>
                <label className="block text-lg font-semibold">
                  Business name
                  <Input
                    required
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    className="mt-2 min-h-14 text-lg md:text-lg"
                  />
                </label>
                <p className="mt-5 text-base text-muted-foreground">
                  {path === "existing"
                    ? "Simulated return from Stripe after linking your existing account."
                    : "Simulated Stripe-hosted onboarding for a new account."}
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() => setStep("choose")}
                  >
                    <ArrowLeft aria-hidden />
                    Back
                  </Button>
                  <Button
                    disabled={action.isPending || !businessName.trim()}
                    onClick={finishStripe}
                  >
                    <Check aria-hidden />
                    {action.isPending ? "Connecting…" : "Complete simulated Stripe step"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Check aria-hidden className="size-12 text-success" />
                <p role="status" className="mt-5 text-xl font-semibold">
                  Connected with Stripe
                </p>
                <p className="mt-3 text-base text-muted-foreground">
                  Families pay your studio directly through your own Stripe account. Online payments
                  are not switched on yet.
                </p>
                <Button className="mt-7" onClick={() => setStripeOpen(false)}>
                  <Check aria-hidden />
                  Done
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={xeroOpen} onOpenChange={setXeroOpen}>
        <DialogContent className="max-w-lg [&>button:last-child]:hidden">
          <DialogTitle className="text-2xl">Connect to Xero</DialogTitle>
          <DialogDescription className="text-base">
            Demo consent only. Nothing is sent to Xero.
          </DialogDescription>
          <p className="text-lg font-semibold">{studioName || "Your music studio"}</p>
          <p className="text-lg">
            Allow Keystone Music HQ to send invoices and payment records to this Xero organisation?
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={action.isPending}
              onClick={() => setXeroOpen(false)}
            >
              <X aria-hidden />
              Cancel
            </Button>
            <Button
              disabled={action.isPending}
              onClick={() =>
                action.mutate(() => connectXero(scope), { onSuccess: () => setXeroOpen(false) })
              }
            >
              <Check aria-hidden />
              Allow demo connection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ProSheet open={proOpen} close={() => setProOpen(false)} />
    </section>
  );
}
