import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Mic, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VoiceClip } from "@/components/ChatMedia";
import { sendMessage } from "@/services/chat";
import { getTeacher } from "@/services/roster";
import type { Message } from "@/mocks/types";
import type { Lang } from "@/mocks/types";
import { translate } from "@/i18n/parent";
import { sendParentMessage } from "@/services/parent";

type Attachment = { kind: "image" | "video" | "voice"; media: NonNullable<Message["media"]> };
export function ChatComposer({ conversationId, parentLang, initialText = "", onSent }: { conversationId: string; parentLang?: Lang; initialText?: string; onSent?: () => void }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(parentLang ?? "en", key);
  const [text, setText] = useState(initialText);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const sending = useMutation({ mutationFn: async () => {
    if (parentLang) return sendParentMessage({ body: text.trim(), kind: attachment?.kind ?? "text", ...(attachment ? { media: attachment.media } : {}) });
    const teacher = await getTeacher();
    return sendMessage({ conversationId, authorName: teacher.name, authorRole: "teacher", body: text.trim(), kind: attachment?.kind ?? "text", ...(attachment ? { media: attachment.media } : {}) });
  }, onSuccess: async () => {
    setText(""); setAttachment(null);
    onSent?.();
    await Promise.all([client.invalidateQueries({ queryKey: ["messages", conversationId] }), client.invalidateQueries({ queryKey: ["chat-threads"] }), client.invalidateQueries({ queryKey: ["parent"] })]);
    toast.success(t("messageSent"));
  }, onError: () => toast.error(t("messageError")) });
  async function attach(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) { toast.error(t("chooseMedia")); return; }
    const url = URL.createObjectURL(file);
    const kind = file.type.startsWith("image/") ? "image" : "video";
    let durationSeconds: number | undefined;
    let thumbnailUrl: string | undefined;
    if (kind === "video") {
      durationSeconds = await new Promise<number | undefined>((resolve) => {
        const video = document.createElement("video"); video.preload = "metadata"; video.src = url;
        const timer = window.setTimeout(() => resolve(undefined), 3000);
        video.onloadeddata = () => { window.clearTimeout(timer); const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 320; const context = canvas.getContext("2d"); if (context) { context.drawImage(video, 0, 0, 480, 320); thumbnailUrl = canvas.toDataURL("image/jpeg"); } resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : undefined); };
        video.onerror = () => { window.clearTimeout(timer); resolve(undefined); };
      });
    }
    setAttachment({ kind, media: { url, fileName: file.name, ...(durationSeconds !== undefined ? { durationSeconds } : {}), ...(thumbnailUrl ? { thumbnailUrl } : {}) } });
  }
  return <form className="shrink-0 border-t border-border bg-background p-4" onSubmit={(event) => { event.preventDefault(); if (!sending.isPending && (text.trim() || attachment)) sending.mutate(); }}>
    {attachment && <div className="mb-3 border-l-4 border-primary bg-muted p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="break-all text-base">{attachment.media.fileName ?? t("voiceNote")}</span>
        <Button type="button" variant="ghost" disabled={sending.isPending} onClick={() => setAttachment(null)}><X aria-hidden /> {t("remove")}</Button></div>
      {attachment.kind === "voice" ? <VoiceClip lang={parentLang ?? "en"} /> : attachment.kind === "image" ? <img src={attachment.media.url} width={160} height={100} alt={t("photoAlt")} className="h-24 w-40 rounded-md object-cover" /> : <video src={attachment.media.url} controls playsInline className="h-32 max-w-full" />}
    </div>}
    <label htmlFor="chat-message" className="sr-only">{parentLang ? t("messageLabel") : "Message to family"}</label>
    <textarea id="chat-message" value={text} onChange={(event) => setText(event.target.value)} disabled={sending.isPending} placeholder={t("messagePlaceholder")} rows={2} className="w-full resize-y rounded-md border-2 border-input bg-card p-3 text-lg" />
    <input ref={fileInput} type="file" accept="image/*,video/*" aria-label={t("attachLabel")} className="hidden" onChange={(event) => { void attach(event.target.files?.[0]); event.target.value = ""; }} />
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-2 sm:flex sm:flex-wrap sm:items-center">
      <Button type="button" variant="ghost" disabled={sending.isPending} onClick={() => fileInput.current?.click()} className="whitespace-normal px-2 sm:px-5"><ImagePlus aria-hidden /> {t("attach")}</Button>
      <Button type="button" variant="ghost" disabled={sending.isPending} onClick={() => setAttachment({ kind: "voice", media: { durationSeconds: 10 } })} className="whitespace-normal px-2 sm:px-5"><Mic aria-hidden /> {t("record")}</Button>
      <Button type="submit" disabled={sending.isPending || (!text.trim() && !attachment)} className="col-span-2 sm:ml-auto"><Send aria-hidden /> {sending.isPending ? t("sending") : t("send")}</Button>
    </div>
  </form>;
}