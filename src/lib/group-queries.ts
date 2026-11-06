import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { getStudentGroups, listGroups } from "@/services/groups";
import type { CommunityScope } from "@/mocks/community";

export const groupsQuery = (scope: CommunityScope = "demo") =>
  queryOptions({ queryKey: ["student-groups", scope], queryFn: () => listGroups(scope) });

export const studentGroupsQuery = (studentId: string, scope: CommunityScope = "demo") =>
  queryOptions({
    queryKey: ["student-groups", scope, "student", studentId],
    queryFn: () => getStudentGroups(studentId, scope),
  });

export async function refreshGroups(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["student-groups"] }),
    client.invalidateQueries({ queryKey: ["news-options"] }),
    client.invalidateQueries({ queryKey: ["student-profile"] }),
  ]);
}
