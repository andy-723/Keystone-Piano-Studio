import { queryOptions } from "@tanstack/react-query";
import { getStudentProfile, getTeacherStudents } from "@/services/students";
import { getRosterProgress } from "@/services/curriculum";

export const studentsQuery = queryOptions({ queryKey: ["students"], queryFn: getTeacherStudents });
export const rosterProgressQuery = queryOptions({ queryKey: ["course", "roster-progress"], queryFn: getRosterProgress });
export const studentProfileQuery = (id: string) => queryOptions({ queryKey: ["student-profile", id], queryFn: () => getStudentProfile(id), staleTime: 0 });