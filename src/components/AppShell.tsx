import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  MessageCircle,
  Receipt,
  Settings,
  Users,
  Megaphone,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { chatThreadsQuery } from "@/lib/chat-queries";
import { Button } from "@/components/ui/button";
import { getStudioWorkspace } from "@/lib/studio-workspace";
import { StudioNews } from "./StudioNews";
import { TeacherProfileSettings } from "./TeacherProfileSettings";
import { ProfilePicture } from "./ProfilePicture";
import { teacherProfileQuery } from "@/lib/community-queries";
import { PlanBilling } from "./PlanBilling";
import { planBillingQuery } from "@/lib/plan-queries";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  canViewStudioSnapshot,
  useAppSettings,
  type Role,
  type StudioStaffRole,
} from "@/lib/app-settings";
import type { Studio } from "@/mocks/types";
import { translate, type ParentKey } from "@/i18n/parent";
import { BrandLogo } from "@/components/BrandLogo";
import { isLiveAuthConfigured } from "@/lib/auth-client";
import { signOutLocal } from "@/lib/sign-out";
import { TourHelpButton } from "@/components/tour/Tour";
import { AppLanguageSwitcher } from "@/components/AppLanguageSwitcher";

const NAV = [
  { to: "/today", labelKey: "navToday", icon: BookOpen },
  { to: "/snapshot", labelKey: "navSnapshot", icon: LayoutDashboard, ownerAdminOnly: true },
  { to: "/calendar", labelKey: "navCalendar", icon: CalendarDays },
  { to: "/news", labelKey: "navNews", icon: Megaphone },
  { to: "/students", labelKey: "navStudents", icon: Users },
  { to: "/chat", labelKey: "navChat", icon: MessageCircle },
  { to: "/invoices", labelKey: "navInvoices", icon: Receipt },
  { to: "/settings", labelKey: "navSettings", icon: Settings },
] as const;

export function AppShell({ children, studio }: { children: ReactNode; studio: Studio }) {
  const { role, setRole, studioStaffRole, setStudioStaffRole, largeText, setLargeText, parentLang } =
    useAppSettings();
  const { data: subscription } = useSuspenseQuery(planBillingQuery(role === "new-teacher" ? "new-studio" : "demo"));
  const { data: profile } = useSuspenseQuery(teacherProfileQuery(role === "new-teacher" ? "new-studio" : "demo"));
  const [newNewsOpen, setNewNewsOpen] = useState(false);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  // Phones: the header tools (language, larger text, help, sign out...) fold behind a Menu button so the
  // header is one short row instead of half the screen. From 640px up they always show.
  const [toolsOpen, setToolsOpen] = useState(false);
  // Sample data (the demo studio, platform staff, local mock mode) is labelled so it is never
  // mistaken for a real studio, e.g. in screen recordings.
  const showDemoLabel = (role === "teacher" || role === "parent") && getStudioWorkspace().mode === "mock";
  const planLabel = subscription.plan === "base" ? "Base plan" : subscription.plan === "academy" ? "Academy plan" : "Pro plan";
  const planBadge = <Button asChild={role === "teacher"} variant={subscription.plan === "base" ? "outline" : "default"} className="min-h-12 h-auto rounded-full px-3 text-base" onClick={() => role === "new-teacher" && setNewPlanOpen(true)}>{role === "teacher" ? <Link to="/settings" hash="plan-and-billing">{planLabel}</Link> : planLabel}</Button>;
  const isTeacher = role === "teacher";
  const showSnapshot = isTeacher && canViewStudioSnapshot(studioStaffRole);
  const navItems = NAV.filter((item) =>
    "ownerAdminOnly" in item && item.ownerAdminOnly ? showSnapshot : true,
  );
  const { data: chatThreads } = useQuery({ ...chatThreadsQuery, enabled: isTeacher });
  const unread = chatThreads?.reduce((total, thread) => total + thread.unreadCount, 0) ?? 0;
  const chatNotification = unread > 0 ? <span role="status" aria-label={`${unread} unread chat messages`} className="absolute -right-5 -top-2 flex min-h-7 min-w-7 items-center justify-center rounded-full bg-destructive px-1.5 text-base font-semibold text-destructive-foreground">{unread > 99 ? "99+" : unread}</span> : null;
  const shellText = (key: ParentKey) => translate(parentLang, key);

  return (
    <div className="min-h-dvh md:flex">
      {/* Left rail on tablet and up (teacher only) */}
      {isTeacher && <nav aria-label="Main" className="hidden md:flex md:w-32 lg:w-40 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 sticky top-0 h-dvh overflow-y-auto overscroll-contain">
        <div className="flex justify-center px-1 py-3">
          <BrandLogo variant="stacked" alt="Keystone Music HQ" />
        </div>
        <div className="mb-3 mt-4 flex flex-col items-start gap-3 border-t border-sidebar-border px-1 pt-3"><p className="break-words text-base font-semibold">{profile?.studioName || studio.name}</p>{planBadge}</div>
        {navItems.map(({ to, labelKey, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/today" }}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-2 text-base font-semibold text-sidebar-foreground transition-[background-color,color,transform] duration-150 fine-hover:hover:bg-sidebar-accent fine-hover:hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground fine-hover:hover:bg-sidebar-primary fine-hover:hover:text-sidebar-primary-foreground" }}
          >
            <span className="relative flex size-6 items-center justify-center"><Icon className="size-6" aria-hidden />{to === "/chat" && chatNotification}</span>
            {shellText(labelKey)}
          </Link>
        ))}
      </nav>}

      <div className={`flex min-w-0 flex-1 flex-col ${isTeacher ? "pb-[calc(9rem+env(safe-area-inset-bottom))] sm:pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>
        <header className="grid min-w-0 gap-2 border-b border-border bg-background/95 px-4 py-3 md:px-8 xl:flex xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:flex-wrap">
            <span className={isTeacher ? "shrink-0 md:hidden" : "shrink-0"}>
              <BrandLogo variant="mark" alt="Keystone Music HQ" className="sm:hidden" />
              <BrandLogo variant="horizontal" alt="Keystone Music HQ" className="hidden sm:block" />
            </span>
            <div className="min-w-0 flex-1 break-words font-display text-lg font-semibold leading-tight sm:text-xl">{profile.studioName || studio.name}{showDemoLabel && <span className="mt-1 block w-fit rounded-full border border-amber-700/40 bg-amber-100 px-3 py-0.5 align-middle font-sans text-sm font-semibold whitespace-nowrap text-amber-900 sm:ml-3 sm:mt-0 sm:inline-block" data-testid="demo-studio-label">{shellText("demoStudio")}</span>}</div>
            {role !== "parent" && <div className="hidden sm:block"><ProfilePicture id="teacher" name={profile.name || "Teacher"} scope={role === "new-teacher" ? "new-studio" : "demo"} /></div>}
            {role !== "parent" && <div className={isTeacher ? "hidden sm:block md:hidden" : "hidden sm:block"}>{planBadge}</div>}
            <Button
              type="button"
              variant="outline"
              className="min-h-12 shrink-0 sm:hidden"
              aria-expanded={toolsOpen}
              aria-controls="app-header-tools"
              onClick={() => setToolsOpen((open) => !open)}
            >
              {toolsOpen ? <X aria-hidden /> : <Menu aria-hidden />}
              {toolsOpen ? shellText("close") : shellText("menu")}
            </Button>
          </div>
          <div id="app-header-tools" className={`${toolsOpen ? "flex" : "hidden"} min-w-0 flex-wrap items-center gap-3 border-t border-border pt-3 sm:flex sm:border-t-0 sm:pt-0 sm:gap-4`}>
            {role !== "parent" && <div className="sm:hidden">{planBadge}</div>}
            {role !== "parent" && <AppLanguageSwitcher />}
            {isTeacher && <TourHelpButton />}
            <div className="relative flex min-h-12 shrink-0 items-center gap-2">
              <Switch id="larger-text" className="relative z-10" checked={largeText} onCheckedChange={setLargeText} />
              <Label htmlFor="larger-text" className="flex min-h-12 cursor-pointer items-center text-base before:absolute before:inset-0">{shellText("largerText")}</Label>
            </div>
            {isTeacher && (
              <Button asChild variant="outline" className="min-h-12">
                <Link to="/support" activeProps={{ "aria-current": "page" }}>
                  <LifeBuoy aria-hidden />
                  {shellText("help")}
                </Link>
              </Button>
            )}
            {role === "new-teacher" && (
              <Button asChild variant="outline" className="min-h-12">
                <a href="/help" target="_blank" rel="noreferrer">
                  <LifeBuoy aria-hidden />
                  {shellText("help")}
                </a>
              </Button>
            )}
            {!isLiveAuthConfigured() && (
              <>
                <label className="flex w-full min-w-0 max-w-full items-center gap-2 text-base sm:w-auto">
                  <span className="sr-only sm:not-sr-only sm:text-muted-foreground">{shellText("viewingAs")}</span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="min-h-12 w-full min-w-0 max-w-full rounded-lg border-2 border-input bg-card px-2 min-readable font-semibold sm:w-auto sm:px-3"
                  >
                    <option value="teacher">Teacher ({profile?.name || "Ms Clarke"})</option>
                    <option value="parent">Parent (Wei Chen)</option>
                    <option value="new-teacher">New teacher (empty studio)</option>
                  </select>
                </label>
                {isTeacher && (
                  <label className="flex w-full min-w-0 max-w-full items-center gap-2 text-base sm:w-auto">
                    <span className="sr-only sm:not-sr-only sm:text-muted-foreground">Studio role</span>
                    <select
                      aria-label="Studio role"
                      value={studioStaffRole}
                      onChange={(e) => setStudioStaffRole(e.target.value as StudioStaffRole)}
                      className="min-h-12 w-full min-w-0 max-w-full rounded-lg border-2 border-input bg-card px-2 min-readable font-semibold sm:w-auto sm:px-3"
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher (no snapshot)</option>
                    </select>
                  </label>
                )}
              </>
            )}
            {isLiveAuthConfigured() && (
              <Button
                type="button"
                variant="outline"
                className="min-h-12"
                onClick={() => {
                  void signOutLocal({ redirectTo: "/login" });
                }}
              >
                {shellText("signOut")}
              </Button>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 md:px-8 md:py-8">{role === "new-teacher" && newPlanOpen ? <div className="mx-auto max-w-3xl"><Button variant="outline" onClick={() => setNewPlanOpen(false)}>Back to studio</Button><h1 className="mt-5 text-3xl font-semibold">Settings</h1><TeacherProfileSettings scope="new-studio"/><PlanBilling scope="new-studio" /><Button className="mt-5" variant="outline" onClick={() => { setNewPlanOpen(false); setNewNewsOpen(true); }}><Megaphone aria-hidden/>Studio news</Button></div> : role === "new-teacher" && newNewsOpen ? <div><Button variant="outline" onClick={() => setNewNewsOpen(false)}>Back to studio</Button><StudioNews scope="new-studio"/></div> : children}</main>
      </div>

      {/* Bottom tab bar on phones (teacher only) */}
      {isTeacher && <nav aria-label="Main" className={`fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 ${navItems.length > 7 ? "sm:grid-cols-4" : "sm:grid-cols-7"} border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden`}>
        {navItems.map(({ to, labelKey, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/today" }}
            className="min-readable flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 font-semibold text-sidebar-foreground transition-[background-color,color] duration-150 fine-hover:hover:bg-sidebar-accent/80 fine-hover:hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
            activeProps={{ className: "text-sidebar-primary underline underline-offset-4" }}
          >
            <span className="relative flex size-6 items-center justify-center"><Icon className="size-6" aria-hidden />{to === "/chat" && chatNotification}</span>
            {shellText(labelKey)}
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
