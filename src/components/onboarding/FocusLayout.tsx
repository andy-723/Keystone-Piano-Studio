import type { Lang } from "@/mocks/types";
import { tOnboarding } from "@/i18n/onboarding";
import { Button } from "@/components/ui/button";

export function FocusLayout({
  studioName,
  progress,
  lang,
  onLangChange,
  children,
}: {
  studioName: string;
  progress: number;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  children: React.ReactNode;
}) {
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
        <div className="flex gap-1" role="group" aria-label="Language">
          <Button
            type="button"
            size="sm"
            variant={lang === "en" ? "default" : "outline"}
            aria-pressed={lang === "en"}
            onClick={() => onLangChange("en")}
          >
            EN
          </Button>
          <Button
            type="button"
            size="sm"
            variant={lang === "zh-CN" ? "default" : "outline"}
            aria-pressed={lang === "zh-CN"}
            onClick={() => onLangChange("zh-CN")}
          >
            中文
          </Button>
          <Button
            type="button"
            size="sm"
            variant={lang === "vi" ? "default" : "outline"}
            aria-pressed={lang === "vi"}
            aria-label="Tiếng Việt"
            onClick={() => onLangChange("vi")}
          >
            VI
          </Button>
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
