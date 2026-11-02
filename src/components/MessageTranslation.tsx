import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getMockEnglishTranslation } from "@/services/chat";

export function MessageTranslation({ messageId, body }: { messageId: string; body: string }) {
  const [visible, setVisible] = useState(false);
  const translation = useMutation({ mutationFn: () => getMockEnglishTranslation(messageId) });
  // The prototype includes Chinese messages; also cover other non-Latin scripts.
  if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Devanagari}]/u.test(body)) return null;
  return <div className="mt-2"><Button variant="link" className="min-h-12 px-0 text-base" aria-expanded={visible} aria-controls={`translation-${messageId}`} disabled={translation.isPending} onClick={() => { setVisible(!visible); if (!visible && !translation.data) translation.mutate(); }}>{translation.isPending ? "Opening translation…" : visible ? "Hide translation" : "Show translation"}</Button>{visible && <div id={`translation-${messageId}`} className="mt-1 border-l-2 border-border pl-3"><p className="text-base font-semibold text-muted-foreground">English · Mock translation</p><p className="mt-2 whitespace-pre-wrap break-words text-lg" lang="en">{translation.isError ? "Translation could not be opened. Please try again." : translation.data ?? "Opening translation…"}</p></div>}</div>;
}