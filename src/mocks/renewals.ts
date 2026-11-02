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
export type RenewalTerm = 2 | 3 | 4;
const laterTerms = new Map<RenewalTerm, typeof renewalState>();
export function getRenewalState(term: RenewalTerm = 2) {
  if (term === 2) return renewalState;
  const existing = laterTerms.get(term);
  if (existing) return existing;
  const state = { active: false, deadline: term === 3 ? "2027-06-25" : "2027-09-17", remindersEnabled: true, reminderDays: 7, families: new Map<string, FamilyRenewal>() };
  laterTerms.set(term, state);
  return state;
}