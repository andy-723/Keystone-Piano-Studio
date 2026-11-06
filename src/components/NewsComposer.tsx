import { useState, useRef } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { ArrowLeft, Eye, Send, Paperclip, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { NewsCard } from './NewsCard';
import { newsOptionsQuery, refreshNews } from '@/lib/news-queries';
import { saveAnnouncement, type AnnouncementInput } from '@/services/news';
import type { Announcement, NewsAttachment, NewsTag, StudentGroup } from '@/mocks/news';
import type { CommunityScope } from '@/mocks/community';
import { NEWS_ATTACHMENT_ACCEPT, isPhoneImageFile } from '@/lib/media-accept';
import { toast } from 'sonner';

type GroupOption = StudentGroup & { familyCount?: number };

function GroupPicker({
  title,
  hint,
  groups,
  selected,
  onToggle,
  onSelectAll,
}: {
  title: string;
  hint: string;
  groups: GroupOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}) {
  if (!groups.length) return null;
  const allSelected = groups.every((group) => selected.includes(group.id));
  return (
    <fieldset className="space-y-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <legend className="font-semibold">{title}</legend>
        <Button type="button" variant="ghost" onClick={onSelectAll}>
          {allSelected ? 'Clear' : 'Select all'}
        </Button>
      </div>
      <p className="text-base text-muted-foreground">{hint}</p>
      {groups.map((group) => (
        <label key={group.id} className="flex min-h-12 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-primary"
            checked={selected.includes(group.id)}
            onChange={() => onToggle(group.id)}
          />
          <span>
            <span className="font-semibold">{group.name}</span>
            <span className="mt-1 block text-base text-muted-foreground">
              {group.familyCount ?? group.studentIds.length} families
              {group.description ? ` · ${group.description}` : ''}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function NewsComposer({ scope, post, close }: { scope: CommunityScope; post?: Announcement; close: () => void }) {
  const { data: options } = useSuspenseQuery(newsOptionsQuery(scope));
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [tag, setTag] = useState<NewsTag>(post?.tag ?? 'news');
  const [kind, setKind] = useState<Announcement['audience']['kind']>(post?.audience.kind ?? (options.studioWide ? 'studio' : 'my_students'));
  const [groups, setGroups] = useState(post?.audience.groupIds ?? []);
  const [families, setFamilies] = useState(post?.audience.familyIds ?? []);
  const [important, setImportant] = useState(post?.important ?? false);
  const [pin, setPin] = useState(post?.pinnedUntil?.slice(0, 10) ?? '');
  const [event, setEvent] = useState(post?.eventDate?.slice(0, 16) ?? '');
  const [expiry, setExpiry] = useState(post?.expiresAt?.slice(0, 10) ?? '');
  const [schedule, setSchedule] = useState(post?.status === 'scheduled');
  const [publishAt, setPublishAt] = useState(post?.publishAt.slice(0, 16) ?? '2026-11-09T09:00');
  const [attachments, setAttachments] = useState<NewsAttachment[]>(post?.attachments ?? []);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const values = (status: Announcement['status']): AnnouncementInput => ({
    title,
    body,
    tag,
    audience: {
      kind,
      ...(kind === 'groups' ? { groupIds: groups } : {}),
      ...(kind === 'families' ? { familyIds: families } : {}),
    },
    important,
    attachments: attachments.map((a) => ({
      ...a,
      featuresStudentIds: a.featuresStudentIds.length > 1 ? a.featuresStudentIds.filter((id) => id !== 'choose') : a.featuresStudentIds,
    })),
    status,
    publishAt: schedule ? `${publishAt}:00+11:00` : post?.status === 'published' ? post.publishAt : options.now,
    ...(pin ? { pinnedUntil: `${pin}T23:59:59+11:00` } : {}),
    ...(event ? { eventDate: `${event}:00+11:00` } : {}),
    ...(expiry ? { expiresAt: `${expiry}T23:59:59+11:00` } : {}),
  });
  const save = useMutation({
    mutationFn: (status: Announcement['status']) => saveAnnouncement(values(status), scope, post?.id),
    onSuccess: async (result) => {
      await refreshNews(client);
      toast.success(result.status === 'draft' ? 'Draft saved' : result.status === 'scheduled' ? 'Post scheduled' : 'Post published');
      close();
    },
    onError: (e) => setError(e.message),
  });
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
  const selectAll = (ids: string[]) => {
    const missing = ids.filter((id) => !groups.includes(id));
    setGroups(missing.length ? [...new Set([...groups, ...ids])] : groups.filter((id) => !ids.includes(id)));
  };
  function attach(file?: File) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImage = isPhoneImageFile(file);
    if ((!isPdf && !isImage) || file.size > 12 * 1024 * 1024) {
      setError('Choose a phone photo (JPG, PNG, HEIC/HEIF) or PDF under 12 MB.');
      return;
    }
    setAttachments([
      ...attachments,
      {
        id: crypto.randomUUID(),
        kind: isPdf ? 'pdf' : 'image',
        fileName: file.name,
        url: URL.createObjectURL(file),
        featuresStudentIds: [],
        photoAnswered: isPdf,
      },
    ]);
  }
  const smartGroups = options.smartGroups ?? options.groups.filter((group) => group.kind === 'smart');
  const studioGroups = options.studioGroups ?? options.groups.filter((group) => (group.kind ?? 'manual') === 'manual');

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" onClick={close}>
        <ArrowLeft aria-hidden />
        Back to news
      </Button>
      <h1 className="my-5 text-3xl font-semibold">{post ? 'Edit post' : 'New post'}</h1>
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          save.mutate(schedule ? 'scheduled' : 'published');
        }}
      >
        <label className="block font-semibold">
          Title
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block font-semibold">
          Message
          <Textarea required className="min-h-48" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <label className="block font-semibold">
          Tag
          <select value={tag} onChange={(e) => setTag(e.target.value as NewsTag)} className="mt-2 min-h-12 w-full rounded-md border-2 border-input bg-card px-3">
            {['news', 'event', 'concert', 'exam', 'holiday', 'reminder'].map((v) => (
              <option key={v} value={v}>
                {v[0]?.toUpperCase()}
                {v.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-semibold">
          Who sees this
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="mt-2 min-h-12 w-full rounded-md border-2 border-input bg-card px-3">
            {options.studioWide && <option value="studio">All families in the studio</option>}
            <option value="my_students">My students</option>
            <option value="groups">Groups & classifications…</option>
            <option value="families">Choose families…</option>
          </select>
        </label>
        {kind === 'groups' && (
          <div className="space-y-4 rounded-md border border-border bg-card/40 p-4">
            <p className="text-base text-muted-foreground">
              Post to everyone in a smart classification (grades, new joiners, recital, competition) or a group you created. Select all within a section, or mix classifications.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => selectAll(options.groups.map((group) => group.id))}>
                Select all groups
              </Button>
              <Button type="button" variant="ghost" onClick={() => setGroups([])}>
                Clear selection
              </Button>
            </div>
            <GroupPicker
              title="Smart classifications"
              hint="Kept in sync from grades, new joiners, recital prep, and upcoming exams."
              groups={smartGroups}
              selected={groups}
              onToggle={(id) => setGroups(toggle(groups, id))}
              onSelectAll={() => selectAll(smartGroups.map((group) => group.id))}
            />
            <GroupPicker
              title="Studio groups"
              hint="Groups you assign yourself for day-to-day studio lists."
              groups={studioGroups}
              selected={groups}
              onToggle={(id) => setGroups(toggle(groups, id))}
              onSelectAll={() => selectAll(studioGroups.map((group) => group.id))}
            />
          </div>
        )}
        {kind === 'families' && (
          <fieldset>
            <legend className="font-semibold">Families</legend>
            {options.families.map((f) => (
              <label key={f.id} className="flex min-h-12 items-center gap-3">
                <input type="checkbox" checked={families.includes(f.id)} onChange={() => setFamilies(toggle(families, f.id))} />
                {f.name}
              </label>
            ))}
          </fieldset>
        )}
        <div>
          <Button type="button" variant="outline" onClick={() => input.current?.click()}>
            <Paperclip aria-hidden />
            Attach photo or PDF
          </Button>
          <input
            ref={input}
            type="file"
            className="hidden"
            aria-label="Attach photo or PDF"
            accept={NEWS_ATTACHMENT_ACCEPT}
            onChange={(e) => {
              attach(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <p className="mt-2 text-base text-muted-foreground">Phone photos welcome, including iPhone HEIC/HEIF.</p>
          {attachments.map((a) => (
            <div key={a.id} className="my-4 border-y border-border py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all">{a.fileName}</span>
                <Button type="button" variant="ghost" onClick={() => setAttachments(attachments.filter((v) => v.id !== a.id))}>
                  <X aria-hidden />
                  Remove
                </Button>
              </div>
              {a.kind === 'image' && (
                <>
                  <label className="block font-semibold">
                    Does this photo show a student?
                    <select
                      className="mt-2 min-h-12 w-full rounded-md border-2 border-input bg-card px-3"
                      value={!a.photoAnswered ? '' : a.featuresStudentIds.length ? 'yes' : 'no'}
                      onChange={(e) =>
                        setAttachments(
                          attachments.map((v) =>
                            v.id === a.id
                              ? {
                                  ...v,
                                  photoAnswered: Boolean(e.target.value),
                                  featuresStudentIds: e.target.value === 'yes' ? ['choose'] : [],
                                }
                              : v,
                          ),
                        )
                      }
                    >
                      <option value="">Choose…</option>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </label>
                  {a.featuresStudentIds.length > 0 && (
                    <fieldset>
                      <legend className="mt-3 font-semibold">Students in this photo</legend>
                      {options.students.map((s) => (
                        <label className="flex min-h-12 items-center gap-3" key={s.id}>
                          <input
                            type="checkbox"
                            checked={a.featuresStudentIds.includes(s.id)}
                            onChange={() =>
                              setAttachments(
                                attachments.map((v) =>
                                  v.id === a.id
                                    ? {
                                        ...v,
                                        featuresStudentIds: toggle(
                                          v.featuresStudentIds.filter((id) => id !== 'choose'),
                                          s.id,
                                        ).concat('choose'),
                                      }
                                    : v,
                                ),
                              )
                            }
                          />
                          {s.name}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <label className="flex min-h-12 items-center gap-3 font-semibold">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          Important: also send by email
        </label>
        <label className="block font-semibold">
          Pin to top until
          <Input type="date" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
        <label className="block font-semibold">
          Event date (optional)
          <Input type="datetime-local" value={event} onChange={(e) => setEvent(e.target.value)} />
        </label>
        <label className="block font-semibold">
          Expires on (optional)
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </label>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
          Schedule for
        </label>
        {schedule && (
          <label className="block font-semibold">
            Date and time
            <Input required type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
          </label>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3 pb-8">
          <Button type="submit" disabled={save.isPending}>
            <Send aria-hidden />
            {schedule ? 'Schedule post' : 'Post now'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError('');
              save.mutate('draft');
            }}
            disabled={save.isPending}
          >
            <Save aria-hidden />
            Save draft
          </Button>
          <Button type="button" variant="outline" onClick={() => setPreview(true)}>
            <Eye aria-hidden />
            Preview
          </Button>
        </div>
      </form>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent>
          <DialogTitle>Family preview</DialogTitle>
          <NewsCard
            now={options.now}
            post={{
              id: 'preview',
              title,
              body,
              authorName: post?.authorName ?? 'Ms Clarke',
              tag,
              publishAt: options.now,
              attachments,
              seen: false,
              acknowledged: false,
              pinned: Boolean(pin),
              ...(event ? { eventDate: `${event}:00+11:00` } : {}),
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
