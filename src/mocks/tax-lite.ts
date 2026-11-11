/**
 * Tax Lite (Starter Accounting Lite) session fixtures.
 * Scope-keyed mock state — swap for REST later; not a general ledger.
 */

import { PROTOTYPE_TODAY, addDays } from "@/lib/calendar";
import { CENTS_PER_KM_RATE } from "@/lib/tax-copy";

/** Record categories for solo music studios. Keystone does not decide what is deductible. */
export const TAX_LITE_CATEGORIES = [
  "Teaching materials & pass-throughs",
  "Instruments & gear",
  "Repairs & consumables",
  "Software & subscriptions",
  "Commercial rent & venue hire",
  "Other deductible",
] as const;

export type TaxLiteCategory = (typeof TAX_LITE_CATEGORIES)[number];

export type TaxLiteExpense = {
  id: string;
  date: string;
  vendor: string;
  category: TaxLiteCategory;
  /** Inclusive of GST when includesGst is true. */
  amountCents: number;
  includesGst: boolean;
  notes?: string;
  /** When set, cost is billed to this student as a reimbursement line. */
  passThroughStudentId?: string;
  passThroughFamilyId?: string;
  attachedInvoiceId?: string;
  createdAt: string;
};

export type TaxLiteKmEntry = {
  id: string;
  date: string;
  kilometres: number;
  purpose: string;
  createdAt: string;
};

/** Seed expenses for the current AU FY (prototype today is 2027-03-15 → FY 2026–27). */
export const taxLiteExpenses: TaxLiteExpense[] = [
  {
    id: "tax-exp-1",
    date: "2026-09-12",
    vendor: "AMEB Victoria",
    category: "Teaching materials & pass-throughs",
    amountCents: 9500,
    includesGst: false,
    notes: "Grade 4 piano exam entry",
    passThroughStudentId: "stu-1",
    passThroughFamilyId: "fam-1",
    attachedInvoiceId: "inv-exam-draft",
    createdAt: "2026-09-12T10:00:00+10:00",
  },
  {
    id: "tax-exp-2",
    date: "2027-01-20",
    vendor: "Hal Leonard Australia",
    category: "Teaching materials & pass-throughs",
    amountCents: 4290,
    includesGst: true,
    notes: "Method book for student",
    createdAt: "2027-01-20T14:00:00+11:00",
  },
  {
    id: "tax-exp-3",
    date: "2027-02-08",
    vendor: "Piano Tune Co",
    category: "Repairs & consumables",
    amountCents: 22000,
    includesGst: true,
    notes: "Studio upright tune",
    createdAt: "2027-02-08T09:30:00+11:00",
  },
];

export const taxLiteKmEntries: TaxLiteKmEntry[] = [
  {
    id: "tax-km-1",
    date: "2027-02-14",
    kilometres: 18,
    purpose: "School visit — group lesson setup",
    createdAt: "2027-02-14T18:00:00+11:00",
  },
];

/** Admin sessions worked from home, logged as they happen (T-05: actual hours, kept at the time). */
export type TaxLiteAdminSession = {
  id: string;
  date: string;
  hours: number;
  note: string;
  createdAt: string;
};

export const taxLiteAdminSessions: TaxLiteAdminSession[] = [
  {
    id: "tax-admin-1",
    date: "2026-09-30",
    hours: 2.5,
    note: "Term 4 invoices and lesson planning",
    createdAt: "2026-09-30T20:00:00+10:00",
  },
];

/**
 * Teacher confirmations of scheduled lessons (T-05). Keyed by lesson occurrence id.
 * fromHome false = the teacher said it was not taught from home, so it is not counted.
 */
export type TaxLiteLessonConfirmation = {
  date: string;
  minutes: number;
  fromHome: boolean;
  confirmedAt: string;
};
export const taxLiteLessonConfirmations: Record<string, TaxLiteLessonConfirmation> = {};

/** Cents-per-km rate for 2026–27 (individuals only, up to 5,000 business km). See src/lib/tax-copy.ts. */
export const TAX_LITE_CENTS_PER_KM = CENTS_PER_KM_RATE;

/** ATO Fixed Rate Method: 70c per hour worked from home. */
export const TAX_LITE_WFH_CENTS_PER_HOUR = 70;

export function resetTaxLiteState(): void {
  taxLiteExpenses.splice(
    0,
    taxLiteExpenses.length,
    {
      id: "tax-exp-1",
      date: "2026-09-12",
      vendor: "AMEB Victoria",
      category: "Teaching materials & pass-throughs",
      amountCents: 9500,
      includesGst: false,
      notes: "Grade 4 piano exam entry",
      passThroughStudentId: "stu-1",
      passThroughFamilyId: "fam-1",
      attachedInvoiceId: "inv-exam-draft",
      createdAt: "2026-09-12T10:00:00+10:00",
    },
    {
      id: "tax-exp-2",
      date: addDays(PROTOTYPE_TODAY, -54),
      vendor: "Hal Leonard Australia",
      category: "Teaching materials & pass-throughs",
      amountCents: 4290,
      includesGst: true,
      notes: "Method book for student",
      createdAt: `${addDays(PROTOTYPE_TODAY, -54)}T14:00:00+11:00`,
    },
    {
      id: "tax-exp-3",
      date: addDays(PROTOTYPE_TODAY, -35),
      vendor: "Piano Tune Co",
      category: "Repairs & consumables",
      amountCents: 22000,
      includesGst: true,
      notes: "Studio upright tune",
      createdAt: `${addDays(PROTOTYPE_TODAY, -35)}T09:30:00+11:00`,
    },
  );
  taxLiteKmEntries.splice(0, taxLiteKmEntries.length, {
    id: "tax-km-1",
    date: addDays(PROTOTYPE_TODAY, -29),
    kilometres: 18,
    purpose: "School visit — group lesson setup",
    createdAt: `${addDays(PROTOTYPE_TODAY, -29)}T18:00:00+11:00`,
  });
  taxLiteAdminSessions.splice(0, taxLiteAdminSessions.length, {
    id: "tax-admin-1",
    date: "2026-09-30",
    hours: 2.5,
    note: "Term 4 invoices and lesson planning",
    createdAt: "2026-09-30T20:00:00+10:00",
  });
  for (const key of Object.keys(taxLiteLessonConfirmations)) delete taxLiteLessonConfirmations[key];
}
