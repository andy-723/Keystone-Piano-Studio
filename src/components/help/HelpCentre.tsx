import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  HELP_TOPICS,
  articleText,
  articlesFor,
  type HelpArticle,
  type HelpAudience,
  type HelpLang,
  type HelpTopic,
} from "@/lib/help/articles";
import { searchArticles } from "@/lib/help/search";
import { helpText } from "@/lib/help/ui-text";
import { SupportRequestForm, type SupportMode } from "./SupportRequestForm";
import { ArticleItem } from "./HelpArticles";

export type HelpCentreProps = {
  audience: HelpAudience;
  lang?: HelpLang;
  /** public = signed out (Turnstile + email), live = signed-in session, demo = mock app. */
  mode: SupportMode;
  /** Family portal only: opens Chat with a prefilled message to the teacher. */
  onMessageTeacher?: ((prefill: string) => void) | undefined;
  supportEmail?: string | undefined;
};

export function HelpCentre({
  audience,
  lang = "en",
  mode,
  onMessageTeacher,
  supportEmail,
}: HelpCentreProps) {
  const effectiveLang: HelpLang = audience === "family" ? lang : "en";
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const results = useMemo(
    () => searchArticles(deferred, audience, { lang: effectiveLang, limit: 6 }),
    [deferred, audience, effectiveLang],
  );
  const grouped = useMemo(() => {
    const map = new Map<HelpTopic, HelpArticle[]>();
    for (const article of articlesFor(audience)) {
      map.set(article.topic, [...(map.get(article.topic) ?? []), article]);
    }
    return [...map.entries()];
  }, [audience]);
  const searching = deferred.trim().length >= 2;

  return (
    <div className="space-y-8" data-testid={`help-centre-${audience}`}>
      <section aria-labelledby="help-search-heading">
        <h2 id="help-search-heading" className="sr-only">
          {helpText(effectiveLang, "searchLabel")}
        </h2>
        <label className="relative block">
          <span className="sr-only">{helpText(effectiveLang, "searchLabel")}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={helpText(effectiveLang, "searchPlaceholder")}
            className="min-h-12 pl-10 text-base"
            autoComplete="off"
          />
        </label>
        {searching && (
          <div className="mt-4" aria-live="polite">
            {results.length === 0 ? (
              <p className="text-base text-muted-foreground">
                {helpText(effectiveLang, "noResults")}
              </p>
            ) : (
              <>
                <h3 className="text-lg font-semibold">{helpText(effectiveLang, "resultsFor")}</h3>
                <div className="mt-2">
                  {results.map(({ article }, index) => (
                    <ArticleItem
                      key={article.id}
                      article={article}
                      lang={effectiveLang}
                      onMessageTeacher={onMessageTeacher}
                      defaultOpen={index === 0}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {!searching && (
        <section aria-labelledby="help-browse-heading">
          <h2 id="help-browse-heading" className="text-2xl font-semibold">
            {helpText(effectiveLang, "browse")}
          </h2>
          {grouped.map(([topic, articles]) => (
            <div key={topic} className="mt-6">
              <h3 className="text-lg font-semibold text-muted-foreground">
                {articleText(HELP_TOPICS[topic], effectiveLang)}
              </h3>
              <div className="mt-1">
                {articles.map((article) => (
                  <ArticleItem
                    key={article.id}
                    article={article}
                    lang={effectiveLang}
                    onMessageTeacher={onMessageTeacher}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section
        aria-labelledby="help-contact-heading"
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2 id="help-contact-heading" className="text-2xl font-semibold">
          {helpText(effectiveLang, "stillNeedHelp")}
        </h2>
        <p className="mt-1 text-base text-muted-foreground">
          {helpText(effectiveLang, "stillNeedHelpBody")}
        </p>
        <SupportRequestForm
          audience={audience}
          lang={effectiveLang}
          mode={mode}
          onMessageTeacher={onMessageTeacher}
          searchQuery={deferred}
          supportEmail={supportEmail}
        />
      </section>
    </div>
  );
}
