import type {
  Conversation, Family, Invoice, InvoiceLine, InvoiceStatus, LessonType, Message, PracticeLog,
  Requirement, RequirementCategory, RiskScore, Student, StudentProgress, Studio, Teacher, WeeklySlot,
} from "./types";
import { PROTOTYPE_TODAY, addDays } from "@/lib/calendar";

// All names are made up.
export const studio: Studio = {
  id: "studio-1",
  name: "Clarke Piano Studio",
  abn: "51 824 753 556",
  gstRegistered: true,
  timezone: "Australia/Melbourne",
};

export const teacher: Teacher = { id: "teacher-1", name: "Ms Margaret Clarke" };

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
  ["Morgan", "Rhys Morgan", "en", [["Evie", 2013]]],
];

export const families: Family[] = [];
export const students: Student[] = [];

FAMILY_SEED.forEach(([surname, gName, lang, kids], i) => {
  const familyId = `fam-${i + 1}`;
  const slug = gName.toLowerCase().replace(/[^a-z]+/g, ".");
  families.push({
    id: familyId,
    displayName: `${surname} family`,
    guardians: [{ id: `g-${i + 1}`, name: gName, email: `${slug}@example.com`, preferredLanguage: lang }],
  });
  kids.forEach(([first, year]) => {
    students.push({ id: `stu-${students.length + 1}`, familyId, firstName: first, lastName: surname, birthYear: year });
  });
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
        gradeGoal: GRADES[Math.min(4, Math.max(0, age - 9))]!,
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
  for (let d = 1; d <= 28; d++) {
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

export const riskScores: RiskScore[] = students.map((s) => {
  if (RED.includes(s.id)) {
    return {
      studentId: s.id, score: 78 + Math.round(rand() * 15), band: "red" as const,
      reasons: ["No practice logged in 14 days", "Missed 2 weeks in a row", "Invoice 21 days overdue"].slice(0, 2 + (s.id === "stu-13" ? 1 : 0)),
    };
  }
  if (YELLOW.includes(s.id)) {
    return { studentId: s.id, score: 45 + Math.round(rand() * 20), band: "yellow" as const, reasons: ["Practice down by half this month"] };
  }
  return { studentId: s.id, score: Math.round(rand() * 30), band: "green" as const, reasons: [] };
});

// Invoices: Term 1 2027, one per family, covering every status.
const STATUSES: InvoiceStatus[] = ["paid", "paid", "sent", "overdue", "partially_paid", "draft", "void"];
export const invoices: Invoice[] = families.map((f, i) => {
  const kids = students.filter((s) => s.familyId === f.id);
  const lines: InvoiceLine[] = kids.map((k) => {
    const slot = weeklySlots.find((w) => w.studentId === k.id)!;
    const lt = lessonTypes.find((l) => l.id === slot.lessonTypeId)!;
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
  const taxCents = lines.reduce((a, l) => a + l.taxCents, 0);
  return {
    id: `inv-${i + 1}`,
    number: `INV-2027-${String(i + 1).padStart(3, "0")}`,
    familyId: f.id,
    status: STATUSES[i % STATUSES.length]!,
    issueDate: "2027-01-18",
    dueDate: "2027-02-01",
    lines,
    subtotalCents: totalCents - taxCents,
    taxCents,
    totalCents,
    isTaxInvoice: true,
  };
});

// Chat: 8 threads, 2 in Chinese.
const t = (daysAgo: number, hm: string) => `${addDays(PROTOTYPE_TODAY, -daysAgo)}T${hm}:00+11:00`;
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
  const last = msgs[msgs.length - 1]!;
  conversations.push({
    id, familyId, lastMessageAt: last[3],
    unreadCount: msgs.filter((m) => m[1] !== "teacher").length && last[1] !== "teacher" ? 1 : 0,
  });
});
