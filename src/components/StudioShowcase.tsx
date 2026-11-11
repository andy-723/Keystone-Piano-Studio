import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LaptopFrame } from "@/components/LaptopFrame";
import { AppScreen } from "@/components/DeviceShowcase";
import { FinanceShowcase } from "@/components/FinanceShowcase";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Laptop,
  Tablet,
  X,
  Maximize2,
} from "lucide-react";

type Feature = "snapshot" | "tax" | "day" | "week" | "chat" | "invoices";
const features = [
  { id: "snapshot", label: "Snapshot", Icon: LayoutDashboard },
  { id: "tax", label: "Tax Lite", Icon: Receipt },
  { id: "day", label: "Attendance", Icon: CheckCircle2 },
  { id: "week", label: "Week view", Icon: CalendarDays },
  { id: "chat", label: "Family chat", Icon: MessageCircle },
  { id: "invoices", label: "Invoices", Icon: FileText },
] as const;

function DeviceContent({
  device,
  initial,
  preview = false,
}: {
  device: "laptop" | "ipad";
  initial: Feature;
  preview?: boolean;
}) {
  const [feature, setFeature] = useState<Feature>(initial);
  return (
    <div
      className={`@container flex min-w-0 flex-col overflow-hidden bg-mk-paper text-mk-ink ${preview ? "mk-showcase-thumbnail" : "mk-showcase-live"}`}
    >
      <div className="mk-showcase-screen-header border-b border-mk-gold/40 px-3 py-3">
        <p className="mb-3 font-mk-serif text-xl font-semibold">Keystone Music HQ</p>
        {!preview && (
          <div
            role="tablist"
            aria-label={`${device === "laptop" ? "Laptop" : "iPad"} features`}
            className="grid grid-cols-2 gap-1 @min-[360px]:grid-cols-3"
          >
            {features.map(({ id, label, Icon }) => (
              <Button
                key={id}
                id={`${device}-${id}`}
                role="tab"
                aria-selected={feature === id}
                aria-controls={`${device}-panel`}
                variant="ghost"
                type="button"
                onClick={() => setFeature(id)}
                className={`h-auto min-h-14 flex-col gap-1 whitespace-normal rounded-md px-1 py-2 text-base ${feature === id ? "bg-mk-bronze text-mk-paper hover:bg-mk-ink hover:text-mk-paper" : "text-mk-ink hover:bg-mk-cream"}`}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {label}
              </Button>
            ))}
          </div>
        )}
      </div>
      <div
        id={preview ? undefined : `${device}-panel`}
        role={preview ? undefined : "tabpanel"}
        aria-labelledby={preview ? undefined : `${device}-${feature}`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {feature === "snapshot" || feature === "tax" ? (
          <>
            <p className="border-b border-mk-gold/30 px-4 py-2 text-base text-mk-ink/70">
              Planned tool · illustrative preview
            </p>
            <FinanceShowcase mode={feature} embedded />
          </>
        ) : (
          <div className="h-full">
            <AppScreen screen={feature} device={device} onNav={setFeature} embedded />
          </div>
        )}
      </div>
    </div>
  );
}

export function StudioShowcase() {
  const [active, setActive] = useState<"laptop" | "ipad" | null>(null);
  return (
    <Dialog
      open={active !== null}
      onOpenChange={(open) => {
        if (!open) setActive(null);
      }}
    >
      <div className="mk-showcase-stage mt-10" data-active={active ?? "none"}>
        {(["laptop", "ipad"] as const).map((device) => (
          <div key={device} className={`mk-showcase-preview mk-showcase-preview-${device}`}>
            <div inert aria-hidden="true">
              <Hardware device={device}>
                <DeviceContent
                  device={device}
                  initial={device === "laptop" ? "snapshot" : "day"}
                  preview
                />
              </Hardware>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActive(device)}
              aria-label={`Open ${device === "laptop" ? "laptop" : "iPad"} preview`}
              className="mk-showcase-open h-full w-full rounded-none hover:bg-transparent"
            >
              <span className="mk-showcase-label">
                <Maximize2 className="size-5" aria-hidden />
                {device === "laptop" ? "Laptop" : "iPad"}
              </span>
            </Button>
          </div>
        ))}
      </div>
      <DialogPortal>
        <DialogOverlay className="mk-showcase-overlay bg-mk-paper/65" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="mk-showcase-popout font-mk-sans text-mk-ink"
          data-device={active ?? "laptop"}
        >
          <DialogTitle className="sr-only">
            Keystone {active === "ipad" ? "iPad" : "laptop"} preview
          </DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              type="button"
              aria-label="Close preview"
              title="Close preview"
              className="mk-showcase-close size-12 shrink-0 rounded-full text-mk-ink hover:bg-mk-paper"
            >
              <X aria-hidden />
            </Button>
          </DialogClose>
          {active && (
            <div key={active} className="mk-showcase-front">
              <Hardware device={active}>
                <DeviceContent device={active} initial={active === "laptop" ? "snapshot" : "day"} />
              </Hardware>
            </div>
          )}
          <div role="group" aria-label="Preview device" className="mk-showcase-controls">
            {(["laptop", "ipad"] as const).map((device) => (
              <Button
                key={device}
                type="button"
                variant="ghost"
                aria-pressed={active === device}
                onClick={() => setActive(device)}
                className="mk-showcase-switch min-h-12 rounded-none px-4 text-base text-mk-ink hover:bg-transparent hover:text-mk-bronze"
              >
                {device === "laptop" ? <Laptop aria-hidden /> : <Tablet aria-hidden />}
                {device === "laptop" ? "Laptop" : "iPad"}
              </Button>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function Hardware({ device, children }: { device: "laptop" | "ipad"; children: React.ReactNode }) {
  if (device === "laptop") return <LaptopFrame>{children}</LaptopFrame>;
  return (
    <div className="mk-showcase-tablet mk-device">
      <div className="mk-tablet-camera" aria-hidden>
        <span />
      </div>
      <div className="mk-tablet-display">{children}</div>
      <div className="mk-tablet-home" aria-hidden>
        <span />
      </div>
    </div>
  );
}
