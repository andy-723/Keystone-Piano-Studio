import { Link } from "@tanstack/react-router";
import { BookOpen, Menu, MessageCircle, Receipt, Settings, Users, Megaphone } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { chatThreadsQuery } from "@/lib/chat-queries";
import { Button } from "@/components/ui/button";
import { StudioNews } from "./StudioNews";
import { TeacherProfileSettings } from "./TeacherProfileSettings";
import { ProfilePicture } from "./ProfilePicture";
import { teacherProfileQuery } from "@/lib/community-queries";
import { PlanBilling } from "./PlanBilling";
import { planBillingQuery } from "@/lib/plan-queries";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAppSettings, type Role } from "@/lib/app-settings";
import type { Studio } from "@/mocks/types";
import { translate } from "@/i18n/parent";
import { BrandLockup, BrandMark } from "@/components/BrandLogo";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const NAV = [
  { to: "/", label: "Today", icon: BookOpen },
  { to: "/news", label: "News", icon: Megaphone },
  { to: "/students", label: "Students", icon: Users },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({
  unreadBadge,
  onNavigate,
  layout,
}: {
  unreadBadge: ReactNode;
  onNavigate?: () => void;
  layout: "rail" | "drawer" | "tabs";
}) {
  const base =
    layout === "rail"
      ? "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-2 text-base font-semibold text-sidebar-foreground hover:bg-sidebar-accent"
      : layout === "drawer"
        ? "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-base font-semibold text-sidebar-foreground hover:bg-sidebar-accent"
        : "min-readable flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 font-semibold text-sidebar-foreground";

  return (
    <>
      {NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: to === "/" }}
          onClick={onNavigate}
          className={base}
          activeProps={{
            className:
              layout === "tabs"
                ? "text-sidebar-primary underline underline-offset-4"
                : "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary",
          }}
        >
          <span className="relative flex size-6 shrink-0 items-center justify-center">
            <Icon className="size-6" aria-hidden />
            {to === "/chat" && unreadBadge}
          </span>
          {label}
        </Link>
      ))}
    </>
  );
}

export function AppShell({ children, studio }: { children: ReactNode; studio: Studio }) {
  const { role, setRole, largeText, setLargeText } = useAppSettings();
  const { data: subscription } = useSuspenseQuery(planBillingQuery(role === "new-teacher" ? "new-studio" : "demo"));
  const { data: profile } = useSuspenseQuery(teacherProfileQuery(role === "new-teacher" ? "new-studio" : "demo"));
  const [newNewsOpen, setNewNewsOpen] = useState(false);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const planLabel = subscription.plan === "base" ? "Base plan" : subscription.plan === "academy" ? "Academy plan" : "Pro plan";
  const planBadge = (
    <Button
      asChild={role === "teacher"}
      variant={subscription.plan === "base" ? "outline" : "default"}
      className="min-h-12 h-auto rounded-full px-3 text-base"
      onClick={() => role === "new-teacher" && setNewPlanOpen(true)}
    >
      {role === "teacher" ? <Link to="/settings" hash="plan-and-billing">{planLabel}</Link> : planLabel}
    </Button>
  );
  const isTeacher = role === "teacher";
  const { data: chatThreads } = useQuery({ ...chatThreadsQuery, enabled: isTeacher });
  const unread = chatThreads?.reduce((total, thread) => total + thread.unreadCount, 0) ?? 0;
  const chatNotification =
    unread > 0 ? (
      <span
        role="status"
        aria-label={`${unread} unread chat messages`}
        className="absolute -right-5 -top-2 flex min-h-7 min-w-7 items-center justify-center rounded-full bg-destructive px-1.5 text-base font-semibold text-destructive-foreground"
      >
        {unread > 99 ? "99+" : unread}
      </span>
    ) : null;
  const { parentLang } = useAppSettings();
  const shellText = (key: "largerText" | "viewingAs") => translate(role === "parent" ? parentLang : "en", key);
  const studioLabel = profile?.studioName || studio.name;

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop rail — lg+ only so phones/tablets are not squeezed */}
      {isTeacher && (
        <nav
          aria-label="Main"
          className="hidden lg:flex lg:w-36 xl:w-40 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 sticky top-0 h-screen"
        >
          <div className="flex flex-col items-center gap-3 px-1 py-3">
            <BrandMark size="lg" alt="Keystone Music HQ" />
            <p className="break-words text-center text-base font-semibold leading-snug">{studioLabel}</p>
            {planBadge}
          </div>
          <NavLinks unreadBadge={chatNotification} layout="rail" />
        </nav>
      )}

      <div
        className={`flex min-w-0 flex-1 flex-col ${
          isTeacher ? "pb-[calc(9rem+env(safe-area-inset-bottom))] sm:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0" : ""
        }`}
      >
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {isTeacher && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-12 min-w-12 shrink-0 lg:hidden"
                aria-label="Open studio menu"
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="size-6" aria-hidden />
              </Button>
            )}

            {role !== "parent" ? (
              <>
                {/* Lockup on phones/tablets; desktop rail already carries the brand mark */}
                <div className={`min-w-0 flex-1 ${isTeacher ? "lg:hidden" : ""}`}>
                  <BrandLockup priority />
                </div>
                {isTeacher && <div className="hidden min-w-0 flex-1 lg:block" aria-hidden />}
                <div className="flex shrink-0 items-center gap-2">
                  {/* Plan lives in the drawer/rail on teacher; show here only for new-teacher */}
                  {role === "new-teacher" && planBadge}
                  <ProfilePicture
                    id="teacher"
                    name={profile.name || "Teacher"}
                    scope={role === "new-teacher" ? "new-studio" : "demo"}
                  />
                </div>
              </>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
          </div>

          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
            <div className="relative flex min-h-12 shrink-0 items-center gap-2">
              <Switch id="larger-text" className="relative z-10" checked={largeText} onCheckedChange={setLargeText} />
              <Label htmlFor="larger-text" className="flex min-h-12 cursor-pointer items-center text-base before:absolute before:inset-0">
                {shellText("largerText")}
              </Label>
            </div>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-base sm:flex-initial">
              <span className="sr-only sm:not-sr-only sm:text-muted-foreground">{shellText("viewingAs")}</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="min-h-12 w-full min-w-0 max-w-full rounded-lg border-2 border-input bg-card px-2 min-readable font-semibold sm:w-auto sm:max-w-[16rem] sm:px-3"
              >
                <option value="teacher">Teacher ({profile?.name || "Ms Clarke"})</option>
                <option value="parent">Parent (Wei Chen)</option>
                <option value="new-teacher">New teacher (empty studio)</option>
              </select>
            </label>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 md:px-8 md:py-8">
          {role === "new-teacher" && newPlanOpen ? (
            <div className="mx-auto max-w-3xl">
              <Button variant="outline" onClick={() => setNewPlanOpen(false)}>
                Back to studio
              </Button>
              <h1 className="mt-5 text-3xl font-semibold">Settings</h1>
              <TeacherProfileSettings scope="new-studio" />
              <PlanBilling scope="new-studio" />
              <Button
                className="mt-5"
                variant="outline"
                onClick={() => {
                  setNewPlanOpen(false);
                  setNewNewsOpen(true);
                }}
              >
                <Megaphone aria-hidden />
                Studio news
              </Button>
            </div>
          ) : role === "new-teacher" && newNewsOpen ? (
            <div>
              <Button variant="outline" onClick={() => setNewNewsOpen(false)}>
                Back to studio
              </Button>
              <StudioNews scope="new-studio" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Bottom tabs below lg */}
      {isTeacher && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 sm:grid-cols-6 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <NavLinks unreadBadge={chatNotification} layout="tabs" />
        </nav>
      )}

      {/* Hamburger drawer for phones/tablets */}
      {isTeacher && (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="flex w-[min(100%,20rem)] flex-col gap-4 bg-sidebar p-4 pt-10 sm:max-w-sm">
            <SheetHeader className="space-y-3 text-left">
              <div className="flex items-center gap-3">
                <BrandMark size="md" />
                <SheetTitle className="text-left text-xl leading-snug">{studioLabel}</SheetTitle>
              </div>
              <SheetDescription className="sr-only">Studio navigation</SheetDescription>
              <div>{planBadge}</div>
            </SheetHeader>
            <nav aria-label="Studio menu" className="flex flex-col gap-1">
              <NavLinks unreadBadge={chatNotification} layout="drawer" onNavigate={() => setMenuOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
      )}
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
