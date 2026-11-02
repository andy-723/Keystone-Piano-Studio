import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openStudentCheckIn } from "@/services/students";

export function StudentCheckIn({ studentId }: { studentId: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const opening = useMutation({ mutationFn: () => openStudentCheckIn(studentId), onSuccess: async (conversation) => {
    await client.invalidateQueries({ queryKey: ["chat-threads"] });
    await navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id }, search: { checkIn: studentId } });
  }, onError: () => toast.error("The family conversation could not be opened. Please try again.") });
  return <Button variant="outline" className="h-auto min-h-12 max-w-full whitespace-normal text-left" disabled={opening.isPending} onClick={() => opening.mutate()}><MessageCircle aria-hidden />{opening.isPending ? "Opening family chat…" : "Send a check-in message"}</Button>;
}