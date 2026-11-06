import { families, students, weeklySlots, studio } from "@/mocks/data";
import { newStudioRoster } from "@/mocks/roster-import";
import type { StudentGroup } from "@/mocks/news";
import type { CommunityScope } from "@/mocks/community";
import type { Family, Student, WeeklySlot } from "@/mocks/types";

export type SmartGroupKey = "grade" | "competition";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grade";
}

function studioIdFor(scope: CommunityScope) {
  return scope === "demo" ? studio.id : "new-studio";
}

function rosterFor(scope: CommunityScope): { students: Student[]; families: Family[]; weeklySlots: WeeklySlot[] } {
  return scope === "demo"
    ? { students, families, weeklySlots }
    : { students: newStudioRoster.students, families: newStudioRoster.families, weeklySlots: newStudioRoster.weeklySlots };
}

export function familyCountFor(studentIds: string[], scope: CommunityScope = "demo") {
  const { students: roster } = rosterFor(scope);
  return new Set(roster.filter((student) => studentIds.includes(student.id)).map((student) => student.familyId)).size;
}

/** Editable demo seed groups — stored as manual groups the teacher can rename/edit. */
export function buildManualSeedGroups(ownerMembershipId: string): StudentGroup[] {
  return [
    {
      id: "saturday",
      studioId: studio.id,
      name: "Saturday group",
      kind: "manual",
      description: "Saturday morning lessons",
      ownerMembershipId,
      studentIds: weeklySlots.filter((slot) => slot.weekday === 6).map((slot) => slot.studentId),
    },
    {
      id: "beginners",
      studioId: studio.id,
      name: "Young beginners",
      kind: "manual",
      description: "Early years and first-year students",
      ownerMembershipId,
      studentIds: students.slice(0, 6).map((student) => student.id),
    },
  ];
}

/** Smart classifications recomputed from the current roster (both scopes). */
export function computeSmartGroups(scope: CommunityScope = "demo"): StudentGroup[] {
  const { students: roster, weeklySlots: slots } = rosterFor(scope);
  const studioId = studioIdFor(scope);
  const byGrade = new Map<string, string[]>();
  for (const slot of slots) {
    const list = byGrade.get(slot.gradeGoal) ?? [];
    list.push(slot.studentId);
    byGrade.set(slot.gradeGoal, list);
  }
  const grades = [...byGrade.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([grade, studentIds]) => ({
      id: `smart-grade-${slug(grade)}`,
      studioId,
      name: grade,
      kind: "smart" as const,
      smartKey: "grade" as const,
      description: "Students working toward this grade",
      studentIds: [...new Set(studentIds)],
    }));
  const competitionIds = roster.filter((student) => Boolean(student.examDate)).map((student) => student.id);
  const competition: StudentGroup = {
    id: "smart-competition",
    studioId,
    name: "Competition & exams",
    kind: "smart",
    smartKey: "competition",
    description: "Students with an upcoming exam or competition",
    studentIds: competitionIds,
  };
  return [...grades, competition];
}

export function annotateGroup(group: StudentGroup, scope: CommunityScope = "demo") {
  return {
    ...group,
    kind: group.kind ?? ("manual" as const),
    memberCount: group.studentIds.length,
    familyCount: familyCountFor(group.studentIds, scope),
  };
}

export function annotateGroups(groups: StudentGroup[], scope: CommunityScope = "demo") {
  return groups.map((group) => annotateGroup(group, scope));
}
