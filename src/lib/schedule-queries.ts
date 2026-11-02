import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { getCredits, getFreeSlots, getWeekLessons } from '@/services/schedule';
export const weekQuery = (date: string) => queryOptions({ queryKey: ['week', date], queryFn: () => getWeekLessons(date) });
export const creditsQuery = (studentId: string) => queryOptions({ queryKey: ['credits', studentId], queryFn: () => getCredits(studentId) });
export const freeSlotsQuery = (date: string, durationMin: number, occurrenceId: string, everyWeek: boolean) => queryOptions({ queryKey: ['free-slots', date, durationMin, occurrenceId, everyWeek], queryFn: () => getFreeSlots({ date, durationMin, ...(occurrenceId ? { occurrenceId } : {}), everyWeek }) });
export const refreshSchedule = (client: QueryClient) => Promise.all(['day', 'week', 'credits', 'free-slots', 'parent', 'student-profile', 'live-lesson', 'messages', 'chat-threads'].map((key) => client.invalidateQueries({ queryKey: [key] })));
