import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Check, Copy, CreditCard, Landmark, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useParentLanguage } from "@/i18n/parent";
import { payParentInvoice } from "@/services/parent";
import { formatAUD } from "@/lib/format";
import { stripeStatusQuery } from "@/lib/integration-queries";
import { formatBsb, getBillingProfile } from "@/services/billing-profile";
import { queryOptions } from "@tanstack/react-query";
import type { Invoice } from "@/mocks/types";

const payToQuery = queryOptions({
  queryKey: ["billing-profile", "demo", "pay-to"],
  queryFn: () => getBillingProfile("demo"),
});

async function copyText(label: string, value: string, copied: string, failed: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(copied.replace("{field}", label));
  } catch {
    toast.error(failed);
  }
}

export function ParentPayment({ invoice }: { invoice: Invoice }) {
  const { t } = useParentLanguage();
  const { data: stripeStatus } = useSuspenseQuery(stripeStatusQuery);
  const { data: profile } = useSuspenseQuery(payToQuery);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"payto" | "becs" | "card">("payto");
  const [done, setDone] = useState(false);
  const client = useQueryClient();
  const payTo = invoice.snapshot?.payTo ?? profile.payTo;
  const reference = invoice.number ?? invoice.id;
  const close = () => {
    setOpen(false);
    if (done) {
      void Promise.all([
        client.invalidateQueries({ queryKey: ["parent"] }),
        client.invalidateQueries({ queryKey: ["invoices"] }),
        client.invalidateQueries({ queryKey: ["invoice"] }),
      ]);
    }
  };
  const paying = useMutation({
    mutationFn: () => payParentInvoice(invoice.id, method),
    onSuccess: () => {
      setDone(true);
    },
    onError: () => toast.error(t("paymentError")),
  });

  const bankBlock = (
    <div className="space-y-3" role="status">
      <p className="text-lg font-semibold">{t("payToHeading")}</p>
      {payTo.accountName && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base">
            <span className="text-muted-foreground">{t("accountName")}: </span>
            {payTo.accountName}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyText(t("accountName"), payTo.accountName!, t("copiedField"), t("copyFailed"))}
          >
            <Copy aria-hidden className="size-4" />
            {t("copy")}
          </Button>
        </div>
      )}
      {payTo.bsb && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base">
            <span className="text-muted-foreground">BSB: </span>
            {formatBsb(payTo.bsb)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyText("BSB", payTo.bsb!.replace(/\D/g, ""), t("copiedField"), t("copyFailed"))}
          >
            <Copy aria-hidden className="size-4" />
            {t("copy")}
          </Button>
        </div>
      )}
      {payTo.accountNumber && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base">
            <span className="text-muted-foreground">{t("accountNumber")}: </span>
            {payTo.accountNumber}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void copyText(t("accountNumber"), payTo.accountNumber!, t("copiedField"), t("copyFailed"))
            }
          >
            <Copy aria-hidden className="size-4" />
            {t("copy")}
          </Button>
        </div>
      )}
      {payTo.payId && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base">
            <span className="text-muted-foreground">PayID: </span>
            {payTo.payId}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyText("PayID", payTo.payId!, t("copiedField"), t("copyFailed"))}
          >
            <Copy aria-hidden className="size-4" />
            {t("copy")}
          </Button>
        </div>
      )}
      <p className="text-base">
        <span className="text-muted-foreground">{t("paymentReference")}: </span>
        <span className="font-semibold">{reference}</span>
      </p>
      <p className="border-l-4 border-border pl-3 text-base text-muted-foreground">{t("teacherMarksPaid")}</p>
    </div>
  );

  return (
    <>
      <Button onClick={() => setOpen(true)} className="w-full whitespace-normal">
        <CreditCard aria-hidden />
        {stripeStatus === "connected" ? t("payNow") : t("viewPayTo")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
          else setOpen(true);
        }}
      >
        <DialogContent className="max-w-md [&>button:last-child]:hidden" aria-describedby="payment-description">
          <DialogTitle>{done ? t("paymentDone") : t("paymentTitle")}</DialogTitle>
          <p id="payment-description" className="text-base text-muted-foreground">
            {stripeStatus === "connected" ? t("paymentMock") : t("bankTransferHint")}
          </p>
          {done ? (
            <Check aria-hidden className="size-12 text-success" />
          ) : stripeStatus !== "connected" ? (
            bankBlock
          ) : (
            <>
              <p className="text-2xl font-semibold">{formatAUD(invoice.balanceCents ?? invoice.totalCents)}</p>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-base">{t("paymentMethod")}</legend>
                {(["payto", "becs", "card"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border p-3"
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      value={value}
                      checked={method === value}
                      onChange={() => setMethod(value)}
                      disabled={paying.isPending}
                      className="size-5 accent-primary"
                    />
                    {value === "card" ? (
                      <CreditCard aria-hidden className="size-5" />
                    ) : (
                      <Landmark aria-hidden className="size-5" />
                    )}
                    {value === "payto" ? "PayTo" : t(value === "becs" ? "directDebit" : "card")}
                  </label>
                ))}
              </fieldset>
              <Button disabled={paying.isPending} className="whitespace-normal" onClick={() => paying.mutate()}>
                {t("paymentConfirm")}
              </Button>
            </>
          )}
          <Button variant="outline" disabled={paying.isPending} onClick={close}>
            <X aria-hidden />
            {t("close")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
