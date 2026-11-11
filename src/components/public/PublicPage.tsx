import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";

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
 * Standalone public web page (Help, Privacy, Terms). Renders outside the app shell,
 * needs no session and loads no studio data. Every link goes back to /login, never into the app.
 */
export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#F5EBD6] text-[#15100D]">
      <header className="border-b border-[#DDD0B4] bg-[#FBF7EE]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <a href="/login" aria-label="Keystone Music HQ sign in">
            <BrandLogo variant="horizontal" alt="Keystone Music HQ" />
          </a>
          <a
            href="/login"
            className="ks-btn ks-btn-secondary"
          >
            Sign in
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="m-0 font-serif text-4xl font-semibold">{title}</h1>
        <div className="mt-6 space-y-4 text-base leading-relaxed text-[#2E261F]">{children}</div>
      </main>
      <footer className="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-1 px-5 pb-10 text-sm text-[#6B6052]">
        <a href="/help" className="text-[#604A19] hover:text-[#15100D]">
          Help
        </a>
        <a href="/privacy" className="text-[#604A19] hover:text-[#15100D]">
          Privacy
        </a>
        <a href="/terms" className="text-[#604A19] hover:text-[#15100D]">
          Terms
        </a>
        <span>Data hosted in Sydney, Australia</span>
      </footer>
    </div>
  );
}

/** Minimal renderer for the legal markdown we ship (#, ##, ###, paragraphs, "- " lists). */
export function LegalMarkdown({ markdown }: { markdown: string }) {
  const blocks = markdown.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        const out: ReactNode[] = [];
        let para: string[] = [];
        let list: string[] = [];
        const flush = () => {
          if (para.length) {
            out.push(<p key={`p${out.length}`}>{para.join(" ")}</p>);
            para = [];
          }
          if (list.length) {
            out.push(
              <ul key={`u${out.length}`} className="list-disc space-y-1 pl-6">
                {list.map((item, i) => (
                  <li key={i}>{item}</li>
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
                <h2 key={`h${out.length}`} className="pt-4 text-2xl font-semibold">
                  {text}
                </h2>
              ) : (
                <h3 key={`h${out.length}`} className="pt-2 text-lg font-semibold">
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
    </>
  );
}
