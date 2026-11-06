import { createFileRoute } from '@tanstack/react-router';
import { ImportStudents } from '@/components/ImportStudents';
import { importContextQuery } from '@/lib/roster-import-queries';
export const Route = createFileRoute('/students/import')({
  loader: ({ context }) => context.queryClient.ensureQueryData(importContextQuery('demo')),
  head: () => ({ meta: [{ title: 'Import students — KeyStone Piano Studios' }, { name: 'description', content: 'Match spreadsheet columns, check students and group families before adding them to your KeyStone Piano Studios studio.' }, { property: 'og:title', content: 'Import students — KeyStone Piano Studios' }, { property: 'og:description', content: 'Review your student roster and send mock family invitations in KeyStone Piano Studios.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: () => <ImportStudents scope="demo" />,
});
