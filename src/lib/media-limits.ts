/** Server-enforced media limits (tune in beta). Phone-side checks are convenience only. */

export type MediaKind = "chat_video" | "practice_video" | "image" | "pdf" | "voice";

export const MEDIA_LIMITS = {
  chat_video: {
    maxDurationSeconds: 60,
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-m4v"] as const,
  },
  practice_video: {
    maxDurationSeconds: 5 * 60,
    maxBytes: 200 * 1024 * 1024,
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-m4v"] as const,
  },
  image: {
    maxDurationSeconds: null as number | null,
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
    ] as const,
  },
  pdf: {
    maxDurationSeconds: null as number | null,
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: ["application/pdf"] as const,
  },
  voice: {
    maxDurationSeconds: 3 * 60,
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: ["audio/mpeg", "audio/mp4", "audio/webm", "audio/wav", "audio/ogg"] as const,
  },
} as const;

export function plainLanguageLimitError(
  kind: MediaKind,
  reason: "size" | "duration" | "mime",
): string {
  if (kind === "chat_video" && (reason === "size" || reason === "duration")) {
    return "Videos can be up to 60 seconds. Trim it and try again.";
  }
  if (kind === "practice_video" && (reason === "size" || reason === "duration")) {
    return "Practice videos can be up to 5 minutes. Trim it and try again.";
  }
  if (kind === "image" && reason === "size") return "Images can be up to 10 MB.";
  if (kind === "pdf" && reason === "size") return "PDFs can be up to 20 MB.";
  if (kind === "voice" && (reason === "size" || reason === "duration")) {
    return "Voice notes can be up to 3 minutes.";
  }
  return "That file type is not allowed.";
}
