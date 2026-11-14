import { tOnboarding } from "@/i18n/onboarding";
import { Button } from "@/components/ui/button";
import { setSiteLang, useSiteLang, type SiteLang } from "@/i18n/marketing/site-lang";

const LANGS: { value: SiteLang; label: string; short: string }[] = [
  { value: "en", label: "English", short: "EN" },
  { value: "zh-CN", label: "中文", short: "中文" },
  { value: "vi", label: "Tiếng Việt", short: "VI" },
];

/**
 * Focus-mode frame for family join and studio-terms onboarding.
 * Language follows the shared `keystone.siteLang` preference (same as the signed-in shell).
 */
export function FocusLayout({
  studioName,
  progress,
  children,
}: {
  studioName: string;
  progress: number;
  children: React.ReactNode;
}) {
  const lang = useSiteLang();
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[hsl(40_33%_96%)] text-foreground">
      <div className="h-1 w-full bg-border" aria-hidden>
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="truncate text-lg font-semibold tracking-tight">{studioName}</p>
        <div className="flex gap-1" role="group" aria-label={tOnboarding(lang, "language")} data-no-translate>
          {LANGS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={lang === option.value ? "default" : "outline"}
              aria-pressed={lang === option.value}
              aria-label={option.label}
              lang={option.value === "en" ? "en-AU" : option.value}
              onClick={() => setSiteLang(option.value)}
            >
              {option.short}
            </Button>
          ))}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-8 pt-4 sm:px-6">
        {children}
      </main>
      <footer className="px-4 py-4 text-center text-sm text-muted-foreground sm:px-6">
        {tOnboarding(lang, "powered")}
      </footer>
    </div>
  );
}
