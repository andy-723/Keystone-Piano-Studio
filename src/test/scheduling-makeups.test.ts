import { afterEach, expect, it } from 'vitest';
import { attendanceMarks, messages, conversations } from '@/mocks/data';
import { creditLedger, recurringMoves, lessonMoves, makeUpBookings, demoSchedulingPolicy, parentMakeUpRequests } from '@/mocks/scheduling';
import { bookMakeUp, getCredits, getDayLessons, getFreeSlots, getLessonOccurrence, markAttendance, moveLesson } from '@/services/schedule';
import { getLiveLesson } from '@/services/lessons';
import { getParentHome, requestParentMakeUp } from '@/services/parent';
const originalLedger = structuredClone(creditLedger); const messageCount = messages.length; const convCount = conversations.length;
afterEach(() => { attendanceMarks.clear(); recurringMoves.splice(0); lessonMoves.clear(); makeUpBookings.splice(0); creditLedger.splice(0, creditLedger.length, ...structuredClone(originalLedger)); messages.splice(messageCount); conversations.splice(convCount); demoSchedulingPolicy.studioCancellationCredit = true; parentMakeUpRequests.clear(); });
it('free slots reject partial teacher overlaps and accept exact adjacent boundaries', async () => {
  const slots = await getFreeSlots({ date: '2027-03-18', durationMin: 30 });
  expect(slots).not.toContain('15:30'); expect(slots).not.toContain('16:00'); expect(slots).toContain('18:30');
  await expect(moveLesson({ occurrenceId: 'stu-1_2027-03-15', date: '2027-03-18', time: '16:00', scope: 'this_week' })).rejects.toThrow('overlaps');
  expect(await getFreeSlots({ date: '2027-03-26', durationMin: 30 })).toEqual([]);
});
it('one-week move preserves identity, removes the original, notifies in family language and leaves next week unchanged', async () => {
  await moveLesson({ occurrenceId: 'stu-1_2027-03-15', date: '2027-03-18', time: '18:30', scope: 'this_week' });
  expect((await getDayLessons('2027-03-15')).lessons.some((lesson) => lesson.id === 'stu-1_2027-03-15')).toBe(false);
  expect((await getLessonOccurrence('stu-1_2027-03-15'))?.startsAt).toBe('2027-03-18T18:30:00+11:00');
  expect((await getLiveLesson('stu-1_2027-03-15'))?.date).toBe('2027-03-18');
  expect((await getDayLessons('2027-03-22')).lessons.find((lesson) => lesson.studentId === 'stu-1')?.startsAt).toBe('2027-03-22T15:30:00+11:00');
  expect(messages.at(-1)?.body).toContain('Lucy的课程已调整至');
});
it('every week from now moves this and later teaching weeks without changing historical attendance or duplicating this occurrence', async () => {
  const history = await getDayLessons('2027-03-01');
  await moveLesson({ occurrenceId: 'stu-1_2027-03-15', date: '2027-03-18', time: '18:30', scope: 'every_week' });
  expect((await getDayLessons('2027-03-18')).lessons.filter((lesson) => lesson.studentId === 'stu-1')).toHaveLength(1);
  expect((await getDayLessons('2027-03-22')).lessons.some((lesson) => lesson.studentId === 'stu-1')).toBe(false);
  expect((await getDayLessons('2027-03-25')).lessons.find((lesson) => lesson.studentId === 'stu-1')?.startsAt).toBe('2027-03-25T18:30:00+11:00');
  expect((await getDayLessons('2027-04-15')).lessons.find((lesson) => lesson.studentId === 'stu-1')?.startsAt).toBe('2027-04-15T18:30:00+10:00');
  expect((await getDayLessons('2027-03-01')).lessons).toEqual(history.lessons);
});
it('recurring moves reject a later-week one-off collision even when the first week is free', async () => {
  await markAttendance('stu-2_2027-03-15', 'cancelled_by_studio');
  await bookMakeUp({ studentId: 'stu-2', date: '2027-03-25', time: '18:30' });
  const slots = await getFreeSlots({ date: '2027-03-18', durationMin: 30, occurrenceId: 'stu-1_2027-03-15', everyWeek: true });
  expect(slots).not.toContain('18:30');
  await expect(moveLesson({ occurrenceId: 'stu-1_2027-03-15', date: '2027-03-18', time: '18:30', scope: 'every_week' })).rejects.toThrow('later week');
});
it('studio cancellation grants one credit, repeated marking is idempotent and undo records a debit', async () => {
  const before = (await getCredits('stu-1')).balance;
  await markAttendance('stu-1_2027-03-15', 'cancelled_by_studio'); await markAttendance('stu-1_2027-03-15', 'cancelled_by_studio');
  expect((await getCredits('stu-1')).balance).toBe(before + 1);
  await markAttendance('stu-1_2027-03-15', 'scheduled');
  expect((await getCredits('stu-1')).balance).toBe(before);
  expect((await getCredits('stu-1')).history.slice(-2).map((entry) => entry.amount)).toEqual([1, -1]);
});
it('studio policy can disable cancellation credits; family late cancellation earns none by default', async () => {
  demoSchedulingPolicy.studioCancellationCredit = false;
  await markAttendance('stu-1_2027-03-15', 'cancelled_by_studio');
  expect((await getCredits('stu-1')).balance).toBe(0);
  await markAttendance('stu-2_2027-03-15', 'cancelled_late'); expect((await getCredits('stu-2')).balance).toBe(0);
});
it('make-up booking consumes one credit, appears on the timetable and cannot be double-booked or overdrawn', async () => {
  await markAttendance('stu-1_2027-03-15', 'cancelled_by_studio');
  const booking = await bookMakeUp({ studentId: 'stu-1', date: '2027-03-18', time: '18:30' });
  expect((await getCredits('stu-1')).balance).toBe(0);
  expect((await getDayLessons('2027-03-18')).lessons.find((lesson) => lesson.id === booking.id)?.isMakeUp).toBe(true);
  await expect(bookMakeUp({ studentId: 'stu-1', date: '2027-03-18', time: '19:00' })).rejects.toThrow('No make-up');
  await markAttendance('stu-2_2027-03-15', 'cancelled_by_studio');
  await expect(bookMakeUp({ studentId: 'stu-2', date: '2027-03-18', time: '18:45' })).rejects.toThrow('overlaps');
  await expect(markAttendance('stu-1_2027-03-15', 'scheduled')).rejects.toThrow('credit has been used');
});
it('parent sees own-family credits and requests in chat without booking or consuming a credit', async () => {
  await markAttendance('stu-1_2027-03-15', 'cancelled_by_studio');
  expect((await getParentHome()).makeUps.find((entry) => entry.studentId === 'stu-1')?.balance).toBe(1);
  await requestParentMakeUp('stu-1', 'en'); await requestParentMakeUp('stu-1', 'en');
  expect(messages.at(-1)?.body).toContain('book a make-up lesson for Lucy'); expect((await getCredits('stu-1')).balance).toBe(1); expect(makeUpBookings).toHaveLength(0);
  await expect(requestParentMakeUp('stu-3', 'en')).rejects.toThrow('not in this family');
});
