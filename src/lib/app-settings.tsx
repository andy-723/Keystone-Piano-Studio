import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "teacher" | "parent";

type Settings = {
  role: Role;
  setRole: (r: Role) => void;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
};

const Ctx = createContext<Settings | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("teacher");
  const [largeText, setLargeText] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("text-large", largeText);
  }, [largeText]);

  return <Ctx.Provider value={{ role, setRole, largeText, setLargeText }}>{children}</Ctx.Provider>;
}

export function useAppSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppSettings must be used inside AppSettingsProvider");
  return v;
}
