import { Link } from "@tanstack/react-router";
import { BookOpen, MessageCircle, Receipt, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAppSettings, type Role } from "@/lib/app-settings";
import type { Studio } from "@/mocks/types";

const NAV = [
  { to: "/", label: "Today", icon: BookOpen },
  { to: "/students", label: "Students", icon: Users },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children, studio }: { children: ReactNode; studio: Studio }) {
  const { role, setRole, largeText, setLargeText } = useAppSettings();
  const isTeacher = role === "teacher";

  return (
    <div className="min-h-screen md:flex">
      {/* Left rail on tablet and up (teacher only) */}
      {isTeacher && <nav aria-label="Main" className="hidden md:flex md:w-32 lg:w-40 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 sticky top-0 h-screen">
        <div className="px-2 py-3 font-display text-2xl font-semibold text-sidebar-primary">Opus</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-2 text-base font-semibold text-sidebar-foreground hover:bg-sidebar-accent"
            activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary" }}
          >
            <Icon className="size-6" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>}

      <div className={`flex min-w-0 flex-1 flex-col ${isTeacher ? "pb-24 md:pb-0" : ""}`}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 md:px-8">
          <div className="font-display text-xl font-semibold">{studio.name}</div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-4">
            <div className="relative flex min-h-12 items-center gap-3">
              <Switch id="larger-text" checked={largeText} onCheckedChange={setLargeText} />
              <Label htmlFor="larger-text" className="flex min-h-12 cursor-pointer items-center text-base before:absolute before:inset-0">Larger text</Label>
            </div>
            <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-base">
              <span className="text-muted-foreground">Viewing as</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="min-h-12 min-w-0 max-w-full rounded-lg border-2 border-input bg-card px-3 min-readable font-semibold"
              >
                <option value="teacher">Teacher (Ms Clarke)</option>
                <option value="parent">Parent (Wei Chen)</option>
              </select>
            </label>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      {/* Bottom tab bar on phones (teacher only) */}
      {isTeacher && <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-sidebar-border bg-sidebar md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="min-readable flex min-h-16 flex-col items-center justify-center gap-0.5 font-semibold text-sidebar-foreground"
            activeProps={{ className: "text-sidebar-primary underline underline-offset-4" }}
          >
            <Icon className="size-6" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>}
    </div>
  );
}

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="mx-auto max-w-2xl daybook-page px-5 py-8 pl-10 md:p-10 md:pl-20">
      <h1 className="text-4xl font-semibold">{title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{note}</p>
    </div>
  );
}
