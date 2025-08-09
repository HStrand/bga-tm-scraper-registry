import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CorporationPlayerStatsRow } from '@/types/corporation';

interface ScoreEloScatterProps {
  data: CorporationPlayerStatsRow[];
  title?: string;
}

export function ScoreEloScatter({ data, title = "Final Score vs Elo" }: ScoreEloScatterProps) {
  // Prepare data for scatter plot
  const scatterData = data
    .filter(row => row.finalScore != null && row.elo != null)
    .map(row => ({
      elo: row.elo!,
      finalScore: row.finalScore!,
      playerName: row.playerName,
      position: row.position,
      playerCount: row.playerCount,
      generations: row.generations,
    }));

  // Groups for separate series (improves legibility and lets us color by position)
  const winners = scatterData.filter(d => d.position === 1);
  const second = scatterData.filter(d => d.position === 2);
  const third = scatterData.filter(d => d.position === 3);
  const others = scatterData.filter(d => d.position !== 1 && d.position !== 2 && d.position !== 3);

  // Color based on position
  const getPointColor = (position?: number) => {
    switch (position) {
      case 1: return '#eab308'; // yellow-500 for winners
      case 2: return '#6b7280'; // gray-500 for 2nd
      case 3: return '#cd7c2f'; // bronze for 3rd
      default: return '#f59e0b'; // amber-500 for others
    }
  };

  return (
    <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        {title}
      </h3>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              type="number"
              dataKey="elo"
              name="Elo"
              tick={{ fontSize: 12 }}
              className="text-slate-600 dark:text-slate-400"
              label={{ value: 'Elo Rating', position: 'insideBottom', offset: -5 }}
            />
            <YAxis 
              type="number"
              dataKey="finalScore"
              name="Final Score"
              tick={{ fontSize: 12 }}
              className="text-slate-600 dark:text-slate-400"
              label={{ value: 'Final Score', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid rgb(203 213 225)',
                borderRadius: '8px',
                color: '#0f172a',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'elo') return [value, 'Elo'];
                if (name === 'finalScore') return [value, 'Final Score'];
                return [value, name];
              }}
              labelFormatter={() => ''}
              content={({ active, payload }) => {
                if (active && payload && payload.length > 0) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm">
                      <div className="font-semibold text-slate-100 mb-2">{data.playerName}</div>
                      <div className="space-y-1 text-slate-300">
                        <div>Elo: {data.elo}</div>
                        <div>Final Score: {data.finalScore}</div>
                        <div>Position: {data.position ? `${data.position}${data.position === 1 ? 'st' : data.position === 2 ? 'nd' : data.position === 3 ? 'rd' : 'th'}` : 'N/A'}</div>
                        <div>Players: {data.playerCount || 'N/A'}</div>
                        <div>Generations: {data.generations || 'N/A'}</div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter 
              data={winners} 
              fill="#eab308"
              fillOpacity={0.8}
              stroke="#a16207"
              strokeWidth={0.8}
            />
            <Scatter 
              data={second} 
              fill="#6b7280"
              fillOpacity={0.7}
              stroke="#4b5563"
              strokeWidth={0.6}
            />
            <Scatter 
              data={third} 
              fill="#cd7c2f"
              fillOpacity={0.7}
              stroke="#a96221"
              strokeWidth={0.6}
            />
            <Scatter 
              data={others} 
              fill="#f59e0b"
              fillOpacity={0.6}
              stroke="#d97706"
              strokeWidth={0.6}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <div>
          {scatterData.length.toLocaleString()} games plotted
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>1st Place</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-gray-500"></div>
            <span>2nd Place</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#cd7c2f' }}></div>
            <span>3rd Place</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span>Other</span>
          </div>
        </div>
      </div>
    </div>
  );
}
