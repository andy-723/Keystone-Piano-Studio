import { createFileRoute } from "@tanstack/react-router";
import { StudentGroupsPage } from "@/components/StudentGroups";
import { groupsQuery } from "@/lib/group-queries";
import { studentsQuery } from "@/lib/student-queries";

export const Route = createFileRoute("/students/groups")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(groupsQuery()),
      context.queryClient.ensureQueryData(studentsQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Student groups — Keystone Music HQ" },
      { name: "description", content: "Create and manage studio student groups for news and organisation in Keystone Music HQ." },
      { property: "og:title", content: "Student groups — Keystone Music HQ" },
      { property: "og:description", content: "Create and manage studio student groups for news and organisation in Keystone Music HQ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => <p role="alert">Groups could not be opened. Please refresh to try again.</p>,
  component: () => <StudentGroupsPage />,
});
