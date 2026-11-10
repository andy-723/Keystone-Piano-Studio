import { useState } from "react";
import { BookOpen, CalendarDays, Check, CheckCircle2, FileText, Laptop, MessageCircle, Send, Tablet } from "lucide-react";

type Screen = "day" | "week" | "chat" | "invoices";
type Device = "laptop" | "ipad";

const screens: { id: Screen; label: string; hint: string; Icon: typeof BookOpen }[] = [
  { id: "day", label: "One-tap attendance", hint: "Tap a lesson to mark it attended.", Icon: CheckCircle2 },
  { id: "week", label: "Week view", hint: "See the whole teaching week at a glance.", Icon: CalendarDays },
  { id: "chat", label: "Family chat", hint: "Type a reply and send it.", Icon: MessageCircle },
  { id: "invoices", label: "Term invoices", hint: "Tap Send to issue a family's invoice.", Icon: FileText },
];

const lessons = [
  { time: "3:30 pm", name: "Lucy Chen", len: "30 min" },
  { time: "4:00 pm", name: "Oliver Wang", len: "45 min" },
  { time: "4:45 pm", name: "Mia Patel", len: "30 min" },
  { time: "5:15 pm", name: "Noah Smith", len: "30 min" },
];

function DayBook() {
  const [done, setDone] = useState<Record<string, boolean>>({ "Lucy Chen": true });
  const count = Object.values(done).filter(Boolean).length;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mk-serif text-2xl font-semibold">Good afternoon</p>
          <p className="text-base text-mk-ink/70">Thursday 15 May · {count} of {lessons.length} marked</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {lessons.map((l) => {
          const on = !!done[l.name];
          return (
            <li key={l.name}>
              <button
                type="button"
                onClick={() => setDone((d) => ({ ...d, [l.name]: !d[l.name] }))}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-left text-base transition ${on ? "border-mk-bronze/50 bg-mk-cream" : "border-mk-gold/40 bg-mk-paper hover:border-mk-bronze"}`}
              >
                <span className="w-20 shrink-0 font-semibold tabular-nums">{l.time}</span>
                <span className="min-w-0 flex-1 truncate">{l.name} <span className="text-mk-ink/60">· {l.len}</span></span>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-medium ${on ? "bg-mk-bronze text-mk-paper" : "border border-mk-ink/20 text-mk-ink/70"}`}>
                  {on ? <><Check className="h-4 w-4" aria-hidden /> Attended</> : "Mark"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const week = [
  ["Mon", "12", ["3:30 Ava", "4:15 Leo", "5:00 Ruby"]],
  ["Tue", "13", ["3:30 Jack", "4:00 Isla", "4:45 Zoe", "5:30 Max"]],
  ["Wed", "14", ["4:00 Ella", "4:30 Sam"]],
  ["Thu", "15", ["3:30 Lucy", "4:00 Oliver", "4:45 Mia"]],
  ["Fri", "16", ["Public holiday"]],
  ["Sat", "17", ["9:00 Ivy", "9:45 Tom"]],
] as const;

function Week() {
  const [sel, setSel] = useState("Thu");
  return (
    <div>
      <p className="font-mk-serif text-2xl font-semibold">Week of 12 May</p>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {week.map(([d, n, items]) => {
          const hol = items[0] === "Public holiday";
          return (
            <button key={d} type="button" onClick={() => setSel(d)}
              className={`min-h-32 rounded-2xl border p-2 text-left text-base transition ${sel === d ? "border-mk-bronze bg-mk-cream" : "border-mk-gold/40 bg-mk-paper"} ${hol ? "bg-mk-ink/5" : ""}`}>
              <span className="block font-semibold">{d} {n}</span>
              {items.map((i) => (
                <span key={i} className={`mt-1 block truncate rounded-lg px-1.5 py-0.5 ${hol ? "italic text-mk-ink/60" : "bg-mk-bronze/15"}`}>{i}</span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chat() {
  const [msgs, setMsgs] = useState([
    { me: false, who: "Chen family", text: "Lucy really enjoyed today's lesson. Thank you!" },
    { me: true, who: "You", text: "She's nailing the scales — keep going this week!" },
  ]);
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { me: true, who: "You", text: text.trim() }]);
    setText("");
  };
  return (
    <div className="flex h-full flex-col">
      <p className="font-mk-serif text-2xl font-semibold">Chen family</p>
      <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <p key={i} className={`max-w-[85%] rounded-2xl px-4 py-2 text-base ${m.me ? "ml-auto bg-mk-bronze text-mk-paper" : "bg-mk-cream"}`}>{m.text}</p>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="demo-msg">Message</label>
        <input id="demo-msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…"
          className="min-h-12 min-w-0 flex-1 rounded-full border border-mk-gold/60 bg-mk-paper px-4 text-base outline-none focus:border-mk-bronze" />
        <button type="submit" aria-label="Send" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-mk-ink text-mk-paper"><Send className="h-5 w-5" aria-hidden /></button>
      </form>
    </div>
  );
}

function Invoices() {
  const [sent, setSent] = useState<Record<string, boolean>>({ Chen: true });
  const rows = [["Chen", "$1,240"], ["Wang", "$620"], ["Patel", "$930"]];
  return (
    <div>
      <p className="font-mk-serif text-2xl font-semibold">Term 2 invoices</p>
      <ul className="mt-4 space-y-2">
        {rows.map(([f, amt]) => (
          <li key={f} className="flex min-h-14 items-center gap-3 rounded-2xl border border-mk-gold/40 bg-mk-paper px-4 text-base">
            <FileText className="h-5 w-5 shrink-0 text-mk-bronze" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{f} family · {amt}</span>
            {sent[f]
              ? <span className="rounded-full bg-mk-cream px-3 py-1 font-medium">Sent ✓</span>
              : <button type="button" onClick={() => setSent((s) => ({ ...s, [f]: true }))} className="min-h-11 rounded-full bg-mk-bronze px-4 font-medium text-mk-paper">Send</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppScreen({ screen, device, onNav }: { screen: Screen; device: Device; onNav: (s: Screen) => void }) {
  const nav: [Screen, string, typeof BookOpen][] = [["day", "Today", BookOpen], ["week", "Week", CalendarDays], ["chat", "Chat", MessageCircle], ["invoices", "Invoices", FileText]];
  const body = screen === "day" ? <DayBook /> : screen === "week" ? <Week /> : screen === "chat" ? <Chat /> : <Invoices />;
  return (
    <div className={`flex h-full bg-mk-paper text-mk-ink ${device === "ipad" ? "flex-col-reverse" : ""}`}>
      <nav className={device === "laptop" ? "hidden w-44 shrink-0 flex-col gap-1 border-r border-mk-gold/40 p-3 sm:flex" : "grid grid-cols-4 border-t border-mk-gold/40"}>
        {device === "laptop" && <p className="mb-3 px-2 font-mk-serif text-lg font-semibold tracking-wide">KEYSTONE</p>}
        {nav.map(([id, label, I]) => (
          <button key={id} type="button" onClick={() => onNav(id)}
            className={`flex min-h-12 items-center gap-2 rounded-xl px-3 text-base transition ${device === "ipad" ? "flex-col justify-center gap-0.5 rounded-none py-1" : ""} ${screen === id ? "bg-mk-cream font-semibold text-mk-bronze" : "text-mk-ink/70 hover:text-mk-ink"}`}>
            <I className="h-5 w-5" aria-hidden />{label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{body}</div>
    </div>
  );
}

export function DeviceShowcase() {
  const [device, setDevice] = useState<Device>("laptop");
  const [screen, setScreen] = useState<Screen>("day");
  const hint = screens.find((s) => s.id === screen)!.hint;
  return (
    <div className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="Device" className="inline-flex rounded-full border border-mk-gold/60 bg-mk-paper p-1">
          {([["laptop", "Laptop", Laptop], ["ipad", "iPad", Tablet]] as const).map(([id, label, I]) => (
            <button key={id} role="tab" aria-selected={device === id} type="button" onClick={() => setDevice(id)}
              className={`inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-base font-medium transition ${device === id ? "bg-mk-ink text-mk-paper" : "text-mk-ink/75"}`}>
              <I className="h-5 w-5" aria-hidden />{label}
            </button>
          ))}
        </div>
        <p className="text-lg text-mk-ink/75" aria-live="polite">Try it: {hint}</p>
      </div>

      <div className="mt-8 flex justify-center">
        {device === "laptop" ? (
          <div className="w-full max-w-5xl">
            <div className="rounded-t-[1.75rem] border-[10px] border-mk-ink bg-mk-ink shadow-[0_30px_80px_-30px_rgba(28,25,23,0.45)]">
              <div className="h-[460px] overflow-hidden rounded-xl sm:h-[520px]"><AppScreen screen={screen} device="laptop" onNav={setScreen} /></div>
            </div>
            <div className="mx-auto h-4 w-[106%] -translate-x-[3%] rounded-b-2xl bg-mk-ink/85" aria-hidden />
          </div>
        ) : (
          <div className="w-full max-w-2xl rounded-[2.5rem] border-[14px] border-mk-ink bg-mk-ink shadow-[0_30px_80px_-30px_rgba(28,25,23,0.45)]">
            <div className="h-[560px] overflow-hidden rounded-[1.5rem] sm:h-[640px]"><AppScreen screen={screen} device="ipad" onNav={setScreen} /></div>
          </div>
        )}
      </div>

      <ul className="mt-8 flex flex-wrap justify-center gap-3">
        {screens.map(({ id, label, Icon }) => (
          <li key={id}>
            <button type="button" onClick={() => setScreen(id)} aria-pressed={screen === id}
              className={`inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-base font-medium transition ${screen === id ? "border-mk-bronze bg-mk-bronze text-mk-paper" : "border-mk-gold/60 bg-mk-paper text-mk-ink hover:border-mk-bronze"}`}>
              <Icon className="h-5 w-5" aria-hidden />{label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
