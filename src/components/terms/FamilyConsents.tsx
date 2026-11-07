import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useParentLanguage } from "@/i18n/parent";
import { getFamilyConsents, recordConsent } from "@/services/terms";
import { getParentSession } from "@/services/parent";

export function FamilyConsents() {
  const { lang } = useParentLanguage();
  const { data } = useQuery({ queryKey: ["family-consents"], queryFn: () => getFamilyConsents("demo") });
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async (input: { studentId: string; type: "media_public" | "lesson_recordings" | "health_notes"; granted: boolean }) => {
      const session = await getParentSession();
      return recordConsent({
        scope: "demo",
        studentId: input.studentId,
        type: input.type,
        granted: input.granted,
        givenBy: session.guardian.name,
      });
    },
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["family-consents"] }), client.invalidateQueries({ queryKey: ["parent"] })]),
  });

  if (!data?.children.length) return null;
  const latest = (studentId: string, type: "media_public" | "lesson_recordings" | "health_notes") =>
    data.consents.filter((entry) => entry.studentId === studentId && entry.type === type).sort((a, b) => b.givenAt.localeCompare(a.givenAt))[0];

  return (
    <section className="mt-6 border-y border-border py-6" aria-label={lang === "zh-CN" ? "同意设置" : "Consents"}>
      <h2 className="text-2xl font-semibold">{lang === "zh-CN" ? "隐私与媒体同意" : "Privacy and media consents"}</h2>
      {data.children.map((child) => {
        const publicMedia = latest(child.id, "media_public");
        const recordings = latest(child.id, "lesson_recordings");
        const health = latest(child.id, "health_notes");
        return (
          <div key={child.id} className="mt-5 border-t border-border pt-4">
            <h3 className="text-xl font-semibold">{child.firstName}</h3>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>{lang === "zh-CN" ? "公开媒体" : "Public media"}: {publicMedia?.granted && !publicMedia.withdrawnAt ? (lang === "zh-CN" ? "已同意" : "Allowed") : (lang === "zh-CN" ? "未同意" : "Not allowed")}</p>
                <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ studentId: child.id, type: "media_public", granted: !(publicMedia?.granted && !publicMedia.withdrawnAt) })}>
                  {publicMedia?.granted && !publicMedia.withdrawnAt ? (lang === "zh-CN" ? "撤回" : "Withdraw") : (lang === "zh-CN" ? "允许" : "Allow")}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>{lang === "zh-CN" ? "课程录音（作业）" : "Lesson recordings"}: {recordings?.granted && !recordings.withdrawnAt ? (lang === "zh-CN" ? "已同意" : "Allowed") : (lang === "zh-CN" ? "未同意" : "Not allowed")}</p>
                <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ studentId: child.id, type: "lesson_recordings", granted: !(recordings?.granted && !recordings.withdrawnAt) })}>
                  {recordings?.granted && !recordings.withdrawnAt ? (lang === "zh-CN" ? "撤回" : "Withdraw") : (lang === "zh-CN" ? "允许" : "Allow")}
                </Button>
              </div>
              {health?.granted && !health.withdrawnAt && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>{lang === "zh-CN" ? "健康备注已保存" : "Health notes on file"}</p>
                  <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ studentId: child.id, type: "health_notes", granted: false })}>
                    {lang === "zh-CN" ? "删除备注同意" : "Remove health notes consent"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
