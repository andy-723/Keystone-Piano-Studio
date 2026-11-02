import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, Landmark, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useParentLanguage } from "@/i18n/parent";
import { payParentInvoice } from "@/services/parent";
import { formatAUD } from "@/lib/format";
import type { Invoice } from "@/mocks/types";

export function ParentPayment({ invoice }: { invoice: Invoice }) {
  const { t } = useParentLanguage();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"payto" | "debit" | "card">("payto");
  const [done, setDone] = useState(false);
  const client = useQueryClient();
  const paying = useMutation({ mutationFn: () => payParentInvoice(invoice.id, method), onSuccess: async () => { setDone(true); await Promise.all([client.invalidateQueries({ queryKey: ["parent"] }), client.invalidateQueries({ queryKey: ["invoices"] }), client.invalidateQueries({ queryKey: ["invoice"] })]); }, onError: () => toast.error(t("paymentError")) });
  return <><Button onClick={() => setOpen(true)} className="w-full whitespace-normal"><CreditCard aria-hidden />{t("payNow")}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md [&>button:last-child]:hidden" aria-describedby="payment-description"><DialogTitle>{done ? t("paymentDone") : t("paymentTitle")}</DialogTitle><p id="payment-description" className="text-base text-muted-foreground">{t("paymentMock")}</p>{done ? <Check aria-hidden className="size-12 text-success" /> : <><p className="text-2xl font-semibold">{formatAUD(invoice.totalCents)}</p><fieldset className="space-y-2"><legend className="mb-2 text-base">{t("paymentMethod")}</legend>{(["payto", "debit", "card"] as const).map((value) => <label key={value} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border p-3"><input type="radio" name="payment-method" value={value} checked={method === value} onChange={() => setMethod(value)} disabled={paying.isPending} className="size-5 accent-primary" />{value === "card" ? <CreditCard aria-hidden className="size-5" /> : <Landmark aria-hidden className="size-5" />}{value === "payto" ? "PayTo" : t(value === "debit" ? "directDebit" : "card")}</label>)}</fieldset><Button disabled={paying.isPending} className="whitespace-normal" onClick={() => paying.mutate()}>{t("paymentConfirm")}</Button></>}<Button variant="outline" disabled={paying.isPending} onClick={() => setOpen(false)}><X aria-hidden />{t("close")}</Button></DialogContent></Dialog></>;
}