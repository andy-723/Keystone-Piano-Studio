import { useSuspenseQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { weekQuery } from '@/lib/schedule-queries';
import { formatShortDate, formatTime } from '@/lib/format';
import type { LessonWithDetails } from '@/services/schedule';
export function WeekTimetable({ date, onLesson }: { date: string; onLesson: (lesson: LessonWithDetails) => void }) {
  const { data } = useSuspenseQuery(weekQuery(date));
  return (
    <section className="mt-6 min-w-0">
      <h1 className="text-3xl font-semibold">{formatShortDate(data[0]?.date ?? date)} – {formatShortDate(data[5]?.date ?? date)}</h1>
      <div className="mt-6 max-w-full md:overflow-x-auto" aria-label="Monday to Saturday timetable">
        <div className="grid grid-cols-1 divide-y divide-border border-y border-border md:min-w-[1080px] md:grid-cols-6 md:divide-x md:divide-y-0">
          {data.map((day) => (
            <div key={day.date} className={`min-w-0 py-5 md:p-3 ${day.day.kind === 'teaching' ? '' : 'bg-muted px-3'}`}>
              <h2 className="mb-4 text-xl font-semibold">{formatShortDate(day.date)}</h2>
              {day.day.kind !== 'teaching' && <p className="text-base text-muted-foreground md:min-h-32">{day.day.kind === 'holiday' ? day.day.name : 'Term break'}</p>}
              {day.day.kind === 'teaching' && day.lessons.length === 0 && <p className="text-base text-muted-foreground">No lessons scheduled.</p>}
              <div className="space-y-3">
                {day.lessons.map((lesson) => (
                  <Button key={lesson.id} variant="outline" className="min-h-24 w-full items-start justify-start whitespace-normal p-3 text-left md:min-h-36" onClick={() => onLesson(lesson)} aria-label={`Move ${lesson.student.firstName} ${lesson.student.lastName}, ${formatShortDate(day.date)} ${formatTime(lesson.startsAt)}`}>
                    <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 md:block">
                      <span className="text-lg font-semibold">{formatTime(lesson.startsAt)}</span>
                      <span className="col-start-1 row-start-2 break-words text-xl md:mt-2 md:block">{lesson.student.firstName} {lesson.student.lastName}</span>
                      <span className="col-start-2 row-start-1 text-base font-normal md:mt-2 md:block">{lesson.lessonType.durationMin} min{lesson.isMakeUp ? ' · Make-up' : ''}</span>
                      {lesson.status !== 'scheduled' && <span className="col-span-2 text-base font-normal text-muted-foreground md:mt-2 md:block">{lesson.status.replaceAll('_', ' ')}</span>}
                      {lesson.credits > 0 && <span className="col-span-2 text-base text-warning md:mt-2 md:block">{lesson.credits} make-up owed</span>}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
