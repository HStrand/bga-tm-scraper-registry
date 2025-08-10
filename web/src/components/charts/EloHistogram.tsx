import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { HistogramBin } from '@/types/corporation';

interface EloHistogramProps {
  data: HistogramBin[];
  title?: string;
  useRedGreenColors?: boolean;
  // Optional Tailwind height class for the inner chart container
  heightClass?: string;
}

export function EloHistogram({ data, title = "Elo Distribution", useRedGreenColors = false, heightClass = "h-56" }: EloHistogramProps) {
  // Function to get color based on bin value (for red/green coloring)
  const getBarColor = (bin: HistogramBin) => {
    if (!useRedGreenColors) return "url(#eloGrad)";
    
    const midpoint = (bin.min + bin.max) / 2;
    if (midpoint < -1) return "#ef4444"; // red-500 for losses
    if (midpoint > 1) return "#22c55e"; // green-500 for gains
    return "#6b7280"; // gray-500 for near-zero
  };
  return (
    <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {title}
      </h3>
      
      <div className={heightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <defs>
              <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="grayGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6b7280" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#6b7280" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: 12 }}
              className="text-slate-600 dark:text-slate-400"
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              className="text-slate-600 dark:text-slate-400"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid rgb(203 213 225)',
                borderRadius: '8px',
                color: '#0f172a',
              }}
              formatter={(value: number) => [value, 'Games']}
              labelFormatter={(label: string) => `Elo Range: ${label}`}
            />
            <Bar 
              dataKey="count" 
              fill={useRedGreenColors ? undefined : "url(#eloGrad)"}
              radius={[4, 4, 0, 0]}
              className="hover:opacity-80 transition-opacity"
            >
              {useRedGreenColors && data.map((entry, index) => {
                const midpoint = (entry.min + entry.max) / 2;
                let fill;
                if (midpoint < -1) fill = "url(#redGrad)";
                else if (midpoint > 1) fill = "url(#greenGrad)";
                else fill = "url(#grayGrad)";
                
                return <Cell key={`cell-${index}`} fill={fill} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
        Total games: {data.reduce((sum, bin) => sum + bin.count, 0).toLocaleString()}
      </div>
    </div>
  );
}
