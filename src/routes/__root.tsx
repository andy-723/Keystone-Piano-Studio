import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useNavigate,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Suspense, useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AppSettingsProvider, useAppSettings } from "@/lib/app-settings";
import { AppShell } from "@/components/AppShell";
import { LiveAuthGuard } from "@/components/LiveAuthGuard";
import { isFocusFlowPath } from "@/lib/auth-paths";
import { ParentPortal } from "@/components/ParentPortal";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { getStudio } from "@/services/roster";
import { setupQuery } from "@/lib/setup-queries";
import { planBillingQuery } from "@/lib/plan-queries";
import { NewTeacherSetup } from "@/components/NewTeacherSetup";
import { teacherProfileQuery } from "@/lib/community-queries";
import { TourProvider } from "@/components/tour/Tour";
import { STUDIO_TOUR } from "@/lib/tour-steps";

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
          <Button asChild>
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    console.error(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">This page didn't load</h1>
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
          <Button variant="outline" asChild>
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context, location }) => {
    // Admin, auth, join/intake and public pages do not need studio/parent fixture priming.
    // Parent portal queries load when ParentPortal mounts (avoids ~0.8s mock delay on every boot).
    if (isFocusFlowPath(location.pathname)) return;
    await Promise.all([
      context.queryClient.ensureQueryData(teacherProfileQuery()),
      context.queryClient.ensureQueryData(teacherProfileQuery("new-studio")),
      context.queryClient.ensureQueryData(planBillingQuery()),
      context.queryClient.ensureQueryData(planBillingQuery("new-studio")),
      context.queryClient.ensureQueryData(studioQuery),
    ]);
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Keystone Music HQ — Studio OS & LMS management platform" },
      {
        name: "description",
        content: "Keystone Music HQ — studio OS & LMS management platform for music teachers.",
      },
      { property: "og:title", content: "Keystone Music HQ — Studio OS & LMS management platform" },
      {
        property: "og:description",
        content: "Keystone Music HQ — studio OS & LMS management platform for music teachers.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#15100D" },
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
        href: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Focus flows (incl. /admin) must not wait on studio fixture suspense.
  if (isFocusFlowPath(pathname)) {
    return (
      <LiveAuthGuard>
        <Suspense fallback={<p className="p-6">Opening…</p>}>
          <Outlet />
        </Suspense>
      </LiveAuthGuard>
    );
  }
  if (role === "new-teacher")
    return (
      <LiveAuthGuard>
        <Suspense fallback={<p className="p-6">Opening your new studio…</p>}>
          <NewTeacherGate />
        </Suspense>
      </LiveAuthGuard>
    );
  return (
    <LiveAuthGuard>
      <StudioShell role={role} />
    </LiveAuthGuard>
  );
}

function StudioShell({ role }: { role: "teacher" | "parent" }) {
  const { data: studio } = useSuspenseQuery(studioQuery);
  return (
    <StudioTour enabled={role === "teacher"}>
      <AppShell studio={studio}>
        {role === "parent" ? (
          <Suspense fallback={<p>Opening your family portal…</p>}>
            <ParentPortal />
          </Suspense>
        ) : (
          /* Required: nested routes render here. */
          <Outlet />
        )}
      </AppShell>
    </StudioTour>
  );
}

/** Studio tour for owners and teachers; the family portal mounts its own tour. */
function StudioTour({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (!enabled) return <>{children}</>;
  return (
    <TourProvider
      tourId="studio"
      steps={STUDIO_TOUR}
      cardBottomClass="bottom-[calc(9rem+env(safe-area-inset-bottom))] sm:bottom-[calc(5rem+env(safe-area-inset-bottom))]"
      onStep={(step) => {
        if (step.route && step.route !== pathname) void navigate({ to: step.route });
      }}
    >
      {children}
    </TourProvider>
  );
}

function NewTeacherGate() {
  const { data } = useSuspenseQuery(setupQuery);
  return (
    <NewTeacherSetup
      shellStudio={{
        id: "new-studio",
        name: data.studio.name || "Keystone Music HQ · New studio",
        gstRegistered: data.tax.registration === "yes",
        abn: data.tax.abn,
        timezone: "Australia/Melbourne",
      }}
    />
  );
}
