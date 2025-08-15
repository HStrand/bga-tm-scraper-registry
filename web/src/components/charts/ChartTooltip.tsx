import { useState, useEffect, useRef } from 'react';

interface ChartTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  children: React.ReactNode;
}

export function ChartTooltip({ visible, x, y, children }: ChartTooltipProps) {
  const [position, setPosition] = useState({ x, y });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 10;

    let adjustedX = x;
    let adjustedY = y;

    // Adjust horizontal position if tooltip would overflow
    if (x + rect.width + margin > viewportWidth) {
      adjustedX = x - rect.width - margin;
    }

    // Adjust vertical position if tooltip would overflow
    if (y + rect.height + margin > viewportHeight) {
      adjustedY = y - rect.height - margin;
    }

    // Ensure tooltip doesn't go off screen on the left or top
    adjustedX = Math.max(margin, adjustedX);
    adjustedY = Math.max(margin, adjustedY);

    setPosition({ x: adjustedX, y: adjustedY });
  }, [visible, x, y]);

  if (!visible) return null;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg p-3 pointer-events-none transition-opacity duration-200"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(10px, -50%)',
      }}
    >
      {children}
    </div>
  );
}

interface TooltipContentProps {
  title: string;
  stats: Array<{
    label: string;
    value: string | number;
    color?: string;
  }>;
}

export function TooltipContent({ title, stats }: TooltipContentProps) {
  return (
    <div className="text-sm">
      <div className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {title}
      </div>
      <div className="space-y-1">
        {stats.map((stat, index) => (
          <div key={index} className="flex justify-between items-center gap-3">
            <span className="text-slate-600 dark:text-slate-400">{stat.label}:</span>
            <span 
              className={`font-medium ${stat.color || 'text-slate-900 dark:text-slate-100'}`}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}