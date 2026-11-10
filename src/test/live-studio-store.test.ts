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
import { studentCourses } from "@/mocks/curriculum";
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

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };

/** Just enough of the Supabase query builder for the studio store. */
function fakeSupabase(tables: Record<string, Row[]>, options: { failOn?: string } = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const rowsFor = () =>
      (tables[table] ?? []).filter((row) =>
        call.filters.every(([column, value]) => column.includes(".") || row[column] === value),
      );
    const result = () => {
      if (options.failOn === `${table}.${call.op}`) {
        return {
          data: null,
          error: { message: "new row violates row-level security policy", code: "42501" },
        };
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
    for (const list of [
      conversations,
      messages,
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
