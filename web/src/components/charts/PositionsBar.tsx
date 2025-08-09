import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PositionsBarProps {
  data: Record<number, number>;
  title?: string;
}

export function PositionsBar({ data, title = "Position Distribution" }: PositionsBarProps) {
  // Convert data to chart format
  const chartData = Object.entries(data)
    .map(([position, count]) => ({
      position: parseInt(position),
      count,
      label: position === '1' ? '🥇 1st' : position === '2' ? '🥈 2nd' : position === '3' ? '🥉 3rd' : `${position}th`,
    }))
    .sort((a, b) => a.position - b.position);

  // Colors for different positions
  const getBarColor = (position: number) => {
    switch (position) {
      case 1: return '#eab308'; // yellow-500 for 1st place
      case 2: return '#6b7280'; // gray-500 for 2nd place  
      case 3: return '#cd7c2f'; // bronze-ish for 3rd place
      default: return '#f59e0b'; // amber-500 for others
    }
  };

  const totalGames = chartData.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {title}
      </h3>
      
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
              formatter={(value: number, name: string, props: any) => [
                `${value} games (${((value / totalGames) * 100).toFixed(1)}%)`,
                'Count'
              ]}
              labelFormatter={(label: string) => `Position: ${label}`}
            />
            <Bar 
              dataKey="count" 
              radius={[4, 4, 0, 0]}
              className="hover:opacity-80 transition-opacity"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.position)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="text-slate-600 dark:text-slate-400">
          Total games: {totalGames.toLocaleString()}
        </div>
        <div className="text-slate-600 dark:text-slate-400">
          Win rate: {totalGames > 0 ? ((data[1] || 0) / totalGames * 100).toFixed(1) : 0}%
        </div>
      </div>
    </div>
  );
}
