import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { GenerationDistributionData } from '@/types/projectcard';

interface GenerationDistributionProps {
  data: GenerationDistributionData[];
  title?: string;
  // Optional Tailwind height class for the inner chart container
  heightClass?: string;
}

export function GenerationDistribution({
  data,
  title = 'Generation Distribution',
  heightClass = 'h-56',
}: GenerationDistributionProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {title}
        </h3>
        <div className="flex items-center justify-center h-56 text-slate-500 dark:text-slate-400">
          No data available
        </div>
      </div>
    );
  }

  const chartData = data.map(d => ({
    generation: d.generation,
    count: d.count,
    percentage: d.percentage,
    label: `${d.generation}`,
  }));

  const total = chartData.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {title}
      </h3>

      <div className={heightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <defs>
              <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.4" />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="generation"
              tick={{ fontSize: 12 }}
              className="text-slate-600 dark:text-slate-400"
              label={{ value: 'Generation', position: 'insideBottom', offset: -5 }}
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
              formatter={(value: number, name: string, props: any) => {
                if (name === 'count') return [value, 'Plays'];
                return [value, name];
              }}
              labelFormatter={(label: string, payload) => {
                const item = payload && payload[0] ? payload[0].payload as any : null;
                return item ? `Generation ${item.generation}` : '';
              }}
              // Custom tooltip content to include percentage
              content={({ active, payload }) => {
                if (active && payload && payload.length > 0) {
                  const d = payload[0].payload as any;
                  return (
                    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm">
                      <div className="font-semibold text-slate-100 mb-2">Generation {d.generation}</div>
                      <div className="space-y-1 text-slate-300">
                        <div>Plays: {d.count.toLocaleString()}</div>
                        <div>Share: {d.percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" fill="url(#genGrad)" radius={[4, 4, 0, 0]} className="hover:opacity-80 transition-opacity">
              <LabelList
                dataKey="count"
                position="top"
                content={(props: any) => {
                  const { x, y, width, value } = props;
                  const minToShow = Math.max(2, total * 0.02);
                  if (typeof value !== 'number' || value < minToShow) return null;
                  const cx = Number(x) + Number(width) / 2;
                  const cy = Number(y) - 4;
                  return (
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-700 dark:fill-slate-300"
                    >
                      {value}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
        Total plays: {total.toLocaleString()}
      </div>
    </div>
  );
}
