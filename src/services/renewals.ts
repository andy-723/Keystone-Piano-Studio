import { families, students, weeklySlots, teacher } from "@/mocks/data";
import { parentGuardianId } from "@/mocks/parent";
import { getRenewalState, type RenewalTerm, type FamilyRenewal } from "@/mocks/renewals";
import { addDays, melbourneIso, TERMS_2027 } from "@/lib/calendar";
import { formatShortDate, formatTime } from "@/lib/format";
import { getOrCreateFamilyConversation, sendMessage } from "./chat";
import { respond } from "./_delay";
import { studioToday } from "@/lib/studio-clock";

function row(familyId: string, term: RenewalTerm = 2): FamilyRenewal { return getRenewalState(term).families.get(familyId) ?? { familyId, status: "not_invited" }; }
function termDates(term: RenewalTerm) { return term === 2 ? TERMS_2027[1] : term === 3 ? TERMS_2027[2] : TERMS_2027[3]; }
function slots(familyId: string) {
  return students.filter((student) => student.familyId === familyId).map((student) => {
    const slot = weeklySlots.find((entry) => entry.studentId === student.id);
    return { studentId: student.id, name: `${student.firstName} ${student.lastName}`, weekday: slot?.weekday ?? 1, time: slot?.time ?? "15:30", gradeGoal: slot?.gradeGoal ?? "AMEB Preliminary" };
  });
}
export async function getRenewals(term: RenewalTerm = 2) {
  const renewalState = getRenewalState(term);
  return respond({ active: renewalState.active, deadline: renewalState.deadline, remindersEnabled: renewalState.remindersEnabled, reminderDays: renewalState.reminderDays, term: termDates(term), termNumber: term, rows: families.map((family) => ({ ...row(family.id, term), familyName: family.displayName, slots: slots(family.id) })) });
}
export async function setRenewalSettings(input: { deadline: string; remindersEnabled: boolean }, term: RenewalTerm = 2) {
  const renewalState = getRenewalState(term);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline) || !Number.isFinite(Date.parse(input.deadline)) || new Date(`${input.deadline}T12:00:00Z`).toISOString().slice(0,10) !== input.deadline || input.deadline < studioToday() || input.deadline >= (TERMS_2027[term - 1]?.start ?? "")) throw new Error("Choose a deadline before the selected term starts");
  if (renewalState.active && input.deadline !== renewalState.deadline) throw new Error("The deadline cannot change after invitations are sent");
  renewalState.deadline = input.deadline; renewalState.remindersEnabled = input.remindersEnabled;
  return getRenewals(term);
}
async function sendRenewalMessage(familyId: string, reminder: boolean, term: RenewalTerm = 2) {
  const renewalState = getRenewalState(term);
  const family = families.find((entry) => entry.id === familyId);
  const chinese = family?.guardians[0]?.preferredLanguage === "zh-CN";
  const conversation = await getOrCreateFamilyConversation(familyId);
  const body = chinese ? `${reminder ? `第 ${term} 学期续课提醒：` : `第 ${term} 学期续课邀请：`}请于 ${renewalState.deadline} 前在家庭首页确认是否继续课程。确认后保留现有上课时间；如需调整时间或暂停，也请告诉我。谢谢！`
    : `${reminder ? `Term ${term} renewal reminder` : `Term ${term} renewal invitation`}: please confirm on your family Home page by ${formatShortDate(renewalState.deadline)} whether you would like to continue. Your current lesson times will be kept after confirmation. You can also request a change or let me know you won't continue. Thank you!`;
  await sendMessage({ conversationId: conversation.id, authorName: teacher.name, authorRole: "teacher", body, kind: "text" });
}
const invitations = new Map<RenewalTerm, Promise<number>>();
export function sendRenewalInvitations(term: RenewalTerm = 2): Promise<number> {
  const existing = invitations.get(term);
  if (existing) return existing;
  const renewalState = getRenewalState(term);
  const inviting = (async () => {
    renewalState.active = true;
    let count = 0;
    for (const family of families) {
      if (row(family.id, term).status !== "not_invited") continue;
      await sendRenewalMessage(family.id, false, term);
      renewalState.families.set(family.id, { familyId: family.id, status: "awaiting", invitedDate: studioToday() }); count++;
    }
    return count;
  })().finally(() => { invitations.delete(term); });
  invitations.set(term, inviting);
  return inviting;
}
const reminderSends = new Map<string, Promise<number>>();
async function sendReminders(term: RenewalTerm, simulate: boolean): Promise<number> {
  const key = String(term);
  const existing = reminderSends.get(key);
  if (existing) return existing;
  const state = getRenewalState(term);
  const sending = (async () => {
    if (!state.active || (simulate && !state.remindersEnabled)) return 0;
    let count = 0;
    for (const entry of state.families.values()) {
      if (entry.status !== "awaiting" || entry.reminderDate || !entry.invitedDate) continue;
      const date = simulate ? addDays(entry.invitedDate, state.reminderDays) : studioToday();
      if (date > state.deadline) continue;
      await sendRenewalMessage(entry.familyId, true, term);
      entry.reminderDate = date; count++;
    }
    return count;
  })().finally(() => reminderSends.delete(key));
  reminderSends.set(key, sending);
  return sending;
}
export function sendRenewalReminders(term: RenewalTerm = 2) { return sendReminders(term, false); }
export function simulateRenewalReminders(term: RenewalTerm = 2) { return sendReminders(term, true); }
function parentFamily() {
  const family = families.find((entry) => entry.guardians.some((guardian) => guardian.id === parentGuardianId));
  if (!family) throw new Error("Family not found");
  return family;
}
export async function getParentRenewal(term: RenewalTerm = 2) {
  const renewalState = getRenewalState(term);
  const family = parentFamily();
  const renewal = row(family.id, term);
  if (!renewalState.active || renewal.status === "not_invited") return respond(null);
  return respond({ ...renewal, deadline: renewalState.deadline, term: termDates(term), termNumber: term, slots: slots(family.id) });
}
export async function respondToParentRenewal(status: "confirmed" | "change_requested" | "declined", note = "", term: RenewalTerm = 2) {
  const renewalState = getRenewalState(term);
  if (!["confirmed", "change_requested", "declined"].includes(status)) throw new Error("Choose a renewal response");
  const family = parentFamily();
  const entry = renewalState.families.get(family.id);
  if (!entry || entry.status !== "awaiting") throw new Error("No pending family renewal");
  if (status === "change_requested" && !note.trim()) throw new Error("Tell your teacher what you would like to change");
  const guardian = family.guardians.find((entry) => entry.id === parentGuardianId);
  const conversation = await getOrCreateFamilyConversation(family.id);
  // Reserve the response before the asynchronous message send to prevent double taps.
  entry.status = status; entry.responseDate = studioToday(); entry.responseNote = note.trim();
  try {
    await sendMessage({ conversationId: conversation.id, authorName: guardian?.name ?? "Parent", authorRole: "guardian", kind: "text", body: `${guardian?.preferredLanguage === "zh-CN" ? status === "confirmed" ? `确认第 ${term} 学期继续课程，保留现有时间。` : status === "declined" ? `第 ${term} 学期暂不继续课程。` : `希望调整第 ${term} 学期的课程安排。` : status === "confirmed" ? `We confirm continuing in Term ${term} at our current lesson times.` : status === "declined" ? `We won't continue lessons in Term ${term}. Thank you.` : `We would like to discuss a change for Term ${term}.`}${note.trim() ? `\n\n${note.trim()}` : ""}` });
  } catch (error) { entry.status = "awaiting"; delete entry.responseDate; delete entry.responseNote; throw error; }
  return getParentRenewal(term);
}
export function renewalSlotLabel(weekday: number, time: string, term: RenewalTerm = 2) {
  const date = addDays(termDates(term).start, (weekday + 6) % 7);
  return `${formatShortDate(date).split(" ")[0]} · ${formatTime(melbourneIso(date, time))}`;
}
export async function getParentRenewals() {
  const rows = await Promise.all(([2, 3, 4] as const).map(getParentRenewal));
  return rows.filter((entry) => entry !== null);
}
