import { getCalendarAuth, type CalendarAuth } from "@/lib/calendar-studio";
import { browserDemoCalendarStore } from "@/server/calendar-store";
import {
  addLesson,
  addLessonFn,
  cancelLessonFn,
  cancelOneLesson,
  changeFromWeek,
  changeFromWeekFn,
  DEMO_CALENDAR_ACTOR,
  deleteLessons,
  deleteLessonsFn,
  disconnectGoogleFn,
  endWeeklyLessons,
  endWeeklyLessonsFn,
  getCalendarWeek,
  getCalendarWeekFn,
  moveLessonFn,
  moveOneLesson,
  restoreLessonFn,
  restoreOneLesson,
  startGoogleConnectFn,
  syncGoogleNowFn,
  type AddLessonInput,
  type CalendarWeek,
} from "@/server/calendar";

/**
 * Calendar calls from the screen. A live studio goes to the server functions. The demo studio
 * runs the same calendar code in this browser tab on the demo fixtures, so the demo works for
 * anyone viewing it (including platform staff, who have no studio role) and never writes to
 * Supabase. Demo changes reset when the page reloads.
 */
async function run<T>(
  live: (auth: CalendarAuth) => Promise<T>,
  demo: (studioId: string) => Promise<T>,
): Promise<T> {
  const auth = await getCalendarAuth();
  if (auth.local) {
    browserDemoCalendarStore();
    return demo(auth.studioId);
  }
  return live(auth);
}

const demoActor = DEMO_CALENDAR_ACTOR;
const googleDemoOnly = () =>
  Promise.reject(new Error("Google Calendar isn't available in the demo studio."));

export const calendarApi = {
  week: (date: string): Promise<CalendarWeek> =>
    run(
      (auth) => getCalendarWeekFn({ data: { ...auth, date } }),
      (studioId) => getCalendarWeek(demoActor, studioId, date),
    ),
  addLesson: (lesson: AddLessonInput) =>
    run(
      (auth) => addLessonFn({ data: { ...auth, lesson } }),
      async (studioId) => ({ id: (await addLesson(demoActor, studioId, lesson)).id }),
    ),
  moveLesson: (input: {
    seriesId: string;
    originalDate: string;
    newDate: string;
    newStartTime: string;
    allowClash?: boolean;
  }) =>
    run(
      (auth) => moveLessonFn({ data: { ...auth, ...input } }),
      async (studioId) => ({ id: (await moveOneLesson(demoActor, studioId, input)).id }),
    ),
  cancelLesson: (input: { seriesId: string; originalDate: string }) =>
    run(
      (auth) => cancelLessonFn({ data: { ...auth, ...input } }),
      async (studioId) => ({ id: (await cancelOneLesson(demoActor, studioId, input)).id }),
    ),
  restoreLesson: (exceptionId: string) =>
    run(
      (auth) => restoreLessonFn({ data: { ...auth, exceptionId } }),
      async (studioId) => {
        await restoreOneLesson(demoActor, studioId, { exceptionId });
        return { ok: true };
      },
    ),
  changeFromWeek: (input: {
    seriesId: string;
    fromDate: string;
    newDate: string;
    startTime: string;
    durationMin: number;
    allowClash?: boolean;
  }) =>
    run(
      (auth) => changeFromWeekFn({ data: { ...auth, ...input } }),
      async (studioId) => ({ id: (await changeFromWeek(demoActor, studioId, input)).id }),
    ),
  endWeekly: (input: { seriesId: string; lastDate: string }) =>
    run(
      (auth) => endWeeklyLessonsFn({ data: { ...auth, ...input } }),
      (studioId) => endWeeklyLessons(demoActor, studioId, input),
    ),
  deleteLessons: (seriesId: string) =>
    run(
      (auth) => deleteLessonsFn({ data: { ...auth, seriesId } }),
      (studioId) => deleteLessons(demoActor, studioId, { seriesId }),
    ),
  startGoogle: () => run((auth) => startGoogleConnectFn({ data: auth }), googleDemoOnly),
  syncGoogle: () => run((auth) => syncGoogleNowFn({ data: auth }), googleDemoOnly),
  disconnectGoogle: () => run((auth) => disconnectGoogleFn({ data: auth }), googleDemoOnly),
};
