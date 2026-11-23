import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parentHomeQuery } from '@/lib/parent-queries';
import { requestParentMakeUp } from '@/services/parent';
import { parentDate, useParentLanguage } from '@/i18n/parent';
/** Make-up credits owed per child, with use-by dates on real studios (0025), and a request button. */
export function ParentMakeUps() {
  const { data } = useSuspenseQuery(parentHomeQuery); const { t, lang } = useParentLanguage(); const client = useQueryClient();
  const request = useMutation({ mutationFn: (studentId: string) => requestParentMakeUp(studentId, lang), onSuccess: () => Promise.all(['parent', 'chat-threads', 'messages', 'credits'].map((key) => client.invalidateQueries({ queryKey: [key] }))) });
  const outcome = { attended: t('lessonAttended'), cancelled: t('lessonCancelled'), missed: t('lessonMissed') };
  return <>
    <section className="mt-6 border-y border-border py-6"><h2 className="text-xl font-semibold">{t('makeUpOwed', { count: data.makeUps.reduce((sum, entry) => sum + entry.balance, 0) })}</h2>{data.makeUps.map((entry) => <div key={entry.studentId} className="mt-4"><p className="text-lg">{entry.name} · {entry.balance}</p>{entry.useBy.length > 0 && <p className="text-base text-muted-foreground">{t('makeUpUseBy', { date: parentDate(entry.useBy[0]!, lang) })}</p>}{entry.balance > 0 && <Button className="mt-3 w-full whitespace-normal" variant="outline" disabled={request.isPending || entry.requested} onClick={() => request.mutate(entry.studentId)}><Send aria-hidden />{t(entry.requested ? 'makeUpRequested' : 'requestMakeUp')}</Button>}</div>)}{request.isError && <p role="alert" className="mt-4 text-base text-destructive">{t('makeUpError')}</p>}</section>
    {data.recentLessons.length > 0 && <section className="border-b border-border py-6" aria-labelledby="recent-lessons"><h2 id="recent-lessons" className="text-xl font-semibold">{t('recentLessons')}</h2><ul className="mt-3 divide-y divide-border">{data.recentLessons.map((lesson) => <li key={lesson.key} className="flex flex-wrap justify-between gap-3 py-3 text-base"><span>{lesson.name} · {parentDate(lesson.date, lang)}</span><span className={lesson.outcome === 'attended' ? 'font-semibold text-success' : 'font-semibold text-muted-foreground'}>{outcome[lesson.outcome]}</span></li>)}</ul></section>}
  </>;
}
