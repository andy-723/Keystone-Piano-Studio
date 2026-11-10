/**
 * Live studio data (0011). Reads and writes this studio's own Supabase rows with the signed-in
 * person's session, so RLS (0003 staff/guardian policies, 0006 access gates) decides what they
 * can see. Nothing here uses the service key.
 *
 * Pattern (transitional, ADR-057): at sign-in the in-memory store the screens already use is
 * emptied and filled from Supabase; each save writes to Supabase first and only then updates the
 * store, so a failed save never shows as saved. Areas not moved to Supabase yet (chat, news,
 * courses, invoices, lessons) simply start empty for a live studio and do not survive a reload.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { families, lessonTypes, students, studio, teacher } from "@/mocks/data";
import { emptyDemoFixtures, DEFAULT_LESSON_TYPES } from "@/mocks/clean-studio";
import { newsState } from "@/mocks/news";
import { setParentGuardianId } from "@/mocks/parent";
import {
  resetTermsStateForCleanStudio,
  termsState,
  type StudioTermsDraft,
  type TermsVersion,
} from "@/mocks/terms";
import type {
  Family,
  Guardian,
  Lang,
  LessonType,
  Student,
  Studio,
  StudioPlan,
  Teacher,
} from "@/mocks/types";
import { getAuthClient } from "@/lib/auth-client";
import {
  isLiveStudio,
  liveStudioId,
  markWorkspaceLoaded,
  setStudioWorkspace,
  type StudioWorkspace,
} from "@/lib/studio-workspace";

type Client = Pick<SupabaseClient, "from">;

/** What we keep in studio.profile (jsonb). Name, id, plan and timezone live elsewhere. */
export type StudioProfile = {
  studio?: Omit<Partial<Studio>, "id" | "name" | "plan" | "timezone">;
  teacher?: Omit<Teacher, "id">;
  lessonTypes?: LessonType[];
  termsDraft?: Pick<StudioTermsDraft, "switches" | "clauseEdits" | "studioPatch">;
};

export type StudioRow = {
  id: string;
  name: string;
  is_demo: boolean;
  profile: StudioProfile | null;
};

type GuardianRow = {
  id: string;
  full_name: string;
  email: string;
  mobile: string | null;
  preferred_language: Lang;
};
type FamilyRow = {
  id: string;
  display_name: string;
  media_consent: boolean | null;
  news_photo_consent: boolean | null;
  is_example: boolean | null;
  guardian: GuardianRow[] | null;
};
type StudentRow = {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  birth_year: number;
  exam_date: string | null;
  target_term: string | null;
  grade_goal: string | null;
  is_example: boolean | null;
};

export type AccountForWorkspace = {
  userId: string;
  platformStaff: unknown;
  memberships: Array<{ studioId: string; role: string }>;
  studioAccess?: Array<{ studioId: string; role: string; plan: StudioPlan | null }>;
};

let clientOverride: Client | null = null;
/** Tests inject a fake Supabase client. */
export function setStudioStoreClientForTests(client: Client | null) {
  clientOverride = client;
}

function client(): Client {
  const c = clientOverride ?? getAuthClient();
  if (!c) throw new Error("Sign-in is unavailable. Please reload and try again.");
  return c;
}

function friendly(error: { message?: string; code?: string } | null, fallback: string): Error {
  const message = error?.message ?? "";
  if (message.includes("base_plan_student_limit"))
    return new Error("The Base plan allows up to 35 students. Upgrade to Pro to add more.");
  if (error?.code === "42501" || /row-level security/i.test(message))
    return new Error("You don't have permission to change this, or your studio is read-only.");
  return new Error(fallback);
}

const STAFF_ORDER = ["owner", "admin", "teacher"] as const;

/**
 * Picks the studio this person works in and whether it is live or the demo. Platform staff and
 * the demo studio stay on the mock fixtures. Any lookup error also stays on mock (today's
 * behaviour) so a missing migration never locks a studio out; it is logged.
 */
export async function chooseStudioWorkspace(
  account: AccountForWorkspace,
  c: Client = client(),
): Promise<{ workspace: StudioWorkspace; row: StudioRow | null; plan: StudioPlan | null }> {
  const mock = { workspace: { mode: "mock" } as StudioWorkspace, row: null, plan: null };
  const staff = STAFF_ORDER.map((role) => account.memberships.find((m) => m.role === role)).find(
    Boolean,
  );
  const guardianEntry = account.studioAccess?.find((entry) => entry.role === "guardian");
  const studioId = staff?.studioId ?? guardianEntry?.studioId;
  if (!studioId) return mock;

  const { data, error } = await c
    .from("studio")
    .select("id, name, is_demo, profile")
    .eq("id", studioId)
    .maybeSingle();
  if (error || !data) {
    console.error("[studio-store] studio lookup failed; staying on demo data", error?.message);
    return mock;
  }
  const row = data as StudioRow;
  if (row.is_demo) return { ...mock, row };
  const plan = account.studioAccess?.find((entry) => entry.studioId === studioId)?.plan ?? null;

  if (staff) {
    return {
      workspace: { mode: "live", studioId, role: staff.role as "owner" | "admin" | "teacher" },
      row,
      plan,
    };
  }
  const guardian = await c
    .from("guardian")
    .select("id")
    .eq("user_id", account.userId)
    .eq("studio_id", studioId)
    .limit(1)
    .maybeSingle();
  if (guardian.error || !guardian.data) {
    console.error("[studio-store] guardian lookup failed", guardian.error?.message);
    return mock;
  }
  return {
    workspace: {
      mode: "live",
      studioId,
      role: "guardian",
      guardianId: (guardian.data as { id: string }).id,
    },
    row,
    plan,
  };
}

function toGuardian(row: GuardianRow): Guardian {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    preferredLanguage: row.preferred_language === "zh-CN" ? "zh-CN" : "en",
    ...(row.mobile ? { mobile: row.mobile } : {}),
  };
}

function toFamily(row: FamilyRow): Family {
  return {
    id: row.id,
    displayName: row.display_name,
    guardians: (row.guardian ?? []).map(toGuardian),
    ...(row.media_consent != null ? { mediaConsent: row.media_consent } : {}),
    ...(row.news_photo_consent != null ? { newsPhotoConsent: row.news_photo_consent } : {}),
    ...(row.is_example ? { isExample: true } : {}),
  };
}

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    familyId: row.family_id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthYear: row.birth_year,
    ...(row.exam_date ? { examDate: row.exam_date } : {}),
    ...(row.target_term ? { targetTerm: row.target_term } : {}),
    ...(row.grade_goal ? { gradeGoal: row.grade_goal } : {}),
    ...(row.is_example ? { isExample: true } : {}),
  };
}

/** Puts this studio's details from studio.profile into the in-memory studio and teacher. */
function applyProfile(row: StudioRow, plan: StudioPlan | null) {
  const profile = row.profile ?? {};
  Object.assign(studio, profile.studio ?? {}, { id: row.id, name: row.name, plan: plan ?? "base" });
  teacher.name = profile.teacher?.name ?? "";
  if (profile.teacher?.childSafety) teacher.childSafety = profile.teacher.childSafety;
  lessonTypes.splice(
    0,
    lessonTypes.length,
    ...structuredClone(profile.lessonTypes?.length ? profile.lessonTypes : DEFAULT_LESSON_TYPES),
  );
}

/**
 * Empties the demo fixtures and fills them with this studio's rows. Called once per sign-in,
 * before any studio screen mounts.
 */
export async function loadLiveStudio(
  workspace: Extract<StudioWorkspace, { mode: "live" }>,
  row: StudioRow,
  plan: StudioPlan | null,
  c: Client = client(),
) {
  const [familyRes, studentRes, termsRes] = await Promise.all([
    c
      .from("family")
      .select(
        "id, display_name, media_consent, news_photo_consent, is_example, guardian(id, full_name, email, mobile, preferred_language)",
      )
      .eq("studio_id", workspace.studioId)
      .order("created_at", { ascending: true }),
    c
      .from("student")
      .select(
        "id, family_id, first_name, last_name, birth_year, exam_date, target_term, grade_goal, is_example",
      )
      .eq("studio_id", workspace.studioId)
      .order("created_at", { ascending: true }),
    // Published studio agreement versions (owner/admin/teacher can read; guardians see none here).
    c
      .from("terms_version")
      .select(
        "id, version_no, rendered_markdown, merge_values, switches, sha256, change_type, change_summary, effective_at, published_at, edited_clause_ids, terms_document!inner(kind)",
      )
      .eq("studio_id", workspace.studioId)
      .eq("terms_document.kind", "studio_agreement")
      .order("version_no", { ascending: true }),
  ]);
  if (familyRes.error)
    throw friendly(familyRes.error, "Couldn't load your families. Please reload.");
  if (studentRes.error)
    throw friendly(studentRes.error, "Couldn't load your students. Please reload.");

  emptyDemoFixtures({ studioId: row.id, studioName: row.name });
  applyProfile(row, plan);
  families.push(...((familyRes.data ?? []) as FamilyRow[]).map(toFamily));
  students.push(...((studentRes.data ?? []) as StudentRow[]).map(toStudent));
  newsState.demo.membership = {
    id: teacher.id,
    role: workspace.role === "guardian" ? "owner" : workspace.role,
    studentIds: students.map((s) => s.id),
    groupIds: [],
  };
  const terms = await resetTermsStateForCleanStudio(row.profile?.termsDraft);
  if (!termsRes.error) {
    terms.versions.push(...((termsRes.data ?? []) as TermsVersionRow[]).map(toTermsVersion));
  } else {
    console.error("[studio-store] terms versions not loaded", termsRes.error.message);
  }
  if (workspace.guardianId) setParentGuardianId(workspace.guardianId);
  setStudioWorkspace(workspace);
  markWorkspaceLoaded(workspace);
}

type TermsVersionRow = {
  id: string;
  version_no: number;
  rendered_markdown: string;
  merge_values: Record<string, unknown>;
  switches: TermsVersion["switches"];
  sha256: string;
  change_type: TermsVersion["changeType"] | null;
  change_summary: string | null;
  effective_at: string;
  published_at: string | null;
  edited_clause_ids: string[] | null;
};

/** The in-memory store keeps the demo document id for the studio agreement of the signed-in studio. */
const STUDIO_AGREEMENT_DOC = "doc-studio-demo";

function toTermsVersion(row: TermsVersionRow): TermsVersion {
  return {
    id: row.id,
    documentId: STUDIO_AGREEMENT_DOC,
    versionNo: row.version_no,
    renderedMarkdown: row.rendered_markdown,
    mergeValues: row.merge_values,
    switches: row.switches,
    sha256: row.sha256,
    changeType: row.change_type ?? "initial",
    changeSummary: row.change_summary ?? "",
    // Stored as timestamptz; the app compares calendar dates.
    effectiveAt: row.effective_at.slice(0, 10),
    publishedAt: row.published_at ?? row.effective_at,
    publishedBy: teacher.name || "Studio",
    editedClauseIds: row.edited_clause_ids ?? [],
  };
}

// ---------------------------------------------------------------------------
// Saves. Each one is a no-op in mock mode, and in live mode writes to Supabase before the
// caller changes the in-memory store.
// ---------------------------------------------------------------------------

export function studioProfileFromStore(): StudioProfile {
  // Plan comes from the subscription; id, name and timezone are columns.
  const { id: _id, name: _name, plan: _plan, timezone: _tz, ...rest } = studio;
  const draft = termsState?.drafts.demo;
  return {
    studio: structuredClone(rest),
    teacher: {
      name: teacher.name,
      ...(teacher.childSafety ? { childSafety: structuredClone(teacher.childSafety) } : {}),
    },
    lessonTypes: structuredClone(lessonTypes),
    ...(draft
      ? {
          termsDraft: {
            switches: structuredClone(draft.switches),
            clauseEdits: structuredClone(draft.clauseEdits),
            studioPatch: structuredClone(draft.studioPatch),
          },
        }
      : {}),
  };
}

/**
 * Saves the studio name and details. Call after changing the in-memory studio/teacher; on
 * failure the caller's change is rolled back by restoring `before`.
 */
export async function saveLiveStudioDetails(before?: {
  studio: Studio;
  teacher: Teacher;
  lessonTypes?: LessonType[];
}) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const { error } = await client()
    .from("studio")
    .update({ name: studio.name, profile: studioProfileFromStore() })
    .eq("id", studioId);
  if (error) {
    if (before) {
      for (const key of Object.keys(studio))
        delete (studio as unknown as Record<string, unknown>)[key];
      Object.assign(studio, before.studio);
      for (const key of Object.keys(teacher))
        delete (teacher as unknown as Record<string, unknown>)[key];
      Object.assign(teacher, before.teacher);
      if (before.lessonTypes) lessonTypes.splice(0, lessonTypes.length, ...before.lessonTypes);
    }
    throw friendly(error, "Couldn't save your studio details. Please try again.");
  }
}

/** Snapshot to pass to saveLiveStudioDetails so a failed save can be undone. */
export function studioSnapshot() {
  return {
    studio: structuredClone(studio),
    teacher: structuredClone(teacher),
    lessonTypes: structuredClone(lessonTypes),
  };
}

export async function insertLiveFamily(family: Family) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const c = client();
  const { error } = await c.from("family").insert({
    id: family.id,
    studio_id: studioId,
    display_name: family.displayName,
    media_consent: family.mediaConsent ?? null,
    news_photo_consent: family.newsPhotoConsent ?? null,
  });
  if (error) throw friendly(error, "Couldn't save this family. Please try again.");
  if (family.guardians.length) {
    const guardians = await c.from("guardian").insert(
      family.guardians.map((guardian) => ({
        id: guardian.id,
        family_id: family.id,
        studio_id: studioId,
        full_name: guardian.name,
        email: guardian.email,
        mobile: guardian.mobile ?? null,
        preferred_language: guardian.preferredLanguage,
      })),
    );
    if (guardians.error) {
      await c.from("family").delete().eq("id", family.id);
      throw friendly(guardians.error, "Couldn't save this family's contact. Please try again.");
    }
  }
}

export async function insertLiveStudents(rows: Student[]) {
  const studioId = liveStudioId();
  if (!studioId || !rows.length) return;
  const { error } = await client()
    .from("student")
    .insert(
      rows.map((student) => ({
        id: student.id,
        family_id: student.familyId,
        studio_id: studioId,
        first_name: student.firstName,
        last_name: student.lastName,
        birth_year: student.birthYear,
        exam_date: student.examDate ?? null,
        target_term: student.targetTerm ?? null,
        grade_goal: student.gradeGoal ?? null,
      })),
    );
  if (error) throw friendly(error, "Couldn't save the student. Please try again.");
}

/** Removes the example family and its student (cascade). Only example rows can go this way. */
export async function deleteLiveExampleFamily(familyId: string) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const { error } = await client()
    .from("family")
    .delete()
    .eq("id", familyId)
    .eq("studio_id", studioId)
    .eq("is_example", true);
  if (error) throw friendly(error, "Couldn't delete the example. Please try again.");
}

/** New ids must be uuids in a live studio (database keys); mock ids keep their readable prefixes. */
export function newRecordId(mockPrefix: string): string {
  return isLiveStudio() ? crypto.randomUUID() : `${mockPrefix}-${crypto.randomUUID()}`;
}

/** Saves a published studio agreement version (append-only in the database). */
export async function insertLiveTermsVersion(version: TermsVersion) {
  const studioId = liveStudioId();
  if (!studioId) return;
  const c = client();
  const existing = await c
    .from("terms_document")
    .select("id")
    .eq("studio_id", studioId)
    .eq("kind", "studio_agreement")
    .limit(1)
    .maybeSingle();
  if (existing.error)
    throw friendly(existing.error, "Couldn't publish your terms. Please try again.");
  let documentId = (existing.data as { id: string } | null)?.id;
  if (!documentId) {
    const created = await c
      .from("terms_document")
      .insert({ studio_id: studioId, kind: "studio_agreement" })
      .select("id")
      .single();
    if (created.error || !created.data)
      throw friendly(created.error, "Couldn't publish your terms. Please try again.");
    documentId = (created.data as { id: string }).id;
  }
  const { error } = await c.from("terms_version").insert({
    id: version.id,
    document_id: documentId,
    studio_id: studioId,
    version_no: version.versionNo,
    rendered_markdown: version.renderedMarkdown,
    merge_values: version.mergeValues,
    switches: version.switches,
    sha256: version.sha256,
    change_type: version.changeType,
    change_summary: version.changeSummary,
    effective_at: version.effectiveAt,
    published_at: new Date().toISOString(),
    edited_clause_ids: version.editedClauseIds,
  });
  if (error) throw friendly(error, "Couldn't publish your terms. Please try again.");
}
