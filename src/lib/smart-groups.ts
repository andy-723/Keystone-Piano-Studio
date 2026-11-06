import { families, students, weeklySlots, studio } from "@/mocks/data";
import type { StudentGroup } from "@/mocks/news";
import type { Student } from "@/mocks/types";

export type SmartGroupKey = "grade" | "new_joiners" | "recital" | "competition";

const MANUAL_SEED: Array<Omit<StudentGroup, "studioId">> = [
  {
    id: "saturday",
    name: "Saturday group",
    kind: "manual",
    description: "Custom studio group",
    studentIds: weeklySlots.filter((slot) => slot.weekday === 6).map((slot) => slot.studentId),
  },
  {
    id: "beginners",
    name: "Young beginners",
    kind: "manual",
    description: "Custom studio group",
    studentIds: students.slice(0, 6).map((student) => student.id),
  },
];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grade";
}

function familyCountFor(studentIds: string[]) {
  return new Set(
    students.filter((student) => studentIds.includes(student.id)).map((student) => student.familyId),
  ).size;
}

function withMeta(group: Omit<StudentGroup, "studioId">): StudentGroup & { familyCount: number } {
  return {
    ...group,
    studioId: studio.id,
    familyCount: familyCountFor(group.studentIds),
  };
}

/** Grade bands from each student's weekly timetable goal. */
function gradeGroups(): Array<Omit<StudentGroup, "studioId">> {
  const byGrade = new Map<string, string[]>();
  for (const slot of weeklySlots) {
    const list = byGrade.get(slot.gradeGoal) ?? [];
    list.push(slot.studentId);
    byGrade.set(slot.gradeGoal, list);
  }
  return [...byGrade.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([grade, studentIds]) => ({
      id: `smart-grade-${slug(grade)}`,
      name: grade,
      kind: "smart" as const,
      smartKey: "grade" as const,
      description: "Students working toward this grade",
      studentIds: [...new Set(studentIds)],
    }));
}

/** Newest roster families this term — useful for welcome posts. */
function newJoinerIds(roster: Student[]) {
  const recentFamilyIds = new Set(families.slice(-4).map((family) => family.id));
  const recent = roster.filter((student) => recentFamilyIds.has(student.familyId)).map((student) => student.id);
  if (recent.length) return recent;
  return roster.slice(-4).map((student) => student.id);
}

/** Saturday concert rehearsal cohort for recital notices. */
function recitalIds() {
  return [...new Set(weeklySlots.filter((slot) => slot.weekday === 6).map((slot) => slot.studentId))];
}

/** Students with an upcoming exam / competition date. */
function competitionIds(roster: Student[]) {
  return roster.filter((student) => Boolean(student.examDate)).map((student) => student.id);
}

export function buildDemoStudentGroups(): StudentGroup[] {
  const roster = students;
  const smart: Array<Omit<StudentGroup, "studioId">> = [
    ...gradeGroups(),
    {
      id: "smart-new-joiners",
      name: "New joiners",
      kind: "smart",
      smartKey: "new_joiners",
      description: "Families who joined this term",
      studentIds: newJoinerIds(roster),
    },
    {
      id: "smart-recital",
      name: "Recital performance",
      kind: "smart",
      smartKey: "recital",
      description: "Students preparing for the studio recital",
      studentIds: recitalIds(),
    },
    {
      id: "smart-competition",
      name: "Competition & exams",
      kind: "smart",
      smartKey: "competition",
      description: "Students with an upcoming exam or competition",
      studentIds: competitionIds(roster),
    },
  ];
  return [...smart, ...MANUAL_SEED].map((group) => {
    const { familyCount: _familyCount, ...rest } = withMeta(group);
    void _familyCount;
    return rest;
  });
}

export function annotateGroups(groups: StudentGroup[]) {
  return groups.map((group) => ({
    ...group,
    kind: group.kind ?? "manual",
    familyCount: familyCountFor(group.studentIds),
  }));
}

export function selectGroupIds(
  groups: Array<Pick<StudentGroup, "id" | "kind" | "smartKey">>,
  filter: "all" | "smart" | "manual" | SmartGroupKey,
) {
  if (filter === "all") return groups.map((group) => group.id);
  if (filter === "smart") return groups.filter((group) => group.kind === "smart").map((group) => group.id);
  if (filter === "manual") return groups.filter((group) => (group.kind ?? "manual") === "manual").map((group) => group.id);
  return groups.filter((group) => group.smartKey === filter).map((group) => group.id);
}
