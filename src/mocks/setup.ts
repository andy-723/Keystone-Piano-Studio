export const STUDIO_STATES = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"] as const;
export type StudioState = typeof STUDIO_STATES[number];
export type SetupStep = 1 | 2 | 3 | 4 | 5;
export interface SetupData {
  studio: { name: string; teacherName: string; suburb: string; state: StudioState };
  tax: { registration: "yes" | "no" | "not_sure"; abn: string };
  lessons: { id: string; durationMin: number; priceCents: number }[];
  policies: { lateCancellationHours: 24 | 48; studioCancellationCredit: boolean; familyLateCancellationCredit: boolean };
  students: { entry: "import" | "type" | "later" };
}
export interface SetupSession extends SetupData { step: SetupStep; completed: boolean; paused: boolean }
export function initialSetup(): SetupSession {
  return { step: 1, completed: false, paused: false, studio: { name: "", teacherName: "", suburb: "", state: "VIC" }, tax: { registration: "not_sure", abn: "" }, lessons: [{ id: "new-30", durationMin: 30, priceCents: 4900 }, { id: "new-45", durationMin: 45, priceCents: 6900 }, { id: "new-60", durationMin: 60, priceCents: 8800 }], policies: { lateCancellationHours: 24, studioCancellationCredit: true, familyLateCancellationCredit: false }, students: { entry: "later" } };
}
export const setupSession = initialSetup();