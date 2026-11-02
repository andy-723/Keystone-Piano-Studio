export function ProgressRing({ percent }: { percent: number }) {
  const circumference = 2 * Math.PI * 64;
  return <div className="relative size-44 shrink-0" role="meter" aria-label="Grade readiness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    <svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden="true">
      <circle cx="80" cy="80" r="64" fill="none" stroke="currentColor" strokeWidth="10" className="text-border" />
      <circle cx="80" cy="80" r="64" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} className="text-success motion-safe:transition-all motion-safe:duration-300" />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-display text-4xl font-semibold">{percent}%</span><span className="text-base text-muted-foreground">ready</span></div>
  </div>;
}