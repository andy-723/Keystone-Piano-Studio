import { Globe } from "lucide-react";
import { SITE_LANGS, setSiteLang, useSiteLang } from "@/i18n/marketing/site-lang";

export function SiteLanguageSwitcher({ className = "" }: { className?: string }) {
  const lang = useSiteLang();
  return (
    <div
      role="group"
      aria-label="Language · 语言 · Ngôn ngữ"
      data-no-translate
      className={`flex items-center gap-1 rounded-full border border-mk-gold/60 bg-mk-paper p-1 ${className}`}
    >
      <Globe aria-hidden className="mx-1 size-5 shrink-0 text-mk-bronze" />
      {SITE_LANGS.map((option) => (
        <button
          key={option.value}
          type="button"
          lang={option.value === "en" ? "en-AU" : option.value}
          aria-pressed={lang === option.value}
          aria-label={option.label}
          onClick={() => setSiteLang(option.value)}
          className={`min-h-12 min-w-12 rounded-full px-3 text-base font-medium transition-colors ${
            lang === option.value ? "bg-mk-ink text-mk-paper" : "text-mk-ink hover:bg-mk-cream"
          }`}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
