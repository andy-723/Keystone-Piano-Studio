import { describe, expect, it } from "vitest";
import { gstFromInclusive, paymentFlags } from "@/services/billing";
import { dayKind, PROTOTYPE_TODAY } from "@/lib/calendar";
import type { Invoice } from "@/mocks/types";

const invoice = (overrides: Partial<Invoice>): Invoice => ({
  id: "inv-x", number: "INV-X", familyId: "fam-1", status: "sent", issueDate: "2027-03-01", dueDate: PROTOTYPE_TODAY,
  lines: [], totalCents: 1000, subtotalCents: 1000, taxCents: 0, isTaxInvoice: true, ...overrides,
});

describe("payment flags", () => {
  it("flags overdue invoices with days overdue", () => {
    const flags = paymentFlags([invoice({ status: "sent", dueDate: "2027-03-01", isOverdue: true, daysOverdue: 14, balanceCents: 1000 })], PROTOTYPE_TODAY);
    expect(flags).toEqual([expect.objectContaining({ kind: "overdue", days: 14 })]);
  });
  it("flags sent invoices due within seven days, including due today", () => {
    const flags = paymentFlags([
      invoice({ dueDate: "2027-03-15", balanceCents: 1000 }),
      invoice({ id: "inv-y", dueDate: "2027-03-22", balanceCents: 1000 }),
    ], PROTOTYPE_TODAY);
    expect(flags.map((flag) => flag.kind)).toEqual(["due_soon", "due_soon"]);
    expect(flags[0]?.days).toBe(0);
  });
  it("ignores paid, draft, void and invoices due further out", () => {
    const flags = paymentFlags([
      invoice({ status: "paid", balanceCents: 0 }), invoice({ id: "a", status: "draft" }), invoice({ id: "b", status: "void" }), invoice({ id: "c", dueDate: "2027-03-30", balanceCents: 1000 }),
    ], PROTOTYPE_TODAY);
    expect(flags).toEqual([]);
  });
  it("sorts overdue before due-soon, earliest due date first", () => {
    const flags = paymentFlags([
      invoice({ id: "soon", dueDate: "2027-03-18", balanceCents: 1000 }),
      invoice({ id: "late", status: "sent", dueDate: "2027-03-05", isOverdue: true, daysOverdue: 10, balanceCents: 1000 }),
    ], PROTOTYPE_TODAY);
    expect(flags.map((flag) => flag.invoice.id)).toEqual(["late", "soon"]);
  });
});

describe("GST", () => {
  it("is one eleventh of a GST-inclusive total", () => {
    expect(gstFromInclusive(4900 * 8)).toBe(3564);
    expect(gstFromInclusive(1100)).toBe(100);
  });
});

describe("lesson calendar", () => {
  it("skips Victorian public holidays and term breaks", () => {
    expect(dayKind("2027-03-08").kind).toBe("holiday");
    expect(dayKind("2027-04-01").kind).toBe("break");
    expect(dayKind("2027-02-08").kind).toBe("teaching");
  });
});
