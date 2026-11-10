/**
 * Empties every demo fixture in place, so a live studio that is not the demo never sees the
 * Clarke Piano Studio families, lessons, chat, news, invoices or notes.
 *
 * Arrays and maps are emptied (not replaced) because services import them by reference.
 * Reference content that is not studio data stays: AMEB requirement titles, the supplied
 * Library starter templates and the Keystone family app terms.
 */
import {
  attendanceMarks,
  conversations,
  families,
  invoices,
  lessonTypes,
  messages,
  payments,
  practiceLogs,
  riskScores,
  studentProgress,
  students,
  studio,
  teacher,
  weeklySlots,
} from "./data";
import { assignments, deliveryModes, submissions } from "./assignments";
import {
  billingAuditLog,
  billingProfileState,
  creditNotes,
  initialNewStudioBillingProfile,
  invoiceEvents,
} from "./billing-profile";
import { termInvoiceDrafts } from "./billing";
import { communityState } from "./community";
import {
  courseFeedback,
  courseItems,
  frameworkSections,
  frameworkSlots,
  studentCourses,
  termMilestones,
} from "./curriculum";
import { initialIntegrations, integrationState } from "./integrations";
import { resetInvitationState } from "./invitations";
import { initialLibrary, libraryState } from "./library";
import { lessonNotes } from "./lessons";
import { newsState } from "./news";
import { clientNotes } from "./notes";
import { enrolmentDrafts } from "./onboarding";
import { parentPayments } from "./parent";
import { opusInvoices } from "./plans";
import { getRenewalState, renewalState } from "./renewals";
import { importBatches } from "./roster-import";
import {
  creditLedger,
  lessonMoves,
  makeUpBookings,
  parentMakeUpRequests,
  recurringMoves,
} from "./scheduling";
import { studentAttendance } from "./student-attendance";
import type { LessonType, Studio, Teacher } from "./types";

/** Lesson prices a new studio starts with until the owner changes them. */
export const DEFAULT_LESSON_TYPES: LessonType[] = [
  { id: "lt-30", name: "30 min lesson", durationMin: 30, priceCents: 0 },
  { id: "lt-45", name: "45 min lesson", durationMin: 45, priceCents: 0 },
  { id: "lt-60", name: "60 min lesson", durationMin: 60, priceCents: 0 },
];

export function blankStudio(id: string, name: string): Studio {
  return {
    id,
    name,
    gstRegistered: false,
    timezone: "Australia/Melbourne",
    plan: "base",
    asyncLessonPolicy: "makeup_credit",
    billing: {
      cycle: "per_term",
      invoiceLeadDays: 14,
      dueRule: "days_after_issue",
      lateFeeAfterDays: 7,
      lateFee: 15,
      suspendAfterDays: 14,
      feeNoticeDays: 30,
      withdrawalNoticeWeeks: 4,
      paymentDiscount: { enabled: false },
    },
    policies: {
      cancelNoticeHours: 24,
      makeUpQuota: 1,
      makeUpPeriod: "term",
      makeUpExpiry: "same term",
      onlinePlatform: "",
      publicHolidays: "skip",
      tuningFrequency: "once a year",
      inactiveRetentionMonths: 24,
    },
    services: { online: false, inHome: false, exams: true, premises: true },
    additionalTerms: "",
  };
}

function replaceObject<T extends object>(target: T, next: T) {
  for (const key of Object.keys(target)) delete (target as Record<string, unknown>)[key];
  Object.assign(target, next);
}

export function emptyDemoFixtures(input: { studioId: string; studioName: string }) {
  replaceObject(studio, blankStudio(input.studioId, input.studioName));
  replaceObject<Teacher>(teacher, { id: "teacher-1", name: "" });
  lessonTypes.splice(0, lessonTypes.length, ...structuredClone(DEFAULT_LESSON_TYPES));

  for (const list of [
    families,
    students,
    weeklySlots,
    studentProgress,
    practiceLogs,
    riskScores,
    invoices,
    payments,
    conversations,
    messages,
    studentCourses,
    frameworkSections,
    frameworkSlots,
    courseItems,
    termMilestones,
    courseFeedback,
    assignments,
    submissions,
    clientNotes,
    recurringMoves,
    makeUpBookings,
    creditLedger,
    enrolmentDrafts,
    creditNotes,
    invoiceEvents,
    billingAuditLog,
    parentPayments,
    opusInvoices,
  ] as unknown[][])
    list.length = 0;

  for (const map of [
    attendanceMarks,
    deliveryModes,
    studentAttendance,
    lessonMoves,
    lessonNotes,
    termInvoiceDrafts,
    importBatches,
  ] as Map<unknown, unknown>[])
    map.clear();
  parentMakeUpRequests.clear();

  for (const term of [2, 3, 4] as const) {
    const state = getRenewalState(term);
    state.active = false;
    state.families.clear();
  }
  renewalState.active = false;

  communityState.demo = { photos: {}, posts: [] };
  const news = newsState.demo;
  news.posts = [];
  news.groups = [];
  news.receipts = [];
  news.notifications = [];
  news.membership = { id: teacher.id, role: "owner", studentIds: [], groupIds: [] };

  integrationState.demo = initialIntegrations();
  billingProfileState.demo = initialNewStudioBillingProfile();
  libraryState.demo = initialLibrary();
  resetInvitationState();
}
