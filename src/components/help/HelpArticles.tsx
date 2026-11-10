import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { articleText, type HelpArticle, type HelpLang } from "@/lib/help/articles";
import { helpText } from "@/lib/help/ui-text";

/** Renders an article body: blank-line paragraphs and "- " bullet lines. */
export function ArticleBody({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {text.split(/\n{2,}/).map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.every((line) => line.startsWith("- "))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-6">
              {lines.map((line, i) => (
                <li key={i}>{line.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{lines.join(" ")}</p>;
      })}
    </div>
  );
}

export function AskStudioCallout({
  lang,
  title,
  onMessageTeacher,
}: {
  lang: HelpLang;
  title: string;
  onMessageTeacher?: ((prefill: string) => void) | undefined;
}) {
  return (
    <div
      className="mt-4 rounded-lg border border-border bg-secondary/60 p-4"
      data-testid="ask-studio"
    >
      <p className="font-semibold">{helpText(lang, "askStudioTitle")}</p>
      <p className="mt-1 text-base text-muted-foreground">{helpText(lang, "askStudioBody")}</p>
      {onMessageTeacher ? (
        <Button className="mt-3 min-h-11" onClick={() => onMessageTeacher(`${title}\n`)}>
          <MessageCircle aria-hidden />
          {helpText(lang, "messageTeacher")}
        </Button>
      ) : (
        <p className="mt-2 text-base">{helpText(lang, "askStudioSignedOut")}</p>
      )}
    </div>
  );
}

export function ArticleItem({
  article,
  lang,
  onMessageTeacher,
  defaultOpen,
}: {
  article: HelpArticle;
  lang: HelpLang;
  onMessageTeacher?: ((prefill: string) => void) | undefined;
  defaultOpen?: boolean | undefined;
}) {
  const title = articleText(article.title, lang);
  return (
    <details
      className="group border-b border-border py-1"
      open={defaultOpen}
      data-article={article.id}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 text-base font-semibold [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span
          aria-hidden
          className="text-muted-foreground transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="pb-4 text-base leading-relaxed">
        <ArticleBody text={articleText(article.body, lang)} />
        {article.studioAnswers && (
          <AskStudioCallout lang={lang} title={title} onMessageTeacher={onMessageTeacher} />
        )}
      </div>
    </details>
  );
}
