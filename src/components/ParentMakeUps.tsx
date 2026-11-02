import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parentHomeQuery } from '@/lib/parent-queries';
import { requestParentMakeUp } from '@/services/parent';
import { useParentLanguage } from '@/i18n/parent';
export function ParentMakeUps() {
  const { data } = useSuspenseQuery(parentHomeQuery); const { t, lang } = useParentLanguage(); const client = useQueryClient();
  const request = useMutation({ mutationFn: (studentId: string) => requestParentMakeUp(studentId, lang), onSuccess: () => Promise.all(['parent', 'chat-threads', 'messages', 'credits'].map((key) => client.invalidateQueries({ queryKey: [key] }))) });
  return <section className="mt-6 border-y border-border py-6"><h2 className="text-xl font-semibold">{t('makeUpOwed', { count: data.makeUps.reduce((sum, entry) => sum + entry.balance, 0) })}</h2>{data.makeUps.map((entry) => <div key={entry.studentId} className="mt-4"><p className="text-lg">{entry.name} · {entry.balance}</p>{entry.balance > 0 && <Button className="mt-3 w-full whitespace-normal" variant="outline" disabled={request.isPending || entry.requested} onClick={() => request.mutate(entry.studentId)}><Send aria-hidden />{t(entry.requested ? 'makeUpRequested' : 'requestMakeUp')}</Button>}</div>)}{request.isError && <p role="alert" className="mt-4 text-base text-destructive">{t('makeUpError')}</p>}</section>;
}
