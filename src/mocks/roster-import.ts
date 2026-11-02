import type { Conversation, Family, LessonType, Message, Student, WeeklySlot } from './types';
export type ImportScope = 'demo' | 'new-studio';
export const newStudioRoster = {
  students: [] as Student[], families: [] as Family[], weeklySlots: [] as WeeklySlot[],
  lessonTypes: [] as LessonType[], conversations: [] as Conversation[], messages: [] as Message[],
};
export const importBatches = new Map<string, { scope: ImportScope; studentIds: string[]; familyIds: string[]; invitedFamilyIds: string[] }>();
