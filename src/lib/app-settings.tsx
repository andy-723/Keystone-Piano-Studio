import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Lang } from "@/mocks/types";
import {
  hydrateSiteLangFromStorage,
  setSiteLang,
  useSiteLang,
  type SiteLang,
} from "@/i18n/marketing/site-lang";

export type Role = "teacher" | "parent" | "new-teacher";

/** Live studio membership role. Demo defaults to owner (solo teacher). */
export type StudioStaffRole = "owner" | "admin" | "teacher";

/** Teacher Library YouTube/Vimeo links — off until reviewed (K8). Not for student recordings. */
export const videoLinksEnabled = false;

export function canViewStudioSnapshot(staffRole: StudioStaffRole): boolean {
  return staffRole === "owner" || staffRole === "admin";
}

type Settings = {
  role: Role;
  setRole: (r: Role) => void;
  studioStaffRole: StudioStaffRole;
  setStudioStaffRole: (r: StudioStaffRole) => void;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
  /** Shared UI language (same store as marketing `keystone.siteLang`). */
  parentLang: Lang;
  setParentLang: (lang: Lang) => void;
  videoLinksEnabled: boolean;
};

const Ctx = createContext<Settings | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("teacher");
  const [studioStaffRole, setStudioStaffRole] = useState<StudioStaffRole>("owner");
  const [largeText, setLargeText] = useState(false);
  // Keep the shared language store hydrated for signed-in routes (marketing navbar may not mount).
  useEffect(() => {
    hydrateSiteLangFromStorage();
  }, []);
  const parentLang = useSiteLang();
  const setParentLang = (lang: Lang) => setSiteLang(lang as SiteLang);

  useEffect(() => {
    document.documentElement.classList.toggle("text-large", largeText);
  }, [largeText]);

  useEffect(() => {
    document.documentElement.lang = parentLang === "en" ? "en-AU" : parentLang;
  }, [parentLang]);

  return (
    <Ctx.Provider
      value={{
        role,
        setRole,
        studioStaffRole,
        setStudioStaffRole,
        largeText,
        setLargeText,
        parentLang,
        setParentLang,
        videoLinksEnabled,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAppSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppSettings must be used inside AppSettingsProvider");
  return v;
}

/** Settings when inside the provider, otherwise null (for guards that also render standalone). */
export function useOptionalAppSettings() {
  return useContext(Ctx);
}
