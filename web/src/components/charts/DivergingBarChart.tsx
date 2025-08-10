import { useMemo } from 'react';

interface DivergingBarData {
  label: string;
  value: number;
  count: number;
  baseline?: number; // For win rate charts, this would be the global win rate
}

interface DivergingBarChartProps {
  data: DivergingBarData[];
  title: string;
  valueLabel: string;
  formatValue: (value: number) => string;
  sortBy?: 'value' | 'count' | 'label';
  useRedGreenColors?: boolean;
  height?: number;
  // New: filter out low-sample items to improve representativeness
  minCount?: number;
  // New: optionally weight bar width by sample size to de-emphasize tiny samples
  weightByCount?: boolean;
}

export function DivergingBarChart({
  data,
  title,
  valueLabel,
  formatValue,
  sortBy = 'value',
  useRedGreenColors = false,
  height = 400,
  minCount = 30,
  weightByCount = false,
}: DivergingBarChartProps) {
  const filtered = useMemo(() => {
    return (data || []).filter(d => (d?.count ?? 0) >= minCount);
  }, [data, minCount]);

  const sortedData = useMemo(() => {
    const sorted = [...filtered];
    switch (sortBy) {
      case 'value':
        return sorted.sort((a, b) => b.value - a.value);
      case 'count':
        return sorted.sort((a, b) => b.count - a.count);
      case 'label':
        return sorted.sort((a, b) => a.label.localeCompare(b.label));
      default:
        return sorted;
    }
  }, [filtered, sortBy]);

  const maxAbsValue = useMemo(() => {
    return Math.max(0, ...sortedData.map(d => Math.abs(d.value)));
  }, [sortedData]);

  const maxCount = useMemo(() => {
    return Math.max(1, ...sortedData.map(d => d.count));
  }, [sortedData]);

  if (sortedData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {title}
        </h3>
        <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          No data available
        </div>
      </div>
    );
  }

  const barHeight = Math.max(24, Math.min(40, (height - 120) / sortedData.length));
  const chartHeight = sortedData.length * (barHeight + 8) + 40;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {title}
      </h3>
      
      <div className="relative" style={{ height: chartHeight }}>
        <svg width="100%" height={chartHeight} className="overflow-visible">
          {/* Center line */}
          <line
            x1="50%"
            y1="20"
            x2="50%"
            y2={chartHeight - 20}
            stroke="currentColor"
            strokeWidth="1"
            className="text-slate-300 dark:text-slate-600"
            strokeDasharray="2,2"
          />
          
          {sortedData.map((item, index) => {
            const y = 20 + index * (barHeight + 8);
            const valueScale = maxAbsValue > 0 ? Math.abs(item.value) / maxAbsValue : 0;
            const countScale = weightByCount ? Math.sqrt(item.count / maxCount) : 1;
            const barWidth = valueScale * 40 * countScale; // weighted max width on each side
            const isPositive = item.value >= 0;
            
            let barColor: string;
            if (useRedGreenColors) {
              barColor = isPositive ? '#10b981' : '#ef4444'; // green-500 : red-500
            } else {
              barColor = '#3b82f6'; // blue-500
            }
            
            return (
              <g key={item.label}>
                {/* Bar */}
                <rect
                  x={isPositive ? '50%' : `${50 - barWidth}%`}
                  y={y}
                  width={`${barWidth}%`}
                  height={barHeight}
                  fill={barColor}
                  opacity={0.8}
                  rx="2"
                />
                
                {/* Label and count with clamping + truncation to prevent overflow */}
                {(() => {
                  const proposed = isPositive ? (50 + barWidth + 2) : (50 - barWidth - 2);
                  let labelXNum = proposed;
                  let labelAnchor: 'start' | 'end' = isPositive ? 'start' : 'end';
                  // Clamp near edges and flip anchor when close to the boundary
                  if (isPositive && proposed > 92) { labelXNum = 98; labelAnchor = 'end'; }
                  if (!isPositive && proposed < 8) { labelXNum = 2; labelAnchor = 'start'; }
                  const displayLabel = item.label.length > 22 ? item.label.slice(0, 22) + '…' : item.label;
                  return (
                    <>
                      <text
                        x={`${labelXNum}%`}
                        y={y + barHeight / 2}
                        dy="0.35em"
                        textAnchor={labelAnchor}
                        className="text-sm font-medium fill-slate-900 dark:fill-slate-100"
                      >
                        {displayLabel}
                      </text>
                      <text
                        x={`${labelXNum}%`}
                        y={y + barHeight / 2 + 12}
                        dy="0.35em"
                        textAnchor={labelAnchor}
                        className="text-xs fill-slate-500 dark:fill-slate-400"
                      >
                        n={item.count}
                      </text>
                    </>
                  );
                })()}
                
                {/* Value */}
                <text
                  x={isPositive ? `${50 + barWidth / 2}%` : `${50 - barWidth / 2}%`}
                  y={y + barHeight / 2}
                  dy="0.35em"
                  textAnchor="middle"
                  className="text-xs font-semibold fill-white"
                >
                  {formatValue(item.value)}
                </text>
                
              </g>
            );
          })}
        </svg>
        
        {/* Legend */}
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-xs text-slate-500 dark:text-slate-400 text-center">
          <div>{valueLabel}</div>
          <div className="mt-1">n≥{minCount}{weightByCount ? ' • width weighted by √n' : ''}</div>
        </div>
      </div>
    </div>
  );
}
