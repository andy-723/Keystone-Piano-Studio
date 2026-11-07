import type {
  Conversation, Family, Invoice, InvoiceLine, InvoiceStatus, LessonType, Message, PracticeLog,
  Requirement, RequirementCategory, RiskScore, Student, StudentProgress, Studio, Teacher, WeeklySlot, LessonStatus, Payment,
} from "./types";
import { PROTOTYPE_TODAY, addDays, melbourneIso } from "@/lib/calendar";

// All names are made up.
export const studio: Studio = {
  id: "studio-1",
  name: "Keystone Music HQ",
  abn: "51 824 753 556",
  gstRegistered: true,
  timezone: "Australia/Melbourne",
  plan: "pro",
  legalName: "Margaret Clarke Piano Studio",
  address: "12 Music Lane, Hawthorn",
  state: "VIC",
  email: "studio@keystone.example",
  phone: "03 9000 0000",
  privacyEmail: "privacy@keystone.example",
  entityType: "sole_trader",
  billing: {
    cycle: "per_term",
    invoiceLeadDays: 14,
    dueRule: "days_after_issue",
    lateFeeAfterDays: 7,
    lateFee: 15,
    suspendAfterDays: 14,
    feeNoticeDays: 30,
    withdrawalNoticeWeeks: 4,
    paymentDiscount: { enabled: false },
  },
  policies: {
    cancelNoticeHours: 24,
    makeUpQuota: 1,
    makeUpPeriod: "term",
    makeUpExpiry: "same term",
    onlinePlatform: "Zoom",
    publicHolidays: "skip",
    tuningFrequency: "once a year",
    inactiveRetentionMonths: 24,
  },
  services: {
    online: true,
    inHome: false,
    exams: true,
    premises: true,
  },
  additionalTerms: "",
};

export const teacher: Teacher = {
  id: "teacher-1",
  name: "Ms Margaret Clarke",
  childSafety: {
    state: "VIC",
    type: "Working with Children Check",
    number: "WWC-DEMO-001234",
    expiry: "2028-06-30",
  },
};

// Session-only attendance state; reloading restores the sample timetable.
export const attendanceMarks = new Map<string, LessonStatus>();

export const lessonTypes: LessonType[] = [
  { id: "lt-30", name: "30 min lesson", durationMin: 30, priceCents: 4900 },
  { id: "lt-45", name: "45 min lesson", durationMin: 45, priceCents: 6900 },
  { id: "lt-60", name: "60 min lesson", durationMin: 60, priceCents: 8800 },
];

// [familySurname, guardianName, language, children[firstName, birthYear]]
const FAMILY_SEED: [string, string, "en" | "zh-CN", [string, number][]][] = [
  ["Chen", "Wei Chen", "zh-CN", [["Lucy", 2015], ["Oscar", 2017]]],
  ["Nguyen", "Thao Nguyen", "en", [["Mia", 2014]]],
  ["Patel", "Priya Patel", "en", [["Arjun", 2013], ["Anika", 2016]]],
  ["O'Brien", "Siobhan O'Brien", "en", [["Finn", 2012]]],
  ["Li", "Jing Li", "zh-CN", [["Grace", 2015]]],
  ["Rossi", "Marco Rossi", "en", [["Sofia", 2014]]],
  ["Thompson", "Kate Thompson", "en", [["Harry", 2016], ["Ella", 2018]]],
  ["Wang", "Hui Wang", "zh-CN", [["Ethan", 2013]]],
  ["Kowalski", "Anna Kowalski", "en", [["Zofia", 2011]]],
  ["Murphy", "Dan Murphy", "en", [["Ruby", 2015]]],
  ["Zhang", "Lei Zhang", "zh-CN", [["Chloe", 2014], ["Leo", 2016]]],
  ["Hassan", "Amira Hassan", "en", [["Yusuf", 2013]]],
  ["Fraser", "Iain Fraser", "en", [["Isla", 2012]]],
  ["Papadopoulos", "Eleni Papadopoulos", "en", [["Nikos", 2014]]],
  ["Kim", "Soo-jin Kim", "en", [["Daniel", 2015]]],
  ["Liu", "Fang Liu", "zh-CN", [["Amy", 2013]]],
  ["Walker", "Sarah Walker", "en", [["Jack", 2010]]],
  ["Singh", "Harpreet Singh", "en", [["Aria", 2016]]],
  ["Bennett", "Claire Bennett", "en", [["Oliver", 2012], ["Matilda", 2015]]],
  ["Tanaka", "Yuki Tanaka", "en", [["Hana", 2014]]],
  ["Ahmed", "Fatima Ahmed", "en", [["Zara", 2017]]],
  ["Morgan", "Rhys Morgan", "en", [["Evie", 2013], ["Theo", 2017]]],
];

export const families: Family[] = [];
export const students: Student[] = [];

FAMILY_SEED.forEach(([surname, gName, lang, kids], i) => {
  const familyId = `fam-${i + 1}`;
  const slug = gName.toLowerCase().replace(/[^a-z]+/g, ".");
  families.push({
    id: familyId,
    displayName: `${surname} family`,
    newsPhotoConsent: i >= 3,
    guardians: [{ id: `g-${i + 1}`, name: gName, email: `${slug}@example.com`, preferredLanguage: lang, mobile: `0491 570 ${String(6 + i).padStart(3, "0")}` }],
  });
  kids.forEach(([first, year]) => {
    students.push({ id: `stu-${students.length + 1}`, familyId, firstName: first, lastName: surname, birthYear: year });
  });
});

const SECOND_GUARDIANS = ["Alex Chen", "Jamie Nguyen", "Rohan Patel", "Patrick O'Brien", "Mei Li", "Anna Rossi"];
families.slice(0, 6).forEach((family, index) => {
  const name = SECOND_GUARDIANS[index];
  if (!name) return;
  family.guardians.push({ id: `g-second-${index + 1}`, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, preferredLanguage: "en", mobile: `0491 570 ${String(40 + index).padStart(3, "0")}` });
});
students.forEach((student, index) => {
  if (index < 6) student.examDate = index < 3 ? `2027-06-${String(18 + index).padStart(2, "0")}` : `2027-08-${String(20 + index).padStart(2, "0")}`;
  else student.targetTerm = index % 2 === 0 ? "Term 2 2027" : "Term 3 2027";
});

// Weekly timetable: Mon–Fri afternoons, Saturday mornings.
const GRADES = ["AMEB Preliminary", "AMEB Grade 1", "AMEB Grade 2", "AMEB Grade 3", "AMEB Grade 4"];
const DAY_TIMES: Record<number, string[]> = {
  1: ["15:30", "16:00", "16:45", "17:30", "18:30"],
  2: ["15:30", "16:15", "17:00", "17:30", "18:15"],
  3: ["15:30", "16:00", "16:30", "17:15", "18:00"],
  4: ["15:45", "16:30", "17:00", "17:45"],
  5: ["15:30", "16:00", "16:30"],
  6: ["09:00", "09:30", "10:15", "11:00", "11:30", "12:15"],
};
export const weeklySlots: WeeklySlot[] = [];
{
  let idx = 0;
  for (const day of [1, 2, 3, 4, 5, 6]) {
    for (const time of DAY_TIMES[day] ?? []) {
      const s = students[idx];
      if (!s) break;
      const age = 2027 - s.birthYear;
      weeklySlots.push({
        studentId: s.id,
        weekday: day,
        time,
        lessonTypeId: age >= 14 ? "lt-60" : age >= 11 ? "lt-45" : "lt-30",
        gradeGoal: GRADES[Math.min(4, Math.max(0, age - 9))] ?? "AMEB Preliminary",
      });
      idx++;
    }
  }
}

// AMEB requirements, Preliminary to Grade 4 (titles and scale names only).
const KEYS = ["C major", "G major", "F major", "D major", "A minor", "E minor", "B♭ major", "D minor", "A major", "E major"];
export const requirements: Requirement[] = [];
GRADES.forEach((g, gi) => {
  const grade = g.replace("AMEB ", "");
  const add = (category: RequirementCategory, title: string) =>
    requirements.push({ id: `req-${requirements.length + 1}`, framework: "AMEB", grade, category, title });
  KEYS.slice(gi, gi + 3).forEach((k) => add("scales", `${k} scale, hands together`));
  add("scales", `${KEYS[gi]} arpeggio`);
  ["List A piece", "List B piece", "List C piece"].forEach((p) => add("pieces", `${p} (${grade})`));
  add("pieces", "Extra list piece");
  add("aural", "Clap back a rhythm");
  add("aural", "Sing back a short melody");
  add("sight-reading", `Sight-reading at ${grade} level`);
});

// Deterministic pseudo-random so mock data is stable across reloads.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export const studentProgress: StudentProgress[] = [];
for (const slot of weeklySlots) {
  const grade = slot.gradeGoal.replace("AMEB ", "");
  for (const r of requirements.filter((r) => r.grade === grade)) {
    const x = rand();
    studentProgress.push({
      studentId: slot.studentId,
      requirementId: r.id,
      status: x < 0.4 ? "passed" : x < 0.75 ? "learning" : "not_started",
    });
  }
}

// Red / yellow students for the risk feature.
const RED = ["stu-6", "stu-13", "stu-21"];
const YELLOW = ["stu-3", "stu-9", "stu-16", "stu-24", "stu-27"];

export const practiceLogs: PracticeLog[] = [];
for (const s of students) {
  for (let d = 1; addDays(PROTOTYPE_TODAY, -d) >= "2027-01-28"; d++) {
    const date = addDays(PROTOTYPE_TODAY, -d);
    const chance = RED.includes(s.id) ? (d > 14 ? 0.3 : 0) : YELLOW.includes(s.id) ? 0.3 : 0.65;
    if (rand() < chance) {
      practiceLogs.push({
        id: `pl-${practiceLogs.length + 1}`, studentId: s.id, date,
        minutes: 10 + Math.round(rand() * 5) * 5, loggedBy: "student",
      });
    }
  }
}

for (let date = "2027-01-28"; date < PROTOTYPE_TODAY; date = addDays(date, 1)) {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (date === "2027-03-08") continue;
  for (const slot of weeklySlots.filter((entry) => entry.weekday === wd)) {
    if (RED.includes(slot.studentId) && date >= addDays(PROTOTYPE_TODAY, -14)) continue;
    practiceLogs.push({ id: `pl-${practiceLogs.length + 1}`, studentId: slot.studentId, date, minutes: 10 + (Number(slot.studentId.replace("stu-", "")) % 3) * 5, loggedBy: "teacher" });
  }
}

export const riskScores: RiskScore[] = students.map((s) => {
  if (RED.includes(s.id)) {
    return {
      studentId: s.id, score: 20 + Math.round(rand() * 29), band: "red" as const,
      reasons: ["No practice logged in 14 days", "Missed 2 weeks in a row", "Invoice 21 days overdue"].slice(0, 2 + (s.id === "stu-13" ? 1 : 0)),
    };
  }
  if (YELLOW.includes(s.id)) {
    return { studentId: s.id, score: 50 + Math.round(rand() * 29), band: "yellow" as const, reasons: ["Practice down by half this month"] };
  }
  return { studentId: s.id, score: 80 + Math.round(rand() * 20), band: "green" as const, reasons: [] };
});

// Invoices: Term 1 2027, one per family, covering every status.
const STATUSES: InvoiceStatus[] = ["paid", "paid", "sent", "overdue", "partially_paid", "draft", "void"];
export const invoices: Invoice[] = families.map((f, i) => {
  const kids = students.filter((s) => s.familyId === f.id);
  const lines: InvoiceLine[] = kids.map((k) => {
    const slot = weeklySlots.find((w) => w.studentId === k.id);
    const lt = lessonTypes.find((l) => l.id === slot?.lessonTypeId);
    if (!lt) throw new Error("Incomplete invoice timetable");
    const qty = 8;
    const lineTotalCents = lt.priceCents * qty;
    return {
      description: `${k.firstName} – ${lt.name}, Term 1 2027`,
      qty, unitCents: lt.priceCents,
      taxCents: Math.round(lineTotalCents / 11),
      lineTotalCents,
    };
  });
  const totalCents = lines.reduce((a, l) => a + l.lineTotalCents, 0);
  const taxCents = Math.round(totalCents / 11);
  const lastLine = lines.at(-1);
  if (lastLine) lastLine.taxCents += taxCents - lines.reduce((sum, line) => sum + line.taxCents, 0);
  return {
    id: `inv-${i + 1}`,
    number: `INV-2027-${String(i + 1).padStart(3, "0")}`,
    familyId: f.id,
    status: f.id === "fam-10" ? "overdue" : STATUSES[i % STATUSES.length] ?? "draft",
    issueDate: "2027-01-18",
    dueDate: f.id === "fam-10" ? addDays(PROTOTYPE_TODAY, -21) : STATUSES[i % STATUSES.length] === "overdue" ? addDays(PROTOTYPE_TODAY, -(14 + i % 32)) : "2027-02-01",
    lines,
    subtotalCents: totalCents - taxCents,
    taxCents,
    totalCents,
    isTaxInvoice: true,
    gstRegistered: true,
    title: "Tax invoice",
  };
});

export const payments: Payment[] = [];
invoices.forEach((invoice, index) => {
  if (invoice.status !== "paid" && invoice.status !== "partially_paid") return;
  payments.push({ id: `payment-${payments.length + 1}`, invoiceId: invoice.id, method: index % 3 === 0 ? "payto" : index % 3 === 1 ? "becs" : "card", amountCents: invoice.status === "paid" ? invoice.totalCents : Math.round(invoice.totalCents / 2), date: "2027-02-05" });
});

// Keep initial conversation IDs stable while expanding to fifteen realistic family threads.
const t = (daysAgo: number, hm: string) => melbourneIso(addDays(PROTOTYPE_TODAY, -daysAgo), hm);
const THREADS: [string, [string, "teacher" | "guardian" | "student", string, string, Message["kind"]][]][] = [
  ["fam-1", [
    ["Ms Clarke", "teacher", "Lucy played her List A piece beautifully today.", t(3, "16:40"), "text"],
    ["Wei Chen", "guardian", "谢谢老师！她每天都在练习。", t(2, "19:05"), "text"],
    ["Wei Chen", "guardian", "Oscar 这周六可以改到十点吗？", t(1, "20:12"), "text"],
  ]],
  ["fam-5", [
    ["Ms Clarke", "teacher", "Grace is ready to start Grade 2 scales.", t(4, "17:10"), "text"],
    ["Jing Li", "guardian", "太好了，谢谢您！", t(4, "18:30"), "text"],
  ]],
  ["fam-2", [
    ["Thao Nguyen", "guardian", "Mia has a school camp next week, so she'll miss Tuesday.", t(2, "08:15"), "text"],
  ]],
  ["fam-3", [
    ["Ms Clarke", "teacher", "Voice note: Arjun's scale tempo", t(5, "17:00"), "voice"],
    ["Priya Patel", "guardian", "Thanks, we'll practise with the metronome.", t(5, "19:20"), "text"],
  ]],
  ["fam-4", [["Siobhan O'Brien", "guardian", "Finn's recital video", t(6, "18:45"), "video"]]],
  ["fam-7", [["Kate Thompson", "guardian", "Ella's practice chart this week", t(1, "17:30"), "image"]]],
  ["fam-12", [["Ms Clarke", "teacher", "Just checking in — we missed Yusuf last week. All well?", t(3, "15:00"), "text"]]],
  ["fam-19", [["Claire Bennett", "guardian", "Can we pay the term in two parts?", t(0, "09:10"), "text"]]],
];
export const conversations: Conversation[] = [];
export const messages: Message[] = [];
THREADS.forEach(([familyId, msgs], i) => {
  const id = `conv-${i + 1}`;
  msgs.forEach(([authorName, authorRole, body, sentAt, kind]) =>
    messages.push({
      id: `msg-${messages.length + 1}`, conversationId: id, authorName, authorRole, body, kind, sentAt,
      ...(authorRole === "teacher" ? { readAt: sentAt } : {}),
    }),
  );
  const last = msgs[msgs.length - 1];
  if (!last) return;
  conversations.push({
    id, familyId, lastMessageAt: last[3],
    unreadCount: msgs.filter((m) => m[1] !== "teacher").length && last[1] !== "teacher" ? 1 : 0,
  });
});

for (const familyId of ["fam-8", "fam-6", "fam-9", "fam-10", "fam-11", "fam-13", "fam-14"]) {
  conversations.push({ id: `conv-${conversations.length + 1}`, familyId, lastMessageAt: t(1, "18:00"), unreadCount: 1 });
}
const chineseFamilies = new Set(["fam-1", "fam-5", "fam-8"]);
for (const [index, conversation] of conversations.entries()) {
  const family = families.find((entry) => entry.id === conversation.familyId);
  const student = students.find((entry) => entry.familyId === conversation.familyId);
  if (!family || !student) continue;
  const chinese = chineseFamilies.has(family.id);
  const gradeGoal = weeklySlots.find((slot) => slot.studentId === student.id)?.gradeGoal ?? "AMEB Preliminary";
  const extra: { days: number; teacher: boolean; body: string; kind?: Message["kind"]; summary?: boolean }[] = [
    { days: 44, teacher: true, body: chinese ? "欢迎回来！这学期我们会练习音阶和新曲目。" : `Welcome back! This term we'll work on ${student.firstName}'s scales and a new List B piece.` },
    { days: 33, teacher: false, body: chinese ? "下周学校有活动，可以安排补课吗？" : "There is a school event next week. Could we arrange a make-up lesson?" },
    { days: 32, teacher: true, body: chinese ? "可以，我们一起找一个合适的时间。" : "Of course — let's find a time that works for your family." },
    { days: 24, teacher: false, body: chinese ? "请问学费可以分两次支付吗？" : "Could we pay the term invoice in two instalments?" },
    { days: 23, teacher: true, body: chinese ? "可以，请在聊天里告诉我方便的日期。" : "Yes, that's fine. Let me know which dates would suit you." },
    { days: 13, teacher: false, body: chinese ? "这是今天在家的练习视频。" : `${student.firstName}'s practice at home today.`, kind: "video" },
    { days: 12, teacher: true, body: chinese ? "节奏更稳定了！请继续慢练，保持手腕放松。" : "The rhythm is much steadier! Keep practising slowly with relaxed wrists." },
  ];
  const existingCount = messages.filter((message) => message.conversationId === conversation.id).length;
  for (const entry of extra.slice(0, Math.min(7, 9 - existingCount))) messages.push({ id: `msg-${messages.length + 1}`, conversationId: conversation.id, authorName: entry.teacher ? "Ms Clarke" : family.guardians[0]?.name ?? "Parent", authorRole: entry.teacher ? "teacher" : "guardian", body: entry.body, kind: entry.kind ?? "text", sentAt: t(entry.days, "18:10"), ...(entry.teacher ? { readAt: t(entry.days - 1, "09:00") } : {}), ...(entry.kind === "video" ? { media: { durationSeconds: 24 } } : {}) });
  if (index === 0) messages.push({ id: `msg-${messages.length + 1}`, conversationId: conversation.id, authorName: "Ms Clarke", authorRole: "teacher", body: "Lucy Chen · Lesson summary\n\nKeep wrists relaxed and try slow practice in short bursts.", kind: "text", sentAt: t(7, "17:00"), readAt: t(6, "18:00"), lessonSummary: { lessonId: `${student.id}_${addDays(PROTOTYPE_TODAY, -7)}`, studentName: `${student.firstName} ${student.lastName}`, gradeGoal, readiness: 45, date: addDays(PROTOTYPE_TODAY, -7), notes: "Keep wrists relaxed and try slow practice in short bursts.", passedCount: 5, requirementCount: 11, studentMinutes: 80, teacherMinutes: 15 } });
  const threadMessages = messages.filter((message) => message.conversationId === conversation.id).sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  conversation.lastMessageAt = threadMessages.at(-1)?.sentAt ?? conversation.lastMessageAt;
}
