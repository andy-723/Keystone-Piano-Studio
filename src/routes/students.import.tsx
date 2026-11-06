import { createFileRoute } from '@tanstack/react-router';
import { ImportStudents } from '@/components/ImportStudents';
import { importContextQuery } from '@/lib/roster-import-queries';
export const Route = createFileRoute('/students/import')({
  loader: ({ context }) => context.queryClient.ensureQueryData(importContextQuery('demo')),
  head: () => ({ meta: [{ title: 'Import students — Keystone Music HQ' }, { name: 'description', content: 'Match spreadsheet columns, check students and group families before adding them to your Keystone Music HQ studio.' }, { property: 'og:title', content: 'Import students — Keystone Music HQ' }, { property: 'og:description', content: 'Review your student roster and send mock family invitations in Keystone Music HQ.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: () => <ImportStudents scope="demo" />,
});
