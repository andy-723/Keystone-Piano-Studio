import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useParentLanguage } from "@/i18n/parent";
import { acceptStudioTerms, dismissMinorTermsNotice, getFamilyAppTerms, getReacceptanceStatus } from "@/services/terms";
import { getParentSession } from "@/services/parent";
import { useState } from "react";

export function ReacceptanceCard({
  onMessageTeacher,
  onLater,
}: {
  onMessageTeacher: (prefill: string) => void;
  onLater: () => void;
}) {
  const { lang } = useParentLanguage();
  const status = useQuery({ queryKey: ["terms-reaccept"], queryFn: () => getReacceptanceStatus("demo") });
  const appTerms = useQuery({ queryKey: ["family-app-terms"], queryFn: getFamilyAppTerms });
  const [agreed, setAgreed] = useState(false);
  const client = useQueryClient();
  const accept = useMutation({
    mutationFn: async () => {
      const data = status.data;
      if (!data || !("version" in data) || !data.version || !appTerms.data?.version) throw new Error("Nothing to accept.");
      const session = await getParentSession();
      return acceptStudioTerms({
        versionId: data.version.id,
        appTermsVersionId: appTerms.data.version.id,
        typedName: session.guardian.name,
        capacity: "guardian",
        relationship: "parent",
        guardianDeclaration: true,
        studentIds: session.children.map((child) => child.id),
        consents: [],
        method: "reaccept",
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["terms-reaccept"] }),
  });
  const dismiss = useMutation({
    mutationFn: dismissMinorTermsNotice,
    onSuccess: () => client.invalidateQueries({ queryKey: ["terms-reaccept"] }),
  });

  if (!status.data || !status.data.needed || !("version" in status.data)) return null;
  const data = status.data;
  const version = data.version!;
  const isMaterial = data.kind === "material";

  if (!isMaterial) {
    return (
      <section className="fixed inset-0 z-40 flex items-end justify-center bg-background/80 p-4 sm:items-center">
        <div className="w-full max-w-lg border border-border bg-card p-6">
          <h2 className="text-2xl font-semibold">{lang === "zh-CN" ? "条款小幅更新" : "A small terms update"}</h2>
          <p className="mt-3">{version.changeSummary}</p>
          <Button className="mt-5 w-full" onClick={() => dismiss.mutate()}>{lang === "zh-CN" ? "知道了" : "Got it"}</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="fixed inset-0 z-40 flex items-end justify-center bg-background/90 p-4 sm:items-center" aria-modal role="dialog">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto border border-border bg-card p-6">
        <h2 className="text-2xl font-semibold">
          {lang === "zh-CN"
            ? `${data.studioName} 已更新条款。变更自 ${version.effectiveAt} 起生效。`
            : `${data.studioName} has updated its terms. The changes start on ${version.effectiveAt}.`}
        </h2>
        <p className="mt-4 text-base">{version.changeSummary}</p>
        <details className="mt-4 border-y border-border py-3">
          <summary className="min-h-12 cursor-pointer font-semibold">{lang === "zh-CN" ? "阅读完整条款" : "Read the full terms"}</summary>
          <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap font-sans text-base">{version.renderedMarkdown}</pre>
        </details>
        <p className="mt-4 text-base text-muted-foreground">
          {lang === "zh-CN"
            ? `您可在 ${data.stopWithoutNoticeUntil} 前停课且无需支付通知期。在此之前，现行条款仍然适用。`
            : `You can stop lessons before ${data.stopWithoutNoticeUntil} without paying the notice period. Until then, your current terms still apply.`}
        </p>
        <label className="mt-5 flex min-h-12 cursor-pointer items-start gap-3">
          <input className="mt-1 size-6 shrink-0 accent-primary" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>{lang === "zh-CN" ? "我接受更新后的条款" : "I accept the updated terms"}</span>
        </label>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button disabled={!agreed || accept.isPending} onClick={() => accept.mutate()}>{lang === "zh-CN" ? "接受" : "Accept"}</Button>
          <Button variant="outline" onClick={onLater}>{lang === "zh-CN" ? "稍后" : "Later"}</Button>
          <Button
            variant="link"
            className="px-0"
            onClick={() =>
              onMessageTeacher(
                lang === "zh-CN"
                  ? `你好 ${data.teacherName}，我对更新后的条款有疑问。`
                  : `Hi ${data.teacherName}, I have a question about the updated terms.`,
              )
            }
          >
            {lang === "zh-CN" ? `不同意？给 ${data.teacherName} 发消息` : `Don't agree? Message ${data.teacherName}`}
          </Button>
        </div>
        {accept.isError && <p role="alert" className="mt-3 text-destructive">{(accept.error as Error).message}</p>}
      </div>
    </section>
  );
}
