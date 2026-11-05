import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { getAnnouncements, getParentNews, getNewsOptions, getNewsNotifications, getNewsClock } from '@/services/news';
import type { CommunityScope } from '@/mocks/community';
export const announcementsQuery = (scope: CommunityScope = 'demo') => queryOptions({queryKey:['announcements',scope],queryFn:()=>getAnnouncements(scope)});
export const newsOptionsQuery = (scope: CommunityScope = 'demo') => queryOptions({queryKey:['news-options',scope],queryFn:()=>getNewsOptions(scope)});
export const parentNewsQuery = queryOptions({queryKey:['parent-news'],queryFn:getParentNews});
export const newsClockQuery = queryOptions({queryKey:['news-clock'],queryFn:()=>getNewsClock()});
export const newsNotificationsQuery = (scope: CommunityScope = 'demo') => queryOptions({queryKey:['news-notifications',scope],queryFn:()=>getNewsNotifications(scope)});
export async function refreshNews(client: QueryClient) { await Promise.all(['announcements','parent-news','news-notifications'].map(key=>client.invalidateQueries({queryKey:[key]}))); }