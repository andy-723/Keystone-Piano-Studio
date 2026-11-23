import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canRead } from "@/lib/subscription";
import { todayIn } from "@/lib/lesson-calendar";
import { renewalAnswerProblem, type RenewalStatus } from "@/lib/term-billing";
import { studioPaused } from "./authz";
import { isMockOnboarding } from "./env";
import { familyWriteContext } from "./family-assignments";
import { familyContextForUser, fail, missingTable, type FamilyContext } from "./family-portal";
import { ProblemError } from "./problem";
import { verifyAccessToken } from "./session";
import { getStudioAccess } from "./subscription-store";
import { createServiceSupabase } from "./supabase";

/**
 * Term renewals for families (0027). Families have no table access, so these use the service
 * key and only ever touch the verified user's own family's rows. The family's chat message
 * about their answer is posted by the app afterwards, like any other chat message.
 */

export type FamilyRenewal = {
  id: string;
  familyId: string;
  termKey: string;
  termName: string;
  termStart: string;
  termEnd: string;
  deadline: string;
  status: RenewalStatus;
  note: string | null;
};

type Row = {
  id: string;
  family_id: string;
  status: RenewalStatus;
  note: string | null;
  renewal_campaign: {
    term_key: string;
    term_start: string;
    term_end: string;
    deadline: string;
  } | null;
};

const termName = (key: string) => {
  const [year, n] = key.split("-T");
  return `Term ${n} ${year}`;
};

/** The family's renewals for terms that haven't ended yet, soonest first. */
export async function listFamilyRenewals(
  supabase: SupabaseClient,
  ctx: FamilyContext,
  now: Date = new Date(),
): Promise<FamilyRenewal[]> {
  const today = todayIn(ctx.timeZone, now);
  const { data, error } = await supabase
    .from("renewal_response")
    .select(
      "id, family_id, status, note, renewal_campaign(term_key, term_start, term_end, deadline)",
    )
    .eq("studio_id", ctx.studioId)
    .eq("family_id", ctx.familyId);
  if (missingTable(error)) return [];
  fail(error, "Renewal lookup failed");
  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.renewal_campaign && row.renewal_campaign.term_end >= today)
    .map((row) => ({
      id: row.id,
      familyId: row.family_id,
      termKey: row.renewal_campaign!.term_key,
      termName: termName(row.renewal_campaign!.term_key),
      termStart: row.renewal_campaign!.term_start,
      termEnd: row.renewal_campaign!.term_end,
      deadline: row.renewal_campaign!.deadline,
      status: row.status,
      note: row.note,
    }))
    .sort((a, b) => a.termStart.localeCompare(b.termStart));
}

/**
 * Saves the family's answer. Only an invitation still awaiting an answer takes one, so a double
 * tap (or an answer the teacher already recorded) changes nothing.
 */
export async function answerFamilyRenewal(
  supabase: SupabaseClient,
  ctx: FamilyContext,
  userId: string,
  input: { responseId: string; status: unknown; note: string },
  now: Date = new Date(),
): Promise<{ renewal: FamilyRenewal; changed: boolean }> {
  const note = String(input.note ?? "");
  const problem = renewalAnswerProblem(input.status, note);
  if (problem) throw new ProblemError(400, "Answer not saved", problem);
  const status = input.status as RenewalStatus;
  const { data, error } = await supabase
    .from("renewal_response")
    .update({
      status,
      note: note.trim() || null,
      responded_at: now.toISOString(),
      responded_by: "family",
      responded_by_user: userId,
    })
    .eq("id", input.responseId)
    .eq("studio_id", ctx.studioId)
    .eq("family_id", ctx.familyId)
    .eq("status", "awaiting")
    .select("id");
  fail(error, "Answer not saved");
  const renewal = (await listFamilyRenewals(supabase, ctx, now)).find(
    (row) => row.id === input.responseId,
  );
  if (!renewal)
    throw new ProblemError(404, "Renewal not found", "That renewal isn't for your family.");
  return { renewal, changed: (data ?? []).length > 0 };
}

export const familyRenewalsFn = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; studioId?: string }) => data)
  .handler(async ({ data }): Promise<{ renewals: FamilyRenewal[] }> => {
    if (isMockOnboarding()) return { renewals: [] };
    const session = await verifyAccessToken(data.accessToken);
    const supabase = createServiceSupabase();
    const ctx = await familyContextForUser(supabase, session.userId, data.studioId);
    if (!ctx) return { renewals: [] };
    const { level } = await getStudioAccess(ctx.studioId);
    if (!canRead(level, "guardian")) throw studioPaused();
    return { renewals: await listFamilyRenewals(supabase, ctx) };
  });

export const familyAnswerRenewalFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      accessToken: string;
      studioId?: string;
      responseId: string;
      status: string;
      note: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { supabase, ctx, userId } = await familyWriteContext(data.accessToken, data.studioId);
    return answerFamilyRenewal(supabase, ctx, userId, {
      responseId: String(data.responseId),
      status: data.status,
      note: String(data.note ?? ""),
    });
  });
