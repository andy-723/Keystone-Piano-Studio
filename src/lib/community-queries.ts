import { queryOptions } from "@tanstack/react-query";
import { getProfilePictures, getTeacherProfile, getStudioNews, getFamilyNews } from "@/services/community";
import type { CommunityScope } from "@/mocks/community";
export const picturesQuery = (scope: CommunityScope = "demo") => queryOptions({ queryKey: ["profile-pictures", scope], queryFn: () => getProfilePictures(scope) });
export const teacherProfileQuery = (scope: CommunityScope = "demo") => queryOptions({ queryKey: ["teacher-profile", scope], queryFn: () => getTeacherProfile(scope) });
export const newsQuery = (scope: CommunityScope = "demo") => queryOptions({ queryKey: ["studio-news", scope], queryFn: () => getStudioNews(scope) });
export const familyNewsQuery = queryOptions({ queryKey: ["family-news"], queryFn: getFamilyNews });