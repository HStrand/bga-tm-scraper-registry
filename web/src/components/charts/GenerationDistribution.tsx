import { GenerationDistributionData } from '@/types/projectcard';

interface GenerationDistributionProps {
  data: GenerationDistributionData[];
}

export function GenerationDistribution({ data }: GenerationDistributionProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Generation Distribution
        </h3>
        <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          No data available
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count));
  const minGeneration = Math.min(...data.map(d => d.generation));
  const maxGeneration = Math.max(...data.map(d => d.generation));

  // Chart dimensions
  const chartWidth = 400;
  const chartHeight = 200;
  const padding = 40;
  const barPadding = 4;

  // Calculate bar width
  const availableWidth = chartWidth - 2 * padding;
  const barWidth = Math.max(20, (availableWidth - (data.length - 1) * barPadding) / data.length);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        Generation Distribution
      </h3>
      
      <div className="relative">
        <svg width={chartWidth} height={chartHeight} className="w-full h-auto">
          {/* Grid lines */}
          <defs>
            <pattern id="genGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-slate-600" opacity="0.3"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#genGrid)" />
          
          {/* Axes */}
          <line 
            x1={padding} 
            y1={chartHeight - padding} 
            x2={chartWidth - padding} 
            y2={chartHeight - padding} 
            stroke="currentColor" 
            strokeWidth="2" 
            className="text-slate-400 dark:text-slate-500"
          />
          <line 
            x1={padding} 
            y1={padding} 
            x2={padding} 
            y2={chartHeight - padding} 
            stroke="currentColor" 
            strokeWidth="2" 
            className="text-slate-400 dark:text-slate-500"
          />
          
          {/* Bars */}
          {data.map((d, index) => {
            const barHeight = (d.count / maxCount) * (chartHeight - 2 * padding);
            const x = padding + index * (barWidth + barPadding);
            const y = chartHeight - padding - barHeight;
            
            return (
              <g key={d.generation}>
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill="currentColor"
                  className="text-blue-500 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <title>
                    Generation {d.generation}: {d.count} plays ({d.percentage.toFixed(1)}% of total)
                  </title>
                </rect>
                
                {/* Value label on top of bar */}
                {barHeight > 20 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 5}
                    textAnchor="middle"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    {d.count}
                  </text>
                )}
              </g>
            );
          })}
          
          {/* Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const value = Math.round(maxCount * ratio);
            const y = chartHeight - padding - ratio * (chartHeight - 2 * padding);
            
            return (
              <g key={ratio}>
                <text
                  x={padding - 10}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="text-xs text-slate-600 dark:text-slate-400"
                >
                  {value}
                </text>
              </g>
            );
          })}
          
          {/* X-axis labels */}
          {data.map((d, index) => {
            const x = padding + index * (barWidth + barPadding) + barWidth / 2;
            
            return (
              <text
                key={d.generation}
                x={x}
                y={chartHeight - padding + 20}
                textAnchor="middle"
                className="text-xs text-slate-600 dark:text-slate-400"
              >
                {d.generation}
              </text>
            );
          })}
        </svg>
      </div>
      
      <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Shows when this card is typically played
      </div>
    </div>
  );
}
