import { useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfilePicture } from "./ProfilePicture";
import { teacherProfileQuery } from "@/lib/community-queries";
import { saveTeacherProfile } from "@/services/community";
import type { CommunityScope } from "@/mocks/community";
import { STUDIO_STATES } from "@/mocks/setup";
import { toast } from "sonner";

export function TeacherProfileSettings({ scope = "demo" }: { scope?: CommunityScope }) {
  const { data } = useSuspenseQuery(teacherProfileQuery(scope));
  const [form, setForm] = useState(data);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      saveTeacherProfile(
        {
          name: form.name,
          studioName: form.studioName,
          ...(form.childSafety ? { childSafety: form.childSafety } : {}),
        },
        scope,
      ),
    onSuccess: async () => {
      await Promise.all(["teacher-profile", "studio", "studio-settings", "setup", "terms"].map((key) => client.invalidateQueries({ queryKey: [key] })));
      toast.success("Profile settings saved");
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <section className="border-b border-border py-7">
      <h2 className="mb-5 text-2xl font-semibold" data-tour="settings-profile">Your profile</h2>
      <ProfilePicture id="teacher" name={data.name || "Teacher"} editable scope={scope} />
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="block font-semibold">
          Teacher name
          <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label className="block font-semibold">
          Studio name
          <Input required value={form.studioName} onChange={(event) => setForm({ ...form, studioName: event.target.value })} />
        </label>
        <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="text-lg font-semibold">Child safety check</legend>
          <label className="block font-semibold">
            State
            <select
              className="mt-2 min-h-12 w-full rounded-md border border-input bg-card px-3"
              value={form.childSafety?.state ?? "VIC"}
              onChange={(event) =>
                setForm({
                  ...form,
                  childSafety: {
                    state: event.target.value,
                    type: form.childSafety?.type ?? "Working with Children Check",
                    number: form.childSafety?.number ?? "",
                    expiry: form.childSafety?.expiry ?? "",
                  },
                })
              }
            >
              {STUDIO_STATES.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <label className="block font-semibold">
            Check type
            <Input
              value={form.childSafety?.type ?? ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  childSafety: {
                    state: form.childSafety?.state ?? "VIC",
                    type: event.target.value,
                    number: form.childSafety?.number ?? "",
                    expiry: form.childSafety?.expiry ?? "",
                  },
                })
              }
            />
          </label>
          <label className="block font-semibold">
            Check number
            <Input
              value={form.childSafety?.number ?? ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  childSafety: {
                    state: form.childSafety?.state ?? "VIC",
                    type: form.childSafety?.type ?? "Working with Children Check",
                    number: event.target.value,
                    expiry: form.childSafety?.expiry ?? "",
                  },
                })
              }
            />
          </label>
          <label className="block font-semibold">
            Expiry
            <Input
              type="date"
              value={form.childSafety?.expiry ?? ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  childSafety: {
                    state: form.childSafety?.state ?? "VIC",
                    type: form.childSafety?.type ?? "Working with Children Check",
                    number: form.childSafety?.number ?? "",
                    expiry: event.target.value,
                  },
                })
              }
            />
          </label>
        </fieldset>
        <Button disabled={save.isPending} type="submit">
          <Save aria-hidden />
          Save profile
        </Button>
      </form>
    </section>
  );
}
