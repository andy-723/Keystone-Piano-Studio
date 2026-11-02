import { afterEach, expect, it } from "vitest";
import { initialSetup, setupSession, STUDIO_STATES } from "@/mocks/setup";
import { invoices, students, studio } from "@/mocks/data";
import { completeSetup, getSetup, resumeSetup, saveSetupStep } from "@/services/setup";
const originalDemo = structuredClone({ invoices, students, studio });
afterEach(() => Object.assign(setupSession, initialSetup()));
it("starts an empty studio without changing demo students, invoices or GST", async () => {
  expect(await getSetup()).toMatchObject({ completed: false, step: 1, studentCount: 0, familyCount: 0, lessonCount: 0 });
  await saveSetupStep({ step: 1, data: { name: "Test Piano", teacherName: "Alex", suburb: "Perth", state: "WA" } });
  await saveSetupStep({ step: 2, data: { registration: "no", abn: "" } });
  expect({ invoices, students, studio }).toEqual(originalDemo);
});
it("state selection picks different school term calendars and accepts all eight states", async () => {
  expect(STUDIO_STATES).toEqual(["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"]);
  await saveSetupStep({ step: 1, data: { name: "Piano", teacherName: "Alex", suburb: "Sydney", state: "NSW" } });
  expect((await getSetup()).calendar.terms[1]).toMatchObject({ start: "2027-04-29", end: "2027-07-02" });
  await saveSetupStep({ step: 1, data: { name: "Piano", teacherName: "Alex", suburb: "Melbourne", state: "VIC" } });
  expect((await getSetup()).calendar.terms[1]).toMatchObject({ start: "2027-04-12", end: "2027-06-25" });
});
it("requires exactly eleven ABN digits for GST Yes but not No or Not sure", async () => {
  await expect(saveSetupStep({ step: 2, data: { registration: "yes", abn: "1234567890" } })).rejects.toThrow("11 digits");
  await expect(saveSetupStep({ step: 2, data: { registration: "yes", abn: "123456789012" } })).rejects.toThrow("11 digits");
  await expect(saveSetupStep({ step: 2, data: { registration: "yes", abn: "abcdefghijk" } })).rejects.toThrow("11 digits");
  expect(await saveSetupStep({ step: 2, data: { registration: "yes", abn: "51 824 753 556" } })).toMatchObject({ tax: { registration: "yes" } });
  expect(await saveSetupStep({ step: 2, data: { registration: "no", abn: "" } })).toMatchObject({ tax: { registration: "no" } });
  expect(await saveSetupStep({ step: 2, data: { registration: "not_sure", abn: "" } })).toMatchObject({ tax: { registration: "not_sure" } });
});
it("prefills 30, 45 and 60 minute prices and stores editable prices as integer cents", async () => {
  expect((await getSetup()).lessons.map((row) => row.durationMin)).toEqual([30, 45, 60]);
  const lessons = [{ id: "custom", durationMin: 30, priceCents: 5250 }];
  expect((await saveSetupStep({ step: 3, data: lessons })).lessons).toEqual(lessons);
  await expect(saveSetupStep({ step: 3, data: [{ id: "invalid", durationMin: 45, priceCents: -1 }] })).rejects.toThrow("price");
});
it("allows 24 or 48 hours with studio credit Yes and family late-cancel credit No defaults", async () => {
  expect((await getSetup()).policies).toEqual({ lateCancellationHours: 24, studioCancellationCredit: true, familyLateCancellationCredit: false });
  expect(await saveSetupStep({ step: 4, data: { ...setupSession.policies, lateCancellationHours: 48 } })).toMatchObject({ policies: { lateCancellationHours: 48 } });
});
it("Finish later saves incomplete entries and resumes at the same step", async () => {
  await saveSetupStep({ step: 1, data: { name: "Partly filled studio", teacherName: "", suburb: "", state: "QLD" } }, { finishLater: true });
  expect(await getSetup()).toMatchObject({ paused: true, step: 1, studio: { name: "Partly filled studio" } });
  expect(await resumeSetup()).toMatchObject({ paused: false, step: 1, studio: { name: "Partly filled studio" } });
  await expect(completeSetup()).rejects.toThrow("your name");
});
it("completes all five steps without importing students or sending family invitations", async () => {
  await saveSetupStep({ step: 1, data: { name: "Fresh Piano", teacherName: "Alex", suburb: "Brisbane", state: "QLD" } });
  await saveSetupStep({ step: 5, data: { entry: "import" } });
  expect(await completeSetup()).toMatchObject({ completed: true, paused: false, studentCount: 0, students: { entry: "import" } });
  expect({ invoices, students, studio }).toEqual(originalDemo);
});