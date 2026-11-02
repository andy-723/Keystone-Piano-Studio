import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Mic, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VoiceClip } from "@/components/ChatMedia";
import { sendMessage } from "@/services/chat";
import { getTeacher } from "@/services/roster";
import type { Message } from "@/mocks/types";

type Attachment = { kind: "image" | "video" | "voice"; media: NonNullable<Message["media"]> };
export function ChatComposer({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const sending = useMutation({ mutationFn: async () => {
    const teacher = await getTeacher();
    return sendMessage({ conversationId, authorName: teacher.name, authorRole: "teacher", body: text.trim(), kind: attachment?.kind ?? "text", ...(attachment ? { media: attachment.media } : {}) });
  }, onSuccess: async () => {
    setText(""); setAttachment(null);
    await Promise.all([client.invalidateQueries({ queryKey: ["messages", conversationId] }), client.invalidateQueries({ queryKey: ["chat-threads"] })]);
    toast.success("Message sent");
  }, onError: () => toast.error("Message could not be sent. Your draft is still here.") });
  async function attach(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) { toast.error("Choose a photo or video."); return; }
    const url = URL.createObjectURL(file);
    const kind = file.type.startsWith("image/") ? "image" : "video";
    let durationSeconds: number | undefined;
    if (kind === "video") {
      durationSeconds = await new Promise<number | undefined>((resolve) => {
        const video = document.createElement("video"); video.preload = "metadata"; video.src = url;
        video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : undefined);
        video.onerror = () => resolve(undefined);
      });
    }
    setAttachment({ kind, media: { url, fileName: file.name, durationSeconds } });
  }
  return <form className="shrink-0 border-t border-border bg-background p-4" onSubmit={(event) => { event.preventDefault(); if (!sending.isPending && (text.trim() || attachment)) sending.mutate(); }}>
    {attachment && <div className="mb-3 border-l-4 border-primary bg-muted p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="break-all text-base">{attachment.media.fileName ?? "Voice note · 10 seconds"}</span>
        <Button variant="ghost" disabled={sending.isPending} onClick={() => setAttachment(null)}><X aria-hidden /> Remove</Button></div>
      {attachment.kind === "voice" ? <VoiceClip /> : attachment.kind === "image" ? <img src={attachment.media.url} width={160} height={100} alt="Attached photo" className="h-24 w-40 rounded-md object-cover" /> : <video src={attachment.media.url} controls className="h-32 max-w-full" />}
    </div>}
    <label htmlFor="chat-message" className="sr-only">Message to family</label>
    <textarea id="chat-message" value={text} onChange={(event) => setText(event.target.value)} disabled={sending.isPending} placeholder="Write a message…" rows={2} className="w-full resize-y rounded-md border-2 border-input bg-card p-3 text-lg" />
    <input ref={fileInput} type="file" accept="image/*,video/*" aria-label="Attach photo or video" className="hidden" onChange={(event) => { void attach(event.target.files?.[0]); event.target.value = ""; }} />
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button variant="ghost" disabled={sending.isPending} onClick={() => fileInput.current?.click()} className="whitespace-normal"><ImagePlus aria-hidden /> Photo or video</Button>
      <Button variant="ghost" disabled={sending.isPending} onClick={() => setAttachment({ kind: "voice", media: { durationSeconds: 10 } })} className="whitespace-normal"><Mic aria-hidden /> Record voice note</Button>
      <Button type="submit" disabled={sending.isPending || (!text.trim() && !attachment)} className="ml-auto"><Send aria-hidden /> {sending.isPending ? "Sending…" : "Send"}</Button>
    </div>
  </form>;
}