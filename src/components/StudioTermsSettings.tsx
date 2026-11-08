import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StudioTermsOnboarding } from "@/components/StudioTermsOnboarding";
import { downloadDocumentPdf } from "@/lib/download-terms-pdf";
import { STUDIO_STATES } from "@/mocks/setup";
import type { TermsScope } from "@/mocks/terms";
import {
  downloadAcceptanceRecords,
  getAcceptanceTracker,
  getFamilyAppTerms,
  getPublishedStudioTerms,
  getStudioTermsDraft,
  getTermsDocumentForPdf,
  publishStudioTerms,
  recordPaperAcceptance,
  remindFamilyTerms,
  saveStudioTermsDraft,
} from "@/services/terms";
import { addDays, PROTOTYPE_TODAY } from "@/lib/calendar";
import { toast } from "sonner";

export function StudioTermsSettings({ scope = "demo" }: { scope?: TermsScope }) {
  const client = useQueryClient();
  const draftQuery = useQuery({ queryKey: ["terms-draft", scope], queryFn: () => getStudioTermsDraft(scope) });
  const publishedQuery = useQuery({ queryKey: ["published-studio-terms", scope], queryFn: () => getPublishedStudioTerms(scope) });
  const trackerQuery = useQuery({ queryKey: ["terms-tracker", scope], queryFn: () => getAcceptanceTracker(scope) });
  const [editingClause, setEditingClause] = useState<string | null>(null);
  const [clauseText, setClauseText] = useState("");
  const [summary, setSummary] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(addDays(PROTOTYPE_TODAY, 30));
  const [forceMaterial, setForceMaterial] = useState(false);
  const [paperFamilyId, setPaperFamilyId] = useState("");
  const [paperFile, setPaperFile] = useState("");
  const [forceOnboarding, setForceOnboarding] = useState(false);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["terms-draft"] }),
      client.invalidateQueries({ queryKey: ["published-studio-terms"] }),
      client.invalidateQueries({ queryKey: ["terms-tracker"] }),
    ]);

  const save = useMutation({
    mutationFn: (input: Parameters<typeof saveStudioTermsDraft>[1]) => saveStudioTermsDraft(scope, input),
    onSuccess: () => { void refresh(); toast.success("Draft saved"); },
    onError: (error: Error) => toast.error(error.message),
  });
  const publish = useMutation({
    mutationFn: () => publishStudioTerms(scope, { changeSummary: summary, effectiveAt, forceMaterial }),
    onSuccess: () => { void refresh(); toast.success("Terms published"); },
    onError: (error: Error) => toast.error(error.message),
  });
  const remind = useMutation({
    mutationFn: (familyId: string) => remindFamilyTerms(familyId, scope),
    onSuccess: () => toast.success("Reminder sent in family chat"),
  });
  const paper = useMutation({
    mutationFn: () => recordPaperAcceptance({ familyId: paperFamilyId, fileName: paperFile, typedName: "Paper acceptance", scope }),
    onSuccess: () => { void refresh(); toast.success("Paper acceptance recorded"); setPaperFile(""); },
    onError: (error: Error) => toast.error(error.message),
  });
  const exportRecords = useMutation({
    mutationFn: () => downloadAcceptanceRecords(scope),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "acceptance-records.json";
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  const pdf = useMutation({
    mutationFn: async (kind: "studio_agreement" | "privacy" | "family_app_terms" | "receipt") => {
      if (kind === "family_app_terms") {
        const app = await getFamilyAppTerms();
        await downloadDocumentPdf({ title: "Keystone Music HQ — App terms of use", body: app.appTermsMarkdown, filename: "keystone-app-terms.pdf" });
        return;
      }
      const doc = await getTermsDocumentForPdf(kind, scope);
      await downloadDocumentPdf(doc);
    },
    onSuccess: () => toast.success("PDF downloaded"),
    onError: (error: Error) => toast.error(error.message),
  });

  const draft = draftQuery.data;
  const studioForm = draft?.studio;

  if (draftQuery.isLoading || !draft || !studioForm) return <p>Loading studio terms…</p>;

  if (forceOnboarding || draft.needsOnboarding) {
    return (
      <StudioTermsOnboarding
        scope={scope}
        plan={studioForm.plan}
        onComplete={() => {
          setForceOnboarding(false);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        {scope === "demo" && <Button asChild variant="ghost"><Link to="/settings"><ArrowLeft aria-hidden />Settings</Link></Button>}
        <h1 className="mt-4 text-3xl font-semibold">Studio terms</h1>
        <p className="mt-3 text-base text-muted-foreground">Australian template for Keystone Music HQ studios (AU v3).</p>
        <p className="mt-1 text-sm text-muted-foreground">Prepared for AU studios.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={pdf.isPending} onClick={() => pdf.mutate("studio_agreement")}><FileText aria-hidden />Download agreement PDF</Button>
          <Button variant="outline" disabled={pdf.isPending} onClick={() => pdf.mutate("privacy")}><FileText aria-hidden />Download privacy PDF</Button>
          <Button variant="outline" disabled={pdf.isPending} onClick={() => pdf.mutate("family_app_terms")}><FileText aria-hidden />Download Keystone app terms</Button>
          <Button variant="outline" onClick={() => setForceOnboarding(true)}>Review fill-in questions</Button>
        </div>
      </div>

      <section className="space-y-4 border-y border-border py-6">
        <h2 className="text-2xl font-semibold">Studio details</h2>
        {([
          ["legalName", "Legal name"],
          ["name", "Trading name"],
          ["abn", "ABN"],
          ["address", "Address"],
          ["email", "Email"],
          ["phone", "Phone"],
          ["privacyEmail", "Privacy email"],
        ] as const).map(([key, label]) => (
          <label key={key} className="block font-semibold">
            {label}
            <Input
              className="mt-2"
              defaultValue={String(studioForm[key] ?? "")}
              onBlur={(event) => save.mutate({ studio: { [key]: event.target.value } })}
            />
          </label>
        ))}
        <label className="block font-semibold">
          State
          <select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3" defaultValue={studioForm.state ?? "VIC"} onChange={(event) => save.mutate({ studio: { state: event.target.value } })}>
            {STUDIO_STATES.map((state) => <option key={state}>{state}</option>)}
          </select>
        </label>
        <label className="block font-semibold">
          Entity type
          <select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3" defaultValue={studioForm.entityType ?? "sole_trader"} onChange={(event) => save.mutate({ studio: { entityType: event.target.value as "sole_trader" | "partnership" | "company" | "trust" } })}>
            <option value="sole_trader">Sole trader</option>
            <option value="partnership">Partnership</option>
            <option value="company">Company</option>
            <option value="trust">Trust</option>
          </select>
        </label>
        <p className="text-base text-muted-foreground">Notice channel (fixed): {draft.noticeChannel}</p>
        <p className="text-base text-muted-foreground">Financial retention: {draft.financialRetentionYears} years</p>
      </section>

      <section className="space-y-4 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold">Billing</h2>
        <label className="block font-semibold">Billing cycle
          <select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3" defaultValue={studioForm.billing?.cycle ?? "per_term"} onChange={(event) => save.mutate({ studio: { billing: { ...studioForm.billing!, cycle: event.target.value as "per_term" | "monthly" | "per_lesson" } } })}>
            <option value="per_term">Each school term</option>
            <option value="monthly">Monthly</option>
            <option value="per_lesson">Per lesson</option>
          </select>
        </label>
        <label className="block font-semibold">Invoice lead days<Input type="number" className="mt-2" defaultValue={studioForm.billing?.invoiceLeadDays ?? 14} onBlur={(event) => save.mutate({ studio: { billing: { ...studioForm.billing!, invoiceLeadDays: Number(event.target.value) } } })} /></label>
        <label className="block font-semibold">Due rule
          <select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3" defaultValue={studioForm.billing?.dueRule ?? "days_after_issue"} onChange={(event) => save.mutate({ studio: { billing: { ...studioForm.billing!, dueRule: event.target.value as "on_issue" | "days_after_issue" | "before_term_start" } } })}>
            <option value="on_issue">On issue</option>
            <option value="days_after_issue">14 days after issue</option>
            <option value="before_term_start">Before term start</option>
          </select>
        </label>
        <label className="block font-semibold">Late fee (A$)<Input type="number" className="mt-2" defaultValue={studioForm.billing?.lateFee ?? 15} onBlur={(event) => save.mutate({ studio: { billing: { ...studioForm.billing!, lateFee: Number(event.target.value) } } })} /></label>
        <label className="block font-semibold">Late fee after days<Input type="number" className="mt-2" defaultValue={studioForm.billing?.lateFeeAfterDays ?? 7} onBlur={(event) => save.mutate({ studio: { billing: { ...studioForm.billing!, lateFeeAfterDays: Number(event.target.value) } } })} /></label>
        <label className="block font-semibold">Suspend after days<Input type="number" className="mt-2" defaultValue={studioForm.billing?.suspendAfterDays ?? 14} onBlur={(event) => save.mutate({ studio: { billing: { ...studioForm.billing!, suspendAfterDays: Number(event.target.value) } } })} /></label>
        <label className="block font-semibold">Fee notice days (min 14)<Input type="number" min={14} className="mt-2" defaultValue={studioForm.billing?.feeNoticeDays ?? 30} onBlur={(event) => save.mutate({ studio: { billing: { ...studioForm.billing!, feeNoticeDays: Math.max(14, Number(event.target.value)) } } })} /></label>
        <label className="block font-semibold">Withdrawal notice weeks (max 4)<Input type="number" max={4} className="mt-2" defaultValue={studioForm.billing?.withdrawalNoticeWeeks ?? 4} onBlur={(event) => save.mutate({ studio: { billing: { ...studioForm.billing!, withdrawalNoticeWeeks: Math.min(4, Number(event.target.value)) } } })} /></label>
      </section>

      <section className="space-y-4 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold">Lessons and make-ups</h2>
        <label className="block font-semibold">Cancel notice (hours)<Input type="number" className="mt-2" defaultValue={studioForm.policies?.cancelNoticeHours ?? 24} onBlur={(event) => save.mutate({ studio: { policies: { ...studioForm.policies!, cancelNoticeHours: Number(event.target.value) } } })} /></label>
        <label className="block font-semibold">Make-up quota<Input type="number" className="mt-2" defaultValue={studioForm.policies?.makeUpQuota ?? 1} onBlur={(event) => save.mutate({ studio: { policies: { ...studioForm.policies!, makeUpQuota: Number(event.target.value) } } })} /></label>
        <label className="block font-semibold">Online platform<Input className="mt-2" defaultValue={studioForm.policies?.onlinePlatform ?? "Zoom"} onBlur={(event) => save.mutate({ studio: { policies: { ...studioForm.policies!, onlinePlatform: event.target.value } } })} /></label>
        <label className="block font-semibold">Tuning frequency<Input className="mt-2" defaultValue={studioForm.policies?.tuningFrequency ?? "once a year"} onBlur={(event) => save.mutate({ studio: { policies: { ...studioForm.policies!, tuningFrequency: event.target.value } } })} /></label>
        <label className="block font-semibold">Inactive retention (months)<Input type="number" className="mt-2" defaultValue={studioForm.policies?.inactiveRetentionMonths ?? 24} onBlur={(event) => save.mutate({ studio: { policies: { ...studioForm.policies!, inactiveRetentionMonths: Number(event.target.value) } } })} /></label>
      </section>

      <section className="space-y-4 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold">Services</h2>
        {([["online", "Online lessons"], ["inHome", "In-home lessons"], ["exams", "Exams"], ["premises", "Studio premises"], ["paymentDiscount", "Payment-method discount"], ["asyncPro", "Video lessons (Pro)"]] as const).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-5 py-2">
            <span className="font-semibold">{label}</span>
            <Switch checked={Boolean(draft.switches[key])} onCheckedChange={(value) => save.mutate({ switches: { [key]: value } })} />
          </label>
        ))}
        {draft.switches.inHome && (
          <label className="block font-semibold">Travel fee<Input className="mt-2" defaultValue={studioForm.services?.inHomeTravelFee ?? "A$20"} onBlur={(event) => save.mutate({ studio: { services: { ...studioForm.services!, inHomeTravelFee: event.target.value } } })} /></label>
        )}
      </section>

      <section className="space-y-4 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold">Privacy</h2>
        <p className="text-base">{draft.privacy.keystoneStorageStatement}</p>
        <p className="text-base text-muted-foreground">Overseas: {draft.privacy.overseasCountriesLabel}</p>
        <label className="block font-semibold">
          Additional terms
          <textarea className="mt-2 min-h-24 w-full rounded-md border border-input bg-card px-3 py-2" defaultValue={studioForm.additionalTerms ?? ""} onBlur={(event) => save.mutate({ studio: { additionalTerms: event.target.value }, switches: { additional: Boolean(event.target.value.trim()) } })} />
        </label>
        {draft.warnings.length > 0 && <p role="status" className="text-base text-warning">Warning: this text mentions {draft.warnings.join(", ")}. These warnings do not make the wording lawful — get your own advice.</p>}
      </section>

      <section className="space-y-4 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold">Clause wording</h2>
        {draft.template.map((clause) => (
          <div key={clause.id} className="border-b border-border py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Part {clause.part}: {clause.heading}{clause.edited && <span className="ml-2 text-base font-normal text-muted-foreground">Edited from Keystone template</span>}</h3>
              <Button variant="outline" onClick={() => { setEditingClause(clause.id); setClauseText(clause.body); }}>Edit wording</Button>
            </div>
            {editingClause === clause.id && (
              <div className="mt-3 space-y-3">
                <textarea className="min-h-32 w-full rounded-md border border-input bg-card px-3 py-2" value={clauseText} onChange={(event) => setClauseText(event.target.value)} />
                <p className="text-base text-muted-foreground">You&apos;re responsible for edited wording. We recommend getting your own advice.</p>
                <Button onClick={() => { save.mutate({ clauseEdits: { [clause.id]: clauseText } }); setEditingClause(null); }}>Save clause</Button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold">Live preview</h2>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card p-4 font-sans text-base">{draft.rendered.markdown}</pre>
        {draft.rendered.missingRequired.length > 0 && <p role="status" className="text-destructive">Missing: {draft.rendered.missingRequired.join(", ")}</p>}
      </section>

      <section className="space-y-4 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold">Publish</h2>
        <label className="block font-semibold">Change summary<Input className="mt-2" value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
        <label className="block font-semibold">Effective date<Input type="date" className="mt-2" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} /></label>
        <label className="flex items-center gap-3"><Switch checked={forceMaterial} onCheckedChange={setForceMaterial} />Treat as material change</label>
        <Button disabled={publish.isPending || draft.rendered.missingRequired.length > 0} onClick={() => publish.mutate()}>Publish terms</Button>
      </section>

      <section className="space-y-3 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold">Version history</h2>
        {publishedQuery.data?.versions.map((version) => (
          <div key={version.id} className="border-b border-border py-3">
            <p className="font-semibold">Version {version.versionNo} · {version.changeType} · effective {version.effectiveAt}</p>
            <p className="text-base text-muted-foreground">{version.changeSummary}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4 pb-10">
        <h2 className="text-2xl font-semibold">Acceptance tracker</h2>
        <p>{trackerQuery.data?.summary}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={exportRecords.isPending} onClick={() => exportRecords.mutate()}><Download aria-hidden />Download acceptance records (JSON)</Button>
          <Button variant="outline" disabled={pdf.isPending} onClick={() => pdf.mutate("receipt")}><Download aria-hidden />Download latest receipt PDF</Button>
        </div>
        <div className="divide-y divide-border">
          {trackerQuery.data?.families.map((family) => (
            <div key={family.familyId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <p>{family.displayName} · {family.status}</p>
              {family.status !== "accepted" && <Button variant="outline" onClick={() => remind.mutate(family.familyId)}><Send aria-hidden />Remind</Button>}
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-xl font-semibold">Record paper acceptance</h3>
          <label className="block font-semibold">Family<select className="mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3" value={paperFamilyId} onChange={(event) => setPaperFamilyId(event.target.value)}><option value="">Choose</option>{trackerQuery.data?.families.map((family) => <option key={family.familyId} value={family.familyId}>{family.displayName}</option>)}</select></label>
          <label className="block font-semibold">File name<Input className="mt-2" value={paperFile} onChange={(event) => setPaperFile(event.target.value)} placeholder="signed-terms.pdf" /></label>
          <Button disabled={!paperFamilyId || !paperFile || paper.isPending} onClick={() => paper.mutate()}>Record paper acceptance</Button>
        </div>
      </section>
    </div>
  );
}
