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
import { integrationsQuery } from "@/lib/integration-queries";
import { connectStripe, connectXero, disconnectStripe, disconnectXero } from "@/services/integrations";
import type { IntegrationScope } from "@/mocks/integrations";

export function Integrations({ scope = "demo", studioName = "", stripeOnly = false }: { scope?: IntegrationScope; studioName?: string; stripeOnly?: boolean }) {
  const { data } = useSuspenseQuery(integrationsQuery(scope));
  const { data: subscription } = useSuspenseQuery(planBillingQuery(scope));
  const [proOpen, setProOpen] = useState(false);
  const client = useQueryClient();
  const [stripeOpen, setStripeOpen] = useState(false);
  const [xeroOpen, setXeroOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState(studioName || "Your music studio");
  const refresh = () => client.invalidateQueries({ queryKey: ["integrations", scope] });
  const action = useMutation({ mutationFn: (operation: () => Promise<unknown>) => operation(), onSuccess: refresh, onError: () => toast.error("Connection could not be updated. Please try again.") });
  const begin = () => { setStep(1); setStripeOpen(true); action.mutate(() => connectStripe({ stage: "start" }, scope)); };
  const finishStripe = () => action.mutate(() => connectStripe({ stage: "complete", businessName }, scope), { onSuccess: () => setStep(3) });
  const stripeStatus = data.stripe.status === "connected" ? "Connected" : data.stripe.status === "setting_up" ? "Setting up" : "Not connected";
  const syncedTime = data.xero.lastSyncedAt ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Melbourne" }).format(new Date(data.xero.lastSyncedAt)) : "Never";
  return <section aria-label="Integrations" className="mt-8">
    <h2 className="text-2xl font-semibold">Integrations</h2>
    <div className="mt-5 grid gap-5">
      <article id="stripe-integration" className="min-w-0 rounded-md border border-border bg-card p-5 md:p-7" aria-label="Stripe integration">
        <header className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-3 text-2xl font-semibold"><CreditCard aria-hidden className="size-7 text-primary" />Stripe</h3><Badge variant="secondary" className="text-base">{stripeStatus}</Badge></header>
        <p className="mt-3 text-lg">Get paid by PayTo, direct debit and card</p>
        {data.stripe.status === "connected" && <p role="status" className="mt-4 flex items-start gap-2 text-lg text-success"><Check aria-hidden className="mt-1 size-5 shrink-0" />Connected – payouts to bank ending {data.stripe.bankLast4}</p>}
        <div className="mt-5 flex flex-wrap gap-3">{data.stripe.status === "connected" ? <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate(() => disconnectStripe(scope))}><Unplug aria-hidden />Disconnect Stripe</Button> : <Button disabled={action.isPending} onClick={begin}><Link2 aria-hidden />{data.stripe.status === "setting_up" ? "Continue Stripe setup" : "Connect Stripe"}</Button>}</div>
      </article>
      {!stripeOnly && <article className="min-w-0 rounded-md border border-border bg-card p-5 md:p-7" aria-label="Xero integration">
        <header className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-3 text-2xl font-semibold"><Landmark aria-hidden className="size-7 text-primary" />Xero</h3><Badge variant="outline" className="text-base">Pro plan</Badge></header>
        <p className="mt-3 text-lg">Send invoices and payments to Xero automatically</p>
        <p role="status" className={`mt-4 text-lg ${data.xero.status === "connected" ? "text-success" : "text-muted-foreground"}`}>{data.xero.status === "connected" ? `Connected to ${data.xero.organisationName} (Xero)` : "Not connected"}</p>
        {data.xero.status === "connected" && <p className="mt-2 text-base text-muted-foreground">Last synced: {syncedTime}</p>}
        {subscription.plan === "base" && <p className="mt-3 text-muted-foreground">Xero sync is paused on Base. Nothing is deleted.</p>}
        <div className="mt-5">{data.xero.status === "connected" ? <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate(() => disconnectXero(scope))}><Unplug aria-hidden />Disconnect</Button> : <Button disabled={action.isPending} onClick={() => subscription.plan === "base" ? setProOpen(true) : setXeroOpen(true)}><Link2 aria-hidden />Connect Xero</Button>}</div>
      </article>}
    </div>
    <Sheet open={stripeOpen} onOpenChange={setStripeOpen}><SheetContent side="right" className="w-full max-w-full overflow-y-auto pb-8 pt-8 sm:w-full sm:max-w-lg [&>button:first-child]:hidden">
      <div className="flex items-center justify-between gap-3"><p className="text-base text-muted-foreground">Stripe · Step {step} of 3</p><Button variant="ghost" aria-label="Close Stripe setup" disabled={action.isPending} onClick={() => setStripeOpen(false)}><X aria-hidden />Close</Button></div>
      <SheetTitle className="mt-5 text-2xl">{step === 1 ? "Business details" : step === 2 ? "Bank account" : "Done"}</SheetTitle>
      <SheetDescription className="mt-3 text-base">Demo connection only. No real account or bank details are needed.</SheetDescription>
      <div className="mt-7">{step === 1 ? <form onSubmit={(event) => { event.preventDefault(); setStep(2); }}><label className="block text-lg font-semibold">Business name<Input required value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="mt-2 min-h-14 text-lg md:text-lg" /></label><label className="mt-5 block text-lg font-semibold">Business type<Input value="Piano teaching studio" readOnly className="mt-2 min-h-14 text-lg md:text-lg" /></label><Button type="submit" className="mt-7" disabled={action.isPending || !businessName.trim()}>Continue<ArrowRight aria-hidden /></Button></form> : step === 2 ? <><dl className="space-y-5 border-y border-border py-5"><div><dt className="text-base text-muted-foreground">Account name</dt><dd className="mt-1 break-words text-lg">{businessName}</dd></div><div><dt className="text-base text-muted-foreground">Demo BSB</dt><dd className="mt-1 text-lg">000-000</dd></div><div><dt className="text-base text-muted-foreground">Demo account</dt><dd className="mt-1 text-lg">•••• 1234</dd></div></dl><div className="mt-7 flex flex-wrap gap-3"><Button variant="outline" disabled={action.isPending} onClick={() => setStep(1)}><ArrowLeft aria-hidden />Back</Button><Button disabled={action.isPending} onClick={finishStripe}><Check aria-hidden />{action.isPending ? "Connecting…" : "Use demo bank account"}</Button></div></> : <><Check aria-hidden className="size-12 text-success" /><p role="status" className="mt-5 text-xl font-semibold">Connected – payouts to bank ending 1234</p><Button className="mt-7" onClick={() => setStripeOpen(false)}><Check aria-hidden />Done</Button></>}</div>
    </SheetContent></Sheet>
    <Dialog open={xeroOpen} onOpenChange={setXeroOpen}><DialogContent className="max-w-lg [&>button:last-child]:hidden"><DialogTitle className="text-2xl">Connect to Xero</DialogTitle><DialogDescription className="text-base">Demo consent only. Nothing is sent to Xero.</DialogDescription><p className="text-lg font-semibold">{studioName || "Your music studio"}</p><p className="text-lg">Allow Keystone Music HQ to send invoices and payment records to this Xero organisation?</p><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={action.isPending} onClick={() => setXeroOpen(false)}><X aria-hidden />Cancel</Button><Button disabled={action.isPending} onClick={() => action.mutate(() => connectXero(scope), { onSuccess: () => setXeroOpen(false) })}><Check aria-hidden />Allow demo connection</Button></div></DialogContent></Dialog>
    <ProSheet open={proOpen} close={() => setProOpen(false)}/>
  </section>;
}