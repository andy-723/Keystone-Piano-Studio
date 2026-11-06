import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { groupsQuery, refreshGroups, studentGroupsQuery } from "@/lib/group-queries";
import {
  addStudentToGroups,
  createGroup,
  deleteGroup,
  renameGroup,
  setGroupMembers,
} from "@/services/groups";
import { studentsQuery } from "@/lib/student-queries";
import type { CommunityScope } from "@/mocks/community";
import { useQueryClient } from "@tanstack/react-query";

export function StudentGroupsPage({ scope = "demo" }: { scope?: CommunityScope }) {
  const { data } = useSuspenseQuery(groupsQuery(scope));
  const { data: roster } = useSuspenseQuery(studentsQuery);
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [membersFor, setMembersFor] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () => createGroup(name, description || undefined, scope),
    onSuccess: async () => {
      setName("");
      setDescription("");
      await refreshGroups(client);
      toast.success("Group created");
    },
    onError: (error) => toast.error(error.message),
  });
  const rename = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Choose a group.");
      return renameGroup(editing.id, editing.name, scope);
    },
    onSuccess: async () => {
      setEditing(null);
      await refreshGroups(client);
      toast.success("Group renamed");
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteGroup(id, scope),
    onSuccess: async (result) => {
      await refreshGroups(client);
      toast.success("deleted" in result && result.deleted ? "Group deleted" : "Group archived");
    },
    onError: (error) => toast.error(error.message),
  });
  const saveMembers = useMutation({
    mutationFn: () => {
      if (!membersFor) throw new Error("Choose a group.");
      return setGroupMembers(membersFor, selectedMembers, scope);
    },
    onSuccess: async () => {
      setMembersFor(null);
      await refreshGroups(client);
      toast.success("Members updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const openMembers = (groupId: string, studentIds: string[]) => {
    setMembersFor(groupId);
    setSelectedMembers(studentIds);
    setMemberSearch("");
  };

  const filteredStudents = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return roster.filter((student) => {
      if (!q) return true;
      const hay = `${student.firstName} ${student.lastName} ${student.familyName} ${student.gradeGoal}`.toLowerCase();
      return hay.includes(q);
    });
  }, [roster, memberSearch]);

  const toggleMember = (id: string) => {
    setSelectedMembers((list) => (list.includes(id) ? list.filter((value) => value !== id) : [...list, id]));
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Button asChild variant="ghost" className="mb-5">
        <Link to="/students">
          <ArrowLeft aria-hidden /> All students
        </Link>
      </Button>
      <header className="mb-7">
        <h1 className="flex items-center gap-3 text-3xl font-semibold">
          <Users className="size-7 text-primary" aria-hidden />
          Groups
        </h1>
        <p className="mt-2 text-muted-foreground">
          Create studio groups for news and day-to-day lists. Smart classifications (grades, competition &amp; exams) update from the roster.
        </p>
      </header>

      <section className="border-y border-border py-6" aria-labelledby="create-group">
        <h2 id="create-group" className="text-2xl font-semibold">
          Create a group
        </h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label className="block font-semibold">
            Name
            <Input className="mt-2" required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block font-semibold">
            Description (optional)
            <Input className="mt-2" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <Button type="submit" disabled={create.isPending}>
            <Plus aria-hidden /> Create
          </Button>
        </form>
        {create.error && (
          <p role="alert" className="mt-3 text-destructive">
            {create.error.message}
          </p>
        )}
      </section>

      <section className="border-b border-border py-7" aria-labelledby="studio-groups">
        <h2 id="studio-groups" className="text-2xl font-semibold">
          Studio groups
        </h2>
        {!data.manual.length && (
          <p className="mt-4 text-muted-foreground">No groups yet. Create one above to target news and organise students.</p>
        )}
        <div className="mt-4 divide-y divide-border">
          {data.manual.map((group) => (
            <article key={group.id} className="flex flex-wrap items-start justify-between gap-4 py-5">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold">{group.name}</h3>
                {group.description && <p className="mt-1 text-base text-muted-foreground">{group.description}</p>}
                <p className="mt-2 text-base text-muted-foreground">
                  {group.memberCount} {group.memberCount === 1 ? "student" : "students"} · {group.familyCount}{" "}
                  {group.familyCount === 1 ? "family" : "families"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => openMembers(group.id, group.studentIds)}>
                  Members
                </Button>
                <Button variant="ghost" onClick={() => setEditing({ id: group.id, name: group.name })}>
                  <Pencil aria-hidden /> Rename
                </Button>
                <Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(group.id)}>
                  <Trash2 aria-hidden /> Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="py-7" aria-labelledby="smart-groups">
        <h2 id="smart-groups" className="text-2xl font-semibold">
          Smart classifications
        </h2>
        <p className="mt-2 text-muted-foreground">Read-only lists derived from grades and upcoming exams.</p>
        <div className="mt-4 divide-y divide-border">
          {data.smart.map((group) => (
            <article key={group.id} className="py-4">
              <h3 className="text-lg font-semibold">{group.name}</h3>
              {group.description && <p className="mt-1 text-base text-muted-foreground">{group.description}</p>}
              <p className="mt-2 text-base text-muted-foreground">
                {group.memberCount} {group.memberCount === 1 ? "student" : "students"} · {group.familyCount}{" "}
                {group.familyCount === 1 ? "family" : "families"}
              </p>
            </article>
          ))}
          {!data.smart.length && <p className="mt-4 text-muted-foreground">No smart classifications yet — add students to the roster first.</p>}
        </div>
      </section>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename group</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                rename.mutate();
              }}
            >
              <label className="block font-semibold">
                Name
                <Input className="mt-2" required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
              </label>
              <Button type="submit" disabled={rename.isPending}>
                Save name
              </Button>
              {rename.error && (
                <p role="alert" className="text-destructive">
                  {rename.error.message}
                </p>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(membersFor)} onOpenChange={(open) => !open && setMembersFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Group members</DialogTitle>
          </DialogHeader>
          <label className="relative block">
            <span className="sr-only">Search students</span>
            <Search className="absolute left-3 top-3.5 size-5 text-muted-foreground" aria-hidden />
            <Input className="pl-11" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search students" />
          </label>
          <div className="mt-3 max-h-80 space-y-1 overflow-auto">
            {filteredStudents.map((student) => (
              <label key={student.id} className="flex min-h-12 items-center gap-3 rounded-md px-2 hover:bg-muted">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={selectedMembers.includes(student.id)}
                  onChange={() => toggleMember(student.id)}
                />
                <span>
                  <span className="font-semibold">
                    {student.firstName} {student.lastName}
                  </span>
                  <span className="mt-0.5 block text-base text-muted-foreground">
                    {student.familyName} · {student.gradeGoal}
                  </span>
                </span>
              </label>
            ))}
            {!filteredStudents.length && <p className="py-4 text-muted-foreground">No students match this search.</p>}
          </div>
          <Button disabled={saveMembers.isPending} onClick={() => saveMembers.mutate()}>
            Save members · {selectedMembers.length}
          </Button>
          {saveMembers.error && (
            <p role="alert" className="text-destructive">
              {saveMembers.error.message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StudentProfileGroups({ studentId, scope = "demo" }: { studentId: string; scope?: CommunityScope }) {
  const { data: all } = useSuspenseQuery(groupsQuery(scope));
  const { data: current } = useSuspenseQuery(studentGroupsQuery(studentId, scope));
  const client = useQueryClient();
  const selected = new Set(current.map((group) => group.id));
  const [pending, setPending] = useState<string[]>([...selected]);

  const save = useMutation({
    mutationFn: async () => {
      const toAdd = pending.filter((id) => !selected.has(id));
      const toRemove = [...selected].filter((id) => !pending.includes(id));
      if (toAdd.length) await addStudentToGroups(studentId, toAdd, scope);
      for (const groupId of toRemove) {
        const group = all.manual.find((entry) => entry.id === groupId);
        if (!group) continue;
        await setGroupMembers(
          groupId,
          group.studentIds.filter((id) => id !== studentId),
          scope,
        );
      }
    },
    onSuccess: async () => {
      await refreshGroups(client);
      toast.success("Groups updated");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">Groups</h3>
        <Button asChild variant="outline">
          <Link to="/students/groups">Manage groups</Link>
        </Button>
      </div>
      {!all.manual.length ? (
        <p className="mt-3 text-muted-foreground">
          No groups yet.{" "}
          <Link className="underline" to="/students/groups">
            Create one
          </Link>
        </p>
      ) : (
        <>
          <fieldset className="mt-3 space-y-2">
            <legend className="sr-only">Studio groups for this student</legend>
            {all.manual.map((group) => (
              <label key={group.id} className="flex min-h-12 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={pending.includes(group.id)}
                  onChange={() =>
                    setPending((list) => (list.includes(group.id) ? list.filter((id) => id !== group.id) : [...list, group.id]))
                  }
                />
                <span>
                  <span className="font-semibold">{group.name}</span>
                  {group.description && <span className="mt-0.5 block text-base text-muted-foreground">{group.description}</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <Button className="mt-4" disabled={save.isPending} onClick={() => save.mutate()}>
            Save groups
          </Button>
        </>
      )}
    </div>
  );
}
