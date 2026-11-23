import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  conversations,
  families,
  invoices,
  lessonTypes,
  messages,
  students,
  studio,
  teacher,
} from "@/mocks/data";
import { newsState } from "@/mocks/news";
import { courseItems, studentCourses } from "@/mocks/curriculum";
import { libraryState } from "@/mocks/library";
import { payments, practiceLogs } from "@/mocks/data";
import { addNote } from "@/services/notes";
import { billingProfileState, creditNotes, invoiceEvents } from "@/mocks/billing-profile";
import {
  createInvoice,
  getInvoices,
  issueCreditNote,
  recordPayment,
  sendInvoice,
  updateDraft,
  deleteDraft,
} from "@/services/billing";
import { resetLiveBillingForTests } from "@/services/live/billing-store";
import {
  liveTermDrafts,
  prepareLiveTermDrafts,
  previewLiveTerm,
  sendLiveTermInvoices,
} from "@/services/live/term-billing-store";
import { addPractice, getStudentCourse, saveStudentCourse } from "@/services/curriculum";
import { copyTemplate, saveCourseTemplate } from "@/services/library";
import { clientNotes } from "@/mocks/notes";
import { opusInvoices } from "@/mocks/plans";
import { taxLiteExpenses } from "@/mocks/tax-lite";
import { proCfoTeachers, proCfoXeroQueue } from "@/mocks/pro-cfo";
import {
  chooseStudioWorkspace,
  loadLiveStudio,
  setStudioStoreClientForTests,
  type StudioRow,
} from "@/services/live/studio-store";
import { resetStudioWorkspaceForTests, isLiveStudio } from "@/lib/studio-workspace";
import { getStudents, getStudio } from "@/services/roster";
import { deleteExampleStudent } from "@/services/students";
import { saveTeacherProfile } from "@/services/community";
import { activateEnrolment, saveEnrolment, startEnrolment } from "@/services/onboarding";
import { enrolmentDrafts } from "@/mocks/onboarding";
import { defaultTargetTerm, onboardingTermOptions, paceTerms } from "@/lib/onboarding";
import { currentTermKey } from "@/lib/course-progress";
import { getPlanBilling, setStudioPlan } from "@/services/plans";
import { createInvitation } from "@/services/invitations";
import { validateStartingAccess } from "@/server/platform";
import { getAnnouncements, saveAnnouncement, archiveAnnouncement } from "@/services/news";
import { createGroup, setGroupMembers, listGroups } from "@/services/groups";
import {
  getChatThreads,
  getOrCreateFamilyConversation,
  markThreadRead,
  sendMessage,
} from "@/services/chat";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Declared props keep dot access legal under noPropertyAccessFromIndexSignature;
// the index signature covers every other column the mocks touch.
type Row = Record<string, any> & {
  [K in
    | "id"
    | "status"
    | "number"
    | "name"
    | "email"
    | "kind"
    | "profile"
    | "is_demo"
    | "display_name"
    | "first_name"
    | "family_id"
    | "studio_id"
    | "sent_at"
    | "read_at"
    | "metadata"
    | "snapshot"
    | "data"
    | "invoice_prefix"
    | "next_invoice_number"
    | "credit_note_prefix"
    | "next_credit_note_number"
    | "p_invoice_id"]?: any;
};
type Tables = Record<string, Row[]> & {
  [K in
    | "studio"
    | "invoice"
    | "invoice_line"
    | "invoice_event"
    | "credit_note"
    | "payment"
    | "family"
    | "guardian"
    | "student"
    | "student_course"
    | "student_group"
    | "library_item"
    | "news_post"
    | "conversation"
    | "message"
    | "snapshot"
    | "studio_billing_profile"]?: Row[];
};
type Call = {
  table: string;
  op: string;
  payload?: unknown;
  filters: Array<[string, unknown]>;
  other: Array<[string, unknown, "neq" | "is"]>;
};

/** Just enough of the Supabase query builder for the studio store. */
function fakeSupabase(
  tables: Tables,
  options: { failOn?: string; failWith?: { message: string; code: string } } = {},
) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call & { conflict?: string[] } = { table, op: "select", filters: [], other: [] };
    const rowsFor = () =>
      (tables[table] ?? []).filter(
        (row) =>
          call.filters.every(([column, value]) => column.includes(".") || row[column] === value) &&
          call.other.every(([column, value, op]) =>
            op === "neq" ? row[column] !== value : (row[column] ?? null) === value,
          ),
      );
    const result = () => {
      if (options.failOn === `${table}.${call.op}`) {
        return {
          data: null,
          error: options.failWith ?? {
            message: "new row violates row-level security policy",
            code: "42501",
          },
        };
      }
      if (call.op === "upsert") {
        const list = (Array.isArray(call.payload) ? call.payload : [call.payload]) as Row[];
        const current = tables[table] ?? [];
        for (const row of list) {
          const keys = call.conflict ?? ["id"];
          const existing = current.find((entry) => keys.every((key) => entry[key] === row[key]));
          if (existing) Object.assign(existing, row);
          else current.push({ ...row });
        }
        tables[table] = current;
        return { data: list, error: null };
      }
      if (call.op === "insert") {
        const list = Array.isArray(call.payload) ? call.payload : [call.payload];
        tables[table] = [
          ...(tables[table] ?? []),
          ...(list as Row[]).map((row) => ({ id: crypto.randomUUID(), ...row })),
        ];
        return { data: list, error: null };
      }
      if (call.op === "delete") {
        const remove = new Set(rowsFor());
        tables[table] = (tables[table] ?? []).filter((row) => !remove.has(row));
        return { data: null, error: null };
      }
      if (call.op === "update") {
        for (const row of rowsFor()) Object.assign(row, call.payload);
        return { data: null, error: null };
      }
      return { data: rowsFor(), error: null };
    };
    const builder = {
      select: () => builder,
      insert: (payload: unknown) => (
        (call.op = "insert"),
        (call.payload = payload),
        calls.push(call),
        builder
      ),
      upsert: (payload: unknown, opts?: { onConflict?: string }) => (
        (call.op = "upsert"),
        (call.payload = payload),
        opts?.onConflict && (call.conflict = opts.onConflict.split(",")),
        calls.push(call),
        builder
      ),
      update: (payload: unknown) => (
        (call.op = "update"),
        (call.payload = payload),
        calls.push(call),
        builder
      ),
      delete: () => ((call.op = "delete"), calls.push(call), builder),
      eq: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
      order: () => builder,
      limit: () => builder,
      gte: () => builder,
      lte: () => builder,
      or: () => builder,
      neq: (column: string, value: unknown) => (call.other.push([column, value, "neq"]), builder),
      is: (column: string, value: unknown) => (call.other.push([column, value, "is"]), builder),
      maybeSingle: async () => {
        const r = result();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
      },
      single: async () => {
        const r = result();
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
      },
      then: (resolve: (value: unknown) => void) => resolve(result()),
    };
    return builder;
  };
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];
  const rpc = async (name: string, args: Row) => {
    rpcCalls.push([name, args]);
    if (options.failOn === `rpc.${name}`)
      return { data: null, error: { message: "not allowed", code: "42501" } };
    const profile = (tables.studio_billing_profile ??= [
      {
        studio_id: STUDIO_ID,
        invoice_prefix: "INV-",
        next_invoice_number: 1,
        credit_note_prefix: "CN-",
        next_credit_note_number: 1,
      },
    ])[0]!;
    if (name === "send_studio_invoice") {
      const row = (tables.invoice ?? []).find((entry) => entry.id === args.p_invoice_id);
      if (!row) return { data: null, error: { message: "Invoice not found" } };
      if (row.status === "draft") {
        row.number = `${profile.invoice_prefix}${String(profile.next_invoice_number).padStart(6, "0")}`;
        profile.next_invoice_number = Number(profile.next_invoice_number) + 1;
        row.status = "sent";
        row.sent_at = "2026-11-10T02:00:00.000Z";
      }
      return { data: row, error: null };
    }
    if (name === "issue_studio_credit_note_number") {
      const number = `${profile.credit_note_prefix}${String(profile.next_credit_note_number).padStart(6, "0")}`;
      profile.next_credit_note_number = Number(profile.next_credit_note_number) + 1;
      return { data: number, error: null };
    }
    return { data: null, error: { message: `unknown rpc ${name}` } };
  };
  return { client: { from, rpc } as never, calls, tables, rpcCalls };
}

const STUDIO_ID = "5f1c7e0e-1111-4111-8111-000000000001";
const EXAMPLE_FAMILY = "5f1c7e0e-2222-4222-8222-000000000001";
const EXAMPLE_STUDENT = "5f1c7e0e-3333-4333-8333-000000000001";

function liveTables(): Tables {
  return {
    studio: [{ id: STUDIO_ID, name: "Andrew Test Studio", is_demo: false, profile: {} }],
    family: [
      {
        id: EXAMPLE_FAMILY,
        studio_id: STUDIO_ID,
        display_name: "Example family",
        media_consent: null,
        news_photo_consent: null,
        is_example: true,
        guardian: [
          {
            id: "g-example",
            full_name: "Sam Example",
            email: "sam.example@example.com",
            mobile: null,
            preferred_language: "en",
          },
        ],
      },
    ],
    student: [
      {
        id: EXAMPLE_STUDENT,
        studio_id: STUDIO_ID,
        family_id: EXAMPLE_FAMILY,
        first_name: "Alex",
        last_name: "Example",
        birth_year: 2016,
        exam_date: null,
        target_term: null,
        grade_goal: "Beginner",
        is_example: true,
      },
    ],
    terms_version: [],
    terms_document: [],
    news_post: [],
    student_group: [],
    student_course: [],
    library_item: [],
    conversation: [
      {
        id: "c0nv0000-0000-4000-8000-000000000001",
        studio_id: STUDIO_ID,
        family_id: EXAMPLE_FAMILY,
        last_message_at: "2026-11-10T01:00:00Z",
      },
    ],
    message: [
      {
        id: "m0000000-0000-4000-8000-000000000001",
        studio_id: STUDIO_ID,
        conversation_id: "c0nv0000-0000-4000-8000-000000000001",
        author_role: "guardian",
        author_name: "Sam Example",
        kind: "text",
        body: "Hello from the example family",
        metadata: {},
        sent_at: "2026-11-10T01:00:00Z",
        read_at: null,
      },
    ],
  };
}

const owner = {
  userId: "owner-1",
  platformStaff: null,
  memberships: [{ studioId: STUDIO_ID, role: "owner" }],
  studioAccess: [{ studioId: STUDIO_ID, role: "owner", plan: "pro" as const }],
};

async function signInLive(
  tables = liveTables(),
  options: { failOn?: string; failWith?: { message: string; code: string } } = {},
) {
  const fake = fakeSupabase(tables, options);
  setStudioStoreClientForTests(fake.client);
  const choice = await chooseStudioWorkspace(owner, fake.client);
  expect(choice.workspace.mode).toBe("live");
  if (choice.workspace.mode !== "live" || !choice.row) throw new Error("expected live");
  await loadLiveStudio(choice.workspace, choice.row, choice.plan, fake.client);
  return fake;
}

describe("live studio data (0011)", () => {
  beforeEach(() => resetStudioWorkspaceForTests());
  afterEach(() => setStudioStoreClientForTests(null));

  it("keeps the demo studio and platform staff on the demo fixtures", async () => {
    const tables = liveTables();
    (tables.studio![0] as Row).is_demo = true;
    const fake = fakeSupabase(tables);
    expect((await chooseStudioWorkspace(owner, fake.client)).workspace.mode).toBe("mock");
    expect(
      (
        await chooseStudioWorkspace(
          { userId: "x", platformStaff: {}, memberships: [] },
          fake.client,
        )
      ).workspace.mode,
    ).toBe("mock");
  });

  it("loads a parent's studio through the server, never the demo, because parents can't read the studio table", async () => {
    const parent = {
      userId: "parent-1",
      platformStaff: null,
      memberships: [],
      studioAccess: [{ studioId: STUDIO_ID, role: "guardian", plan: "pro" as const }],
    };
    // The browser client would return nothing for `studio` under RLS; it must not be asked.
    const noStudioRead = {
      from: () => {
        throw new Error("parents must not read studio directly");
      },
    } as never;
    const choice = await chooseStudioWorkspace(parent, noStudioRead, async (studioId) => ({
      id: studioId,
      name: "Andrew Test Studio",
      is_demo: false,
      profile: {},
      guardianId: "guardian-1",
    }));
    expect(choice.workspace).toEqual({
      mode: "live",
      studioId: STUDIO_ID,
      userId: "parent-1",
      role: "guardian",
      guardianId: "guardian-1",
    });
    expect(choice.row?.name).toBe("Andrew Test Studio");

    await expect(chooseStudioWorkspace(parent, noStudioRead, async () => null)).rejects.toThrow(
      /couldn't find your studio/,
    );
    const demo = await chooseStudioWorkspace(parent, noStudioRead, async (studioId) => ({
      id: studioId,
      name: "Clarke",
      is_demo: true,
      profile: {},
      guardianId: "g",
    }));
    expect(demo.workspace.mode).toBe("mock");
  });

  it("stays on demo data (today's behaviour) if the studio lookup fails, e.g. 0011 not applied", async () => {
    const broken = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { message: "column studio.is_demo does not exist" },
            }),
          }),
        }),
      }),
    } as never;
    expect((await chooseStudioWorkspace(owner, broken)).workspace.mode).toBe("mock");
  });

  it("shows a real studio only its own rows: no Clarke families, chat, news, invoices or notes", async () => {
    expect(families.length).toBeGreaterThan(10);
    await signInLive();
    expect(isLiveStudio()).toBe(true);
    expect(families.map((f) => f.displayName)).toEqual(["Example family"]);
    expect(students.map((s) => s.firstName)).toEqual(["Alex"]);
    expect(conversations.map((c) => c.familyId)).toEqual([EXAMPLE_FAMILY]);
    expect(messages.map((m) => m.body)).toEqual(["Hello from the example family"]);
    for (const list of [
      invoices,
      studentCourses,
      clientNotes,
      newsState.demo.posts,
      opusInvoices,
      taxLiteExpenses,
      proCfoTeachers,
      proCfoXeroQueue,
    ]) {
      expect(list).toHaveLength(0);
    }
    const s = await getStudio();
    expect(s).toMatchObject({
      id: STUDIO_ID,
      name: "Andrew Test Studio",
      plan: "pro",
      gstRegistered: false,
    });
    expect(s.abn).toBeUndefined();
    expect(teacher.name).toBe("");
    expect(lessonTypes.map((l) => l.durationMin)).toEqual([30, 45, 60]);
    const roster = await getStudents();
    expect(roster[0]).toMatchObject({
      isExample: true,
      gradeGoal: "Beginner",
      familyName: "Example family",
    });
    const plan = await getPlanBilling();
    expect(plan.card).toBeNull();
    await expect(setStudioPlan("base")).rejects.toThrow(/Keystone subscription/);
  });

  it("saves studio details to the studio's own row", async () => {
    const fake = await signInLive();
    await saveTeacherProfile({ name: "Ms Phan", studioName: "Phan Piano" });
    const row = fake.tables.studio![0]!;
    expect(row.name).toBe("Phan Piano");
    expect((row.profile as { teacher: { name: string } }).teacher.name).toBe("Ms Phan");
    expect(studio.name).toBe("Phan Piano");
  });

  it("undoes a studio details change that Supabase refuses", async () => {
    await signInLive(liveTables(), { failOn: "studio.update" });
    await expect(saveTeacherProfile({ name: "Ms Phan", studioName: "Phan Piano" })).rejects.toThrow(
      /permission|read-only/,
    );
    expect(studio.name).toBe("Andrew Test Studio");
    expect(teacher.name).toBe("");
  });

  it("saves a new enrolment's family and student before showing them", async () => {
    const fake = await signInLive();
    await startEnrolment({
      firstName: "Edison",
      lastName: "Phan",
      birthYear: 2017,
      guardianName: "Andrew Phan",
      guardianEmail: "parent@example.org",
      guardianMobile: "0400000000",
      language: "en",
    }).catch(() => undefined);
    expect(fake.tables.family!.some((row) => row.display_name === "Phan family")).toBe(true);
    expect(
      fake.tables.guardian!.some(
        (row) => row.email === "parent@example.org" && row.studio_id === STUDIO_ID,
      ),
    ).toBe(true);
    expect(
      fake.tables.student!.some(
        (row) => row.first_name === "Edison" && row.studio_id === STUDIO_ID,
      ),
    ).toBe(true);
    expect(students.some((s) => s.firstName === "Edison")).toBe(true);
  });

  it("does not show a student that Supabase refused to save", async () => {
    await signInLive(liveTables(), { failOn: "student.insert" });
    await expect(
      startEnrolment({
        firstName: "Edison",
        lastName: "Phan",
        birthYear: 2017,
        guardianName: "Andrew Phan",
        guardianEmail: "parent@example.org",
        guardianMobile: "0400000000",
        language: "en",
      }),
    ).rejects.toThrow();
    expect(students.some((s) => s.firstName === "Edison")).toBe(false);
  });

  it("never invites the example family, and lets the owner delete the example", async () => {
    const fake = await signInLive();
    await expect(
      createInvitation({ familyId: EXAMPLE_FAMILY, studentIds: [EXAMPLE_STUDENT] }),
    ).rejects.toThrow(/example family/);
    await deleteExampleStudent(EXAMPLE_STUDENT);
    expect(students).toHaveLength(0);
    expect(families).toHaveLength(0);
    const del = fake.calls.find((call) => call.table === "family" && call.op === "delete");
    expect(del?.filters).toEqual(
      expect.arrayContaining([
        ["is_example", true],
        ["studio_id", STUDIO_ID],
      ]),
    );
  });

  it("refuses to delete a real student through the example action", async () => {
    await signInLive();
    await startEnrolment({
      firstName: "Edison",
      lastName: "Phan",
      birthYear: 2017,
      guardianName: "Andrew Phan",
      guardianEmail: "parent@example.org",
      guardianMobile: "0400000000",
      language: "en",
    }).catch(() => undefined);
    const edison = students.find((s) => s.firstName === "Edison")!;
    await expect(deleteExampleStudent(edison.id)).rejects.toThrow(/Only the example/);
  });
});

describe("starting access for a new studio (paused banner fix)", () => {
  it("defaults to complimentary Pro so the owner is not read-only", () => {
    expect(validateStartingAccess(undefined)).toEqual({
      status: "comp",
      plan: "pro",
      accessEndsOn: null,
    });
  });
  it("needs an end date for a pilot", () => {
    expect(() => validateStartingAccess({ status: "pilot", plan: "pro" })).toThrow(
      /end date|last day/i,
    );
    expect(
      validateStartingAccess({ status: "pilot", plan: "pro", accessEndsOn: "2027-05-17" })
        .accessEndsOn,
    ).toBe("2027-05-17");
  });
  it("allows no free access on purpose", () => {
    expect(validateStartingAccess({ status: "none", plan: "base" }).status).toBe("none");
  });
});

describe("live family chat (0013)", () => {
  beforeEach(() => resetStudioWorkspaceForTests());
  afterEach(() => setStudioStoreClientForTests(null));
  const CONV = "c0nv0000-0000-4000-8000-000000000001";

  it("loads the studio's saved chat with unread counts", async () => {
    await signInLive();
    const threads = await getChatThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      id: CONV,
      unreadCount: 1,
      family: { displayName: "Example family" },
    });
    expect(threads[0]!.latest?.body).toBe("Hello from the example family");
  });

  it("saves a sent message as the signed-in teacher before showing it", async () => {
    const fake = await signInLive();
    const sent = await sendMessage({
      conversationId: CONV,
      authorName: "Ms Phan",
      authorRole: "teacher",
      kind: "text",
      body: " Welcome! ",
    });
    const row = fake.tables.message!.find((m) => m.id === sent.id)!;
    expect(row).toMatchObject({
      studio_id: STUDIO_ID,
      author_user_id: "owner-1",
      author_role: "teacher",
      body: "Welcome!",
    });
    expect(messages.some((m) => m.id === sent.id)).toBe(true);
  });

  it("does not show a message Supabase refused", async () => {
    await signInLive(liveTables(), { failOn: "message.insert" });
    await expect(
      sendMessage({
        conversationId: CONV,
        authorName: "Ms Phan",
        authorRole: "teacher",
        kind: "text",
        body: "Hi",
      }),
    ).rejects.toThrow();
    expect(messages).toHaveLength(1);
  });

  it("drops browser-only media links when saving", async () => {
    const fake = await signInLive();
    const sent = await sendMessage({
      conversationId: CONV,
      authorName: "Ms Phan",
      authorRole: "teacher",
      kind: "image",
      body: "Photo",
      media: { url: "blob:http://x/1", fileName: "a.png" },
    });
    expect(fake.tables.message!.find((m) => m.id === sent.id)!.metadata).toEqual({
      media: { fileName: "a.png" },
    });
  });

  it("marks the family's messages read and starts new family chats once", async () => {
    const fake = await signInLive();
    await markThreadRead(CONV);
    expect(fake.tables.message![0]!.read_at).toBeTruthy();
    await startEnrolment({
      firstName: "Edison",
      lastName: "Phan",
      birthYear: 2017,
      guardianName: "Andrew Phan",
      guardianEmail: "parent@example.org",
      guardianMobile: "0400000000",
      language: "en",
    }).catch(() => undefined);
    const family = families.find((f) => f.displayName === "Phan family")!;
    const first = await getOrCreateFamilyConversation(family.id);
    const again = await getOrCreateFamilyConversation(family.id);
    expect(again.id).toBe(first.id);
    expect(fake.tables.conversation!.filter((c) => c.family_id === family.id)).toHaveLength(1);
  });
});

describe("live studio news and groups (0014)", () => {
  beforeEach(() => resetStudioWorkspaceForTests());
  afterEach(() => setStudioStoreClientForTests(null));

  it("publishes on real time, saves the post as the signed-in author, and archives it", async () => {
    const fake = await signInLive();
    expect(await getAnnouncements()).toHaveLength(0);
    const post = await saveAnnouncement({ title: "Welcome", body: "Lessons start Monday" });
    expect(post.status).toBe("published");
    expect(Math.abs(Date.parse(post.publishAt) - Date.now())).toBeLessThan(60_000);
    expect(fake.tables.news_post![0]).toMatchObject({
      id: post.id,
      studio_id: STUDIO_ID,
      author_user_id: "owner-1",
      title: "Welcome",
    });
    await archiveAnnouncement(post.id);
    expect(fake.tables.news_post![0]!.status).toBe("archived");
  });

  it("does not show a post Supabase refused", async () => {
    await signInLive(liveTables(), { failOn: "news_post.insert" });
    await expect(saveAnnouncement({ title: "Welcome", body: "Hi" })).rejects.toThrow();
    expect(await getAnnouncements()).toHaveLength(0);
  });

  it("saves manual groups and their students", async () => {
    const fake = await signInLive();
    const group = await createGroup("Saturday mornings");
    await setGroupMembers(group.id, [EXAMPLE_STUDENT]);
    expect(fake.tables.student_group![0]).toMatchObject({
      name: "Saturday mornings",
      student_ids: [EXAMPLE_STUDENT],
      owner_user_id: "owner-1",
    });
    expect((await listGroups()).manual.map((g) => g.name)).toEqual(["Saturday mornings"]);
  });

  it("loads saved posts and groups at sign-in", async () => {
    const tables = liveTables();
    tables.news_post = [
      {
        id: "p1",
        studio_id: STUDIO_ID,
        author_user_id: "someone-else",
        author_name: "Ms Other",
        title: "Concert",
        body: "Sunday",
        tag: "concert",
        audience: { kind: "studio" },
        important: false,
        status: "published",
        publish_at: "2026-11-01T00:00:00Z",
        pinned_until: null,
        expires_at: null,
        event_date: null,
        edited_at: null,
        attachments: [],
      },
    ];
    tables.student_group = [
      {
        id: "g1",
        studio_id: STUDIO_ID,
        name: "Beginners",
        description: null,
        student_ids: [EXAMPLE_STUDENT],
        owner_user_id: "owner-1",
        archived: false,
      },
    ];
    await signInLive(tables);
    const posts = await getAnnouncements();
    expect(posts.map((p) => [p.title, p.own])).toEqual([["Concert", false]]);
    expect((await listGroups()).manual.map((g) => g.name)).toEqual(["Beginners"]);
  });
});

describe("live courses and Library (0015)", () => {
  beforeEach(() => resetStudioWorkspaceForTests());
  afterEach(() => setStudioStoreClientForTests(null));

  it("gives a real student an empty starter course, saved only when the teacher edits it", async () => {
    const fake = await signInLive();
    const first = await getStudentCourse(EXAMPLE_STUDENT);
    expect(first.course).toMatchObject({
      framework: "Custom",
      grade: "Beginner",
      status: "active",
    });
    expect(first.items).toHaveLength(0);
    expect(first.feedback).toHaveLength(0);
    expect(first.sections.map((section) => section.name)).toEqual([
      "Repertoire",
      "Technical work",
      "Theory and reading",
      "Ear, sight-reading and pedal",
    ]);
    expect((await getStudentCourse(EXAMPLE_STUDENT)).course.id).toBe(first.course.id);
    expect(studentCourses).toHaveLength(0);
    expect(
      fake.calls.filter((call) => call.table === "student_course" && call.op !== "select"),
    ).toHaveLength(0);

    const saved = await saveStudentCourse(EXAMPLE_STUDENT, {
      targetTerm: "2027-T2",
      items: [
        {
          id: "item-1",
          studentCourseId: first.course.id,
          sectionId: first.sections[0]!.id,
          title: "Ode to Joy",
          stage: 2,
          updatedAt: "2026-11-10T00:00:00Z",
        },
      ],
    });
    expect(saved.items.map((item) => item.title)).toEqual(["Ode to Joy"]);
    const row = fake.tables.student_course![0]!;
    expect(row).toMatchObject({
      id: first.course.id,
      studio_id: STUDIO_ID,
      student_id: EXAMPLE_STUDENT,
      status: "active",
    });
    const data = row.data as {
      items: { title: string }[];
      sections: unknown[];
      course: { targetTerm: string };
    };
    expect(data.items.map((item) => item.title)).toEqual(["Ode to Joy"]);
    expect(data.sections).toHaveLength(4);
    expect(data.course.targetTerm).toBe("2027-T2");
  });

  it("puts the course back if Supabase refuses the save", async () => {
    await signInLive(liveTables(), { failOn: "student_course.upsert" });
    const first = await getStudentCourse(EXAMPLE_STUDENT);
    await expect(
      saveStudentCourse(EXAMPLE_STUDENT, {
        targetTerm: "2027-T2",
        items: [
          {
            id: "item-1",
            studentCourseId: first.course.id,
            sectionId: first.sections[0]!.id,
            title: "Ode to Joy",
            stage: 1,
            updatedAt: "2026-11-10T00:00:00Z",
          },
        ],
      }),
    ).rejects.toThrow(/read-only|permission/);
    expect(studentCourses).toHaveLength(0);
    expect(courseItems).toHaveLength(0);
    expect((await getStudentCourse(EXAMPLE_STUDENT)).items).toHaveLength(0);
  });

  it("saves studio Library templates but never the supplied ones", async () => {
    const fake = await signInLive();
    const supplied = libraryState.demo.courses.find((course) => course.supplied)!;
    await copyTemplate("courses", supplied.id);
    const copy = libraryState.demo.courses.find((course) => !course.supplied)!;
    expect(fake.tables.library_item).toHaveLength(1);
    expect(fake.tables.library_item![0]).toMatchObject({
      id: copy.id,
      kind: "course",
      studio_id: STUDIO_ID,
    });
    await saveCourseTemplate({ ...copy, name: "Our beginner plan" });
    expect(fake.tables.library_item).toHaveLength(1);
    expect((fake.tables.library_item![0]!.data as { name: string }).name).toBe("Our beginner plan");
  });

  it("does not keep a Library copy Supabase refused", async () => {
    await signInLive(liveTables(), { failOn: "library_item.upsert" });
    const supplied = libraryState.demo.courses.find((course) => course.supplied)!;
    const before = libraryState.demo.courses.length;
    await expect(copyTemplate("courses", supplied.id)).rejects.toThrow();
    expect(libraryState.demo.courses).toHaveLength(before);
  });

  it("loads saved courses and Library templates at sign-in", async () => {
    const tables = liveTables();
    const courseId = "5f1c7e0e-4444-4444-8444-000000000001";
    tables.student_course = [
      {
        id: courseId,
        studio_id: STUDIO_ID,
        student_id: EXAMPLE_STUDENT,
        status: "active",
        data: {
          course: {
            id: courseId,
            studentId: EXAMPLE_STUDENT,
            framework: "AMEB",
            grade: "Grade 1",
            targetTerm: "2027-T1",
            weeklyPracticeGoalMin: 90,
            gradeHoursEstimate: 40,
            status: "active",
          },
          sections: [
            {
              id: `${courseId}-section-0`,
              framework: "AMEB",
              grade: "Grade 1",
              name: "Repertoire",
              weightPct: 100,
            },
          ],
          slots: [],
          items: [
            {
              id: "i1",
              studentCourseId: courseId,
              sectionId: `${courseId}-section-0`,
              title: "Minuet",
              stage: 3,
              updatedAt: "2026-11-01T00:00:00Z",
            },
          ],
          milestones: [],
          feedback: [],
        },
      },
    ];
    tables.library_item = [
      {
        id: "5f1c7e0e-5555-4555-8555-000000000001",
        studio_id: STUDIO_ID,
        kind: "lesson",
        data: {
          id: "x",
          name: "Our welcome",
          audience: "beginner",
          isWelcomeDefault: true,
          steps: [],
          supplied: true,
        },
      },
    ];
    await signInLive(tables);
    const course = await getStudentCourse(EXAMPLE_STUDENT);
    expect(course.course).toMatchObject({
      id: courseId,
      framework: "AMEB",
      weeklyPracticeGoalMin: 90,
    });
    expect(course.items.map((item) => item.title)).toEqual(["Minuet"]);
    const lessons = libraryState.demo.lessons.filter((lesson) => lesson.audience === "beginner");
    const ours = lessons.find((lesson) => lesson.name === "Our welcome")!;
    expect(ours).toMatchObject({
      id: "5f1c7e0e-5555-4555-8555-000000000001",
      supplied: false,
      isWelcomeDefault: true,
    });
    expect(lessons.filter((lesson) => lesson.isWelcomeDefault)).toHaveLength(1);
  });
});

describe("live invoices (0004 + 0016)", () => {
  beforeEach(() => {
    resetStudioWorkspaceForTests();
    resetLiveBillingForTests();
  });
  afterEach(() => setStudioStoreClientForTests(null));

  const line = {
    description: "Alex Example – 30 min lesson",
    qty: 10,
    unitCents: 4500,
    taxCents: 0,
    lineTotalCents: 45000,
    studentId: EXAMPLE_STUDENT,
    taxCode: "taxable" as const,
  };

  it("starts a real studio with no invoices and its own numbering", async () => {
    const tables = liveTables();
    tables.studio_billing_profile = [
      {
        studio_id: STUDIO_ID,
        invoice_prefix: "KPS-",
        next_invoice_number: 4,
        credit_note_prefix: "CN-",
        next_credit_note_number: 1,
        numbering_locked_at: null,
        pay_to_bsb: "062000",
        pay_to_account_number: "12345678",
        pay_to_account_name: "Test Studio",
        attach_pdf: true,
        pre_due_reminder_days: 3,
        receipt_emails: false,
        auto_send_term_invoices: false,
        tailored_pre_due_days: null,
        tailored_pre_due_note: null,
      },
    ];
    await signInLive(tables);
    expect(await getInvoices()).toEqual([]);
    expect(payments).toHaveLength(0);
    expect(billingProfileState.demo).toMatchObject({
      invoicePrefix: "KPS-",
      nextInvoiceNumber: 4,
      receiptEmails: false,
      payTo: { bsb: "062000", accountNumber: "12345678", accountName: "Test Studio" },
    });
  });

  it("saves a draft, lets the database number it on send, and records a payment", async () => {
    const fake = await signInLive();
    const draft = await createInvoice({ familyId: EXAMPLE_FAMILY, lines: [line] });
    expect(draft.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(draft.issueDate).not.toMatch(/^2027-03-15/);
    expect(fake.tables.invoice).toHaveLength(1);
    expect(fake.tables.invoice![0]).toMatchObject({
      id: draft.id,
      status: "draft",
      number: null,
      total_cents: 45000,
    });
    expect(fake.tables.invoice_line).toHaveLength(1);

    await updateDraft(draft.id, {
      lines: [
        line,
        { ...line, description: "Book", qty: 1, unitCents: 2000, lineTotalCents: 2000 },
      ],
    });
    expect(fake.tables.invoice_line).toHaveLength(2);

    const sent = await sendInvoice(draft.id);
    expect(fake.rpcCalls.map(([name]) => name)).toEqual(["send_studio_invoice"]);
    expect(sent).toMatchObject({ number: "INV-000001", status: "sent" });
    expect(fake.tables.invoice![0]).toMatchObject({ number: "INV-000001", status: "sent" });
    expect(
      (fake.tables.invoice![0]!.snapshot as { totals: { totalCents: number } }).totals.totalCents,
    ).toBe(47000);
    expect(billingProfileState.demo.nextInvoiceNumber).toBe(2);
    expect((fake.tables.invoice_event ?? []).map((event) => event.kind)).toEqual(
      expect.arrayContaining(["created", "sent"]),
    );

    const paid = await recordPayment(draft.id, { method: "bank_transfer", amountCents: 47000 });
    expect(paid.status).toBe("paid");
    expect(fake.tables.payment).toHaveLength(1);
    expect(fake.tables.payment![0]).toMatchObject({
      invoice_id: draft.id,
      amount_cents: 47000,
      method: "bank_transfer",
    });
    expect(fake.tables.invoice![0]!.status).toBe("paid");
  });

  it("does not keep a payment or invoice change Supabase refused", async () => {
    await signInLive(liveTables(), { failOn: "payment.insert" });
    const draft = await createInvoice({ familyId: EXAMPLE_FAMILY, lines: [line] });
    await sendInvoice(draft.id);
    const eventsBefore = invoiceEvents.length;
    await expect(recordPayment(draft.id, { method: "cash", amountCents: 1000 })).rejects.toThrow(
      /permission|read-only/,
    );
    expect(payments).toHaveLength(0);
    expect((await getInvoices())[0]!.status).toBe("sent");
    expect(invoiceEvents).toHaveLength(eventsBefore);
  });

  it("does not send an invoice the database would not number", async () => {
    await signInLive(liveTables(), { failOn: "rpc.send_studio_invoice" });
    const draft = await createInvoice({ familyId: EXAMPLE_FAMILY, lines: [line] });
    await expect(sendInvoice(draft.id)).rejects.toThrow();
    const [after] = await getInvoices();
    expect(after).toMatchObject({ status: "draft", number: null });
  });

  it("numbers credit notes in the database and deletes drafts", async () => {
    const fake = await signInLive();
    const note = await issueCreditNote({
      familyId: EXAMPLE_FAMILY,
      amountCents: 2000,
      reason: "Missed lesson",
    });
    expect(note.number).toBe("CN-000001");
    expect(fake.tables.credit_note![0]).toMatchObject({
      number: "CN-000001",
      amount_cents: 2000,
      status: "open",
    });
    expect(creditNotes).toHaveLength(1);

    const draft = await createInvoice({ familyId: EXAMPLE_FAMILY, lines: [line] });
    await deleteDraft(draft.id);
    expect(fake.tables.invoice).toHaveLength(0);
  });

  it("loads saved invoices, lines and payments at sign-in", async () => {
    const tables = liveTables();
    const invoiceId = "5f1c7e0e-6666-4666-8666-000000000001";
    tables.invoice = [
      {
        id: invoiceId,
        studio_id: STUDIO_ID,
        family_id: EXAMPLE_FAMILY,
        number: "INV-000001",
        status: "partially_paid",
        kind: "standard",
        related_invoice_id: null,
        bill_to_guardian_id: null,
        cc_guardian_ids: [],
        billing_period_start: null,
        billing_period_end: null,
        terms_version_id: null,
        snapshot: null,
        pdf_path: null,
        pdf_sha256: null,
        collection: "manual",
        queried_at: null,
        query_resolved_at: null,
        voided_at: null,
        void_reason: null,
        sent_at: "2026-11-01T00:00:00Z",
        issue_date: "2026-11-01",
        due_date: "2026-11-15",
        subtotal_cents: 45000,
        tax_cents: 0,
        total_cents: 45000,
        is_tax_invoice: false,
        gst_registered: false,
        title: "Invoice",
        term_key: null,
        reviewed_at: null,
        xero_synced_at: null,
        invoice_line: [
          {
            id: "l1",
            description: "Lessons",
            qty: 10,
            unit_cents: 4500,
            tax_cents: 0,
            line_total_cents: 45000,
            student_id: EXAMPLE_STUDENT,
            lesson_type_id: null,
            tax_code: "taxable",
            credit_note_id: null,
            created_at: "2026-11-01T00:00:00Z",
          },
        ],
      },
    ];
    tables.payment = [
      {
        id: "5f1c7e0e-7777-4777-8777-000000000001",
        studio_id: STUDIO_ID,
        invoice_id: invoiceId,
        family_id: EXAMPLE_FAMILY,
        amount_cents: 20000,
        method: "payid",
        received_on: "2026-11-05",
        reference: null,
        recorded_by: null,
        reverses_payment_id: null,
        stripe_payment_intent_id: null,
        xero_synced_at: null,
      },
    ];
    await signInLive(tables);
    const [loaded] = await getInvoices();
    expect(loaded).toMatchObject({
      id: invoiceId,
      number: "INV-000001",
      paidCents: 20000,
      balanceCents: 25000,
    });
    expect(loaded!.lines.map((entry) => entry.description)).toEqual(["Lessons"]);
  });
});

describe("live practice logs and notes (0023)", () => {
  beforeEach(() => resetStudioWorkspaceForTests());
  afterEach(() => setStudioStoreClientForTests(null));

  it("loads the studio's practice and notes at sign-in", async () => {
    const tables = liveTables();
    const today = new Date().toISOString().slice(0, 10);
    tables["practice_log"] = [
      {
        id: "pl-row-1",
        studio_id: STUDIO_ID,
        student_id: EXAMPLE_STUDENT,
        practice_date: today,
        minutes: 25,
        logged_by: "parent",
      },
    ];
    tables["client_note"] = [
      {
        id: "note-row-1",
        studio_id: STUDIO_ID,
        subject_type: "student",
        subject_id: EXAMPLE_STUDENT,
        body: "Scales next week",
        category: "lesson",
        visibility: "shared",
        pinned: false,
        lesson_occurrence_id: "ser-1:2026-11-23",
        author_name: "Ms Phan",
        created_at: "2026-11-23T07:00:00Z",
      },
    ];
    await signInLive(tables);
    expect(practiceLogs).toEqual([
      { id: "pl-row-1", studentId: EXAMPLE_STUDENT, date: today, minutes: 25, loggedBy: "student" },
    ]);
    expect(clientNotes).toEqual([
      expect.objectContaining({
        id: "note-row-1",
        lessonOccurrenceId: "ser-1:2026-11-23",
        visibility: "shared",
      }),
    ]);
  });

  it("saves practice and lesson notes to the database before showing them", async () => {
    const fake = await signInLive();
    await addPractice({
      studentId: EXAMPLE_STUDENT,
      date: "2026-11-23",
      minutes: 30,
      loggedBy: "teacher",
    });
    expect(fake.tables["practice_log"]).toEqual([
      expect.objectContaining({
        studio_id: STUDIO_ID,
        student_id: EXAMPLE_STUDENT,
        minutes: 30,
        logged_by: "teacher",
        logged_by_user_id: "owner-1",
      }),
    ]);
    await addNote({
      subjectType: "student",
      subjectId: EXAMPLE_STUDENT,
      body: " Lovely tone ",
      category: "lesson",
      visibility: "shared",
      lessonOccurrenceId: "ser-1:2026-11-23",
    });
    expect(fake.tables["client_note"]).toEqual([
      expect.objectContaining({
        studio_id: STUDIO_ID,
        body: "Lovely tone",
        visibility: "shared",
        lesson_occurrence_id: "ser-1:2026-11-23",
        author_user_id: "owner-1",
      }),
    ]);
    expect(clientNotes).toHaveLength(1);
  });

  it("does not show a note or practice Supabase refused", async () => {
    await signInLive(liveTables(), { failOn: "client_note.insert" });
    await expect(
      addNote({
        subjectType: "student",
        subjectId: EXAMPLE_STUDENT,
        body: "Hi",
        category: "lesson",
      }),
    ).rejects.toThrow();
    expect(clientNotes).toHaveLength(0);
    setStudioStoreClientForTests(null);
    resetStudioWorkspaceForTests();
    await signInLive(liveTables(), { failOn: "practice_log.insert" });
    await expect(
      addPractice({
        studentId: EXAMPLE_STUDENT,
        date: "2026-11-23",
        minutes: 10,
        loggedBy: "teacher",
      }),
    ).rejects.toThrow();
    expect(practiceLogs).toHaveLength(0);
  });
});

describe("live enrol wizard progress (0024)", () => {
  beforeEach(() => resetStudioWorkspaceForTests());
  afterEach(() => setStudioStoreClientForTests(null));

  const STUDENT = "5f1c7e0e-3333-4333-8333-000000000099";
  const INVITE = "5f1c7e0e-9999-4999-8999-000000000001";
  const intake = {
    experience: "beginner",
    previousGrades: "",
    theoryExams: "",
    instrument: "digital",
    goal: "Play for fun",
    daysPerWeek: 5,
    minutesPerDay: 15,
  };
  function invitedTables(): Tables {
    const tables = liveTables();
    tables.student!.push({
      id: STUDENT,
      studio_id: STUDIO_ID,
      family_id: EXAMPLE_FAMILY,
      first_name: "Mia",
      last_name: "Nguyen",
      birth_year: 2018,
      exam_date: null,
      target_term: null,
      grade_goal: null,
      is_example: false,
    });
    tables["invitation"] = [
      { id: INVITE, studio_id: STUDIO_ID, status: "completed", created_at: "2026-11-20T00:00:00Z" },
    ];
    tables["invitation_student"] = [
      { invitation_id: INVITE, student_id: STUDENT, studio_id: STUDIO_ID },
    ];
    tables["intake_response"] = [
      {
        studio_id: STUDIO_ID,
        student_id: STUDENT,
        answers: intake,
        submitted_at: "2026-11-21T00:00:00Z",
      },
    ];
    tables["enrolment_progress"] = [];
    return tables;
  }
  const draft = () => {
    const found = enrolmentDrafts.find((entry) => entry.studentId === STUDENT);
    if (!found) throw new Error("no draft for the invited student");
    return found;
  };

  it("starts real studios on today's terms, not the fixed 2027 list", async () => {
    await signInLive(invitedTables());
    const now = currentTermKey(new Date());
    expect(onboardingTermOptions()[0]).toBe(now);
    expect(onboardingTermOptions()).toHaveLength(5);
    expect(paceTerms()).toEqual(onboardingTermOptions().slice(1, 4));
    expect(defaultTargetTerm()).toBe(onboardingTermOptions()[2]);
    expect(draft().targetTerm).toBe(defaultTargetTerm());
  });

  it("saves each step and resumes there after signing in again", async () => {
    const tables = invitedTables();
    await signInLive(tables);
    const start = draft();
    expect(start.step).toBe(1);
    expect(start.status).toBe("intake_done");
    const steps = start.welcomeTemplate!.steps.map((step) => step.contentItemId);
    await saveEnrolment(start.id, { ...start, step: 2 });
    await saveEnrolment(start.id, {
      ...draft(),
      welcomeChecks: steps,
      startingStages: { Repertoire: 2 },
      step: 3,
    });
    await saveEnrolment(start.id, {
      ...draft(),
      gradeHours: 30,
      lessonMinutes: 45,
      practiceGoal: 90,
      targetTerm: onboardingTermOptions()[3]!,
      step: 4,
    });
    await saveEnrolment(start.id, { ...draft(), strengths: "Good ear", workOn: "Posture" });
    expect(tables["enrolment_progress"]).toHaveLength(1);
    expect(tables["enrolment_progress"]![0]).toMatchObject({
      studio_id: STUDIO_ID,
      student_id: STUDENT,
      step: 4,
      status: "welcome_done",
    });

    // New sign-in (another device, a refresh): the wizard opens on step 4 with the answers.
    resetStudioWorkspaceForTests();
    await signInLive(tables);
    expect(draft()).toMatchObject({
      step: 4,
      status: "welcome_done",
      welcomeChecks: steps,
      startingStages: { Repertoire: 2 },
      gradeHours: 30,
      lessonMinutes: 45,
      practiceGoal: 90,
      targetTerm: onboardingTermOptions()[3],
      strengths: "Good ear",
      workOn: "Posture",
    });
  });

  it("keeps the teacher on the step when Supabase refuses the save", async () => {
    const tables = invitedTables();
    await signInLive(tables, { failOn: "enrolment_progress.upsert" });
    const start = draft();
    await expect(saveEnrolment(start.id, { ...start, step: 2 })).rejects.toThrow(
      /permission|studio is read-only/,
    );
    expect(draft().step).toBe(1);
    expect(tables["enrolment_progress"]).toHaveLength(0);
  });

  it("works as before, for this session only, until migration 0024 is run", async () => {
    const tables = invitedTables();
    await signInLive(tables, {
      failOn: "enrolment_progress.upsert",
      failWith: { message: 'relation "public.enrolment_progress" does not exist', code: "42P01" },
    });
    const start = draft();
    await saveEnrolment(start.id, { ...start, step: 2 });
    expect(draft().step).toBe(2);
  });

  it("marks progress active on activation and doesn't offer the student again", async () => {
    const tables = invitedTables();
    await signInLive(tables);
    const start = draft();
    const steps = start.welcomeTemplate!.steps.map((step) => step.contentItemId);
    await saveEnrolment(start.id, {
      ...start,
      welcomeChecks: steps,
      step: 4,
      strengths: "Ear",
      workOn: "Hands",
    });
    const done = await activateEnrolment(start.id);
    expect(done.status).toBe("active");
    expect(done.completedAt?.slice(0, 4)).toBe(String(new Date().getFullYear()));
    expect(tables["enrolment_progress"]![0]).toMatchObject({ status: "active" });
    expect(tables["enrolment_progress"]![0]!["completed_at"]).toBeTruthy();
    expect(tables.student_course!.some((row) => row["student_id"] === STUDENT)).toBe(true);

    resetStudioWorkspaceForTests();
    await signInLive(tables);
    expect(enrolmentDrafts.some((entry) => entry.studentId === STUDENT)).toBe(false);
  });
});

describe("bill next term on real studios (0027)", () => {
  beforeEach(() => {
    resetStudioWorkspaceForTests();
    resetLiveBillingForTests();
  });
  afterEach(() => setStudioStoreClientForTests(null));

  const FAMILY = "5f1c7e0e-2222-4222-8222-000000000002";
  const KID = "5f1c7e0e-3333-4333-8333-000000000002";
  const TERM = { key: "2027-T1", name: "Term 1 2027", start: "2027-02-03", end: "2027-04-09" };

  function termTables(rule: "skip" | "make_up" | "charge" = "skip") {
    const tables = liveTables();
    (tables.studio![0] as Row).profile = {
      studio: { state: "NSW", policies: { publicHolidays: rule } },
      lessonTypes: [{ id: "lt-30", name: "30 min lesson", durationMin: 30, priceCents: 4500 }],
    };
    tables.family!.push({
      id: FAMILY,
      studio_id: STUDIO_ID,
      display_name: "Chen family",
      media_consent: null,
      news_photo_consent: null,
      is_example: false,
      guardian: [{ id: "g-chen", full_name: "Lin Chen", email: "lin@example.com", mobile: null, preferred_language: "en" }],
    });
    tables.student!.push({
      id: KID,
      studio_id: STUDIO_ID,
      family_id: FAMILY,
      first_name: "Mia",
      last_name: "Chen",
      birth_year: 2016,
      exam_date: null,
      target_term: null,
      grade_goal: null,
      is_example: false,
    });
    (tables as Record<string, Row[]>)["lesson_series"] = [
      {
        id: "ser-mia",
        studio_id: STUDIO_ID,
        student_id: KID,
        teacher_user_id: "owner-1",
        repeat: "weekly",
        first_date: "2026-11-02",
        until_date: null,
        start_time: "16:00:00",
        duration_min: 30,
      },
    ];
    (tables as Record<string, Row[]>)["lesson_exception"] = [];
    (tables as Record<string, Row[]>)["makeup_credit"] = [];
    return tables;
  }
  const input = { term: TERM, holidayDates: ["2027-03-26", "2027-03-29"], closures: [] };

  it("counts the term's lessons, skips Easter Monday, and makes one draft per family once", async () => {
    const fake = await signInLive(termTables());
    const preview = await previewLiveTerm(input);
    expect(preview.families.map((row) => row.familyName)).toEqual(["Chen family"]);
    const mia = preview.families[0]!.students[0]!;
    expect(mia).toMatchObject({ problem: null, unitCents: 4500, skipped: ["2027-03-29"] });
    expect(mia.dates).toHaveLength(8);
    expect(preview.families[0]!.ready).toBe(true);

    const drafts = await prepareLiveTermDrafts(input);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ termKey: "2027-T1", totalCents: 36000, dueDate: "2027-02-03" });
    expect(fake.tables.invoice).toHaveLength(1);
    expect(fake.tables.invoice![0]).toMatchObject({ term_key: "2027-T1", billing_period_start: "2027-02-03", status: "draft" });
    // Preparing again adds nothing.
    await prepareLiveTermDrafts(input);
    expect(fake.tables.invoice).toHaveLength(1);
    expect((await previewLiveTerm(input)).families[0]!.invoice?.status).toBe("draft");

    const sent = await sendLiveTermInvoices("2027-T1");
    expect(sent).toHaveLength(1);
    expect(fake.tables.invoice![0]).toMatchObject({ status: "sent", number: "INV-000001" });
    expect(liveTermDrafts("2027-T1")).toEqual([]);
  });

  it("charges a make-up holiday and names it on the line", async () => {
    await signInLive(termTables("make_up"));
    const [draft] = await prepareLiveTermDrafts(input);
    expect(draft!.lines[0]!.qty).toBe(9);
    expect(draft!.lines[0]!.description).toContain("29 Mar public holiday, make-up offered");
  });

  it("leaves out students with no price, and families who haven't confirmed a renewal", async () => {
    const tables = termTables();
    (tables.studio![0] as Row).profile.lessonTypes = [{ id: "lt-30", name: "30 min lesson", durationMin: 30, priceCents: 0 }];
    await signInLive(tables);
    const preview = await previewLiveTerm(input);
    expect(preview.families[0]!.students[0]!.problem).toBe("no_price");
    expect(await prepareLiveTermDrafts(input)).toEqual([]);

    resetStudioWorkspaceForTests();
    resetLiveBillingForTests();
    const asked = termTables();
    (asked as Record<string, Row[]>)["renewal_campaign"] = [
      {
        id: "camp-1",
        studio_id: STUDIO_ID,
        term_key: "2027-T1",
        term_start: TERM.start,
        term_end: TERM.end,
        deadline: "2027-01-20",
        renewal_response: [
          { id: "resp-1", family_id: FAMILY, status: "awaiting", invited_at: "2026-12-01T00:00:00Z", reminded_at: null, responded_at: null, responded_by: null, note: null },
        ],
      },
    ];
    await signInLive(asked);
    const waiting = await previewLiveTerm(input);
    expect(waiting.families[0]).toMatchObject({ renewal: "awaiting", ready: false });
    expect(await prepareLiveTermDrafts(input)).toEqual([]);
  });

  it("is Pro only", async () => {
    const tables = termTables();
    owner.studioAccess[0]!.plan = "base" as never;
    try {
      await signInLive(tables);
      await expect(prepareLiveTermDrafts(input)).rejects.toThrow(/Pro/);
    } finally {
      owner.studioAccess[0]!.plan = "pro";
    }
  });
});
