import { Button } from "@/components/ui/button";
import { SITE_LANGS, setSiteLang, useSiteLang } from "@/i18n/marketing/site-lang";
import { translate } from "@/i18n/parent";

/**
 * In-app language control (studio shell, family portal, admin, login). Writes the same
 * `keystone.siteLang` preference as the public SiteLanguageSwitcher.
 */
export function AppLanguageSwitcher({
  className = "",
  "aria-label": ariaLabel,
  "data-tour": dataTour,
}: {
  className?: string;
  "aria-label"?: string;
  "data-tour"?: string;
}) {
  const lang = useSiteLang();
  const label = ariaLabel ?? translate(lang, "language");
  return (
    <div
      role="group"
      aria-label={label}
      data-no-translate
      {...(dataTour ? { "data-tour": dataTour } : {})}
      className={`flex flex-wrap gap-1 ${className}`}
    >
      {SITE_LANGS.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={lang === option.value ? "secondary" : "ghost"}
          aria-pressed={lang === option.value}
          aria-label={option.label}
          lang={option.value === "en" ? "en-AU" : option.value}
          onClick={() => setSiteLang(option.value)}
          className={option.value === "zh-CN" ? "min-h-11 whitespace-nowrap" : "min-h-11"}
        >
          {option.short}
        </Button>
      ))}
    </div>
  );
}
