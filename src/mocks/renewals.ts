export type RenewalStatus = "not_invited" | "awaiting" | "confirmed" | "change_requested" | "declined";
export interface FamilyRenewal {
  familyId: string;
  status: RenewalStatus;
  invitedDate?: string;
  reminderDate?: string;
  responseDate?: string;
  responseNote?: string;
}
export const renewalState = {
  active: false,
  deadline: "2027-03-25",
  remindersEnabled: true,
  reminderDays: 7,
  families: new Map<string, FamilyRenewal>(),
};