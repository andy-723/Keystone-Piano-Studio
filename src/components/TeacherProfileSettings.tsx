import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfilePicture } from "./ProfilePicture";
import { teacherProfileQuery } from "@/lib/community-queries";
import { saveTeacherProfile } from "@/services/community";
import type { CommunityScope } from "@/mocks/community";
import { toast } from "sonner";

export function TeacherProfileSettings({ scope = "demo" }: { scope?: CommunityScope }) {
  const { data } = useSuspenseQuery(teacherProfileQuery(scope));
  const [form, setForm] = useState(data);
  const client = useQueryClient();
  const save = useMutation({ mutationFn: () => saveTeacherProfile(form, scope), onSuccess: async () => { await Promise.all(["teacher-profile", "studio", "studio-settings", "setup"].map(key => client.invalidateQueries({ queryKey: [key] }))); toast.success("Profile settings saved"); }, onError: error => toast.error(error.message) });
  return <section className="border-b border-border py-7"><h2 className="mb-5 text-2xl font-semibold">Your profile</h2><ProfilePicture id="teacher" name={data.name || "Teacher"} editable scope={scope}/><form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}><label className="block font-semibold">Teacher name<Input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label className="block font-semibold">Studio name<Input required value={form.studioName} onChange={event => setForm({ ...form, studioName: event.target.value })} /></label><Button disabled={save.isPending} type="submit"><Save aria-hidden/>Save profile</Button></form></section>;
}