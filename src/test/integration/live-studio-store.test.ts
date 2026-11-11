/**
 * The studio store against a real local Supabase (PostgREST + RLS), signed in as a studio owner.
 * Skipped unless SUPABASE_LOCAL=1:
 *   supabase start
 *   SUPABASE_LOCAL=1 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... bunx vitest run src/test/integration
 */
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { families, students, studio, teacher } from "@/mocks/data";
import {
  chooseStudioWorkspace,
  loadLiveStudio,
  setStudioStoreClientForTests,
} from "@/services/live/studio-store";
import { saveTeacherProfile } from "@/services/community";
import { startEnrolment } from "@/services/onboarding";
import { deleteExampleStudent } from "@/services/students";
import { getPublishedStudioTerms } from "@/services/terms";
import { insertLiveTermsVersion } from "@/services/live/studio-store";
import { getChatThreads, getOrCreateFamilyConversation, sendMessage } from "@/services/chat";
import { getStudentCourse, saveStudentCourse } from "@/services/curriculum";
import { copyTemplate } from "@/services/library";
import { libraryState } from "@/mocks/library";
import { createInvoice, getInvoices, issueCreditNote, recordPayment, sendInvoice } from "@/services/billing";

const enabled = process.env["SUPABASE_LOCAL"] === "1";

describe.skipIf(!enabled)("live studio store (local Supabase)", () => {
  it("loads, saves and deletes only the signed-in owner's studio rows", async () => {
    const url = process.env["SUPABASE_URL"] ?? "http://127.0.0.1:54321";
    const anon = process.env["SUPABASE_ANON_KEY"]!;
    const admin = createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
      auth: { persistSession: false },
    });

    const email = `owner-${crypto.randomUUID()}@example.com`;
    const password = `pw-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;
    const { data: studioId, error } = await admin.rpc("create_studio_with_owner", {
      p_name: "Integration Studio",
      p_timezone: "Australia/Melbourne",
      p_owner_user_id: userId,
      p_actor: null,
    });
    expect(error).toBeNull();
    await admin
      .from("studio_subscription")
      .update({ status: "comp", plan: "pro" })
      .eq("studio_id", studioId);

    const user = createClient(url, anon, { auth: { persistSession: false } });
    const signIn = await user.auth.signInWithPassword({ email, password });
    expect(signIn.error).toBeNull();
    setStudioStoreClientForTests(user);

    const choice = await chooseStudioWorkspace(
      {
        userId,
        platformStaff: null,
        memberships: [{ studioId: studioId as string, role: "owner" }],
        studioAccess: [{ studioId: studioId as string, role: "owner", plan: "pro" }],
      },
      user,
    );
    expect(choice.workspace.mode).toBe("live");
    if (choice.workspace.mode !== "live" || !choice.row) return;
    await loadLiveStudio(choice.workspace, choice.row, choice.plan, user);

    expect(studio.name).toBe("Integration Studio");
    expect(families.map((f) => f.displayName)).toEqual(["Example family"]);
    expect(families[0]!.guardians[0]!.email).toBe("sam.example@example.com");
    expect(students.map((s) => [s.firstName, s.isExample])).toEqual([["Alex", true]]);

    await saveTeacherProfile({ name: "Ms Integration", studioName: "Integration Piano" });
    const saved = await admin.from("studio").select("name, profile").eq("id", studioId).single();
    expect(saved.data?.name).toBe("Integration Piano");
    expect((saved.data?.profile as { teacher: { name: string } }).teacher.name).toBe(
      "Ms Integration",
    );

    await startEnrolment({
      firstName: "Real",
      lastName: "Kid",
      birthYear: 2016,
      guardianName: "Real Parent",
      guardianEmail: "real.parent@example.org",
      guardianMobile: "0400000000",
      language: "en",
    }).catch(() => undefined);
    const kids = await admin
      .from("student")
      .select("first_name, is_example")
      .eq("studio_id", studioId)
      .order("created_at");
    expect(kids.data?.map((k) => k.first_name)).toEqual(["Alex", "Real"]);

    await insertLiveTermsVersion({
      id: crypto.randomUUID(),
      documentId: "doc-studio-demo",
      versionNo: 1,
      renderedMarkdown: "# Terms",
      mergeValues: {},
      switches: {},
      sha256: "abc",
      changeType: "initial",
      changeSummary: "First",
      effectiveAt: "2027-01-01",
      publishedAt: "",
      publishedBy: "",
      editedClauseIds: [],
    });

    const realFamily = families.find((f) => !f.isExample)!;
    const conv = await getOrCreateFamilyConversation(realFamily.id);
    await sendMessage({
      conversationId: conv.id,
      authorName: "Ms Integration",
      authorRole: "teacher",
      kind: "text",
      body: "Welcome to the studio",
    });

    const realKid = students.find((s) => !s.isExample)!;
    const starter = await getStudentCourse(realKid.id);
    await saveStudentCourse(realKid.id, {
      targetTerm: starter.course.targetTerm,
      items: [
        {
          id: crypto.randomUUID(),
          studentCourseId: starter.course.id,
          sectionId: starter.sections[0]!.id,
          title: "Minuet in G",
          stage: 2,
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    await copyTemplate("courses", libraryState.demo.courses.find((c) => c.supplied)!.id);

    const realFamilyId = families.find((f) => !f.isExample)!.id;
    const draft = await createInvoice({
      familyId: realFamilyId,
      lines: [
        {
          description: "Lessons",
          qty: 10,
          unitCents: 4500,
          taxCents: 0,
          lineTotalCents: 45000,
          studentId: realKid.id,
          taxCode: "taxable",
        },
      ],
    });
    const sent = await sendInvoice(draft.id);
    expect(sent?.number).toBe("INV-000001");
    await recordPayment(draft.id, { method: "bank_transfer", amountCents: 20000 });
    const note = await issueCreditNote({ familyId: realFamilyId, amountCents: 1000, reason: "Missed lesson" });
    expect(note.number).toBe("CN-000001");
    const second = await createInvoice({
      familyId: realFamilyId,
      lines: [{ description: "Book", qty: 1, unitCents: 2000, taxCents: 0, lineTotalCents: 2000 }],
    });
    expect((await sendInvoice(second.id))?.number).toBe("INV-000002");

    await deleteExampleStudent(students.find((s) => s.isExample)!.id);
    const after = await admin.from("student").select("first_name").eq("studio_id", studioId);
    expect(after.data?.map((k) => k.first_name)).toEqual(["Real"]);

    // A fresh sign-in reads everything back, terms included.
    await loadLiveStudio(
      choice.workspace,
      (
        await chooseStudioWorkspace(
          {
            userId,
            platformStaff: null,
            memberships: [{ studioId: studioId as string, role: "owner" }],
          },
          user,
        )
      ).row!,
      "pro",
      user,
    );
    expect(teacher.name).toBe("Ms Integration");
    expect(students.map((s) => s.firstName)).toEqual(["Real"]);
    expect((await getPublishedStudioTerms()).versions.map((v) => v.versionNo)).toEqual([1]);
    const threads = await getChatThreads();
    expect(threads.map((t) => t.latest?.body)).toContain("Welcome to the studio");
    expect((await getStudentCourse(realKid.id)).items.map((i) => i.title)).toEqual(["Minuet in G"]);
    expect(libraryState.demo.courses.filter((c) => !c.supplied)).toHaveLength(1);
    const reloaded = await getInvoices();
    expect(reloaded.map((i) => [i.number, i.status, i.paidCents])).toEqual([
      ["INV-000001", "partially_paid", 20000],
      ["INV-000002", "sent", 0],
    ]);
    expect(reloaded[0]!.lines.map((l) => l.description)).toEqual(["Lessons"]);
    setStudioStoreClientForTests(null);
  });
});
