import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { render } from "@react-email/components";
import { InviteEmail, inviteSubject } from "@/emails/InviteEmail";
import { teacher, studio, families, students } from "@/mocks/data";

export const Route = createFileRoute("/settings/email-preview")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["email-preview"], queryFn: loadPreview }),
  component: EmailPreviewPage,
  head: () => ({ meta: [{ title: "Invite email preview — Keystone Music HQ" }] }),
});

async function loadPreview() {
  const family = families[0]!;
  const kids = students.filter((s) => s.familyId === family.id);
  const childNames = kids.map((k) => k.firstName).join(" and ");
  const appUrl =
    (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: { VITE_APP_URL?: string } }).env?.VITE_APP_URL) ||
    "http://127.0.0.1:3000";
  const props = {
    language: family.guardians[0]!.preferredLanguage,
    teacherName: teacher.name,
    guardianFirstName: family.guardians[0]!.name.split(" ")[0]!,
    childNames,
    studioName: studio.name,
    joinUrl: `${appUrl}/join/preview-token`,
    expiresLabel: "29 Mar 2027",
    logoUrl: null as string | null,
  };
  const html = await render(InviteEmail(props));
  return {
    subject: inviteSubject(props.language, props.teacherName, props.childNames),
    html,
    props,
  };
}

function EmailPreviewPage() {
  const { data } = useSuspenseQuery({ queryKey: ["email-preview"], queryFn: loadPreview });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-semibold">Invite email</h1>
      <p className="text-base text-muted-foreground">
        Live render of what families receive (demo data).
      </p>
      <p className="rounded-md border border-border bg-card p-3 text-base">
        <span className="font-semibold">Subject:</span> {data.subject}
      </p>
      <iframe
        title="Invite email preview"
        className="min-h-[640px] w-full rounded-md border border-border bg-white"
        srcDoc={data.html}
      />
    </div>
  );
}
