import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The real-studio family enrolment form (src/server/family-join.ts) over a small in-memory
 * stand-in for the Supabase tables it uses.
 */
type Row = Record<string, unknown>;

const fake = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  users: [] as { id: string; email: string }[],
  accessLevel: "full" as string,
}));

function makeClient() {
  function query(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: {
      kind: "select" | "insert" | "update" | "upsert";
      payload?: unknown;
      conflict?: string[];
    } = {
      kind: "select",
    };
    let order: { column: string; ascending: boolean } | null = null;
    let limit: number | null = null;
    const value = (row: Row, column: string): unknown =>
      column.includes(".")
        ? column.split(".").reduce<unknown>((acc, key) => (acc as Row | undefined)?.[key], row)
        : row[column];
    const run = (): Row[] => {
      const rows = (fake.tables[table] ??= []);
      if (op.kind === "insert" || op.kind === "upsert") {
        const list = (Array.isArray(op.payload) ? op.payload : [op.payload]) as Row[];
        return list.map((entry) => {
          if (op.kind === "upsert" && op.conflict) {
            const existing = rows.find((row) =>
              op.conflict!.every((key) => row[key] === entry[key]),
            );
            if (existing) return Object.assign(existing, entry);
          }
          const created = {
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            ...entry,
          };
          rows.push(created);
          return created;
        });
      }
      let matched = rows.filter((row) => filters.every((test) => test(row)));
      if (op.kind === "update") {
        matched.forEach((row) => Object.assign(row, op.payload as Row));
        return matched;
      }
      if (order) {
        const { column, ascending } = order;
        matched = [...matched].sort(
          (a, b) =>
            String(a[column]).localeCompare(String(b[column]), undefined, { numeric: true }) *
            (ascending ? 1 : -1),
        );
      }
      return limit == null ? matched : matched.slice(0, limit);
    };
    const chain = {
      select: () => chain,
      insert: (payload: unknown) => ((op = { kind: "insert", payload }), chain),
      update: (payload: unknown) => ((op = { kind: "update", payload }), chain),
      upsert: (payload: unknown, options?: { onConflict?: string }) => (
        (op = { kind: "upsert", payload, conflict: options?.onConflict?.split(",") ?? [] }),
        chain
      ),
      eq: (column: string, v: unknown) => (filters.push((row) => value(row, column) === v), chain),
      neq: (column: string, v: unknown) => (filters.push((row) => value(row, column) !== v), chain),
      is: (column: string, v: unknown) => (
        filters.push((row) => (value(row, column) ?? null) === v),
        chain
      ),
      not: (column: string, _op: string, v: unknown) => (
        filters.push((row) => (value(row, column) ?? null) !== v),
        chain
      ),
      in: (column: string, values: unknown[]) => (
        filters.push((row) => values.includes(value(row, column))),
        chain
      ),
      order: (column: string, options?: { ascending?: boolean }) => (
        (order = { column, ascending: options?.ascending ?? true }),
        chain
      ),
      limit: (n: number) => ((limit = n), chain),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => {
        const rows = run();
        return rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { message: "No row" } };
      },
      then: (
        resolve: (value: { data: Row[]; error: null }) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        try {
          return Promise.resolve(resolve({ data: run(), error: null }));
        } catch (error) {
          return reject ? Promise.resolve(reject(error)) : Promise.reject(error);
        }
      },
    };
    return chain;
  }
  return {
    from: query,
    rpc: async () => ({ data: null, error: null }),
    auth: {
      admin: {
        createUser: async ({ email }: { email: string }) => {
          if (fake.users.some((user) => user.email === email)) {
            return {
              data: { user: null },
              error: { message: "A user with this email address has already been registered" },
            };
          }
          const user = { id: crypto.randomUUID(), email };
          fake.users.push(user);
          return { data: { user }, error: null };
        },
        generateLink: async ({ email }: { email: string }) => {
          const user = fake.users.find((entry) => entry.email === email);
          if (!user)
            return { data: { user: null, properties: null }, error: { message: "User not found" } };
          return { data: { user, properties: { hashed_token: "hashedtoken123456" } }, error: null };
        },
      },
    },
  };
}

vi.mock("@/server/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/env")>();
  return {
    ...original,
    isMockOnboarding: () => false,
    getServerEnv: () => ({
      ...original.getServerEnv(),
      appUrl: "https://www.keystonemusichq.com",
      emailFrom: "Keystone Music HQ <noreply@keystonemusichq.com>",
      resendApiKey: "re_test",
      turnstileSiteKey: "site-key",
      turnstileSecretKey: "secret",
    }),
  };
});
vi.mock("@/server/supabase", () => ({ createServiceSupabase: () => makeClient() }));
vi.mock("@/server/subscription-store", () => ({
  getStudioAccess: async () => ({ level: fake.accessLevel, subscription: null }),
}));
vi.mock("@/server/turnstile", () => ({
  verifyTurnstile: async (token: string | undefined) => token === "captcha-ok",
}));

import { sha256Hex } from "@/lib/onboarding/crypto";
import { setEmailProviderForTests, type SendEmailInput } from "@/server/email";
import {
  autosaveLiveJoin,
  loadLiveJoin,
  submitLiveJoin,
  unlockLiveJoin,
} from "@/server/family-join";
import { draftForInvitedStudent, loadLiveEnrolments } from "@/services/live/enrolment-store";
import { enrolmentDrafts } from "@/mocks/onboarding";
import type { TermsState } from "@/mocks/terms";
import type { JoinAnswers } from "@/lib/onboarding/submission";

const STUDIO = "11111111-1111-4111-8111-111111111111";
const FAMILY = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const GUARDIAN = "44444444-4444-4444-8444-444444444444";
const INVITE = "55555555-5555-4555-8555-555555555555";
const TERMS_V1 = "66666666-6666-4666-8666-666666666666";
const TOKEN = "ab".repeat(32);

let ipCounter = 0;
const meta = () => ({ ip: `198.51.100.${++ipCounter}`, userAgent: "vitest" });

async function seed(overrides: { expiresAt?: string; withTerms?: boolean } = {}) {
  fake.tables = {
    studio: [
      {
        id: STUDIO,
        name: "Sunny Keys Studio",
        reply_to_email: "hello@sunnykeys.test",
        profile: { teacher: { name: "Ms Lee" } },
      },
    ],
    family: [{ id: FAMILY, studio_id: STUDIO, display_name: "Nguyen family" }],
    guardian: [
      {
        id: GUARDIAN,
        family_id: FAMILY,
        studio_id: STUDIO,
        full_name: "Jane Nguyen",
        email: "jane@family.test",
        mobile: null,
        user_id: null,
      },
    ],
    student: [
      {
        id: STUDENT,
        family_id: FAMILY,
        studio_id: STUDIO,
        first_name: "Mia",
        last_name: "Nguyen",
        birth_year: 2016,
      },
    ],
    invitation: [
      {
        id: INVITE,
        studio_id: STUDIO,
        family_id: FAMILY,
        email: "jane@family.test",
        language: "en",
        token_hash: await sha256Hex(TOKEN),
        status: "sent",
        expires_at: overrides.expiresAt ?? new Date(Date.now() + 7 * 864e5).toISOString(),
      },
    ],
    invitation_student: [{ invitation_id: INVITE, student_id: STUDENT, studio_id: STUDIO }],
    intake_response: [
      {
        id: crypto.randomUUID(),
        invitation_id: INVITE,
        studio_id: STUDIO,
        student_id: null,
        answers: {
          children: { [STUDENT]: { firstName: "Mia", lastName: "Nguyen", birthYear: 2016 } },
        },
        current_step: "collection",
        created_at: "2026-11-17T00:00:00Z",
      },
    ],
    terms_document: [{ id: "doc-1", studio_id: STUDIO, kind: "studio_agreement" }],
    terms_version:
      overrides.withTerms === false
        ? []
        : [
            {
              id: TERMS_V1,
              document_id: "doc-1",
              studio_id: STUDIO,
              version_no: 1,
              rendered_markdown: "# Sunny Keys studio agreement",
              merge_values: { billing: { cycle: "per_term", lateFee: 20 } },
              sha256: "f".repeat(64),
              change_type: "initial",
              effective_at: "2026-11-01T00:00:00Z",
              terms_document: { kind: "studio_agreement" },
            },
          ],
    terms_acceptance: [],
    consent_record: [],
    auth_audit: [],
    conversation: [],
    message: [],
  };
}

const answers = (): JoinAnswers => ({
  fillerName: "Jane Nguyen",
  relationship: "parent",
  mobile: "0412 345 678",
  collectionAcknowledged: true,
  terms: {
    studioAgreed: true,
    keystoneAgreed: true,
    guardianDeclaration: true,
    typedName: "Jane Nguyen",
    relationship: "parent",
  },
  children: {
    [STUDENT]: {
      firstName: "Mia",
      lastName: "Nguyen",
      birthYear: 2016,
      experience: "beginner",
      instrument: "digital",
      goalKind: "fun",
      daysPerWeek: 5,
      minutesPerDay: 15,
      emergencyMedical: true,
      mediaPublic: false,
    },
  },
});

describe("family enrolment form for real studios", () => {
  const sent: SendEmailInput[] = [];

  beforeEach(async () => {
    sent.length = 0;
    fake.users = [];
    fake.accessLevel = "full";
    await seed();
    setEmailProviderForTests({
      async send(input) {
        sent.push(input);
        return { id: `email-${sent.length}` };
      },
    });
  });
  afterEach(() => setEmailProviderForTests(null));

  it("opens a real invite link from the database, with the studio's own terms", async () => {
    const session = await loadLiveJoin(TOKEN, meta());
    expect(session.state).toBe("active");
    if (session.state !== "active") return;
    expect(session.live).toBe(true);
    expect(session.studioName).toBe("Sunny Keys Studio");
    expect(session.teacherName).toBe("Ms Lee");
    expect(session.students.map((s) => s.firstName)).toEqual(["Mia"]);
    expect(session.terms?.versionId).toBe(TERMS_V1);
    expect(session.terms?.moneyRules.lateFee).toContain("$20");
    expect(fake.tables["invitation"]![0]!["status"]).toBe("opened");
    expect(fake.tables["auth_audit"]!.map((row) => row["event"])).toEqual(["invite_opened"]);
  });

  it("refuses unknown, expired and terms-less links with a clear message", async () => {
    expect((await loadLiveJoin("cd".repeat(32), meta())).state).toBe("unavailable");
    expect((await loadLiveJoin("not-a-token", meta())).state).toBe("unavailable");

    await seed({ expiresAt: "2026-01-01T00:00:00Z" });
    const expired = await loadLiveJoin(TOKEN, meta());
    expect(expired).toMatchObject({ state: "unavailable", teacherName: "Ms Lee" });
    expect(fake.tables["invitation"]![0]!["status"]).toBe("expired");

    await seed({ withTerms: false });
    const noTerms = await loadLiveJoin(TOKEN, meta());
    expect(noTerms.state).toBe("unavailable");
    if (noTerms.state === "unavailable")
      expect(noTerms.message).toContain("hasn't published its studio terms");
  });

  it("won't save answers until the security check passes, and keeps that flag server-side", async () => {
    await expect(
      autosaveLiveJoin(
        { token: TOKEN, currentStep: "filler", answers: { fillerName: "J" } },
        meta(),
      ),
    ).rejects.toThrow("security check");
    await expect(unlockLiveJoin({ token: TOKEN, turnstileToken: "bad" }, meta())).rejects.toThrow(
      "Security check failed",
    );
    await unlockLiveJoin({ token: TOKEN, turnstileToken: "captcha-ok" }, meta());
    const saved = await autosaveLiveJoin(
      {
        token: TOKEN,
        currentStep: "mobile",
        answers: { fillerName: "Jane", turnstileUnlocked: false },
      },
      meta(),
    );
    expect(saved.savedAt).toBeTruthy();
    const row = fake.tables["intake_response"]![0]!;
    expect(row["current_step"]).toBe("mobile");
    expect(row["answers"]).toMatchObject({ fillerName: "Jane", turnstileUnlocked: true });
  });

  it("submits: records terms, consents and intake, makes the parent's sign-in account and emails a link", async () => {
    await unlockLiveJoin({ token: TOKEN, turnstileToken: "captcha-ok" }, meta());
    const result = await submitLiveJoin(
      { token: TOKEN, answers: answers(), termsVersionId: TERMS_V1 },
      meta(),
    );
    expect(result).toMatchObject({
      ok: true,
      guardianName: "Jane Nguyen",
      email: "jane@family.test",
      loginLinkSent: true,
    });

    const user = fake.users.find((entry) => entry.email === "jane@family.test");
    expect(user).toBeTruthy();
    expect(fake.tables["guardian"]![0]).toMatchObject({
      user_id: user!.id,
      mobile: "0412 345 678",
    });

    const acceptances = fake.tables["terms_acceptance"]!;
    expect(acceptances.map((row) => row["document_kind"]).sort()).toEqual([
      "family_app_terms",
      "studio_agreement",
    ]);
    expect(acceptances.find((row) => row["document_kind"] === "studio_agreement")).toMatchObject({
      version_id: TERMS_V1,
      typed_name: "Jane Nguyen",
      capacity: "guardian",
      guardian_id: GUARDIAN,
      invitation_id: INVITE,
      student_ids: [STUDENT],
    });
    const appVersion = fake.tables["terms_version"]!.find((row) =>
      row["change_summary"]?.toString().includes("family app terms"),
    );
    expect(appVersion).toBeTruthy();
    expect(
      acceptances.find((row) => row["document_kind"] === "family_app_terms")?.["version_id"],
    ).toBe(appVersion!["id"]);

    expect(fake.tables["consent_record"]!.map((row) => [row["type"], row["granted"]])).toEqual([
      ["emergency_medical", true],
      ["media_public", false],
    ]);
    const studentIntake = fake.tables["intake_response"]!.find(
      (row) => row["student_id"] === STUDENT,
    );
    expect(studentIntake?.["answers"]).toMatchObject({
      experience: "beginner",
      instrument: "digital",
      daysPerWeek: 5,
    });
    expect(fake.tables["invitation"]![0]!["status"]).toBe("completed");
    expect(fake.tables["message"]![0]).toMatchObject({
      author_role: "guardian",
      body: expect.stringContaining("Enrolment form completed"),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("jane@family.test");
    expect(sent[0]!.html).toContain(
      "/auth/callback?token_hash=hashedtoken123456&amp;type=magiclink",
    );
    expect(sent[0]!.from).toContain("noreply@keystonemusichq.com");

    // The link now says it's done, and can't be submitted twice.
    expect(await loadLiveJoin(TOKEN, meta())).toMatchObject({
      state: "completed",
      loginEmail: "jane@family.test",
    });
    await expect(submitLiveJoin({ token: TOKEN, answers: answers() }, meta())).rejects.toThrow(
      "already been completed",
    );
  });

  it("links an existing Keystone account instead of making a second one", async () => {
    fake.users.push({ id: "existing-user", email: "jane@family.test" });
    await unlockLiveJoin({ token: TOKEN, turnstileToken: "captcha-ok" }, meta());
    await submitLiveJoin({ token: TOKEN, answers: answers() }, meta());
    expect(fake.users).toHaveLength(1);
    expect(fake.tables["guardian"]![0]!["user_id"]).toBe("existing-user");
  });

  it("refuses a submit without the security check, after a terms change, or a self-enrolled child", async () => {
    await expect(submitLiveJoin({ token: TOKEN, answers: answers() }, meta())).rejects.toThrow(
      "security check",
    );
    await unlockLiveJoin({ token: TOKEN, turnstileToken: "captcha-ok" }, meta());
    await expect(
      submitLiveJoin({ token: TOKEN, answers: answers(), termsVersionId: "old-version" }, meta()),
    ).rejects.toThrow("updated the studio terms");
    const self = answers();
    self.relationship = "self";
    self.terms!.relationship = "self";
    await expect(submitLiveJoin({ token: TOKEN, answers: self }, meta())).rejects.toThrow(
      "parent or legal guardian must enrol",
    );
    expect(fake.tables["terms_acceptance"]).toHaveLength(0);
    expect(fake.tables["invitation"]![0]!["status"]).not.toBe("completed");
  });

  it("refuses new families while the studio is paused", async () => {
    fake.accessLevel = "read_only";
    expect(await loadLiveJoin(TOKEN, meta())).toMatchObject({ state: "unavailable" });
  });
});

describe("teacher side: completed forms show up as saved enrolments", () => {
  beforeEach(async () => {
    enrolmentDrafts.length = 0;
    fake.users = [];
    fake.accessLevel = "full";
    await seed();
    setEmailProviderForTests({ send: async () => ({ id: "x" }) });
  });
  afterEach(() => setEmailProviderForTests(null));

  it("turns a waiting invite into 'intake sent' and a submitted form into 'intake done' with terms accepted", async () => {
    const terms = { acceptances: [], consents: [] } as unknown as TermsState;
    const workspace = {
      mode: "live",
      studioId: STUDIO,
      userId: "teacher-1",
      role: "teacher",
    } as const;
    await loadLiveEnrolments(workspace, makeClient() as never, terms);
    expect(enrolmentDrafts.map((d) => [d.studentId, d.status])).toEqual([[STUDENT, "intake_sent"]]);

    enrolmentDrafts.length = 0;
    await unlockLiveJoin({ token: TOKEN, turnstileToken: "captcha-ok" }, meta());
    await submitLiveJoin({ token: TOKEN, answers: answers() }, meta());
    const after = { acceptances: [], consents: [] } as unknown as TermsState;
    await loadLiveEnrolments(workspace, makeClient() as never, after);
    expect(enrolmentDrafts[0]).toMatchObject({
      studentId: STUDENT,
      status: "intake_done",
      practiceGoal: 75,
    });
    expect(enrolmentDrafts[0]!.intake).toMatchObject({
      experience: "beginner",
      goal: "Play for fun",
    });
    expect(
      after.acceptances.some(
        (a) => a.documentKind === "studio_agreement" && a.versionId === TERMS_V1,
      ),
    ).toBe(true);
    expect(after.consents).toHaveLength(2);
  });

  it("guardians don't load the studio's enrolments", async () => {
    const terms = { acceptances: [], consents: [] } as unknown as TermsState;
    await loadLiveEnrolments(
      { mode: "live", studioId: STUDIO, userId: "u", role: "guardian", guardianId: GUARDIAN },
      makeClient() as never,
      terms,
    );
    expect(enrolmentDrafts).toHaveLength(0);
    expect(draftForInvitedStudent(STUDENT, null).status).toBe("intake_sent");
  });
});
