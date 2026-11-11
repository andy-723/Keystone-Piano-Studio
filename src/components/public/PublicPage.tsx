import { useSiteLang } from "@/i18n/marketing/site-lang";
import type { ReactNode } from "react";
import { MarketingNavbar } from "@/components/MarketingNavbar";
import { MarketingFooter } from "@/components/MarketingFooter";

/** Support address shown on public pages. Set VITE_SUPPORT_EMAIL in Vercel. */
export function publicSupportEmail(): string {
  const env =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined> | undefined)
      : undefined;
  const value = env?.["VITE_SUPPORT_EMAIL"]?.trim();
  return value || "support@keystonemusichq.com";
}

/**
 * Standalone public web page (Help, Contact, Privacy, Terms, Disclaimer) in the marketing
 * theme: shared navbar, ink hero band, paper content card and marketing footer.
 * Needs no session and loads no studio data.
 */
export function PublicPage({
  title,
  intro,
  eyebrow = "LEGAL",
  children,
}: {
  title: string;
  intro?: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-mk-cream font-mk-sans text-mk-ink antialiased">
      <MarketingNavbar />
      <section className="relative isolate overflow-hidden bg-mk-ink text-mk-paper">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-40"
          style={{ background: "var(--mk-essentials-pattern)" }}
        />
        <div className="mx-auto max-w-4xl px-5 py-12 md:px-10 md:py-16">
          <p className="flex items-center gap-3 text-base font-medium text-mk-gold">
            <span className="h-px w-8 bg-mk-gold" aria-hidden />
            {eyebrow}
          </p>
          <h1 className="mt-4 font-mk-serif text-4xl font-semibold leading-tight md:text-5xl">
            {title}
          </h1>
          {intro ? (
            <p className="mt-4 max-w-2xl text-xl leading-relaxed text-mk-paper/85">{intro}</p>
          ) : null}
        </div>
      </section>
      <main className="mx-auto -mt-6 max-w-4xl px-5 pb-16 md:px-10">
        <div className="mk-public-card rounded-2xl border border-mk-gold/50 bg-mk-paper p-6 shadow-[var(--shadow-mk-lift)] md:p-10">
          <div className="space-y-4 text-lg leading-relaxed text-mk-ink/85">{children}</div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

/** Minimal renderer for the legal markdown we ship (#, ##, ###, paragraphs, "- " lists). */
/** Renders **bold** spans inside a line of legal text. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function LegalMarkdown({ markdown }: { markdown: string }) {
  const blocks = markdown.trim().split(/\n{2,}/);
  const lang = useSiteLang();
  return (
    <>
    {lang !== "en" && (
      <p role="note" className="rounded-xl border border-mk-gold/60 bg-mk-cream px-4 py-3 text-base font-medium text-mk-ink">
        This document is available in English only. The English version applies.
      </p>
    )}
    <div data-no-translate className="contents">
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        if (lines.length >= 2 && lines.every((line) => line.trim().startsWith("|"))) {
          const [head = "", , ...body] = lines;
          return (
            <div key={index} className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-base">
                <thead>
                  <tr>
                    {cells(head).map((cell, i) => (
                      <th
                        key={i}
                        className="border-b border-mk-gold/40 py-2 pr-4 font-semibold text-mk-ink"
                      >
                        {inline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, r) => (
                    <tr key={r}>
                      {cells(row).map((cell, i) => (
                        <td key={i} className="border-b border-mk-gold/20 py-2 pr-4 align-top">
                          {inline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const out: ReactNode[] = [];
        let para: string[] = [];
        let list: string[] = [];
        const flush = () => {
          if (para.length) {
            const text = para.join(" ");
            out.push(
              text.startsWith("> ") ? (
                <p key={`p${out.length}`} className="border-l-2 border-mk-gold pl-4">
                  {inline(text.slice(2))}
                </p>
              ) : (
                <p key={`p${out.length}`}>{inline(text)}</p>
              ),
            );
            para = [];
          }
          if (list.length) {
            out.push(
              <ul key={`u${out.length}`} className="list-disc space-y-1 pl-6 marker:text-mk-gold">
                {list.map((item, i) => (
                  <li key={i}>{inline(item)}</li>
                ))}
              </ul>,
            );
            list = [];
          }
        };
        for (const line of lines) {
          const heading = /^(#{1,3})\s+(.*)$/.exec(line);
          if (heading) {
            flush();
            const level = heading[1]?.length ?? 0;
            const text = heading[2] ?? "";
            if (level === 1) continue; // page title is rendered by PublicPage
            out.push(
              level === 2 ? (
                <h2
                  key={`h${out.length}`}
                  className="mt-6 border-t border-mk-gold/40 pt-6 font-mk-serif text-2xl font-semibold text-mk-ink first:mt-0 first:border-0 first:pt-0"
                >
                  {text}
                </h2>
              ) : (
                <h3 key={`h${out.length}`} className="pt-2 text-xl font-semibold text-mk-bronze">
                  {text}
                </h3>
              ),
            );
          } else if (line.startsWith("- ")) {
            if (para.length) flush();
            list.push(line.slice(2));
          } else if (line.trim()) {
            if (list.length) flush();
            para.push(line.trim());
          }
        }
        flush();
        return <div key={index}>{out}</div>;
      })}
    </div>
    </>
  );
}
