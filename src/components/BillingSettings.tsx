import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Download, Landmark, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { IntegrationScope } from "@/mocks/integrations";
import {
  formatBsb,
  getBillingProfile,
  maskAccountNumber,
  saveBillingProfile,
  savePayTo,
} from "@/services/billing-profile";
import { exportBillingCsv } from "@/services/billing";
import { queryOptions } from "@tanstack/react-query";

const billingProfileQuery = (scope: IntegrationScope) =>
  queryOptions({
    queryKey: ["billing-profile", scope],
    queryFn: () => getBillingProfile(scope),
  });

export function BillingSettings({ scope = "demo" }: { scope?: IntegrationScope }) {
  const { data: profile } = useSuspenseQuery(billingProfileQuery(scope));
  const client = useQueryClient();
  const [accountName, setAccountName] = useState(profile.payTo.accountName ?? "");
  const [bsb, setBsb] = useState(profile.payTo.bsb ? formatBsb(profile.payTo.bsb) : "");
  const [accountNumber, setAccountNumber] = useState(profile.payTo.accountNumber ?? "");
  const [payId, setPayId] = useState(profile.payTo.payId ?? "");
  const [cashNote, setCashNote] = useState(profile.payTo.cashNote ?? "");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaOpen, setMfaOpen] = useState(false);
  const [preDue, setPreDue] = useState(profile.preDueReminderDays == null ? "" : String(profile.preDueReminderDays));
  const [invoicePrefix, setInvoicePrefix] = useState(profile.invoicePrefix);
  const [nextNumber, setNextNumber] = useState(String(profile.nextInvoiceNumber));

  const refresh = () => client.invalidateQueries({ queryKey: ["billing-profile", scope] });

  const savePay = useMutation({
    mutationFn: () => {
      const payTo: Parameters<typeof savePayTo>[1] = {};
      if (accountName.trim()) payTo.accountName = accountName.trim();
      const bsbDigits = bsb.replace(/\D/g, "");
      if (bsbDigits) payTo.bsb = bsbDigits;
      const accountDigits = accountNumber.replace(/\D/g, "");
      if (accountDigits) payTo.accountNumber = accountDigits;
      if (payId.trim()) payTo.payId = payId.trim();
      if (cashNote.trim()) payTo.cashNote = cashNote.trim();
      return savePayTo(scope, payTo, mfaCode);
    },
    onSuccess: async () => {
      setMfaOpen(false);
      setMfaCode("");
      await refresh();
      toast.success("Payment details saved");
    },
    onError: (error: Error) => toast.error(error.message || "Payment details could not be saved."),
  });

  const saveSettings = useMutation({
    mutationFn: () => {
      const patch: Parameters<typeof saveBillingProfile>[1] = {
        invoicePrefix,
        nextInvoiceNumber: Number(nextNumber) || profile.nextInvoiceNumber,
        preDueReminderDays: preDue.trim() === "" ? null : Number(preDue),
        attachPdf: profile.attachPdf,
        receiptEmails: profile.receiptEmails,
      };
      if (profile.autoSendTermInvoices !== undefined) {
        patch.autoSendTermInvoices = profile.autoSendTermInvoices;
      }
      return saveBillingProfile(scope, patch);
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Invoice settings saved");
    },
    onError: (error: Error) => toast.error(error.message || "Settings could not be saved."),
  });

  const toggleSetting = useMutation({
    mutationFn: (patch: Partial<typeof profile>) => saveBillingProfile(scope, patch),
    onSuccess: async () => {
      await refresh();
      toast.success("Invoice settings updated");
    },
    onError: () => toast.error("Setting could not be saved."),
  });

  const exporting = useMutation({
    mutationFn: () => exportBillingCsv(),
    onSuccess: (files) => {
      for (const [name, csv] of [
        ["family-invoices.csv", files.invoices],
        ["family-payments.csv", files.payments],
        ["family-credit-notes.csv", files.creditNotes],
      ] as const) {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      toast.success("CSV exported for your accountant");
    },
    onError: () => toast.error("Export could not be prepared."),
  });

  return (
    <div className="space-y-8">
      <section className="border-b border-border py-6" aria-label="Payment details">
        <h2 className="flex items-center gap-3 text-2xl font-semibold" data-tour="settings-payment-details">
          <Landmark aria-hidden className="size-6 text-primary" />
          Payment details
        </h2>
        <p className="mt-2 text-base text-muted-foreground">
          Families see these bank details when Stripe is not connected. Changing them requires a
          six-digit authenticator code (demo: 123456).
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block font-semibold">
            Account name
            <Input className="mt-2" value={accountName} onChange={(event) => setAccountName(event.target.value)} />
          </label>
          <label className="block font-semibold">
            BSB
            <Input
              className="mt-2"
              inputMode="numeric"
              value={bsb}
              onChange={(event) => setBsb(formatBsb(event.target.value))}
              placeholder="000-000"
            />
          </label>
          <label className="block font-semibold">
            Account number
            <Input
              className="mt-2"
              inputMode="numeric"
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
              placeholder={maskAccountNumber(profile.payTo.accountNumber) || "Account number"}
            />
          </label>
          <label className="block font-semibold">
            PayID
            <Input className="mt-2" value={payId} onChange={(event) => setPayId(event.target.value)} />
          </label>
          <label className="block font-semibold sm:col-span-2">
            Cash note
            <Input className="mt-2" value={cashNote} onChange={(event) => setCashNote(event.target.value)} />
          </label>
        </div>
        {!mfaOpen ? (
          <Button className="mt-5" onClick={() => setMfaOpen(true)}>
            Save payment details
          </Button>
        ) : (
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="block font-semibold">
              Authenticator code
              <Input
                className="mt-2 w-40"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
              />
            </label>
            <Button disabled={savePay.isPending || mfaCode.length !== 6} onClick={() => savePay.mutate()}>
              {savePay.isPending ? "Saving…" : "Confirm save"}
            </Button>
            <Button variant="ghost" onClick={() => setMfaOpen(false)}>
              Cancel
            </Button>
          </div>
        )}
      </section>

      <section className="border-b border-border py-6" aria-label="Invoice settings">
        <h2 className="flex items-center gap-3 text-2xl font-semibold">
          <Receipt aria-hidden className="size-6 text-primary" />
          Invoice settings
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block font-semibold">
            Invoice prefix
            <Input
              className="mt-2"
              value={invoicePrefix}
              disabled={Boolean(profile.numberingLockedAt)}
              onChange={(event) => setInvoicePrefix(event.target.value)}
            />
          </label>
          <label className="block font-semibold">
            Next invoice number
            <Input
              className="mt-2"
              inputMode="numeric"
              value={nextNumber}
              disabled={Boolean(profile.numberingLockedAt)}
              onChange={(event) => setNextNumber(event.target.value)}
            />
          </label>
          <label className="block font-semibold sm:col-span-2">
            Pre-due reminder (days before due; blank = off)
            <Input
              className="mt-2"
              inputMode="numeric"
              value={preDue}
              onChange={(event) => setPreDue(event.target.value)}
            />
          </label>
        </div>
        {profile.numberingLockedAt && (
          <p className="mt-3 text-base text-muted-foreground">Numbering is locked after the first send.</p>
        )}
        <div className="mt-5 space-y-4">
          <label className="flex items-center justify-between gap-5 py-2">
            <span className="font-semibold">Attach PDF to invoice emails</span>
            <Switch
              checked={profile.attachPdf}
              onCheckedChange={(value) => toggleSetting.mutate({ attachPdf: value })}
            />
          </label>
          <label className="flex items-center justify-between gap-5 py-2">
            <span className="font-semibold">Send payment receipt emails</span>
            <Switch
              checked={profile.receiptEmails}
              onCheckedChange={(value) => toggleSetting.mutate({ receiptEmails: value })}
            />
          </label>
          <label className="flex items-center justify-between gap-5 py-2">
            <span className="font-semibold">Auto-send reviewed term invoices (Pro)</span>
            <Switch
              checked={Boolean(profile.autoSendTermInvoices)}
              onCheckedChange={(value) => toggleSetting.mutate({ autoSendTermInvoices: value })}
            />
          </label>
        </div>
        <Button className="mt-5" variant="outline" disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
          {saveSettings.isPending ? "Saving…" : "Save invoice settings"}
        </Button>
      </section>

      <section className="border-b border-border py-6" aria-label="Export for accountant">
        <h2 className="text-2xl font-semibold">Export for accountant</h2>
        <p className="mt-2 text-base text-muted-foreground">
          Download a CSV of family invoices including overdue flags for your accountant.
        </p>
        <Button className="mt-4" variant="outline" disabled={exporting.isPending} onClick={() => exporting.mutate()}>
          <Download aria-hidden />
          {exporting.isPending ? "Preparing…" : "Export CSV"}
        </Button>
      </section>
    </div>
  );
}
