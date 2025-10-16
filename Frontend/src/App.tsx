import React, { useEffect, useState } from "react";
import HomePage from "@/pages/HomePage";
import { Sun, Moon } from "lucide-react";
import logoUrl from '../lulu-tv.svg';

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored === "light" || stored === "dark") return stored;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    return prefersDark ? "dark" : "light";
  } catch {
    return "dark";
  }
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    try {
      localStorage.setItem("theme", theme);
    } catch {}
    const root = document.documentElement;
    root.classList.remove("theme-dark", "theme-light");
    root.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className={`min-h-screen antialiased ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <header className="sticky top-0 z-40 border-b backdrop-blur bg-[color:var(--surface)]/70 border-[color:var(--border)]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoUrl} alt="Logo" className="w-6 h-6" />
            <h1 className="text-lg md:text-xl tracking-tight font-bold" style={{ color: "var(--text)" }}>
            LULU-TV
            </h1>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="ui-btn ui-btn-ghost rounded-full p-2"
              aria-label={theme === "dark" ? "Switch to Day Mode" : "Switch to Night Mode"}
              title={theme === "dark" ? "Day Mode" : "Night Mode"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="text-xs md:text-sm" style={{ color: "var(--muted)" }}>
              Browse languages, countries & channels
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <HomePage />
      </main>
    </div>
  );
}
