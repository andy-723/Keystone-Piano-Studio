export interface LessonNotes {
  notes: string;
  voiceSeconds: number;
  summaryMessageId?: string;
  conversationId?: string;
}

export const lessonNotes = new Map<string, LessonNotes>();