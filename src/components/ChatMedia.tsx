import { useEffect, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Message } from "@/mocks/types";
import pianoPractice from "@/assets/piano-practice.jpg";

export function VoiceClip({ seconds = 10 }: { seconds?: number }) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setElapsed((value) => {
      if (value + 1 >= seconds) { setPlaying(false); return seconds; }
      return value + 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [playing, seconds]);
  return <div className="flex flex-wrap items-center gap-3">
    <Button variant="outline" onClick={() => { if (elapsed >= seconds) setElapsed(0); setPlaying(!playing); }}>
      {playing ? <Pause aria-hidden /> : <Play aria-hidden />} {playing ? "Pause" : "Play"}
    </Button>
    <svg viewBox="0 0 180 40" className="h-10 w-28 shrink-0 text-primary" role="img" aria-label="Voice waveform">
      {Array.from({ length: 30 }, (_, i) => { const height = 8 + ((i * 13) % 29); return <line key={i} x1={i * 6 + 2} x2={i * 6 + 2} y1={(40 - height) / 2} y2={(40 + height) / 2} stroke="currentColor" strokeWidth="3" opacity={i / 30 <= elapsed / seconds ? 1 : 0.4} />; })}
    </svg>
    <span className="text-base text-muted-foreground" aria-live="off">0:{String(elapsed).padStart(2, "0")} / 0:{String(seconds).padStart(2, "0")}</span>
    <span className="w-full text-base text-muted-foreground">Simulated voice clip</span>
  </div>;
}

export function ChatMedia({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  if (message.kind === "voice") return <VoiceClip seconds={message.media?.durationSeconds ?? 10} />;
  if (message.kind === "video" && message.media?.url) return <video controls preload="metadata" className="max-h-80 w-full rounded-md" src={message.media.url} aria-label={message.media.fileName ?? "Video message"} />;
  if (message.kind !== "image" && message.kind !== "video") return null;
  const source = message.media?.url ?? pianoPractice;
  const thumbnail = message.media?.thumbnailUrl ?? source;
  return <>
    <Button variant="ghost" className="h-auto w-full max-w-sm flex-col whitespace-normal p-0" onClick={() => setOpen(true)}>
      <img src={thumbnail} alt={message.kind === "image" ? message.body || "Piano practice photo" : "Piano performance video preview"} width={992} height={672} loading="lazy" className="aspect-[3/2] w-full rounded-md object-cover" />
      <span className="flex min-h-12 items-center gap-2">{message.kind === "video" ? <><Play aria-hidden /> Play video · 0:{String(message.media?.durationSeconds ?? 24).padStart(2, "0")}</> : "Open photo"}</span>
    </Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl">
      <DialogTitle>{message.kind === "image" ? "Photo" : "Piano performance"}</DialogTitle>
      <img src={source} alt="Piano practice" width={992} height={672} className="w-full rounded-md" />
      {message.kind === "video" && <p className="text-base text-muted-foreground">Sample video preview · 24 seconds</p>}
      <Button variant="outline" onClick={() => setOpen(false)}><X aria-hidden /> Close</Button>
    </DialogContent></Dialog>
  </>;
}