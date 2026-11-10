import { QueryClient, QueryClientProvider, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Suspense, useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppSettingsProvider, useAppSettings } from "@/lib/app-settings";
import { AppShell } from "@/components/AppShell";
import { ParentPortal } from "@/components/ParentPortal";
import { parentSessionQuery, parentHomeQuery, parentChatQuery, parentProgressQuery, parentInvoicesQuery } from "@/lib/parent-queries";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { getStudio } from "@/services/roster";
import { setupQuery } from "@/lib/setup-queries";
import { planBillingQuery } from "@/lib/plan-queries";
import { NewTeacherSetup } from "@/components/NewTeacherSetup";
import { teacherProfileQuery } from '@/lib/community-queries';

const studioQuery = queryOptions({ queryKey: ["studio"], queryFn: getStudio });

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-base text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Button asChild><Link to="/">Go home</Link></Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button variant="outline" asChild><Link to="/">Go home</Link></Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(teacherProfileQuery()),context.queryClient.ensureQueryData(teacherProfileQuery('new-studio')),context.queryClient.ensureQueryData(planBillingQuery()), context.queryClient.ensureQueryData(planBillingQuery("new-studio")), context.queryClient.ensureQueryData(studioQuery), context.queryClient.ensureQueryData(parentSessionQuery), context.queryClient.ensureQueryData(parentHomeQuery), context.queryClient.ensureQueryData(parentChatQuery), context.queryClient.ensureQueryData(parentProgressQuery), context.queryClient.ensureQueryData(parentInvoicesQuery)]); },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Keystone Music HQ — Studio OS & LMS management platform" },
      { name: "description", content: "Keystone Music HQ — studio OS & LMS management platform for music teachers." },
      { property: "og:title", content: "Keystone Music HQ — Studio OS & LMS management platform" },
      { property: "og:description", content: "Keystone Music HQ — studio OS & LMS management platform for music teachers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Instrument+Sans:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AppSettingsProvider>
        <RoleGate />
        <Toaster position="top-center" toastOptions={{ className: "!text-base !min-h-14" }} />
      </AppSettingsProvider>
    </QueryClientProvider>
  );
}

function RoleGate() {
  const { role } = useAppSettings();
  const { data: studio } = useSuspenseQuery(studioQuery);
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  if (pathname === "/welcome" || pathname === "/pricing") return <Outlet />;
  if (role === "new-teacher") return <Suspense fallback={<p className="p-6">Opening your new studio…</p>}><NewTeacherGate /></Suspense>;
  return (
    <AppShell studio={studio}>
      {role === "parent" ? (
        <Suspense fallback={<p>Opening your family portal…</p>}><ParentPortal /></Suspense>
      ) : (
        /* Required: nested routes render here. */
        <Outlet />
      )}
    </AppShell>
  );
}

function NewTeacherGate() {
  const { data } = useSuspenseQuery(setupQuery);
  return <AppShell studio={{ id: "new-studio", name: data.studio.name || "Keystone Music HQ · New studio", gstRegistered: data.tax.registration === "yes", abn: data.tax.abn, timezone: "Australia/Melbourne" }}><NewTeacherSetup /></AppShell>;
}
