import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Pencil, Archive, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  announcementsQuery,
  newsOptionsQuery,
  parentNewsQuery,
  newsNotificationsQuery,
  newsClockQuery,
  refreshNews,
} from "@/lib/news-queries";
import { archiveAnnouncement, recordNewsReceipt } from "@/services/news";
import type { Announcement } from "@/mocks/news";
import type { CommunityScope } from "@/mocks/community";
import { useParentLanguage } from "@/i18n/parent";
import { newsText } from "@/i18n/news";
import { NewsCard } from "./NewsCard";
import { NewsComposer } from "./NewsComposer";
import { toast } from "sonner";

export function StudioNews({ scope = "demo" }: { scope?: CommunityScope }) {
  const { data: posts } = useSuspenseQuery(announcementsQuery(scope)),
    { data: options } = useSuspenseQuery(newsOptionsQuery(scope));
  const [compose, setCompose] = useState(false),
    [editing, setEditing] = useState<Announcement | null>(null),
    [view, setView] = useState("published");
  const client = useQueryClient();
  const archive = useMutation({
    mutationFn: (id: string) => archiveAnnouncement(id, scope),
    onSuccess: () => refreshNews(client),
    onError: (e) => toast.error(e.message),
  });
  if (compose)
    return (
      <NewsComposer
        scope={scope}
        {...(editing ? { post: editing } : {})}
        close={() => {
          setCompose(false);
          setEditing(null);
        }}
      />
    );
  const displayed = posts.filter((p) =>
    view === "published"
      ? p.status === "published" &&
        (!p.expiresAt || Date.parse(p.expiresAt) > Date.parse(options.now))
      : p.status === view,
  );
  function audience(p: Announcement) {
    if (p.audience.kind === "studio") return "All families";
    if (p.audience.kind === "my_students") return "My students";
    if (p.audience.kind === "families") return "Selected families";
    return options.groups
      .filter((g) => p.audience.groupIds?.includes(g.id))
      .map((g) => g.name)
      .join(", ");
  }
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-3xl font-semibold">
          <Megaphone aria-hidden />
          Studio news
        </h1>
        <Button onClick={() => setCompose(true)}>
          <Plus aria-hidden />
          New post
        </Button>
      </div>
      <div className="my-6 flex flex-wrap gap-2" role="group" aria-label="Post status">
        {["published", "draft", "scheduled", "archived"].map((v) => (
          <Button
            key={v}
            variant={view === v ? "secondary" : "ghost"}
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {v === "draft" ? "Drafts" : v[0]?.toUpperCase()}
            {v === "draft" ? "" : v.slice(1)}
          </Button>
        ))}
      </div>
      <div className="space-y-5">
        {!displayed.length && <p className="py-8 text-muted-foreground">No {view} posts.</p>}
        {displayed.map((p) => (
          <NewsCard
            key={p.id}
            now={options.now}
            post={{ ...p, seen: true, acknowledged: false }}
            teacherMeta={`${audience(p)} · ${p.total} families · Seen by ${p.seen} of ${p.total} families · ${p.acknowledged} acknowledged`}
          >
            {p.own && p.status !== "archived" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(p);
                    setCompose(true);
                  }}
                >
                  <Pencil aria-hidden />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate(p.id)}
                >
                  <Archive aria-hidden />
                  Archive
                </Button>
              </div>
            )}
          </NewsCard>
        ))}
      </div>
    </div>
  );
}
export function FamilyNews({
  onMessage,
  pinnedOnly = false,
}: {
  onMessage?: (title: string) => void;
  pinnedOnly?: boolean;
}) {
  const { data: posts } = useSuspenseQuery(parentNewsQuery),
    { data: now } = useSuspenseQuery(newsClockQuery);
  const { lang } = useParentLanguage(),
    client = useQueryClient();
  const receipt = useMutation({
    mutationFn: ({ id, ack }: { id: string; ack: boolean }) => recordNewsReceipt(id, ack),
    onSuccess: () => refreshNews(client),
    onError: (e) => toast.error(e.message),
  });
  // Seeing a card requires it to enter the viewport, not merely loading the feed.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-news-id");
            if (id) {
              void recordNewsReceipt(id).then(() => refreshNews(client));
              observer.unobserve(entry.target);
            }
          }
      },
      { threshold: 0.35 },
    );
    document.querySelectorAll("[data-news-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [posts, client]);
  const visible = pinnedOnly ? posts.filter((p) => p.pinned) : posts;
  return (
    <section className="py-6">
      <h2 className="mb-5 flex items-center gap-2 text-2xl font-semibold">
        <Megaphone aria-hidden />
        {newsText(lang, "news")}
      </h2>
      <div className="space-y-5">
        {!visible.length && !pinnedOnly && <p>{newsText(lang, "empty")}</p>}
        {visible.map((p) => (
          <div key={p.id} data-news-id={p.seen ? undefined : p.id}>
            <NewsCard
              post={p}
              now={now}
              lang={lang}
              onSeen={() => receipt.mutate({ id: p.id, ack: false })}
              onAcknowledge={() => receipt.mutate({ id: p.id, ack: true })}
              {...(onMessage ? { onMessage: () => onMessage(p.title) } : {})}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
export function LatestNews() {
  const { data: posts } = useSuspenseQuery(announcementsQuery());
  const latest = posts
    .filter((p) => p.status === "published")
    .sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt))[0];
  if (!latest) return null;
  return (
    <section className="mb-6 border-y border-border py-5">
      <h2 className="text-xl font-semibold">Latest news</h2>
      <Button variant="link" asChild className="mt-2 h-auto whitespace-normal px-0 text-left">
        <Link to="/news">{latest.title}</Link>
      </Button>
      <p className="text-base text-muted-foreground">
        Seen by {latest.seen} of {latest.total} families
      </p>
    </section>
  );
}
export function NewsNotifications({ scope = "demo" }: { scope?: CommunityScope }) {
  const { data } = useSuspenseQuery(newsNotificationsQuery(scope));
  return (
    <section className="mt-8 border-t border-border py-6">
      <h2 className="text-2xl font-semibold">Alerts</h2>
      <p className="mt-3 text-base text-muted-foreground">
        Alerts arrive by email or in the app when push isn&apos;t available. Push delivery is not
        guaranteed.
      </p>
      <h3 className="my-4 text-xl font-semibold">Sent notifications (simulated)</h3>
      {!data.length && <p className="text-muted-foreground">No notifications sent.</p>}
      <div className="max-h-96 overflow-auto divide-y divide-border">
        {data.map((n) => (
          <div className="py-3" key={n.id}>
            <p className="break-words">{n.title}</p>
            <p className="mt-1 text-base text-muted-foreground">
              {n.kind === "push" ? "Push (simulated)" : "Email"} · {n.personId} ·{" "}
              {new Date(n.sentAt).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
