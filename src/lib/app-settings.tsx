import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Lang } from "@/mocks/types";

export type Role = "teacher" | "parent" | "new-teacher";

/** Teacher Library YouTube/Vimeo links — off until reviewed (K8). Not for student recordings. */
export const videoLinksEnabled = false;

type Settings = {
  role: Role;
  setRole: (r: Role) => void;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
  parentLang: Lang;
  setParentLang: (lang: Lang) => void;
  videoLinksEnabled: boolean;
};

const Ctx = createContext<Settings | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("teacher");
  const [largeText, setLargeText] = useState(false);
  const [parentLang, setParentLang] = useState<Lang>("zh-CN");

  useEffect(() => {
    document.documentElement.classList.toggle("text-large", largeText);
  }, [largeText]);

  return (
    <Ctx.Provider
      value={{
        role,
        setRole,
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
