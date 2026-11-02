import { attendanceMarks, lessonTypes, students, weeklySlots, families, teacher } from '@/mocks/data';
import type { LessonOccurrence, LessonStatus, LessonType, Student } from '@/mocks/types';
import { PROTOTYPE_TODAY, addDays, dayKind, melbourneIso, weekday, type DayKind } from '@/lib/calendar';
import { respond } from './_delay';
import { studentAttendance } from '@/mocks/student-attendance';
import { lessonMoves, recurringMoves, makeUpBookings, creditLedger, demoSchedulingPolicy, parentMakeUpRequests } from '@/mocks/scheduling';
import { getOrCreateFamilyConversation, sendMessage } from './chat';
import { formatShortDate, formatTime } from '@/lib/format';
export type LessonWithDetails = LessonOccurrence & { student: Student; lessonType: LessonType; gradeGoal: string; isMakeUp: boolean; credits: number };
export type DayPlan = { date: string; day: DayKind; lessons: LessonWithDetails[] };
export const weekMonday = (date: string) => addDays(date, -((weekday(date) + 6) % 7));
const balance = (studentId: string) => creditLedger.filter((entry) => entry.studentId === studentId).reduce((sum, entry) => sum + entry.amount, 0);
function details(id: string, studentId: string, typeId: string, date: string, time: string, gradeGoal: string, isMakeUp = false): LessonWithDetails {
  const student = students.find((entry) => entry.id === studentId); const lessonType = lessonTypes.find((entry) => entry.id === typeId);
  if (!student || !lessonType) throw new Error('Lesson not found');
  const startsAt = melbourneIso(date, time);
  return { id, studentId, lessonTypeId: typeId, startsAt, endsAt: new Date(Date.parse(startsAt) + lessonType.durationMin * 60000).toISOString(), status: attendanceMarks.get(id) ?? studentAttendance.get(id) ?? 'scheduled', student, lessonType, gradeGoal, isMakeUp, credits: balance(studentId) };
}
function buildDay(date: string): DayPlan {
  const day = dayKind(date); if (day.kind !== 'teaching') return { date, day, lessons: [] };
  const lessons: LessonWithDetails[] = [];
  for (const slot of weeklySlots) {
    const change = recurringMoves.filter((entry) => entry.studentId === slot.studentId && entry.effectiveDate <= date).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).at(0);
    if ((change?.weekday ?? slot.weekday) !== weekday(date)) continue;
    const id = `${slot.studentId}_${date}`;
    if (!lessonMoves.has(id) && ![...lessonMoves.values()].some((move) => move.studentId === slot.studentId && move.date === date && move.id !== id && recurringMoves.some((change) => change.studentId === slot.studentId && change.effectiveDate <= date && weekMonday(change.effectiveDate) === weekMonday(move.originalDate)))) lessons.push(details(id, slot.studentId, slot.lessonTypeId, date, change?.time ?? slot.time, slot.gradeGoal));
  }
  for (const move of lessonMoves.values()) if (move.date === date) {
    const slot = weeklySlots.find((entry) => entry.studentId === move.studentId); const makeup = makeUpBookings.find((entry) => entry.id === move.id); if (slot) lessons.push(details(move.id, slot.studentId, makeup?.lessonTypeId ?? slot.lessonTypeId, date, move.time, makeup?.gradeGoal ?? slot.gradeGoal, Boolean(makeup)));
  }
  for (const booking of makeUpBookings) if (booking.date === date && !lessonMoves.has(booking.id)) lessons.push(details(booking.id, booking.studentId, booking.lessonTypeId, date, booking.time, booking.gradeGoal, true));
  return { date, day, lessons: lessons.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) };
}
function occurrence(id: string): LessonWithDetails | undefined {
  const move = lessonMoves.get(id); const date = move?.date ?? id.slice(id.lastIndexOf('_') + 1);
  return buildDay(date).lessons.find((entry) => entry.id === id);
}
export const getLessonOccurrence = (id: string) => respond(occurrence(id) ?? null);
export const getDayLessons = (date: string): Promise<DayPlan> => respond(buildDay(date));
export const getTodayLessons = (): Promise<DayPlan> => getDayLessons(PROTOTYPE_TODAY);
export const getWeekLessons = (date: string) => respond(Array.from({ length: 6 }, (_, index) => buildDay(addDays(weekMonday(date), index))));
export const getCredits = (studentId: string) => respond({ balance: balance(studentId), history: creditLedger.filter((entry) => entry.studentId === studentId).map((entry) => ({ ...entry })), requested: parentMakeUpRequests.has(studentId) });
export async function markAttendance(id: string, status: LessonStatus): Promise<LessonStatus> {
  const lesson = occurrence(id); if (!lesson) throw new Error('Lesson not found');
  const current = attendanceMarks.get(id) ?? studentAttendance.get(id) ?? 'scheduled';
  const eligible = (value: LessonStatus) => value === 'cancelled_by_studio' && demoSchedulingPolicy.studioCancellationCredit || value === 'cancelled_late' && demoSchedulingPolicy.familyLateCancellationCredit;
  const sourceBalance = creditLedger.filter((entry) => entry.occurrenceId === id && entry.reason !== 'Make-up booked').reduce((sum, entry) => sum + entry.amount, 0);
  const targetBalance = eligible(status) ? 1 : 0;
  if (targetBalance < sourceBalance && balance(lesson.studentId) < 1) throw new Error('This credit has been used. Cancel its make-up booking before undoing the cancellation.');
  if (targetBalance !== sourceBalance && current !== status) creditLedger.push({ id: crypto.randomUUID(), studentId: lesson.studentId, occurrenceId: id, amount: targetBalance > sourceBalance ? 1 : -1, date: PROTOTYPE_TODAY, reason: targetBalance ? status === 'cancelled_by_studio' ? 'Cancelled by studio' : 'Late cancellation credit' : 'Cancellation undone' });
  if (status === 'scheduled') attendanceMarks.delete(id); else attendanceMarks.set(id, status);
  return respond(status, 60);
}
function validDate(date: string) { return /^2027-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date; }
function isFree(date: string, time: string, durationMin: number, excludedIds: string[] = []): boolean {
  if (!validDate(date) || date < PROTOTYPE_TODAY || dayKind(date).kind !== 'teaching' || weekday(date) === 0 || !/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(':').map(Number); const start = (hours ?? 0) * 60 + (minutes ?? 0);
  if ((minutes ?? 0) > 59 || start < 9 * 60 || start + durationMin > 20 * 60 || !Number.isInteger(durationMin) || durationMin <= 0) return false;
  const instant = Date.parse(melbourneIso(date, time)); const end = instant + durationMin * 60000;
  return buildDay(date).lessons.filter((lesson) => !excludedIds.includes(lesson.id) && !['cancelled_by_studio', 'cancelled_late'].includes(lesson.status)).every((lesson) => end <= Date.parse(lesson.startsAt) || instant >= Date.parse(lesson.endsAt));
}
export async function getFreeSlots(input: { date: string; durationMin: number; occurrenceId?: string; everyWeek?: boolean }) {
  const lesson = input.occurrenceId ? occurrence(input.occurrenceId) : undefined;
  const slots: string[] = [];
  for (let minute = 9 * 60; minute + input.durationMin <= 20 * 60; minute += 15) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    if (input.everyWeek && lesson ? recurringFree(lesson, input.date, time) : isFree(input.date, time, input.durationMin, input.occurrenceId ? [input.occurrenceId] : [])) slots.push(time);
  }
  return respond(slots);
}
function recurringFree(lesson: LessonWithDetails, date: string, time: string) {
  for (let target = date; target <= '2027-12-17'; target = addDays(target, 7)) {
    if (dayKind(target).kind !== 'teaching') continue;
    const exclude = [lesson.id, `${lesson.studentId}_${target}`];
    if (!isFree(target, time, lesson.lessonType.durationMin, exclude)) return false;
  }
  return isFree(date, time, lesson.lessonType.durationMin, [lesson.id, `${lesson.studentId}_${date}`]);
}
async function notify(lesson: LessonWithDetails, date: string, time: string, makeUp = false, recurring = false) {
  const family = families.find((entry) => entry.id === lesson.student.familyId);
  const zh = family?.guardians[0]?.preferredLanguage === 'zh-CN';
  const when = `${formatShortDate(date)}, ${formatTime(melbourneIso(date, time))}`;
  const chineseWhen = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne' }).format(new Date(melbourneIso(date, time)));
  const body = zh ? `${lesson.student.firstName}的${makeUp ? '补课已安排在' : '课程已调整至'}${chineseWhen}。${recurring ? '从本周起，每周按此时间上课。' : ''}` : `${lesson.student.firstName}'s ${makeUp ? 'make-up is booked for' : 'lesson has moved to'} ${when}.${recurring ? ' Every week from now.' : ''}`;
  const conversation = await getOrCreateFamilyConversation(lesson.student.familyId);
  return sendMessage({ conversationId: conversation.id, authorName: teacher.name, authorRole: 'teacher', kind: 'text', body });
}
export async function moveLesson(input: { occurrenceId: string; date: string; time: string; scope: 'this_week' | 'every_week' }) {
  const lesson = occurrence(input.occurrenceId); if (!lesson || lesson.status !== 'scheduled') throw new Error('Only an upcoming, unmarked lesson can be moved.');
  if (!['this_week', 'every_week'].includes(input.scope)) throw new Error('Choose how often this move repeats.');
  const sourceDate = lesson.startsAt.slice(0, 10);
  if (sourceDate < PROTOTYPE_TODAY || weekMonday(sourceDate) !== weekMonday(input.date)) throw new Error('Choose a day in this lesson’s week.');
  if (input.scope === 'every_week' && lesson.isMakeUp) throw new Error('Make-ups are one-off lessons.');
  if (input.scope === 'every_week') {
    if (!recurringFree(lesson, input.date, input.time)) throw new Error('That time overlaps another lesson in this or a later week. Choose a free slot.');
    const conflict = recurringMoves.find((entry) => entry.studentId === lesson.studentId && entry.effectiveDate > weekMonday(sourceDate));
    if (conflict) throw new Error('There is a later weekly change for this student. Move that lesson instead.');
    recurringMoves.push({ studentId: lesson.studentId, effectiveDate: weekMonday(sourceDate) < PROTOTYPE_TODAY ? PROTOTYPE_TODAY : weekMonday(sourceDate), weekday: weekday(input.date), time: input.time });
    if (input.date !== sourceDate) lessonMoves.set(lesson.id, { id: lesson.id, studentId: lesson.studentId, originalDate: sourceDate, date: input.date, time: input.time });
    else lessonMoves.delete(lesson.id);
  } else {
    if (!isFree(input.date, input.time, lesson.lessonType.durationMin, [lesson.id])) throw new Error('That time overlaps another lesson. Choose a free slot.');
    lessonMoves.set(lesson.id, { id: lesson.id, studentId: lesson.studentId, originalDate: sourceDate, date: input.date, time: input.time });
  }
  const moved = occurrence(lesson.id) ?? buildDay(input.date).lessons.find((entry) => entry.studentId === lesson.studentId);
  await notify(lesson, input.date, input.time, false, input.scope === 'every_week');
  return respond(moved ?? null);
}
export async function bookMakeUp(input: { studentId: string; date: string; time: string }) {
  const slot = weeklySlots.find((entry) => entry.studentId === input.studentId); const type = lessonTypes.find((entry) => entry.id === slot?.lessonTypeId);
  if (!slot || !type || balance(input.studentId) < 1) throw new Error('No make-up credit available.');
  if (!isFree(input.date, input.time, type.durationMin)) throw new Error('That time overlaps another lesson or is not a teaching day.');
  const id = `makeup-${crypto.randomUUID()}_${input.date}`;
  makeUpBookings.push({ id, studentId: input.studentId, date: input.date, time: input.time, lessonTypeId: type.id, gradeGoal: slot.gradeGoal, status: 'scheduled' });
  creditLedger.push({ id: crypto.randomUUID(), studentId: input.studentId, occurrenceId: id, amount: -1, date: PROTOTYPE_TODAY, reason: `Make-up booked · ${formatShortDate(input.date)} · ${formatTime(melbourneIso(input.date, input.time))}` });
  parentMakeUpRequests.delete(input.studentId);
  const lesson = details(id, input.studentId, type.id, input.date, input.time, slot.gradeGoal, true);
  await notify(lesson, input.date, input.time, true);
  return respond(lesson);
}
