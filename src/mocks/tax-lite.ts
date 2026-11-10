/**
 * Tax Lite (Starter Accounting Lite) session fixtures.
 * Scope-keyed mock state — swap for REST later; not a general ledger.
 */

import { PROTOTYPE_TODAY, addDays } from "@/lib/calendar";

/** ATO-ish deduction buckets for solo music studios (blueprint §1). */
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

/** Manual admin hours claimed for Fixed Rate WFH (in addition to scheduled teaching). */
export let taxLiteAdminHoursByFy: Record<string, number> = {
  "2026-27": 2.5,
};

/** ATO cents-per-km rate used for the optional light log (display only). */
export const TAX_LITE_CENTS_PER_KM = 88;

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
  taxLiteAdminHoursByFy = { "2026-27": 2.5 };
}
