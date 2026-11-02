import { LockKeyhole, Users } from "lucide-react";
import type { ClientNote } from "@/mocks/types";
import { messageDay } from "@/lib/chat-queries";
import { formatShortDate } from "@/lib/format";

export function ClientNoteDisplay({ note }: { note: ClientNote }) {
  return <div><p className="whitespace-pre-wrap break-words text-base italic">{note.body}</p><p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted-foreground"><span>{note.authorName} · {formatShortDate(messageDay(note.createdAt))}</span><span className="inline-flex items-center gap-1">{note.visibility === "private" ? <LockKeyhole className="size-4" aria-hidden /> : <Users className="size-4" aria-hidden />}{note.visibility === "private" ? "Private" : "Shared"}</span></p></div>;
}