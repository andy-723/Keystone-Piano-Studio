export type CommunityScope = "demo" | "new-studio";
export interface NewsPost { id: string; title: string; body: string; authorName: string; createdAt: string }
export const communityState: Record<CommunityScope, { photos: Record<string, string>; posts: NewsPost[] }> = {
  demo: { photos: {}, posts: [] },
  "new-studio": { photos: {}, posts: [] },
};