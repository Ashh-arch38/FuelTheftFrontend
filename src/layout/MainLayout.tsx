// src/layouts/MainLayout.tsx
import React, { useState, useEffect, useLayoutEffect } from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Apply dark class ASAP to reduce FOUC (runs before paint)
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("darkMode");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const shouldEnableDark = saved === "true" || (!saved && !!prefersDark);
    setDarkMode(shouldEnableDark);
    document.documentElement.classList.toggle("dark", shouldEnableDark);
  }, []);

  // Restore sidebar collapsed state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved != null) {
      try {
        setCollapsed(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Listen to OS theme changes and sync if user hasn't explicitly chosen
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("darkMode");
    // Only auto-follow system if user hasn't set a preference
    if (saved !== null) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setDarkMode(e.matches);
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("darkMode", String(next)); // lock user choice
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next);
      }
      return next;
    });
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_collapsed", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // If you plan a mobile overlay sidebar, you can change the margin rule below conditionally
  const mainMarginClass = collapsed ? "ml-16" : "ml-64";

  return (
    <div
      className="flex min-h-screen text-gray-900 dark:text-gray-100 transition-colors duration-300
                 bg-gradient-to-b from-[#e0f2fe] to-[#f0f9ff] dark:from-gray-900 dark:to-gray-800"
    >
      <Sidebar
        collapsed={collapsed}
        toggleCollapsed={toggleCollapsed}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
      />

      <div className={`flex-1 transition-all duration-300 ${mainMarginClass}`}>
        <Navbar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;
