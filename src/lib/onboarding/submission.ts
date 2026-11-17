import { z } from "zod";
import { isAdultStudent } from "@/lib/enrolment";
import { isAuMobile } from "@/lib/onboarding/au-mobile";
import { allStudentsAdult, goalLabel, type FlowStudent } from "@/lib/onboarding/steps";
import type { ChildAnswers, FamilyAnswers } from "@/mocks/invitations";
import type { Intake } from "@/mocks/types";

/**
 * Checks for a submitted family enrolment form. Shared by the demo flow (in-memory)
 * and the real-studio flow (src/server/family-join.ts) so both refuse the same answers
 * with the same messages.
 */
export type JoinAnswers = FamilyAnswers & { children?: Record<string, ChildAnswers> };

const submitSchema = z.object({
  fillerName: z.string().min(2),
  relationship: z.enum(["parent", "legal_guardian", "self"]),
  mobile: z.string().min(8),
  collectionAcknowledged: z.literal(true),
  terms: z.object({
    studioAgreed: z.literal(true),
    keystoneAgreed: z.literal(true),
    guardianDeclaration: z.boolean(),
    typedName: z.string().min(3),
    relationship: z.enum(["parent", "legal_guardian", "self"]),
  }),
  children: z.record(z.any()),
});

export type ParsedJoinAnswers = z.infer<typeof submitSchema>;

/** Step 1: the family-level answers (who is filling in, mobile, terms ticks). */
export function parseJoinAnswers(answers: JoinAnswers): ParsedJoinAnswers {
  const parsed = submitSchema.safeParse({
    ...answers,
    collectionAcknowledged: true,
    terms: {
      studioAgreed: true,
      keystoneAgreed: true,
      guardianDeclaration: Boolean(answers.terms?.guardianDeclaration),
      typedName: answers.terms?.typedName ?? "",
      relationship: answers.terms?.relationship || answers.relationship || "parent",
    },
  });
  if (!parsed.success) throw new Error("Complete every required question.");
  if (!isAuMobile(parsed.data.mobile)) throw new Error("Enter an Australian mobile number.");
  return parsed.data;
}

export type JoinConsent = {
  type: "emergency_medical" | "health_notes" | "media_public";
  granted: boolean;
  studentId: string;
};

/** Step 2: per-student questions, guardian rules for minors, and what to record. */
export function checkJoinStudents(
  parsed: ParsedJoinAnswers,
  answers: JoinAnswers,
  students: FlowStudent[],
): {
  hasMinor: boolean;
  capacity: "guardian" | "self";
  consents: JoinConsent[];
  intakes: { studentId: string; intake: Intake }[];
} {
  const hasMinor = students.some((student) => !isAdultStudent(student.birthYear));
  const relationship = parsed.relationship;
  if (hasMinor) {
    if (relationship === "self")
      throw new Error("A parent or legal guardian must enrol students under 18.");
    if (!parsed.terms.guardianDeclaration)
      throw new Error("Confirm you are the parent or legal guardian.");
  }
  if (!hasMinor && relationship === "self" && !allStudentsAdult(students)) {
    throw new Error("Self enrolment is only for adult students.");
  }

  for (const student of students) {
    const child = answers.children?.[student.id];
    if (
      !child?.experience ||
      !child.instrument ||
      !child.goalKind ||
      !child.daysPerWeek ||
      !child.minutesPerDay
    ) {
      throw new Error(`Complete ${student.firstName}'s enrolment questions.`);
    }
    if (child.emergencyMedical == null || child.mediaPublic == null)
      throw new Error("Answer every consent question.");
    const notes = `${child.healthNotes ?? ""}${child.teacherNotes ?? ""}`.trim();
    if (notes && child.healthNotesConsent == null)
      throw new Error("Answer the health notes consent.");
  }

  const capacity = hasMinor ? "guardian" : relationship === "self" ? "self" : "guardian";
  const consents = students.flatMap((student) => {
    const child = answers.children![student.id]!;
    const rows: JoinConsent[] = [
      {
        type: "emergency_medical",
        granted: Boolean(child.emergencyMedical),
        studentId: student.id,
      },
      { type: "media_public", granted: Boolean(child.mediaPublic), studentId: student.id },
    ];
    const notes = `${child.healthNotes ?? ""}${child.teacherNotes ?? ""}`.trim();
    if (notes)
      rows.push({
        type: "health_notes",
        granted: Boolean(child.healthNotesConsent),
        studentId: student.id,
      });
    return rows;
  });

  const intakes = students.map((student) => ({
    studentId: student.id,
    intake: intakeFromChild(answers.children![student.id]!),
  }));

  return { hasMinor, capacity, consents, intakes };
}

/** The teacher-facing intake for one student. Health notes are left out without consent. */
export function intakeFromChild(child: ChildAnswers): Intake {
  const minutes = child.minutesPerDay ?? (child.minutesOther ? Number(child.minutesOther) : 0);
  return {
    experience: child.experience === "transferring" ? "transferring" : "beginner",
    previousGrades: child.previousGrades ?? "",
    theoryExams: child.theoryExams ?? "",
    instrument: child.instrument === "not_yet" || !child.instrument ? "keyboard" : child.instrument,
    goal: goalLabel(child),
    daysPerWeek: child.daysPerWeek ?? 0,
    minutesPerDay: minutes,
    ...(child.healthNotesConsent === false
      ? {}
      : child.healthNotes || child.teacherNotes
        ? { healthNotes: [child.healthNotes, child.teacherNotes].filter(Boolean).join("\n") }
        : {}),
  };
}
