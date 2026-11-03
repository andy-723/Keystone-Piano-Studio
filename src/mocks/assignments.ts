import { families, studio } from "./data";
import { courseItems, studentCourses } from "./curriculum";
import type { Assignment, Submission } from "./types";
export const assignments: Assignment[] = studentCourses.map((course, i) => ({ id: `assignment-${course.studentId}`, studentId: course.studentId, occurrenceId: `${course.studentId}_2027-03-15`, dueDate: "2027-03-21", tasks: courseItems.filter(item => item.studentCourseId === course.id).slice(0, 2).map((item, index) => ({ id: `task-${course.studentId}-${index}`, courseItemId: item.id, text: `Explore ${item.title}`, minutesPerDay: 10, daysPerWeek: 5, submissionRequested: i === 0 && index === 0 ? "video" : "none", done: false })) }));
export const submissions: Submission[] = [];
export const deliveryModes = new Map<string, "in_person" | "online" | "async">();
studio.plan ??= "pro"; studio.asyncLessonPolicy ??= "makeup_credit";
families.forEach((family,index) => { family.mediaConsent ??= index !== 1 && index !== 2; });