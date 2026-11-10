import { createServiceSupabase } from "./supabase";
import { isMockOnboarding } from "./env";
import { ProblemError } from "./problem";
import type { LessonException, LessonSeries } from "@/lib/lesson-calendar";
import { students as demoStudents, families as demoFamilies } from "@/mocks/data";

/** Studio id the calendar uses in the local demo (no Supabase). */
export const DEMO_CALENDAR_STUDIO = "demo";

/**
 * Storage for the lesson calendar (0010). Service-key access only: every caller must already have
 * checked requireStudioRole for the studio it passes in. Every query is scoped by studio_id.
 */
export interface CalendarStudent {
  id: string;
  firstName: string;
  lastName: string;
  familyName: string | null;
}

export interface CalendarConnection {
  id: string;
  studioId: string;
  userId: string;
  accountEmail: string | null;
  calendarId: string | null;
  status: "connected" | "needs_reconnect" | "disconnected";
  lastSyncedAt: string | null;
  lastError: string | null;
}

export type NewSeries = Omit<LessonSeries, "id" | "googleSyncStatus" | "googleSyncError"> & {
  createdBy: string;
};
export type SeriesPatch = Partial<
  Pick<LessonSeries, "untilDate" | "startTime" | "durationMin" | "location" | "note">
>;
export type NewException = Omit<LessonException, "id"> & { createdBy: string };

export interface CalendarStore {
  studioTimezone(studioId: string): Promise<string>;
  listStudents(studioId: string): Promise<CalendarStudent[]>;
  /** Series that could have a lesson in [from, to], plus every exception that touches the range. */
  listLessons(
    studioId: string,
    from: string,
    to: string,
  ): Promise<{ series: LessonSeries[]; exceptions: LessonException[] }>;
  /** Every series for a teacher that has not ended before `from` (Google catch-up sync). */
  listTeacherSeries(
    studioId: string,
    teacherUserId: string,
    from: string,
  ): Promise<{ series: LessonSeries[]; exceptions: LessonException[] }>;
  getSeries(
    studioId: string,
    seriesId: string,
  ): Promise<{ series: LessonSeries; exceptions: LessonException[] } | null>;
  insertSeries(row: NewSeries): Promise<LessonSeries>;
  updateSeries(studioId: string, seriesId: string, patch: SeriesPatch): Promise<LessonSeries>;
  deleteSeries(studioId: string, seriesId: string): Promise<void>;
  upsertException(row: NewException): Promise<LessonException>;
  deleteException(studioId: string, exceptionId: string): Promise<LessonException | null>;
  setSyncState(
    studioId: string,
    seriesIds: string[],
    status: LessonSeries["googleSyncStatus"],
    error: string | null,
  ): Promise<void>;
  getConnection(studioId: string, userId: string): Promise<CalendarConnection | null>;
  saveConnection(input: {
    studioId: string;
    userId: string;
    accountEmail: string | null;
    calendarId: string | null;
    refreshToken: string;
  }): Promise<CalendarConnection>;
  getRefreshToken(connectionId: string): Promise<string | null>;
  markConnection(
    connectionId: string,
    patch: {
      status?: CalendarConnection["status"];
      lastError?: string | null;
      lastSyncedAt?: string;
      calendarId?: string;
    },
  ): Promise<void>;
  forgetConnection(connectionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Memory store (mock mode and unit tests)
// ---------------------------------------------------------------------------
export function createMemoryCalendarStore(
  seed: {
    timezone?: string;
    students?: Record<string, CalendarStudent[]>;
  } = {},
) {
  const series = new Map<string, LessonSeries>();
  const exceptions = new Map<string, LessonException>();
  const connections = new Map<string, CalendarConnection>();
  const tokens = new Map<string, string>();
  const students = seed.students ?? {};
  const timezone = seed.timezone ?? "Australia/Melbourne";
  const copy = <T>(value: T): T => ({ ...value });

  const forStudio = (studioId: string) =>
    [...series.values()].filter((s) => s.studioId === studioId);
  const exceptionsFor = (ids: Set<string>) =>
    [...exceptions.values()].filter((e) => ids.has(e.seriesId)).map(copy);

  const store: CalendarStore & {
    state: {
      series: typeof series;
      exceptions: typeof exceptions;
      connections: typeof connections;
      tokens: typeof tokens;
    };
  } = {
    state: { series, exceptions, connections, tokens },
    async studioTimezone() {
      return timezone;
    },
    async listStudents(studioId) {
      return (students[studioId] ?? []).map(copy);
    },
    async listLessons(studioId, from, to) {
      const moved = [...exceptions.values()].filter(
        (e) => e.studioId === studioId && e.newDate && e.newDate >= from && e.newDate <= to,
      );
      const ids = new Set(moved.map((e) => e.seriesId));
      for (const s of forStudio(studioId)) {
        const last = s.repeat === "once" ? s.firstDate : s.untilDate;
        if (s.firstDate <= to && (!last || last >= from)) ids.add(s.id);
      }
      return {
        series: [...ids]
          .map((id) => series.get(id))
          .filter((s): s is LessonSeries => Boolean(s))
          .map(copy),
        exceptions: exceptionsFor(ids),
      };
    },
    async listTeacherSeries(studioId, teacherUserId, from) {
      const list = forStudio(studioId).filter(
        (s) => s.teacherUserId === teacherUserId && (!s.untilDate || s.untilDate >= from),
      );
      return { series: list.map(copy), exceptions: exceptionsFor(new Set(list.map((s) => s.id))) };
    },
    async getSeries(studioId, seriesId) {
      const row = series.get(seriesId);
      if (!row || row.studioId !== studioId) return null;
      return { series: copy(row), exceptions: exceptionsFor(new Set([seriesId])) };
    },
    async insertSeries(row) {
      if (!(students[row.studioId] ?? []).some((s) => s.id === row.studentId)) {
        throw new ProblemError(400, "Unknown student", "That student is not in this studio.");
      }
      const { createdBy: _createdBy, ...rest } = row;
      const saved: LessonSeries = {
        ...rest,
        id: crypto.randomUUID(),
        googleSyncStatus: "off",
        googleSyncError: null,
      };
      series.set(saved.id, saved);
      return copy(saved);
    },
    async updateSeries(studioId, seriesId, patch) {
      const row = series.get(seriesId);
      if (!row || row.studioId !== studioId) throw new ProblemError(404, "Lesson not found");
      const next = { ...row, ...patch };
      series.set(seriesId, next);
      return copy(next);
    },
    async deleteSeries(studioId, seriesId) {
      const row = series.get(seriesId);
      if (!row || row.studioId !== studioId) return;
      series.delete(seriesId);
      for (const [id, e] of exceptions) if (e.seriesId === seriesId) exceptions.delete(id);
    },
    async upsertException(row) {
      const s = series.get(row.seriesId);
      if (!s || s.studioId !== row.studioId) throw new ProblemError(404, "Lesson not found");
      const existing = [...exceptions.values()].find(
        (e) => e.seriesId === row.seriesId && e.originalDate === row.originalDate,
      );
      const { createdBy: _createdBy, ...rest } = row;
      const saved: LessonException = { ...rest, id: existing?.id ?? crypto.randomUUID() };
      exceptions.set(saved.id, saved);
      return copy(saved);
    },
    async deleteException(studioId, exceptionId) {
      const row = exceptions.get(exceptionId);
      if (!row || row.studioId !== studioId) return null;
      exceptions.delete(exceptionId);
      return copy(row);
    },
    async setSyncState(studioId, seriesIds, status, error) {
      for (const id of seriesIds) {
        const row = series.get(id);
        if (row && row.studioId === studioId)
          series.set(id, { ...row, googleSyncStatus: status, googleSyncError: error });
      }
    },
    async getConnection(studioId, userId) {
      const row = [...connections.values()].find(
        (c) => c.studioId === studioId && c.userId === userId,
      );
      return row ? copy(row) : null;
    },
    async saveConnection(input) {
      const existing = [...connections.values()].find(
        (c) => c.studioId === input.studioId && c.userId === input.userId,
      );
      const row: CalendarConnection = {
        id: existing?.id ?? crypto.randomUUID(),
        studioId: input.studioId,
        userId: input.userId,
        accountEmail: input.accountEmail,
        calendarId: input.calendarId ?? existing?.calendarId ?? null,
        status: "connected",
        lastSyncedAt: existing?.lastSyncedAt ?? null,
        lastError: null,
      };
      connections.set(row.id, row);
      tokens.set(row.id, input.refreshToken);
      return copy(row);
    },
    async getRefreshToken(connectionId) {
      const row = connections.get(connectionId);
      return row?.status === "connected" ? (tokens.get(connectionId) ?? null) : null;
    },
    async markConnection(connectionId, patch) {
      const row = connections.get(connectionId);
      if (row) connections.set(connectionId, { ...row, ...patch });
    },
    async forgetConnection(connectionId) {
      const row = connections.get(connectionId);
      if (row) connections.set(connectionId, { ...row, status: "disconnected" });
      tokens.delete(connectionId);
    },
  };
  return store;
}

// ---------------------------------------------------------------------------
// Supabase store (live)
// ---------------------------------------------------------------------------
type SeriesRow = {
  id: string;
  studio_id: string;
  student_id: string;
  teacher_user_id: string;
  repeat: "weekly" | "once";
  first_date: string;
  until_date: string | null;
  start_time: string;
  duration_min: number;
  location: string | null;
  note: string | null;
  google_sync_status: LessonSeries["googleSyncStatus"];
  google_sync_error: string | null;
};
type ExceptionRow = {
  id: string;
  studio_id: string;
  series_id: string;
  original_date: string;
  action: "cancel" | "move";
  new_date: string | null;
  new_start_time: string | null;
};
type ConnectionRow = {
  id: string;
  studio_id: string;
  user_id: string;
  account_email: string | null;
  calendar_id: string | null;
  status: CalendarConnection["status"];
  last_synced_at: string | null;
  last_error: string | null;
};

const SERIES_COLUMNS =
  "id, studio_id, student_id, teacher_user_id, repeat, first_date, until_date, start_time, duration_min, location, note, google_sync_status, google_sync_error";
const EXCEPTION_COLUMNS =
  "id, studio_id, series_id, original_date, action, new_date, new_start_time";
const CONNECTION_COLUMNS =
  "id, studio_id, user_id, account_email, calendar_id, status, last_synced_at, last_error";

const hhmm = (value: string | null) => (value ? value.slice(0, 5) : null);

function toSeries(row: SeriesRow): LessonSeries {
  return {
    id: row.id,
    studioId: row.studio_id,
    studentId: row.student_id,
    teacherUserId: row.teacher_user_id,
    repeat: row.repeat,
    firstDate: row.first_date,
    untilDate: row.until_date,
    startTime: hhmm(row.start_time) ?? "00:00",
    durationMin: row.duration_min,
    location: row.location,
    note: row.note,
    googleSyncStatus: row.google_sync_status,
    googleSyncError: row.google_sync_error,
  };
}

function toException(row: ExceptionRow): LessonException {
  return {
    id: row.id,
    studioId: row.studio_id,
    seriesId: row.series_id,
    originalDate: row.original_date,
    action: row.action,
    newDate: row.new_date,
    newStartTime: hhmm(row.new_start_time),
  };
}

function toConnection(row: ConnectionRow): CalendarConnection {
  return {
    id: row.id,
    studioId: row.studio_id,
    userId: row.user_id,
    accountEmail: row.account_email,
    calendarId: row.calendar_id,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  };
}

function fail(
  error: { message: string; code?: string } | null,
  title = "Calendar update failed",
): void {
  if (!error) return;
  if (error.code === "23514")
    throw new ProblemError(400, "Check the lesson details", error.message);
  if (error.code === "23505")
    throw new ProblemError(
      409,
      "Already changed",
      "This week has already been changed. Undo it first.",
    );
  throw new ProblemError(500, title, error.message);
}

function createSupabaseCalendarStore(): CalendarStore {
  const db = () => createServiceSupabase();

  async function exceptionsForSeries(ids: string[]): Promise<LessonException[]> {
    if (!ids.length) return [];
    const { data, error } = await db()
      .from("lesson_exception")
      .select(EXCEPTION_COLUMNS)
      .in("series_id", ids);
    fail(error);
    return ((data ?? []) as ExceptionRow[]).map(toException);
  }

  return {
    async studioTimezone(studioId) {
      const { data, error } = await db()
        .from("studio")
        .select("timezone")
        .eq("id", studioId)
        .maybeSingle();
      fail(error);
      return (data?.timezone as string | undefined) ?? "Australia/Melbourne";
    },
    async listStudents(studioId) {
      const { data, error } = await db()
        .from("student")
        .select("id, first_name, last_name, family:family_id(display_name)")
        .eq("studio_id", studioId)
        .order("first_name");
      fail(error);
      return (
        (data ?? []) as unknown as Array<{
          id: string;
          first_name: string;
          last_name: string;
          family: { display_name: string } | null;
        }>
      ).map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        familyName: row.family?.display_name ?? null,
      }));
    },
    async listLessons(studioId, from, to) {
      const client = db();
      const [inRange, moved] = await Promise.all([
        client
          .from("lesson_series")
          .select(SERIES_COLUMNS)
          .eq("studio_id", studioId)
          .lte("first_date", to)
          .or(`until_date.is.null,until_date.gte.${from}`),
        client
          .from("lesson_exception")
          .select("series_id")
          .eq("studio_id", studioId)
          .gte("new_date", from)
          .lte("new_date", to),
      ]);
      fail(inRange.error);
      fail(moved.error);
      const series = ((inRange.data ?? []) as SeriesRow[]).map(toSeries);
      const have = new Set(series.map((s) => s.id));
      const missing = [
        ...new Set(((moved.data ?? []) as Array<{ series_id: string }>).map((r) => r.series_id)),
      ].filter((id) => !have.has(id));
      if (missing.length) {
        const extra = await client
          .from("lesson_series")
          .select(SERIES_COLUMNS)
          .eq("studio_id", studioId)
          .in("id", missing);
        fail(extra.error);
        series.push(...((extra.data ?? []) as SeriesRow[]).map(toSeries));
      }
      return { series, exceptions: await exceptionsForSeries(series.map((s) => s.id)) };
    },
    async listTeacherSeries(studioId, teacherUserId, from) {
      const { data, error } = await db()
        .from("lesson_series")
        .select(SERIES_COLUMNS)
        .eq("studio_id", studioId)
        .eq("teacher_user_id", teacherUserId)
        .or(`until_date.is.null,until_date.gte.${from}`);
      fail(error);
      const series = ((data ?? []) as SeriesRow[]).map(toSeries);
      return { series, exceptions: await exceptionsForSeries(series.map((s) => s.id)) };
    },
    async getSeries(studioId, seriesId) {
      const { data, error } = await db()
        .from("lesson_series")
        .select(SERIES_COLUMNS)
        .eq("studio_id", studioId)
        .eq("id", seriesId)
        .maybeSingle();
      fail(error);
      if (!data) return null;
      return {
        series: toSeries(data as SeriesRow),
        exceptions: await exceptionsForSeries([seriesId]),
      };
    },
    async insertSeries(row) {
      const { data, error } = await db()
        .from("lesson_series")
        .insert({
          studio_id: row.studioId,
          student_id: row.studentId,
          teacher_user_id: row.teacherUserId,
          repeat: row.repeat,
          first_date: row.firstDate,
          until_date: row.untilDate,
          start_time: row.startTime,
          duration_min: row.durationMin,
          location: row.location,
          note: row.note,
          created_by: row.createdBy,
        })
        .select(SERIES_COLUMNS)
        .single();
      fail(error);
      return toSeries(data as SeriesRow);
    },
    async updateSeries(studioId, seriesId, patch) {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("untilDate" in patch) update["until_date"] = patch.untilDate;
      if (patch.startTime) update["start_time"] = patch.startTime;
      if (patch.durationMin) update["duration_min"] = patch.durationMin;
      if ("location" in patch) update["location"] = patch.location;
      if ("note" in patch) update["note"] = patch.note;
      const { data, error } = await db()
        .from("lesson_series")
        .update(update)
        .eq("studio_id", studioId)
        .eq("id", seriesId)
        .select(SERIES_COLUMNS)
        .maybeSingle();
      fail(error);
      if (!data) throw new ProblemError(404, "Lesson not found");
      return toSeries(data as SeriesRow);
    },
    async deleteSeries(studioId, seriesId) {
      const { error } = await db()
        .from("lesson_series")
        .delete()
        .eq("studio_id", studioId)
        .eq("id", seriesId);
      fail(error);
    },
    async upsertException(row) {
      const { data, error } = await db()
        .from("lesson_exception")
        .upsert(
          {
            studio_id: row.studioId,
            series_id: row.seriesId,
            original_date: row.originalDate,
            action: row.action,
            new_date: row.newDate,
            new_start_time: row.newStartTime,
            created_by: row.createdBy,
          },
          { onConflict: "series_id,original_date" },
        )
        .select(EXCEPTION_COLUMNS)
        .single();
      fail(error);
      return toException(data as ExceptionRow);
    },
    async deleteException(studioId, exceptionId) {
      const { data, error } = await db()
        .from("lesson_exception")
        .delete()
        .eq("studio_id", studioId)
        .eq("id", exceptionId)
        .select(EXCEPTION_COLUMNS)
        .maybeSingle();
      fail(error);
      return data ? toException(data as ExceptionRow) : null;
    },
    async setSyncState(studioId, seriesIds, status, error) {
      if (!seriesIds.length) return;
      const result = await db()
        .from("lesson_series")
        .update({
          google_sync_status: status,
          google_sync_error: error?.slice(0, 300) ?? null,
          google_synced_at: status === "synced" ? new Date().toISOString() : null,
        })
        .eq("studio_id", studioId)
        .in("id", seriesIds);
      fail(result.error);
    },
    async getConnection(studioId, userId) {
      const { data, error } = await db()
        .from("calendar_connection")
        .select(CONNECTION_COLUMNS)
        .eq("studio_id", studioId)
        .eq("user_id", userId)
        .eq("provider", "google")
        .maybeSingle();
      fail(error);
      return data ? toConnection(data as ConnectionRow) : null;
    },
    async saveConnection(input) {
      const { data: id, error } = await db().rpc("calendar_connection_save", {
        p_studio_id: input.studioId,
        p_user_id: input.userId,
        p_account_email: input.accountEmail,
        p_calendar_id: input.calendarId,
        p_refresh_token: input.refreshToken,
      });
      fail(error, "Could not save the Google connection");
      const { data, error: readError } = await db()
        .from("calendar_connection")
        .select(CONNECTION_COLUMNS)
        .eq("id", id as string)
        .single();
      fail(readError);
      return toConnection(data as ConnectionRow);
    },
    async getRefreshToken(connectionId) {
      const { data, error } = await db().rpc("calendar_connection_refresh_token", {
        p_connection_id: connectionId,
      });
      fail(error);
      return (data as string | null) ?? null;
    },
    async markConnection(connectionId, patch) {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.status) update["status"] = patch.status;
      if ("lastError" in patch) update["last_error"] = patch.lastError?.slice(0, 300) ?? null;
      if (patch.lastSyncedAt) update["last_synced_at"] = patch.lastSyncedAt;
      if (patch.calendarId) update["calendar_id"] = patch.calendarId;
      const { error } = await db()
        .from("calendar_connection")
        .update(update)
        .eq("id", connectionId);
      fail(error);
    },
    async forgetConnection(connectionId) {
      const { error } = await db().rpc("calendar_connection_forget", {
        p_connection_id: connectionId,
      });
      fail(error);
    },
  };
}

let override: CalendarStore | null = null;
let mockStore: CalendarStore | null = null;

/** Tests swap in a memory store. */
export function setCalendarStoreForTests(store: CalendarStore | null) {
  override = store;
}

export function getCalendarStore(): CalendarStore {
  if (override) return override;
  if (isMockOnboarding()) {
    mockStore ??= createMemoryCalendarStore({
      students: {
        [DEMO_CALENDAR_STUDIO]: demoStudents.map((s) => ({
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          familyName: demoFamilies.find((f) => f.id === s.familyId)?.displayName ?? null,
        })),
      },
    });
    return mockStore;
  }
  return createSupabaseCalendarStore();
}
