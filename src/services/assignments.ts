import { assignments, submissions, deliveryModes } from "@/mocks/assignments";
import { families, students, studio, teacher, practiceLogs } from "@/mocks/data";
import { creditLedger } from "@/mocks/scheduling";
import type { AssignmentTask, Feedback, Submission } from "@/mocks/types";
import { respond } from "./_delay";
import { getParentSession, sendParentMessage } from "./parent";
import { getLessonOccurrence, weekMonday } from "./schedule";
import { getStudentCourse, recordCourseFeedback } from "./curriculum";
import { getOrCreateFamilyConversation, sendMessage } from "./chat";
import { readStudioPlan, setStudioPlan } from "./plans";
import type { StudioPlan } from "@/mocks/types";
import { addDays, PROTOTYPE_TODAY } from "@/lib/calendar";
export function requirePro() { if (readStudioPlan() === "base") throw new Error("Available on Pro"); }
export async function getAssignmentSettings() { return respond({ plan: readStudioPlan(), asyncLessonPolicy: studio.asyncLessonPolicy ?? "makeup_credit" }); }
export async function setAssignmentSettings(input: { plan: StudioPlan; asyncLessonPolicy: "makeup_credit" | "counts_as_lesson" }) { if (!["base", "pro", "academy"].includes(input.plan) || !["makeup_credit", "counts_as_lesson"].includes(input.asyncLessonPolicy)) throw new Error("Choose a valid plan and policy."); await setStudioPlan(input.plan); studio.asyncLessonPolicy = input.asyncLessonPolicy; return getAssignmentSettings(); }
export async function getStudentAssignments(studentId: string) { if (!students.some(student=>student.id===studentId)) throw new Error("Student not found."); return respond(structuredClone(assignments.filter(entry=>entry.studentId===studentId).sort((a,b)=>b.dueDate.localeCompare(a.dueDate)))); }
export async function getAssignmentEditor(occurrenceId: string) { const lesson=await getLessonOccurrence(occurrenceId); if(!lesson) throw new Error("Lesson not found."); const [history,course,settings]=await Promise.all([getStudentAssignments(lesson.studentId),getStudentCourse(lesson.studentId),getAssignmentSettings()]); return { lesson, history, course, settings }; }
export async function saveAssignment(input: { studentId: string; occurrenceId: string; dueDate: string; tasks: AssignmentTask[]; demoClip?: boolean }) {
 const lesson=await getLessonOccurrence(input.occurrenceId); if(!lesson || lesson.studentId!==input.studentId) throw new Error("Assignment lesson does not belong to this student.");
 const course=await getStudentCourse(input.studentId);
 if (!input.tasks.length || new Set(input.tasks.map(task=>task.id)).size!==input.tasks.length || input.tasks.some(task=>!task.text.trim() || !Number.isInteger(task.minutesPerDay)||task.minutesPerDay<1||task.minutesPerDay>240||!Number.isInteger(task.daysPerWeek)||task.daysPerWeek<1||task.daysPerWeek>7|| !["none","audio","video"].includes(task.submissionRequested)|| task.courseItemId&&!course.items.some(item=>item.id===task.courseItemId))) throw new Error("Give each task a title, minutes and 1–7 practice days.");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)||Number.isNaN(Date.parse(input.dueDate))||input.dueDate<lesson.startsAt.slice(0,10)) throw new Error("Choose a due date after the lesson.");
 if(input.tasks.some(task=>task.submissionRequested!=="none")||input.demoClip) requirePro();
 const existing=assignments.find(entry=>entry.occurrenceId===input.occurrenceId); const assignment={...structuredClone(input),id:existing?.id??crypto.randomUUID()};
 // Preserve completion and task identity on re-save; no other assignment may share task IDs.
 if (input.tasks.some(task=>assignments.some(entry=>entry.id!==assignment.id&&entry.tasks.some(other=>other.id===task.id)))) throw new Error("Task IDs must be unique to this assignment.");
 if(existing) Object.assign(existing,assignment); else assignments.push(assignment);
 const conv=await getOrCreateFamilyConversation(lesson.student.familyId); await sendMessage({conversationId:conv.id,authorName:teacher.name,authorRole:"teacher",kind:"text",body:`This week’s assignment · due ${input.dueDate}\n${input.tasks.map(task=>`${task.text}: ${task.daysPerWeek} days × ${task.minutesPerDay} min`).join("\n")}`,assignmentCard:{assignmentId:assignment.id,label:"This week’s assignment"}});
 return respond(structuredClone(assignment));
}
export async function makeAsyncLesson(occurrenceId: string) {
 requirePro(); const lesson=await getLessonOccurrence(occurrenceId); if(!lesson||lesson.status!=="scheduled"||lesson.startsAt.slice(0,10)<PROTOTYPE_TODAY) throw new Error("Choose an upcoming unmarked lesson.");
 if(deliveryModes.get(occurrenceId)==="async") return respond(lesson);
 const assignment=assignments.find(entry=>entry.occurrenceId===occurrenceId); if(!assignment||!assignment.tasks.some(task=>task.submissionRequested!=="none")) throw new Error("Set this week’s recording tasks before making a video lesson.");
 deliveryModes.set(occurrenceId,"async");
 if((studio.asyncLessonPolicy??"makeup_credit")==="makeup_credit"&&!creditLedger.some(entry=>entry.occurrenceId===occurrenceId&&entry.reason==="Video lesson make-up credit")) creditLedger.push({id:crypto.randomUUID(),studentId:lesson.studentId,occurrenceId,amount:1,date:PROTOTYPE_TODAY,reason:"Video lesson make-up credit"});
 const conv=await getOrCreateFamilyConversation(lesson.student.familyId); await sendMessage({conversationId:conv.id,authorName:teacher.name,authorRole:"teacher",kind:"text",body:`This week’s lesson is by video. Record your tasks by ${assignment.dueDate}.${assignment.demoClip?" Your teacher attached a demo clip placeholder.":""}`,assignmentCard:{assignmentId:assignment.id,label:"Video lesson"}});
 return getLessonOccurrence(occurrenceId);
}
export async function getParentAssignments() { const {family,children}=await getParentSession(); const ids=children.map(child=>child.id); const own=assignments.filter(entry=>ids.includes(entry.studentId)&&entry.dueDate>=PROTOTYPE_TODAY&&entry.dueDate<=addDays(weekMonday(PROTOTYPE_TODAY),13)); const taskIds=own.flatMap(entry=>entry.tasks.map(task=>task.id)); return respond({assignments:structuredClone(own),children:children.map(child=>({id:child.id,firstName:child.firstName,birthYear:child.birthYear})),mediaConsent:family.mediaConsent===true,pro:readStudioPlan()!=="base",submissions:structuredClone(submissions.filter(entry=>taskIds.includes(entry.assignmentTaskId)))}); }
async function parentTask(taskId: string) { const {family,children}=await getParentSession(); const assignment=assignments.find(entry=>children.some(child=>child.id===entry.studentId)&&entry.tasks.some(task=>task.id===taskId)); const task=assignment?.tasks.find(entry=>entry.id===taskId); const child=children.find(entry=>entry.id===assignment?.studentId); if(!assignment||!task||!child) throw new Error("Task does not belong to this family."); return {assignment,task,child,family}; }
export async function completeParentTask(taskId: string,minutes: number) { const {task,child}=await parentTask(taskId); if(!Number.isInteger(minutes)||minutes<1||minutes>1440) throw new Error("Enter positive whole practice minutes."); if(task.done) return getParentAssignments(); practiceLogs.push({id:crypto.randomUUID(),studentId:child.id,date:PROTOTYPE_TODAY,minutes,loggedBy:"student",assignmentTaskId:task.id}); task.done=true; return getParentAssignments(); }
export async function setParentMediaConsent(consent: boolean) { const {family}=await getParentSession(); const original=families.find(entry=>entry.id===family.id); if(!original) throw new Error("Family not found."); original.mediaConsent=consent; return getParentAssignments(); }
export async function submitRecording(
  taskId: string,
  submittedBy: "guardian" | "student",
  media?: { fileName: string; mediaUrl: string; mimeType?: string; durationSec?: number; kind?: "audio" | "video" },
) {
  requirePro();
  const { task, child, family } = await parentTask(taskId);
  if (family.mediaConsent !== true) throw new Error("Guardian media consent is required before recording.");
  if (task.submissionRequested === "none") throw new Error("No recording requested for this task.");
  if (!["guardian", "student"].includes(submittedBy)) throw new Error("Choose who is submitting.");
  if (media) {
    if (!media.fileName.trim() || !media.mediaUrl.startsWith("blob:")) throw new Error("Choose a photo or video from the phone gallery.");
    if (media.kind && media.kind !== task.submissionRequested && task.submissionRequested === "audio" && media.kind === "video") {
      /* Allow a video upload when the task asked for audio — phones often only expose camera roll video. */
    }
  }
  const previous = submissions.find((entry) => entry.assignmentTaskId === taskId && entry.status === "waiting_review");
  if (previous) return respond(structuredClone(previous));
  const submission: Submission = {
    id: crypto.randomUUID(),
    assignmentTaskId: taskId,
    kind: media?.kind === "audio" || media?.kind === "video" ? media.kind : task.submissionRequested,
    durationSec: media?.durationSec ?? 20,
    submittedBy,
    guardianApproved: submittedBy === "guardian" || 2027 - child.birthYear >= 13,
    status: "waiting_review",
    createdAt: `${PROTOTYPE_TODAY}T13:30:00+11:00`,
    ...(media
      ? {
          fileName: media.fileName,
          mediaUrl: media.mediaUrl,
          ...(media.mimeType ? { mimeType: media.mimeType } : {}),
        }
      : {}),
  };
  submissions.push(submission);
  return respond(structuredClone(submission));
}
export async function approveSubmission(id: string) { const submission=submissions.find(entry=>entry.id===id); if(!submission) throw new Error("Submission not found."); await parentTask(submission.assignmentTaskId); submission.guardianApproved=true; return getParentAssignments(); }
export async function getReviewQueue() { requirePro(); return respond(submissions.filter(entry=>entry.guardianApproved&&entry.status==="waiting_review").sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(entry=>{const assignment=assignments.find(assignment=>assignment.tasks.some(task=>task.id===entry.assignmentTaskId));const task=assignment?.tasks.find(task=>task.id===entry.assignmentTaskId); const student=students.find(student=>student.id===assignment?.studentId); return {...structuredClone(entry),studentName:student?.firstName??"Student",studentId:student?.id,task:structuredClone(task),daysWaiting:Math.max(0,Math.floor((Date.parse(`${PROTOTYPE_TODAY}T23:59:00+11:00`)-Date.parse(entry.createdAt))/86400000))};})); }
export async function reviewSubmission(id:string,input:{outcome:Feedback["outcome"];newStage?:1|2|3|4|5;comment:string;replyKind?:"voice"|"video"}) { requirePro(); const submission=submissions.find(entry=>entry.id===id); if(!submission||!submission.guardianApproved) throw new Error("Wait for guardian approval."); if(submission.status==="reviewed") return respond(structuredClone(submission)); const assignment=assignments.find(entry=>entry.tasks.some(task=>task.id===submission.assignmentTaskId)); const task=assignment?.tasks.find(task=>task.id===submission.assignmentTaskId); const student=students.find(entry=>entry.id===assignment?.studentId); if(!assignment||!task||!student) throw new Error("Assignment not found."); if(!["pass","stage_move","carry_over","needs_work"].includes(input.outcome)) throw new Error("Choose a checkpoint outcome."); if(task.courseItemId) await recordCourseFeedback({studentId:student.id,courseItemId:task.courseItemId,submissionId:id,...input,shared:true}); const conv=await getOrCreateFamilyConversation(student.familyId); await sendMessage({conversationId:conv.id,authorName:teacher.name,authorRole:"teacher",kind:input.replyKind==="voice"?"voice":input.replyKind==="video"?"video":"text",body:`Feedback ready · ${task.text}\n${input.outcome.replaceAll("_"," ")}\n${input.comment}`,...(input.replyKind?{media:{durationSeconds:20,fileName:"Teacher reply placeholder"}}:{}),assignmentCard:{assignmentId:assignment.id,label:"Feedback ready"}});Object.assign(submission,{status:"reviewed",...input});return respond(structuredClone(submission)); }
export async function requestParentVideoLesson(studentId:string) {requirePro(); const {children}=await getParentSession();const child=children.find(entry=>entry.id===studentId);if(!child)throw new Error("Child not in this family.");return sendParentMessage({kind:"text",body:`${child.firstName} is sick. Could we send a video instead of this week’s lesson? Please set the recording tasks.`});}