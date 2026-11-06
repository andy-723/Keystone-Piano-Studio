import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Lang } from "@/mocks/types";

export type Role = "teacher" | "parent" | "new-teacher";

type Settings = {
  role: Role;
  setRole: (r: Role) => void;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
  parentLang: Lang;
  setParentLang: (lang: Lang) => void;
};

const Ctx = createContext<Settings | null>(null);

function roleFromSearch(): Role | null {
  if (typeof window === "undefined") return null;
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "parent" || view === "teacher" || view === "new-teacher" ? view : null;
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  // Always start as teacher so SSR/client hydrate match; ?view= applies in the effect below.
  const [role, setRole] = useState<Role>("teacher");
  const [largeText, setLargeText] = useState(false);
  const [parentLang, setParentLang] = useState<Lang>("zh-CN");

  useEffect(() => {
    document.documentElement.classList.toggle("text-large", largeText);
  }, [largeText]);

  useEffect(() => {
    const sync = () => {
      const next = roleFromSearch();
      if (next) setRole(next);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return <Ctx.Provider value={{ role, setRole, largeText, setLargeText, parentLang, setParentLang }}>{children}</Ctx.Provider>;
}

export function useAppSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppSettings must be used inside AppSettingsProvider");
  return v;
}
