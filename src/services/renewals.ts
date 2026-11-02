import { families, students, weeklySlots, teacher } from "@/mocks/data";
import { parentGuardianId } from "@/mocks/parent";
import { renewalState, type FamilyRenewal } from "@/mocks/renewals";
import { addDays, melbourneIso, PROTOTYPE_TODAY, TERMS_2027 } from "@/lib/calendar";
import { formatShortDate, formatTime } from "@/lib/format";
import { getOrCreateFamilyConversation, sendMessage } from "./chat";
import { respond } from "./_delay";

function row(familyId: string): FamilyRenewal { return renewalState.families.get(familyId) ?? { familyId, status: "not_invited" }; }
function slots(familyId: string) {
  return students.filter((student) => student.familyId === familyId).map((student) => {
    const slot = weeklySlots.find((entry) => entry.studentId === student.id);
    return { studentId: student.id, name: `${student.firstName} ${student.lastName}`, weekday: slot?.weekday ?? 1, time: slot?.time ?? "15:30", gradeGoal: slot?.gradeGoal ?? "AMEB Preliminary" };
  });
}
export async function getRenewals() {
  return respond({ active: renewalState.active, deadline: renewalState.deadline, remindersEnabled: renewalState.remindersEnabled, reminderDays: renewalState.reminderDays, term: TERMS_2027[1], rows: families.map((family) => ({ ...row(family.id), familyName: family.displayName, slots: slots(family.id) })) });
}
export async function setRenewalSettings(input: { deadline: string; remindersEnabled: boolean }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline) || !Number.isFinite(Date.parse(input.deadline)) || new Date(`${input.deadline}T12:00:00Z`).toISOString().slice(0,10) !== input.deadline || input.deadline < PROTOTYPE_TODAY || input.deadline >= TERMS_2027[1].start) throw new Error("Choose a deadline before Term 2 starts");
  if (renewalState.active && input.deadline !== renewalState.deadline) throw new Error("The deadline cannot change after invitations are sent");
  renewalState.deadline = input.deadline; renewalState.remindersEnabled = input.remindersEnabled;
  return getRenewals();
}
async function sendRenewalMessage(familyId: string, reminder: boolean) {
  const family = families.find((entry) => entry.id === familyId);
  const chinese = family?.guardians[0]?.preferredLanguage === "zh-CN";
  const conversation = await getOrCreateFamilyConversation(familyId);
  const body = chinese ? `${reminder ? "温馨提醒：" : "第 2 学期续课邀请："}请于 ${renewalState.deadline} 前在家庭首页确认是否继续课程。确认后保留现有上课时间；如需调整时间或暂停，也请告诉我。谢谢！`
    : `${reminder ? "A friendly renewal reminder" : "Term 2 renewal invitation"}: please confirm on your family Home page by ${formatShortDate(renewalState.deadline)} whether you would like to continue. Your current lesson times will be kept after confirmation. You can also request a change or let me know you won't continue. Thank you!`;
  await sendMessage({ conversationId: conversation.id, authorName: teacher.name, authorRole: "teacher", body, kind: "text" });
}
let inviting: Promise<number> | undefined;
export function sendRenewalInvitations(): Promise<number> {
  if (inviting) return inviting;
  inviting = (async () => {
    renewalState.active = true;
    let count = 0;
    for (const family of families) {
      if (row(family.id).status !== "not_invited") continue;
      await sendRenewalMessage(family.id, false);
      renewalState.families.set(family.id, { familyId: family.id, status: "awaiting", invitedDate: PROTOTYPE_TODAY }); count++;
    }
    return count;
  })().finally(() => { inviting = undefined; });
  return inviting;
}
let reminding: Promise<number> | undefined;
export function simulateRenewalReminders(): Promise<number> {
  if (reminding) return reminding;
  reminding = (async () => {
    if (!renewalState.active || !renewalState.remindersEnabled) return 0;
    let count = 0;
    for (const entry of renewalState.families.values()) {
      if (entry.status !== "awaiting" || entry.reminderDate || !entry.invitedDate) continue;
      const due = addDays(entry.invitedDate, renewalState.reminderDays);
      if (due > renewalState.deadline) continue;
      await sendRenewalMessage(entry.familyId, true);
      entry.reminderDate = due; count++;
    }
    return count;
  })().finally(() => { reminding = undefined; });
  return reminding;
}
function parentFamily() {
  const family = families.find((entry) => entry.guardians.some((guardian) => guardian.id === parentGuardianId));
  if (!family) throw new Error("Family not found");
  return family;
}
export async function getParentRenewal() {
  const family = parentFamily();
  const renewal = row(family.id);
  if (!renewalState.active || renewal.status === "not_invited") return respond(null);
  return respond({ ...renewal, deadline: renewalState.deadline, term: TERMS_2027[1], slots: slots(family.id) });
}
export async function respondToParentRenewal(status: "confirmed" | "change_requested" | "declined", note = "") {
  if (!["confirmed", "change_requested", "declined"].includes(status)) throw new Error("Choose a renewal response");
  const family = parentFamily();
  const entry = renewalState.families.get(family.id);
  if (!entry || entry.status !== "awaiting") throw new Error("No pending family renewal");
  if (status === "change_requested" && !note.trim()) throw new Error("Tell your teacher what you would like to change");
  const guardian = family.guardians.find((entry) => entry.id === parentGuardianId);
  const conversation = await getOrCreateFamilyConversation(family.id);
  // Reserve the response before the asynchronous message send to prevent double taps.
  entry.status = status; entry.responseDate = PROTOTYPE_TODAY; entry.responseNote = note.trim();
  try {
    await sendMessage({ conversationId: conversation.id, authorName: guardian?.name ?? "Parent", authorRole: "guardian", kind: "text", body: `${guardian?.preferredLanguage === "zh-CN" ? status === "confirmed" ? "确认第 2 学期继续课程，保留现有时间。" : status === "declined" ? "第 2 学期暂不继续课程。" : "希望调整第 2 学期的课程安排。" : status === "confirmed" ? "We confirm continuing in Term 2 at our current lesson times." : status === "declined" ? "We won't continue lessons in Term 2. Thank you." : "We would like to discuss a change for Term 2."}${note.trim() ? `\n\n${note.trim()}` : ""}` });
  } catch (error) { entry.status = "awaiting"; delete entry.responseDate; delete entry.responseNote; throw error; }
  return getParentRenewal();
}
export function renewalSlotLabel(weekday: number, time: string) {
  const date = addDays("2027-04-12", (weekday + 6) % 7);
  return `${formatShortDate(date).split(" ")[0]} · ${formatTime(melbourneIso(date, time))}`;
}