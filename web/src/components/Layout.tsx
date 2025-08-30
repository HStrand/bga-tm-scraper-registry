import React, { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import {
  Home,
  Building2,
  Layers,
  Target,
  Trophy,
  Flag,
  Award,
  X,
  Menu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

type IconType = React.ElementType;

interface NavLinkItem {
  to: string;
  label: string;
  icon: IconType;
}

const navItems: NavLinkItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/corporations", label: "Corporations", icon: Building2 },
  { to: "/cards", label: "Project Cards", icon: Layers },
  { to: "/preludes", label: "Preludes", icon: ChevronLeft },
  { to: "/milestones", label: "Milestones", icon: Flag },
  { to: "/awards", label: "Awards", icon: Award },
  { to: "/leaderboards", label: "Leaderboards", icon: Trophy },
];

function usePersistentExpanded(key = "sidebarExpanded", defaultValue = true) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return defaultValue;
      return v === "true";
    } catch {
      return defaultValue;
    }
  });
  const update = (val: boolean) => {
    setExpanded(val);
    try {
      localStorage.setItem(key, String(val));
    } catch {}
  };
  const toggle = () => update(!expanded);
  return { expanded, update, toggle };
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  // Mobile drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Desktop sidebar expanded/collapsed (persistent)
  const { expanded: isExpanded, toggle: toggleExpanded, update: setExpanded } =
    usePersistentExpanded("sidebarExpanded", true);

  // Close the drawer on route changes
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  // Close drawer on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const NavLinks = useCallback(
    ({ showLabels }: { showLabels: boolean }) => (
      <nav className="mt-3 space-y-1">
        {navItems.map((item) => {
          const active =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={clsx(
                "group flex items-center rounded-xl transition-all",
                showLabels ? "gap-3 px-4 py-3" : "justify-center px-3 py-3",
                showLabels ? "text-lg font-semibold" : "text-[0px] font-semibold",
                active
                  ? "bg-amber-50 dark:bg-amber-900/25 text-amber-900 dark:text-amber-100 ring-1 ring-amber-200/60 dark:ring-amber-700/40"
                  : "text-slate-800 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-700/70"
              )}
            >
              <Icon
                className={clsx(
                  showLabels ? "w-6 h-6" : "w-6 h-6",
                  active
                    ? "text-amber-600 dark:text-amber-300"
                    : "text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200"
                )}
              />
              <span
                className={clsx(
                  "transition-opacity",
                  showLabels ? "opacity-100" : "opacity-0 pointer-events-none hidden"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    ),
    [location.pathname]
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-800/80 backdrop-blur border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3 px-4 h-14">
          {/* Hamburger (opens mobile drawer) */}
          <button
            className="inline-flex items-center justify-center w-10 h-10 rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 md:hidden"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-controls="app-drawer"
            aria-expanded={isDrawerOpen}
          >
            <Menu className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>

          {/* Brand */}
          <div className="flex items-center gap-2">
            <span className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Terraforming Mars Statistics
            </span>
          </div>
        </div>
      </header>

      {/* Desktop sidebar (persistent, collapsible) */}
      <aside
        className={clsx(
          "hidden md:flex fixed inset-y-0 left-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-sm",
          isExpanded ? "w-72" : "w-20"
        )}
        aria-label="Sidebar"
      >
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sidebar header with expand/collapse */}
          <div className="h-14 border-b border-slate-200 dark:border-slate-700 px-3 flex items-center justify-between">
            {isExpanded ? (
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Navigation
              </span>
            ) : (
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 sr-only">
                Navigation
              </span>
            )}
            <button
              onClick={toggleExpanded}
              className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronLeft className="w-4 h-4 text-slate-700 dark:text-slate-200" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-700 dark:text-slate-200" />
              )}
            </button>
          </div>

          {/* Sidebar content */}
          <div className={clsx("p-3 overflow-y-auto", isExpanded ? "px-3" : "px-2")}>
            <NavLinks showLabels={isExpanded} />
          </div>

          {/* Footer */}
          <div className="mt-auto p-3 border-t border-slate-200 dark:border-slate-700">
            <div
              className={clsx(
                "text-xs text-slate-500 dark:text-slate-400",
                isExpanded ? "text-left" : "text-center"
              )}
            >
              Made by StrandedKnight
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop (mobile) */}
      <div
        className={clsx(
          "fixed inset-0 z-50 bg-black/40 transition-opacity md:hidden",
          isDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsDrawerOpen(false)}
        aria-hidden={!isDrawerOpen}
      />

      {/* Drawer (mobile hamburger menu) */}
      <aside
        id="app-drawer"
        className={clsx(
          "fixed z-[60] inset-y-0 left-0 w-[320px] bg-white dark:bg-slate-800 md:hidden",
          "border-r border-slate-200 dark:border-slate-700 shadow-xl",
          "transform transition-transform",
          isDrawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
      >
        {/* Drawer header */}
        <div className="h-14 border-b border-slate-200 dark:border-slate-700 px-4 flex items-center justify-between">
          <span className="text-base font-semibold text-slate-900 dark:text-slate-100">Navigation</span>
          <button
            className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Close navigation menu"
          >
            <X className="w-4 h-4 text-slate-700 dark:text-slate-200" />
          </button>
        </div>

        {/* Drawer content */}
        <div className="p-4">
          <NavLinks showLabels={true} />
        </div>

        {/* Subtle footer */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500 dark:text-slate-400">Made by StrandedKnight</div>
        </div>
      </aside>

      {/* Main content (shifted for desktop sidebar) */}
      <main className={clsx(isExpanded ? "md:pl-72" : "md:pl-20")}>
        <div className="container mx-auto px-4 py-6 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
