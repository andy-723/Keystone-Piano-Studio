import { queryOptions } from '@tanstack/react-query';
import { getImportContext, getNewStudioRoster } from '@/services/roster-import';
import type { ImportScope } from '@/mocks/roster-import';
export const importContextQuery = (scope: ImportScope) => queryOptions({ queryKey: [scope === 'new-studio' ? 'new-studio' : 'demo', 'import-context'], queryFn: () => getImportContext(scope), staleTime: 0 });
export const newStudioRosterQuery = queryOptions({ queryKey: ['new-studio', 'roster'], queryFn: getNewStudioRoster });
