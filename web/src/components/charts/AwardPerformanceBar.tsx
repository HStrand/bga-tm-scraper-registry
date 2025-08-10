import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CorporationAwardStats } from '@/types/corporation';

interface AwardPerformanceBarProps {
  data: CorporationAwardStats[];
  title?: string;
}

export function AwardPerformanceBar({ data, title = "Award Performance" }: AwardPerformanceBarProps) {
  // Convert data to chart format
  const chartData = data.map((item: any) => {
    const award = item.award ?? item.Award ?? '';
    const winRateRaw = item.winRate ?? item.WinRate ?? 0;
    const wonCount = item.wonCount ?? item.WonCount ?? 0;
    const totalGames = item.totalGames ?? item.TotalGames ?? 0;
    const total = totalGames > 0 ? totalGames : 0;
    const computedRate = total > 0 ? (wonCount / total) : 0;
    const winRate = (winRateRaw && winRateRaw > 0 ? winRateRaw : computedRate) * 100; // ensure percentage
    return {
      award,
      winRate,
      wonCount,
      totalGames,
      label: award,
    };
  });

  // Color based on win rate
  const getBarColor = (winRate: number) => {
    if (winRate >= 40) return '#22c55e'; // green-500 for high win rates
    if (winRate >= 20) return '#eab308'; // yellow-500 for medium win rates
    return '#ef4444'; // red-500 for low win rates
  };

  if (chartData.length === 0) {
    return (
      <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {title}
        </h3>
        <div className="h-56 flex items-center justify-center text-slate-500 dark:text-slate-400">
          No award data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {title}
      </h3>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={chartData} 
            layout="horizontal"
            margin={{ top: 20, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              className="text-slate-600 dark:text-slate-400"
              label={{ value: 'Win Rate (%)', position: 'insideBottom', offset: -5 }}
            />
            <YAxis 
              type="category"
              dataKey="award"
              tick={{ fontSize: 12 }}
              className="text-slate-600 dark:text-slate-400"
              width={75}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid rgb(203 213 225)',
                borderRadius: '8px',
                color: '#0f172a',
              }}
              formatter={(value: number, name: string, props: any) => [
                `${value.toFixed(1)}%`,
                'Win Rate'
              ]}
              labelFormatter={(label: string) => `${label}`}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length > 0) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm">
                      <div className="font-semibold text-slate-100 mb-2">{data.award}</div>
                      <div className="space-y-1 text-slate-300">
                        <div>Win Rate: {data.winRate.toFixed(1)}%</div>
                        <div>Won: {data.wonCount} times</div>
                        <div>Total Games: {data.totalGames}</div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar 
              dataKey="winRate" 
              radius={[0, 4, 4, 0]}
              className="hover:opacity-80 transition-opacity"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.winRate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <div>
          {chartData.length} awards tracked
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>High (40%+)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Medium (20-40%)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Low ({`<20%`})</span>
          </div>
        </div>
      </div>
    </div>
  );
}
