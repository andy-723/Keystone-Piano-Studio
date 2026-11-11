/**
 * Accept strings and helpers for phone camera rolls (incl. iPhone HEIC/HEIF).
 * Convenience only — not enforcement. Server/Storage limits live in
 * src/lib/media-limits.ts and src/services/providers/media-storage.ts.
 */

export const PHONE_IMAGE_ACCEPT =
  "image/*,image/heic,image/heif,image/heic-sequence,image/heif-sequence,.heic,.heif";

export const PHONE_VIDEO_ACCEPT =
  "video/*,video/mp4,video/quicktime,video/webm,video/3gpp,video/x-m4v,.mov,.mp4,.m4v,.webm,.3gp";

export const PHONE_MEDIA_ACCEPT = `${PHONE_IMAGE_ACCEPT},${PHONE_VIDEO_ACCEPT}`;

export const NEWS_ATTACHMENT_ACCEPT = `${PHONE_IMAGE_ACCEPT},application/pdf,.pdf`;

const IMAGE_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
  "bmp",
  "tif",
  "tiff",
]);
const VIDEO_EXT = new Set(["mp4", "mov", "m4v", "webm", "3gp", "3gpp", "avi", "mkv"]);

function extension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? (parts.at(-1) ?? "") : "";
}

export function isPhoneImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (/heic|heif/i.test(file.type)) return true;
  return IMAGE_EXT.has(extension(file.name));
}

export function isPhoneVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return VIDEO_EXT.has(extension(file.name));
}

export function isPhoneMediaFile(file: File): boolean {
  return isPhoneImageFile(file) || isPhoneVideoFile(file);
}

export function mediaKindFromFile(file: File): "image" | "video" | null {
  if (isPhoneVideoFile(file)) return "video";
  if (isPhoneImageFile(file)) return "image";
  return null;
}

export function describeUnsupportedMedia(file: File, lang: "en" | "zh-CN" | "vi" | boolean = "en") {
  if (lang === "vi") return `Không dùng được “${file.name}”. Hãy chọn ảnh (kể cả HEIC) hoặc video (MOV/MP4) từ thư viện điện thoại.`;
  return lang === true || lang === "zh-CN"
    ? `无法使用「${file.name}」。请从相册选择照片、HEIC 或视频（如 MOV/MP4）。`
    : `Couldn’t use “${file.name}”. Choose a photo (including HEIC) or video (MOV/MP4) from the phone gallery.`;
}
