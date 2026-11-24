export type ThemeMode = "auto" | "light" | "dark";

export function getSystemIsDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(mode: ThemeMode): boolean {
  if (typeof window === "undefined") return true;
  const isDark = mode === "dark" || (mode === "auto" && getSystemIsDark());
  const root = document.documentElement;
  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  return isDark;
}
