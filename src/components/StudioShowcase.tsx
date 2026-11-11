import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LaptopFrame } from "@/components/LaptopFrame";
import { AppScreen } from "@/components/DeviceShowcase";
import { FinanceShowcase } from "@/components/FinanceShowcase";
import { CalendarDays, CheckCircle2, FileText, LayoutDashboard, MessageCircle, Receipt } from "lucide-react";

type Feature = "snapshot" | "tax" | "day" | "week" | "chat" | "invoices";
const features = [
  { id: "snapshot", label: "Snapshot", Icon: LayoutDashboard },
  { id: "tax", label: "Tax Lite", Icon: Receipt },
  { id: "day", label: "Attendance", Icon: CheckCircle2 },
  { id: "week", label: "Week view", Icon: CalendarDays },
  { id: "chat", label: "Family chat", Icon: MessageCircle },
  { id: "invoices", label: "Invoices", Icon: FileText },
] as const;

function DeviceContent({ device, initial }: { device: "laptop" | "ipad"; initial: Feature }) {
  const [feature, setFeature] = useState<Feature>(initial);
  return <div className="flex h-[580px] min-w-0 flex-col overflow-hidden bg-mk-paper text-mk-ink">
    <div className="border-b border-mk-gold/40 px-3 py-3">
      <p className="mb-3 font-mk-serif text-xl font-semibold">Keystone Music HQ</p>
      <div role="tablist" aria-label={`${device === "laptop" ? "Laptop" : "iPad"} features`} className="grid grid-cols-3 gap-1">
        {features.map(({ id, label, Icon }) => <Button key={id} id={`${device}-${id}`} role="tab" aria-selected={feature === id} aria-controls={`${device}-panel`} variant="ghost" type="button" onClick={() => setFeature(id)} className={`h-auto min-h-14 flex-col gap-1 whitespace-normal rounded-md px-1 py-2 text-base ${feature === id ? "bg-mk-bronze text-mk-paper hover:bg-mk-ink hover:text-mk-paper" : "text-mk-ink hover:bg-mk-cream"}`}><Icon className="size-5 shrink-0" aria-hidden />{label}</Button>)}
      </div>
    </div>
    <div id={`${device}-panel`} role="tabpanel" aria-labelledby={`${device}-${feature}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {feature === "snapshot" || feature === "tax" ? <><p className="border-b border-mk-gold/30 px-4 py-2 text-base text-mk-ink/70">Planned tool · illustrative preview</p><FinanceShowcase mode={feature} embedded /></> : <div className="h-full"><AppScreen screen={feature} device={device} onNav={setFeature} embedded /></div>}
    </div>
  </div>;
}

export function StudioShowcase() {
  return <div className="mt-10 grid min-w-0 items-start gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-6">
    <div role="region" aria-label="Laptop preview" className="min-w-0">
      <p className="mb-4 text-center text-lg font-medium text-mk-bronze">On your laptop</p>
      <LaptopFrame><DeviceContent device="laptop" initial="snapshot" /></LaptopFrame>
    </div>
    <div role="region" aria-label="iPad preview" className="mx-auto w-full min-w-0 max-w-lg">
      <p className="mb-4 text-center text-lg font-medium text-mk-bronze">On your iPad</p>
      <div className="mk-device overflow-hidden rounded-[28px] border-[10px] border-mk-ink bg-mk-ink p-1">
        <div className="flex h-4 items-center justify-center" aria-hidden><span className="size-1 rounded-full bg-device-lens" /></div>
        <div className="overflow-hidden rounded-[14px]"><DeviceContent device="ipad" initial="tax" /></div>
        <div className="h-3" aria-hidden />
      </div>
    </div>
  </div>;
}