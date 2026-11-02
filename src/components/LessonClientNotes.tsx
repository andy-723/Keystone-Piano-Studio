import { useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { NotebookPen, Pin, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ClientNoteDisplay } from "@/components/ClientNoteDisplay";
import { addNote, getStudentNoteContext } from "@/services/notes";
import type { ClientNote } from "@/mocks/types";

export const studentNotesQuery = (id: string) => queryOptions({ queryKey: ["student-notes", id], queryFn: () => getStudentNoteContext(id) });
export function LessonClientNotes({ studentId, name, occurrenceId }: { studentId: string; name: string; occurrenceId: string }) {
  const { data } = useSuspenseQuery(studentNotesQuery(studentId));
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<ClientNote["category"]>("lesson");
  const [shared, setShared] = useState(false);
  const client = useQueryClient();
  const saving = useMutation({ mutationFn: () => addNote({ subjectType: "student", subjectId: studentId, body, category, visibility: shared ? "shared" : "private", lessonOccurrenceId: occurrenceId }), onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ["student-notes", studentId] }), client.invalidateQueries({ queryKey: ["parent"] })]);
    setOpen(false); setBody(""); setShared(false); setCategory("lesson"); toast.success("Note saved");
  }, onError: () => toast.error("The note could not be saved. Your draft is still here.") });
  return <div className="mt-5 border-t border-border pt-4">{data.latest && <ClientNoteDisplay note={data.latest} />}<Button variant="ghost" className="mt-2" onClick={() => { setShared(false); setOpen(true); }}><NotebookPen aria-hidden /> Add note</Button>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent className="w-full overflow-y-auto sm:max-w-xl [&>button]:hidden" aria-describedby={`note-description-${studentId}`}><SheetTitle className="pr-4 text-2xl">Add note · {name}</SheetTitle><SheetDescription id={`note-description-${studentId}`} className="mt-2 text-base">{category === "lesson" ? "Lesson note" : "Client note"}</SheetDescription>
      <Button variant="ghost" className="mt-3" disabled={saving.isPending} onClick={() => setOpen(false)}><X aria-hidden /> Close</Button>
      {data.pinned.length > 0 && <section className="my-5 border-y border-border py-4"><h3 className="mb-3 flex items-center gap-2 text-xl"><Pin aria-hidden className="size-5" /> Pinned reminders</h3><div className="space-y-5">{data.pinned.map((note) => <ClientNoteDisplay key={note.id} note={note} />)}</div></section>}
      <form className="mt-5 space-y-5" onSubmit={(event) => { event.preventDefault(); if (body.trim() && !saving.isPending) saving.mutate(); }}>
        <label className="block">Note<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} disabled={saving.isPending} className="mt-2 w-full rounded-md border border-input bg-card p-3 text-lg" /></label>
        <label className="block">Category<select value={category} disabled={saving.isPending} onChange={(event) => setCategory(event.target.value as ClientNote["category"])} className="mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3 text-lg">{["lesson", "general", "billing", "pastoral"].map((value) => <option key={value} value={value}>{value[0]?.toUpperCase()}{value.slice(1)}</option>)}</select></label>
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">Share with family<Switch checked={shared} onCheckedChange={setShared} disabled={saving.isPending} aria-label="Share with family" className="h-12 w-20 [&>span]:size-10 [&>span]:data-[state=checked]:translate-x-8" /></label>
        <Button type="submit" disabled={!body.trim() || saving.isPending} className="w-full"><Save aria-hidden />{saving.isPending ? "Saving…" : "Save note"}</Button>
      </form></SheetContent></Sheet>
  </div>;
}