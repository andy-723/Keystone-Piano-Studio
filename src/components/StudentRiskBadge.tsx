import type { RiskScore } from "@/mocks/types";

const labels = { green: "Green", yellow: "Yellow", red: "Red" };
const tones = { green: "border-success bg-success-soft text-success", yellow: "border-warning bg-warning-soft text-foreground", red: "border-destructive bg-card text-destructive" };

export function StudentRiskBadge({ band }: { band: RiskScore["band"] }) {
  return <span className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-1 text-base font-semibold ${tones[band]}`}>
    <span aria-hidden className={`size-3 rounded-full ${band === "green" ? "bg-success" : band === "yellow" ? "bg-warning" : "bg-destructive"}`} />{labels[band]}
  </span>;
}