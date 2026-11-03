import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { picturesQuery } from "@/lib/community-queries";
import { setProfilePicture } from "@/services/community";
import type { CommunityScope } from "@/mocks/community";
import { toast } from "sonner";

export function ProfilePicture({ id, name, editable = false, scope = "demo" }: { id: string; name: string; editable?: boolean; scope?: CommunityScope }) {
  const { data } = useQuery(picturesQuery(scope));
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const save = useMutation({ mutationFn: (image: string | null) => setProfilePicture(id, image, scope), onSuccess: images => { client.setQueryData(picturesQuery(scope).queryKey, images); toast.success("Profile picture saved"); }, onError: error => toast.error(error.message) });
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error("Choose a JPG, PNG or WebP picture under 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") save.mutate(reader.result); };
    reader.onerror = () => toast.error("This picture could not be opened.");
    reader.readAsDataURL(file);
  }
  return <div className="flex flex-wrap items-center gap-3"><div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xl font-semibold text-secondary-foreground">{data?.[id] ? <img src={data[id]} alt={`${name} profile`} className="size-full object-cover" /> : <span aria-label={`${name} initials`}>{name.split(" ").filter(Boolean).slice(0, 2).map(word => word[0]).join("")}</span>}</div>{editable && <><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={`Upload picture for ${name}`} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /><Button variant="outline" disabled={save.isPending} onClick={() => input.current?.click()}><Camera aria-hidden />Change picture</Button>{data?.[id] && <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}><Trash2 aria-hidden />Remove picture</Button>}</>}</div>;
}