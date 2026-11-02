import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Check, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parentRenewalsQuery } from "@/lib/renewal-queries";
import { respondToParentRenewal } from "@/services/renewals";
import { useParentLanguage, parentDate } from "@/i18n/parent";
import { addDays, melbourneIso } from "@/lib/calendar";
import { formatTime } from "@/lib/format";

export function ParentRenewal() {
  const { data } = useSuspenseQuery(parentRenewalsQuery);
  return <>{data.map((renewal) => <RenewalCard key={renewal.termNumber} data={renewal} />)}</>;
}
function RenewalCard({ data }: { data: Awaited<ReturnType<typeof import("@/services/renewals").getParentRenewals>>[number] }) {
  const { t, lang } = useParentLanguage();
  const [choice, setChoice] = useState<"confirmed" | "change_requested" | "declined">("confirmed");
  const [note, setNote] = useState("");
  const client = useQueryClient();
  const responding = useMutation({ mutationFn: () => respondToParentRenewal(choice, note, data.termNumber), onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ["parent"] }), client.invalidateQueries({ queryKey: ["renewals"] }), client.invalidateQueries({ queryKey: ["chat-threads"] }), client.invalidateQueries({ queryKey: ["messages"] }), client.invalidateQueries({ queryKey: ["term2-drafts"] })]); toast.success(t("renewalSaved"));
  }, onError: () => toast.error(t("renewalError")) });
  if (!data) return null;
  return <section className="mt-6 border-y-2 border-primary py-6" aria-labelledby={`parent-renewal-${data.termNumber}`}><h2 id={`parent-renewal-${data.termNumber}`} className="flex items-center gap-2 text-2xl font-semibold"><CalendarDays aria-hidden className="size-6 text-primary" />{t("renewalTitle").replace("{term}", String(data.termNumber))}</h2><p className="mt-3 text-base">{parentDate(data.term.start, lang)} – {parentDate(data.term.end, lang)}</p><p className="mt-2 text-base font-semibold">{t("renewalDeadline")} {parentDate(data.deadline, lang)}</p>
    <div className="mt-4 space-y-2">{data.slots.map((slot) => { const date = addDays(data.term.start, (slot.weekday + 6) % 7); return <p key={slot.studentId} className="text-base">{slot.name} · {new Intl.DateTimeFormat(lang === "en" ? "en-AU" : "zh-CN", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))} · {formatTime(melbourneIso(date, slot.time))}</p>; })}</div>
    {data.status !== "awaiting" ? <div className="mt-5 border-l-4 border-success pl-4"><p className="flex items-center gap-2 font-semibold"><Check aria-hidden />{t(data.status === "confirmed" ? "renewalConfirmed" : data.status === "declined" ? "renewalDeclined" : "renewalChangeSent")}</p>{data.responseNote && <p className="mt-3 whitespace-pre-wrap break-words text-base">{data.responseNote}</p>}</div> : <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); if (!responding.isPending) responding.mutate(); }}>
      <fieldset className="space-y-2"><legend className="mb-3 text-lg font-semibold">{t("renewalQuestion")}</legend>{(["confirmed", "change_requested", "declined"] as const).map((value) => <label key={value} className="flex min-h-14 cursor-pointer items-start gap-3 border-b border-border py-3"><input type="radio" name={`renewal-response-${data.termNumber}`} value={value} checked={choice === value} disabled={responding.isPending} onChange={() => setChoice(value)} className="mt-1 size-5 shrink-0 accent-primary" /><span>{t(value === "confirmed" ? "renewalContinue" : value === "change_requested" ? "renewalChange" : "renewalStop")}</span></label>)}</fieldset>
      {choice !== "confirmed" && <label className="block text-base">{t("renewalNote")}<textarea value={note} onChange={(event) => setNote(event.target.value)} required={choice === "change_requested"} disabled={responding.isPending} rows={3} className="mt-2 w-full rounded-md border border-input bg-card p-3 text-lg" /></label>}
      <Button type="submit" disabled={responding.isPending || (choice === "change_requested" && !note.trim())} className="w-full whitespace-normal"><Check aria-hidden />{responding.isPending ? t("sending") : t("renewalSubmit")}</Button>
    </form>}
  </section>;
}