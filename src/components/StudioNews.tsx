import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Send, Trash2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newsQuery, familyNewsQuery } from "@/lib/community-queries";
import { publishStudioNews, deleteStudioNews } from "@/services/community";
import type { CommunityScope, NewsPost } from "@/mocks/community";
import { useParentLanguage } from "@/i18n/parent";
import { toast } from "sonner";

function NewsList({ posts, remove, chinese = false }: { posts: NewsPost[]; remove?: (id: string) => void; chinese?: boolean }) {
  return <div className="divide-y divide-border">{posts.length === 0 && <p className="py-7 text-muted-foreground">{chinese ? "暂无工作室动态。" : "No studio updates yet."}</p>}{posts.map(post => <article key={post.id} className="py-6"><h3 className="break-words text-2xl font-semibold">{post.title}</h3><p className="mt-2 text-base text-muted-foreground">{post.authorName} · {new Date(post.createdAt).toLocaleDateString(chinese ? "zh-CN" : "en-AU", { day: "numeric", month: "short", year: "numeric" })}</p><p className="mt-4 whitespace-pre-wrap break-words">{post.body}</p>{remove && <Button className="mt-4" variant="ghost" onClick={() => { if (window.confirm("Delete this studio update for all families?")) remove(post.id); }}><Trash2 aria-hidden/>Delete update</Button>}</article>)}</div>;
}
export function StudioNews({ scope = "demo" }: { scope?: CommunityScope }) {
  const { data } = useSuspenseQuery(newsQuery(scope));
  const client = useQueryClient();
  const [title, setTitle] = useState(""), [body, setBody] = useState("");
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ["studio-news", scope] }), client.invalidateQueries({ queryKey: ["family-news"] })]); }
  const publish = useMutation({ mutationFn: () => publishStudioNews({ title, body }, scope), onSuccess: async () => { setTitle(""); setBody(""); await refresh(); toast.success("Update published to all families"); }, onError: error => toast.error(error.message) });
  const remove = useMutation({ mutationFn: (id: string) => deleteStudioNews(id, scope), onSuccess: refresh, onError: error => toast.error(error.message) });
  return <div className="mx-auto max-w-3xl"><h1 className="flex items-center gap-3 text-3xl font-semibold"><Megaphone aria-hidden/>Studio news</h1><form className="my-7 space-y-4 border-y border-border py-6" onSubmit={event => { event.preventDefault(); publish.mutate(); }}><h2 className="text-2xl font-semibold">Write an update</h2><label className="block font-semibold">Title<Input required value={title} onChange={event => setTitle(event.target.value)}/></label><label className="block font-semibold">Update<Textarea required className="min-h-40" value={body} onChange={event => setBody(event.target.value)}/></label><Button type="submit" disabled={publish.isPending}><Send aria-hidden/>Publish to all families</Button></form><h2 className="text-2xl font-semibold">Published updates</h2><NewsList posts={data} remove={id => remove.mutate(id)}/></div>;
}
export function FamilyNews() {
  const { data } = useSuspenseQuery(familyNewsQuery);
  const { lang } = useParentLanguage();
  return <section className="border-b border-border py-6"><h2 className="flex items-center gap-2 text-2xl font-semibold"><Megaphone aria-hidden/>{lang === "zh-CN" ? "工作室动态" : "Studio news"}</h2><NewsList posts={data} chinese={lang === "zh-CN"}/></section>;
}