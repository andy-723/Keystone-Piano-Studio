import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpen, Copy, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { libraryQuery } from "@/lib/onboarding-queries";
import {
  copyTemplate,
  saveContent,
  saveCourseTemplate,
  saveLessonTemplate,
} from "@/services/library";
import type { ContentItem, CourseTemplate, LessonTemplate } from "@/mocks/types";
import type { ImportScope } from "@/mocks/roster-import";
import { useAppSettings } from "@/lib/app-settings";
import { intakeField } from "./StudentIntake";
type Editor =
  | { kind: "content"; item: ContentItem }
  | { kind: "lessons"; item: LessonTemplate }
  | { kind: "courses"; item: CourseTemplate };
export function Library({ scope = "demo" }: { scope?: ImportScope }) {
  const { videoLinksEnabled } = useAppSettings();
  const { data } = useSuspenseQuery(libraryQuery(scope));
  const client = useQueryClient();
  const [tab, setTab] = useState<"content" | "lessons" | "courses">("content");
  const [editor, setEditor] = useState<Editor | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["library", scope] });
  const copy = useMutation({
    mutationFn: (id: string) => copyTemplate(tab, id, scope),
    onSuccess: refresh,
  });
  const save = useMutation({
    mutationFn: (value: Editor) =>
      value.kind === "content"
        ? saveContent(value.item, scope)
        : value.kind === "lessons"
          ? saveLessonTemplate(value.item, scope)
          : saveCourseTemplate(value.item, scope),
    onSuccess: async () => {
      await refresh();
      setEditor(null);
    },
  });
  const open = (value: Editor) => {
    save.reset();
    setEditor(structuredClone(value));
  };
  const contentKinds = [
    "text",
    "link",
    "file",
    "video",
    "audio",
    "checklist",
    ...(videoLinksEnabled ? ["video_link"] : []),
  ] as ContentItem["kind"][];
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="flex items-center gap-3 text-3xl font-semibold">
        <BookOpen aria-hidden className="text-primary" />
        Library
      </h1>
      <div
        className="my-7 flex flex-wrap gap-2 border-y border-border py-4"
        role="tablist"
        aria-label="Library"
        data-tour="library-tabs"
      >
        {(
          [
            ["content", "Content"],
            ["lessons", "Lesson templates"],
            ["courses", "Course templates"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? "secondary" : "ghost"}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "content" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              open({
                kind: "content",
                item: { id: crypto.randomUUID(), kind: "text", title: "", body: "" },
              })
            }
          >
            <Plus aria-hidden />
            Add content
          </Button>
          {videoLinksEnabled && (
            <Button
              variant="outline"
              onClick={() =>
                open({
                  kind: "content",
                  item: { id: crypto.randomUUID(), kind: "video_link", title: "", url: "" },
                })
              }
            >
              <Plus aria-hidden />
              Video link
            </Button>
          )}
        </div>
      )}
      <div className="mt-5 space-y-4">
        {data[tab].map((item) => (
          <article key={item.id} className="rounded-md border border-border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="min-w-0 break-words text-xl font-semibold">
                {"title" in item ? item.title : item.name}
              </h2>
              <span className="text-base text-muted-foreground">
                {item.supplied ? "Keystone Music HQ template" : "Studio copy"}
              </span>
            </div>
            {"kind" in item && (
              <>
                <p className="mt-2 capitalize text-muted-foreground">
                  {item.kind === "video_link" ? "Video link" : item.kind}
                </p>
                {item.body && <p className="mt-3 whitespace-pre-wrap">{item.body}</p>}
                {item.url && (
                  <a
                    className="mt-3 block break-all text-primary underline"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.url}
                  </a>
                )}
                {item.mediaPlaceholder && (
                  <p className="mt-3 border-l-2 border-border pl-3">{item.mediaPlaceholder}</p>
                )}
              </>
            )}
            {"steps" in item && (
              <>
                <ol className="mt-3 list-inside list-decimal space-y-2">
                  {item.steps.map((step, i) => (
                    <li key={i}>
                      {data.content.find((content) => content.id === step.contentItemId)?.title}
                      {step.note && <p className="pl-5 text-muted-foreground">{step.note}</p>}
                    </li>
                  ))}
                </ol>
                {item.isWelcomeDefault && (
                  <p className="mt-3 text-success">Use for new students · {item.audience}</p>
                )}
              </>
            )}
            {"sections" in item && (
              <p className="mt-3">
                {item.framework} · {item.grade} ·{" "}
                {item.sections
                  .map((section) => `${section.name} ${section.weightPct}%`)
                  .join(" · ")}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={copy.isPending}
                onClick={() => copy.mutate(item.id)}
              >
                <Copy aria-hidden />
                Copy
              </Button>
              {!item.supplied && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if ("kind" in item) open({ kind: "content", item });
                    else if ("steps" in item) open({ kind: "lessons", item });
                    else open({ kind: "courses", item });
                  }}
                >
                  <Pencil aria-hidden />
                  Edit
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {copy.error && (
        <p role="alert" className="mt-4 text-destructive">
          {copy.error.message}
        </p>
      )}
      <Dialog
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit studio {editor?.kind === "content" ? "content" : "template"}
            </DialogTitle>
          </DialogHeader>
          {editor && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(editor);
              }}
              className="space-y-5"
            >
              <label className="block font-semibold">
                {editor.kind === "content" ? "Title" : "Name"}
                <Input
                  required
                  className={intakeField}
                  value={editor.kind === "content" ? editor.item.title : editor.item.name}
                  onChange={(event) =>
                    setEditor(
                      editor.kind === "content"
                        ? { ...editor, item: { ...editor.item, title: event.target.value } }
                        : editor.kind === "lessons"
                          ? { ...editor, item: { ...editor.item, name: event.target.value } }
                          : { ...editor, item: { ...editor.item, name: event.target.value } },
                    )
                  }
                />
              </label>
              {editor.kind === "content" && (
                <>
                  <label className="block font-semibold">
                    Kind
                    <select
                      className={intakeField}
                      value={editor.item.kind}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          item: { ...editor.item, kind: event.target.value as ContentItem["kind"] },
                        })
                      }
                    >
                      {contentKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind === "video_link" ? "video link" : kind}
                        </option>
                      ))}
                    </select>
                  </label>
                  {editor.item.kind !== "video_link" && (
                    <label className="block font-semibold">
                      Body
                      <textarea
                        className={intakeField}
                        rows={4}
                        value={editor.item.body ?? ""}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            item: { ...editor.item, body: event.target.value },
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="block font-semibold">
                    {editor.item.kind === "video_link" ? "YouTube or Vimeo URL" : "Link"}
                    <Input
                      className={intakeField}
                      value={editor.item.url ?? ""}
                      onChange={(event) =>
                        setEditor({ ...editor, item: { ...editor.item, url: event.target.value } })
                      }
                    />
                  </label>
                  {editor.item.kind === "video_link" && (
                    <p className="text-base text-muted-foreground">
                      Shown as a plain link — never an embedded player. Not for student recordings.
                    </p>
                  )}
                  {["file", "video", "audio"].includes(editor.item.kind) && (
                    <label className="block font-semibold">
                      Media placeholder
                      <Input
                        className={intakeField}
                        value={editor.item.mediaPlaceholder ?? ""}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            item: { ...editor.item, mediaPlaceholder: event.target.value },
                          })
                        }
                      />
                    </label>
                  )}
                </>
              )}
              {editor.kind === "lessons" && (
                <>
                  <label className="flex min-h-12 items-center gap-3">
                    <input
                      className="size-6 accent-primary"
                      type="checkbox"
                      checked={editor.item.isWelcomeDefault}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          item: { ...editor.item, isWelcomeDefault: event.target.checked },
                        })
                      }
                    />
                    Use for new students
                  </label>
                  {editor.item.steps.map((step, index) => (
                    <div key={index} className="border-b border-border pb-4">
                      <p className="font-semibold">
                        {index + 1}.{" "}
                        {data.content.find((content) => content.id === step.contentItemId)?.title}
                      </p>
                      <label className="block">
                        Teacher note
                        <Input
                          className={intakeField}
                          value={step.note ?? ""}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              item: {
                                ...editor.item,
                                steps: editor.item.steps.map((entry, i) =>
                                  i === index ? { ...entry, note: event.target.value } : entry,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[-1, 1].map((direction) => (
                          <Button
                            key={direction}
                            type="button"
                            variant="ghost"
                            title={direction === -1 ? "Move up" : "Move down"}
                            aria-label={`${direction === -1 ? "Move up" : "Move down"} step ${index + 1}`}
                            disabled={
                              index + direction < 0 || index + direction >= editor.item.steps.length
                            }
                            onClick={() => {
                              const steps = [...editor.item.steps];
                              const other = steps[index + direction];
                              if (!other) return;
                              steps[index + direction] = step;
                              steps[index] = other;
                              setEditor({ ...editor, item: { ...editor.item, steps } });
                            }}
                          >
                            {direction === -1 ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Remove step ${index + 1}`}
                          onClick={() =>
                            setEditor({
                              ...editor,
                              item: {
                                ...editor.item,
                                steps: editor.item.steps.filter((_, i) => i !== index),
                              },
                            })
                          }
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <label className="block font-semibold">
                    Add a content item
                    <select
                      className={intakeField}
                      value=""
                      onChange={(event) => {
                        if (event.target.value)
                          setEditor({
                            ...editor,
                            item: {
                              ...editor.item,
                              steps: [...editor.item.steps, { contentItemId: event.target.value }],
                            },
                          });
                      }}
                    >
                      <option value="">Choose content</option>
                      {data.content.map((content) => (
                        <option key={content.id} value={content.id}>
                          {content.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {editor.kind === "courses" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block font-semibold">
                      Framework
                      <select
                        className={intakeField}
                        value={editor.item.framework}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            item: {
                              ...editor.item,
                              framework: event.target.value as CourseTemplate["framework"],
                            },
                          })
                        }
                      >
                        {["AMEB", "Trinity", "ABRSM", "Custom"].map((framework) => (
                          <option key={framework}>{framework}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block font-semibold">
                      Grade
                      <Input
                        className={intakeField}
                        value={editor.item.grade}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            item: { ...editor.item, grade: event.target.value },
                          })
                        }
                      />
                    </label>
                  </div>
                  {editor.item.sections.map((section, index) => (
                    <fieldset key={index} className="min-w-0 border-t border-border pt-4">
                      <label className="block font-semibold">
                        Section name
                        <Input
                          className={intakeField}
                          value={section.name}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              item: {
                                ...editor.item,
                                sections: editor.item.sections.map((entry, i) =>
                                  i === index ? { ...entry, name: event.target.value } : entry,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="mt-3 block">
                        Weight (%)
                        <Input
                          className={intakeField}
                          type="number"
                          min={0}
                          max={100}
                          value={section.weightPct}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              item: {
                                ...editor.item,
                                sections: editor.item.sections.map((entry, i) =>
                                  i === index
                                    ? { ...entry, weightPct: Number(event.target.value) }
                                    : entry,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="mt-3 block">
                        Items — one per line
                        <textarea
                          rows={3}
                          className={intakeField}
                          value={section.items.join("\n")}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              item: {
                                ...editor.item,
                                sections: editor.item.sections.map((entry, i) =>
                                  i === index
                                    ? { ...entry, items: event.target.value.split("\n") }
                                    : entry,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                    </fieldset>
                  ))}
                  <h3 className="text-xl font-semibold">Default milestones</h3>
                  {editor.item.defaultMilestones.map((milestone, index) => (
                    <div className="grid gap-4 sm:grid-cols-2" key={index}>
                      <label>
                        Terms after target
                        <Input
                          className={intakeField}
                          type="number"
                          min={0}
                          value={milestone.termOffset}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              item: {
                                ...editor.item,
                                defaultMilestones: editor.item.defaultMilestones.map((entry, i) =>
                                  i === index
                                    ? { ...entry, termOffset: Number(event.target.value) }
                                    : entry,
                                ),
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Target stage
                        <select
                          className={intakeField}
                          value={milestone.targetStage}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              item: {
                                ...editor.item,
                                defaultMilestones: editor.item.defaultMilestones.map((entry, i) =>
                                  i === index
                                    ? {
                                        ...entry,
                                        targetStage: Number(event.target.value) as
                                          1 | 2 | 3 | 4 | 5,
                                      }
                                    : entry,
                                ),
                              },
                            })
                          }
                        >
                          {[1, 2, 3, 4, 5].map((stage) => (
                            <option key={stage}>{stage}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </>
              )}
              {save.error && (
                <p role="alert" className="text-destructive">
                  {save.error.message}
                </p>
              )}
              <Button type="submit" disabled={save.isPending} className="w-full">
                <Save aria-hidden />
                Save changes
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
