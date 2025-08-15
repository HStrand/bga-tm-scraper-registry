import { useState, useRef } from 'react';
import { GenerationData } from '@/types/projectcard';
import { ChartTooltip, TooltipContent } from './ChartTooltip';

interface WinRateByGenerationProps {
  data: GenerationData[];
}

interface TooltipData {
  generation: number;
  winRate: number;
  gameCount: number;
}

export function WinRateByGeneration({ data }: WinRateByGenerationProps) {
  const [hoveredPoint, setHoveredPoint] = useState<TooltipData | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const chartRef = useRef<HTMLDivElement>(null);

  const handlePointHover = (pointData: TooltipData, event: React.MouseEvent) => {
    setHoveredPoint(pointData);
    setMousePos({ x: event.clientX, y: event.clientY });
  };

  const handlePointLeave = () => {
    setHoveredPoint(null);
  };

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Win Rate by Generation
        </h3>
        <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          No data available
        </div>
      </div>
    );
  }

  const maxWinRate = Math.max(...data.map(d => d.winRate));
  const minGeneration = Math.min(...data.map(d => d.generation));
  const maxGeneration = Math.max(...data.map(d => d.generation));

  // Create SVG path for the line
  const createPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return '';
    
    const pathData = points.map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${point.x} ${point.y}`;
    }).join(' ');
    
    return pathData;
  };

  // Chart dimensions
  const chartWidth = 400;
  const chartHeight = 200;
  const padding = 40;

  // Calculate points
  const points = data.map(d => ({
    x: padding + ((d.generation - minGeneration) / (maxGeneration - minGeneration)) * (chartWidth - 2 * padding),
    y: chartHeight - padding - (d.winRate / maxWinRate) * (chartHeight - 2 * padding)
  }));

  const pathData = createPath(points);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        Win Rate by Generation
      </h3>
      
      <div ref={chartRef} className="relative">
        <svg width={chartWidth} height={chartHeight} className="w-full h-auto">
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-slate-600" opacity="0.3"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
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
          
          {/* Line */}
          <path
            d={pathData}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-blue-500"
          />
          
          {/* Data points */}
          {points.map((point, index) => {
            const pointData: TooltipData = {
              generation: data[index].generation,
              winRate: data[index].winRate,
              gameCount: data[index].gameCount,
            };

            return (
              <g key={index}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="currentColor"
                  className="text-blue-500"
                />
                {/* Larger invisible circle for easier hovering */}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="12"
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={(e) => handlePointHover(pointData, e)}
                  onMouseLeave={handlePointLeave}
                />
              </g>
            );
          })}
          
          {/* Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(value => (
            <g key={value}>
              <text
                x={padding - 10}
                y={chartHeight - padding - (value / maxWinRate) * (chartHeight - 2 * padding)}
                textAnchor="end"
                dominantBaseline="middle"
                className="text-xs text-slate-600 dark:text-slate-400"
              >
                {(value * 100).toFixed(0)}%
              </text>
            </g>
          ))}
          
          {/* X-axis labels */}
          {data.map((d, index) => (
            <text
              key={d.generation}
              x={points[index].x}
              y={chartHeight - padding + 20}
              textAnchor="middle"
              className="text-xs text-slate-600 dark:text-slate-400"
            >
              {d.generation}
            </text>
          ))}
        </svg>
      </div>
      
      <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Shows win rate when card is played in each generation
      </div>

      <ChartTooltip
        visible={!!hoveredPoint}
        x={mousePos.x}
        y={mousePos.y}
      >
        {hoveredPoint && (
          <TooltipContent
            title={`Generation ${hoveredPoint.generation}`}
            stats={[
              {
                label: 'Win Rate',
                value: `${(hoveredPoint.winRate * 100).toFixed(1)}%`,
                color: 'text-blue-600 dark:text-blue-400'
              },
              {
                label: 'Games',
                value: hoveredPoint.gameCount.toLocaleString(),
              }
            ]}
          />
        )}
      </ChartTooltip>
    </div>
  );
}
