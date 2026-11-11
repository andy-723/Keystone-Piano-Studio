import { marketingFinance, type SnapshotPeriod } from "@/mocks/marketing-finance";

/** Read-only marketing examples; never access or change studio records. */
export async function getMarketingFinance() {
  return structuredClone(marketingFinance);
}

export function homeOfficeEstimateCents(hours: number, rateCents: number) {
  return Math.round(hours * rateCents);
}

export function marketingSnapshotCsv(period: SnapshotPeriod) {
  const data = marketingFinance[period];
  return `Signal,Illustrative value,Period\r\nRevenue collected,"${data.collected}",${period}\r\nOverdue,${data.overdue},${period}\r\nActive students,${data.students},${period}\r\nIncomplete invites,${data.invites},${period}\r\nPractice at risk,${data.practice},${period}\r\nLessons delivered,${data.lessons},${period}\r\n`;
}

export function marketingTaxCsv() {
  const { tax } = marketingFinance;
  return `Illustrative only - not for tax lodgement,Amount AUD\r\nGross tuition,${(tax.grossCents / 100).toFixed(2)}\r\nMerchant fees,${(tax.stripeFeesCents / 100).toFixed(2)}\r\nTeaching and admin hours,${tax.hours}\r\nHome-office estimate at 70 cents per hour,${(homeOfficeEstimateCents(tax.hours, tax.rateCents) / 100).toFixed(2)}\r\nPass-through reimbursement (not tuition),${(tax.bookCents / 100).toFixed(2)}\r\n`;
}
