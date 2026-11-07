import type { LessonStatus } from './types';
import { studentAttendance } from './student-attendance';
export interface LessonMove { id: string; studentId: string; originalDate: string; date: string; time: string }
export interface RecurringMove { studentId: string; effectiveDate: string; weekday: number; time: string }
export interface MakeUpBooking { id: string; studentId: string; date: string; time: string; lessonTypeId: string; gradeGoal: string; status: LessonStatus }
export interface CreditEntry {
  id: string;
  studentId: string;
  occurrenceId: string;
  amount: 1 | -1 | 0;
  date: string;
  reason: string;
  /** Optional expiry for make-up credits (YYYY-MM-DD). */
  expiresAt?: string;
  /** True when the studio has offered a make-up slot for this credit. */
  slotOffered?: boolean;
}
export const lessonMoves = new Map<string, LessonMove>();
export const recurringMoves: RecurringMove[] = [];
export const makeUpBookings: MakeUpBooking[] = [];
export const creditLedger: CreditEntry[] = [...studentAttendance.entries()].filter(([, status]) => status === 'cancelled_by_studio').map(([id]) => ({ id: `credit-${id}`, studentId: id.slice(0, id.lastIndexOf('_')), occurrenceId: id, amount: 1, date: id.slice(id.lastIndexOf('_') + 1), reason: 'Cancelled by studio' }));
export const demoSchedulingPolicy = { studioCancellationCredit: true, familyLateCancellationCredit: false };
export const parentMakeUpRequests = new Set<string>();
