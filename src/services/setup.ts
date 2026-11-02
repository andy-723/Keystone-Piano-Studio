import { setupSession, STUDIO_STATES, type SetupData, type SetupStep } from "@/mocks/setup";
import { respond } from "./_delay";
import { STATE_CALENDARS } from "@/mocks/state-calendars";

export type SetupStepInput =
  | { step: 1; data: SetupData["studio"] }
  | { step: 2; data: SetupData["tax"] }
  | { step: 3; data: SetupData["lessons"] }
  | { step: 4; data: SetupData["policies"] }
  | { step: 5; data: SetupData["students"] };
export function validateSetupStep(input: SetupStepInput) {
  switch (input.step) {
    case 1:
      if (!input.data.name.trim() || !input.data.teacherName.trim() || !input.data.suburb.trim()) throw new Error("Enter your studio name, your name and suburb.");
      if (!STUDIO_STATES.includes(input.data.state)) throw new Error("Choose your state or territory.");
      break;
    case 2:
      if (!["yes", "no", "not_sure"].includes(input.data.registration)) throw new Error("Choose a GST answer.");
      if (input.data.registration === "yes" && !/^\d{11}$/.test(input.data.abn.replace(/\s/g, ""))) throw new Error("Enter an ABN with 11 digits.");
      break;
    case 3:
      if (!input.data.length) throw new Error("Add at least one lesson length and price.");
      if (input.data.some((row) => !Number.isInteger(row.durationMin) || row.durationMin <= 0 || !Number.isInteger(row.priceCents) || row.priceCents < 0)) throw new Error("Enter a positive lesson length and a price of $0 or more.");
      if (new Set(input.data.map((row) => row.durationMin)).size !== input.data.length) throw new Error("Use each lesson length only once.");
      break;
    case 4:
      if (![24, 48].includes(input.data.lateCancellationHours)) throw new Error("Choose 24 or 48 hours’ notice.");
      break;
    case 5:
      if (!["import", "type", "later"].includes(input.data.entry)) throw new Error("Choose how to add students.");
  }
}
export const getSetup = () => respond({ ...setupSession, calendar: STATE_CALENDARS[setupSession.studio.state], studentCount: 0, familyCount: 0, lessonCount: 0 });
export async function saveSetupStep(input: SetupStepInput, options: { finishLater?: boolean; nextStep?: SetupStep } = {}) {
  if (!options.finishLater) validateSetupStep(input);
  const keys = { 1: "studio", 2: "tax", 3: "lessons", 4: "policies", 5: "students" } as const;
  Object.assign(setupSession, { [keys[input.step]]: structuredClone(input.data), step: options.nextStep ?? input.step, paused: options.finishLater ?? false });
  return getSetup();
}
export async function resumeSetup(step: SetupStep = setupSession.step) {
  setupSession.step = step; setupSession.paused = false; setupSession.completed = false;
  return getSetup();
}
export async function completeSetup() {
  validateSetupStep({ step: 1, data: setupSession.studio });
  validateSetupStep({ step: 2, data: setupSession.tax });
  validateSetupStep({ step: 3, data: setupSession.lessons });
  validateSetupStep({ step: 4, data: setupSession.policies });
  validateSetupStep({ step: 5, data: setupSession.students });
  setupSession.completed = true; setupSession.paused = false;
  return getSetup();
}