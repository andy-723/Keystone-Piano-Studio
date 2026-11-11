import { useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getMarketingFinance, homeOfficeEstimateCents, marketingSnapshotCsv, marketingTaxCsv } from "@/services/marketing-finance";
import type { SnapshotPeriod, SnapshotSignal } from "@/mocks/marketing-finance";
import { ArrowDownToLine, ArrowRight, Laptop, Tablet, Check, Receipt, Clock, Wallet, Users, Mail, BookOpen, Heart } from "lucide-react";

export const marketingFinanceQuery = queryOptions({ queryKey: ["marketing-finance"], queryFn: getMarketingFinance });
const signals: { id: SnapshotSignal; label: string; Icon: typeof Wallet }[] = [
  { id: "collected", label: "Revenue collected", Icon: Wallet },
  { id: "overdue", label: "Overdue", Icon: Receipt },
  { id: "students", label: "Active students", Icon: Users },
  { id: "invites", label: "Incomplete invites", Icon: Mail },
  { id: "practice", label: "Practice at risk", Icon: Heart },
  { id: "lessons", label: "Lessons delivered", Icon: BookOpen },
];
const money = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);

function download(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

export function FinanceShowcase({ mode }: { mode: "snapshot" | "tax" }) {
  const { data } = useSuspenseQuery(marketingFinanceQuery);
  const [device, setDevice] = useState<"laptop" | "ipad">("laptop");
  const [period, setPeriod] = useState<SnapshotPeriod>("week");
  const [signal, setSignal] = useState<SnapshotSignal>("overdue");
  const [taxView, setTaxView] = useState("summary");
  const [passed, setPassed] = useState(false);
  return <div className="mt-7 min-w-0">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label={`${mode} device`} className="flex gap-1">
        {(["laptop", "ipad"] as const).map(d => <Button key={d} type="button" variant="ghost" aria-pressed={device === d} onClick={() => setDevice(d)} className={device === d ? "bg-mk-ink text-mk-paper hover:bg-mk-bronze hover:text-mk-paper" : "text-mk-bronze hover:bg-mk-cream"}>{d === "laptop" ? <Laptop aria-hidden /> : <Tablet aria-hidden />}{d === "laptop" ? "Laptop" : "iPad"}</Button>)}
      </div>
      <p className="text-base text-mk-ink/70">Planned tools · illustrative preview</p>
    </div>
    <div className={`mk-device mx-auto overflow-hidden border-[8px] border-mk-ink bg-mk-paper ${device === "ipad" ? "max-w-2xl rounded-[24px]" : "w-full rounded-lg"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mk-gold/50 px-4 py-3 sm:px-6"><span className="font-mk-serif text-xl font-semibold">Keystone <span className="text-mk-bronze">/ {mode === "snapshot" ? "Snapshot" : "Tax Lite"}</span></span><span className="text-base text-mk-ink/70">Owner view</span></div>
      <div className="p-4 sm:p-6">
        {mode === "snapshot" ? <>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-mk-serif text-2xl font-semibold">Your studio pulse</h3><p className="text-base text-mk-ink/70">{data[period].label} · Sydney</p></div><div role="group" aria-label="Snapshot period" className="flex gap-1">{(["week", "month"] as const).map(p => <Button key={p} variant="ghost" aria-pressed={period === p} onClick={() => setPeriod(p)} className={period === p ? "bg-mk-bronze text-mk-paper hover:bg-mk-ink hover:text-mk-paper" : "text-mk-bronze hover:bg-mk-cream"}>{p === "week" ? "Week" : "Month"}</Button>)}</div></div>
          <div className="mt-5 grid grid-cols-2 gap-px border-y border-mk-gold/50 bg-mk-gold/30 lg:grid-cols-3">{signals.map(({ id, label, Icon }) => <Button key={id} variant="ghost" aria-pressed={signal === id} onClick={() => setSignal(id)} className={`h-auto min-h-28 flex-col items-start justify-start rounded-none p-3 text-left sm:p-5 ${signal === id ? "bg-mk-cream text-mk-bronze hover:bg-mk-cream" : "bg-mk-paper text-mk-ink hover:bg-mk-cream"}`}><span className="flex items-center gap-2 text-base"><Icon className="size-5 shrink-0" aria-hidden />{label}</span><span className="font-mk-serif text-3xl tabular-nums">{data[period][id]}</span></Button>)}</div>
          <div key={`${period}-${signal}`} className="mk-screen mt-5 min-h-[220px]" aria-live="polite"><h4 className="text-lg font-semibold">{signals.find(s => s.id === signal)?.label}</h4><ul className="mt-2 divide-y divide-mk-gold/30">{data.lists[signal].map(([name, detail], i) => <li key={name} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-3 text-base"><span>{name}</span><span className="text-mk-ink/70">{signal === "collected" && i === 2 ? `${data[period].collected} total` : signal === "overdue" && period === "month" && i === 1 ? "$420 · 3 days overdue" : signal === "lessons" && period === "month" ? ["72 lessons", "9 lessons", "3 lessons"][i] : detail}</span></li>)}</ul></div>
          <Button variant="ghost" className="mt-2 text-mk-bronze hover:bg-mk-cream" onClick={() => download(marketingSnapshotCsv(period), `keystone-example-${period}.csv`)}><ArrowDownToLine aria-hidden />Export example CSV</Button>
        </> : <>
          <div><h3 className="font-mk-serif text-2xl font-semibold">The year, ready to review</h3><p className="text-base text-mk-ink/70">Australian FY · 1 Jul 2026–30 Jun 2027</p></div>
          <div className="mt-4 flex flex-wrap gap-1" role="group" aria-label="Tax Lite view">{[["summary", "Summary"], ["costs", "Student costs"], ["hours", "Home studio"]].map(([id, label]) => <Button key={id} variant="ghost" aria-pressed={taxView === id} onClick={() => setTaxView(id)} className={taxView === id ? "bg-mk-bronze text-mk-paper hover:bg-mk-ink hover:text-mk-paper" : "text-mk-bronze hover:bg-mk-cream"}>{label}</Button>)}</div>
          <div key={taxView} className="mk-screen mt-5 min-h-[270px]" aria-live="polite">
            {taxView === "summary" ? <dl className="divide-y divide-mk-gold/40">{[["Gross tuition collected", money(data.tax.grossCents)], ["Stripe merchant fees", money(data.tax.stripeFeesCents)], ["Teaching & admin hours", `${data.tax.hours} hrs`], ["Home-office estimate", money(homeOfficeEstimateCents(data.tax.hours, data.tax.rateCents))]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-4"><dt className="text-lg">{label}</dt><dd className="font-mk-serif text-2xl font-semibold tabular-nums">{value}</dd></div>)}</dl> : taxView === "costs" ? <div><Receipt className="size-8 text-mk-bronze" aria-hidden /><h4 className="mt-3 font-mk-serif text-2xl font-semibold">AMEB book · Lucy Chen</h4><p className="mt-2 text-lg">{money(data.tax.bookCents)} paid by the studio</p><p className="mt-3 text-base text-mk-ink/70">Reimbursement · separate from tuition income</p><Button className="mt-5 bg-mk-bronze text-mk-paper hover:bg-mk-ink" disabled={passed} onClick={() => setPassed(true)}>{passed ? <Check aria-hidden /> : <ArrowRight aria-hidden />}{passed ? "Added to next example invoice" : "Pass on to student"}</Button></div> : <div><Clock className="size-8 text-mk-bronze" aria-hidden /><h4 className="mt-3 font-mk-serif text-2xl font-semibold">Home studio hours</h4><p className="mt-4 text-3xl font-semibold">480 hrs × 70¢ = $336</p><p className="mt-4 text-lg text-mk-ink/70">Teaching and admin, together. An illustrative fixed-rate estimate; check eligibility and the applicable ATO rate.</p></div>}
          </div>
          <Button variant="ghost" className="mt-3 text-mk-bronze hover:bg-mk-cream" onClick={() => download(marketingTaxCsv(), "keystone-illustrative-tax-pack.csv")}><ArrowDownToLine aria-hidden />Export example tax pack</Button>
        </>}
      </div>
    </div>
  </div>;
}