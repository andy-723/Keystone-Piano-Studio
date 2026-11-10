import { useState } from "react";
import { Link, Outlet, useParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Search, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chatThreadsQuery, messageDay } from "@/lib/chat-queries";
import { formatShortDate } from "@/lib/format";

export function ChatLayout() {
  const { data: threads } = useSuspenseQuery(chatThreadsQuery);
  const [search, setSearch] = useState("");
  const params = useParams({ strict: false });
  const selected = params.conversationId;
  const filtered = threads.filter((thread) => `${thread.family?.displayName} ${thread.family?.guardians.map((guardian) => guardian.name).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="mx-auto max-w-7xl">
    <h1 className="mb-5 flex items-center gap-3 text-3xl font-semibold"><MessageCircle aria-hidden className="size-7 text-primary" /> Chat</h1>
    <div className="chat-workspace flex min-w-0 overflow-hidden border-y border-border bg-card md:border">
      <aside className={`${selected ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col md:w-72 lg:w-80 md:border-r md:border-border`} aria-label="Family threads" data-tour="chat-family-list">
        <div className="shrink-0 border-b border-border p-4">
          <label htmlFor="family-search" className="mb-2 block font-semibold">Families <span className="font-normal text-muted-foreground">· {threads.length}</span></label>
          <div className="relative"><Search aria-hidden className="absolute left-3 top-4 size-5 text-muted-foreground" /><input id="family-search" type="search" aria-label="Search families" placeholder="Search families" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-12 w-full min-w-0 rounded-md border-2 border-input bg-background py-2 pl-10 pr-3 text-base" /></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 && <p className="p-5 text-muted-foreground">No families found.</p>}
          {filtered.map((thread) => <Button key={thread.id} asChild variant="ghost" className={`h-auto min-h-28 w-full justify-start whitespace-normal rounded-none border-b border-border p-4 text-left ${selected === thread.id ? "bg-secondary" : ""}`}>
            <Link to="/chat/$conversationId" params={{ conversationId: thread.id }} aria-current={selected === thread.id ? "page" : undefined}>
              <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="break-words font-semibold">{thread.family?.displayName}</span>{thread.unreadCount > 0 && <span aria-label={`${thread.unreadCount} unread`} className="flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-primary px-2 text-base text-primary-foreground">{thread.unreadCount}</span>}</div>
                <p className="mt-1 line-clamp-2 break-words text-base font-normal text-muted-foreground">{thread.latest?.lessonSummary ? "Lesson summary" : thread.latest?.body || (thread.latest?.kind === "voice" ? "Voice note" : thread.latest?.kind === "video" ? "Video" : "Photo")}</p>
                <p className="mt-1 text-base font-normal text-muted-foreground">{formatShortDate(messageDay(thread.lastMessageAt))}</p>
              </div>
            </Link>
          </Button>)}
        </div>
      </aside>
      <Outlet />
    </div>
  </div>;
}