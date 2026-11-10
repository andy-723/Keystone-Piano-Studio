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
import { getStudentCourse, saveStudentCourse } from "@/services/curriculum";
import { copyTemplate, saveCourseTemplate } from "@/services/library";
import { clientNotes } from "@/mocks/notes";
import { opusInvoices } from "@/mocks/plans";
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
import { startEnrolment } from "@/services/onboarding";
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

type Row = Record<string, unknown>;
type Call = {
  table: string;
  op: string;
  payload?: unknown;
  filters: Array<[string, unknown]>;
  other: Array<[string, unknown, "neq" | "is"]>;
};

/** Just enough of the Supabase query builder for the studio store. */
function fakeSupabase(tables: Record<string, Row[]>, options: { failOn?: string } = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [], other: [] };
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
          error: { message: "new row violates row-level security policy", code: "42501" },
        };
      }
      if (call.op === "upsert") {
        const list = (Array.isArray(call.payload) ? call.payload : [call.payload]) as Row[];
        const current = tables[table] ?? [];
        for (const row of list) {
          const existing = current.find((entry) => entry.id === row.id);
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
      upsert: (payload: unknown) => (
        (call.op = "upsert"),
        (call.payload = payload),
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
  return { client: { from } as never, calls, tables };
}

const STUDIO_ID = "5f1c7e0e-1111-4111-8111-000000000001";
const EXAMPLE_FAMILY = "5f1c7e0e-2222-4222-8222-000000000001";
const EXAMPLE_STUDENT = "5f1c7e0e-3333-4333-8333-000000000001";

function liveTables(): Record<string, Row[]> {
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

async function signInLive(tables = liveTables(), options: { failOn?: string } = {}) {
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
      "Musicianship",
      "Theory",
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
