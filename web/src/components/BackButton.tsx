import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  fallbackPath: string;
  className?: string;
  label?: string;
}

export function BackButton({ fallbackPath, className = "", label = "Back" }: BackButtonProps) {
  const navigate = useNavigate();
  const handleBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallbackPath);
  }, [navigate, fallbackPath]);

  return (
    <button
      onClick={handleBack}
      aria-label="Go back"
      className={[
        "inline-flex items-center gap-2 rounded-md",
        "bg-white/90 dark:bg-slate-900/60",
        "text-slate-700 dark:text-slate-200",
        "px-3 py-1.5 shadow-sm",
        "ring-1 ring-inset ring-slate-200 dark:ring-slate-700",
        "hover:bg-slate-100 dark:hover:bg-slate-700",
        "transition-colors",
        className,
      ].join(" ")}
    >
      <ArrowLeft className="w-4 h-4" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
