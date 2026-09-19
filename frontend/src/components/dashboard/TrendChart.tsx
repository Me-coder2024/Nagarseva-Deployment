import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import type { Issue } from '@/types';
import { TrendingUp } from 'lucide-react';

interface TrendChartProps {
  issues?: Issue[];
}

export const TrendChart = ({ issues = [] }: TrendChartProps) => {
  const dateCounts: Record<string, { total: number; resolved: number; timestamp: number }> = {};

  const sortedIssues = [...issues].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  sortedIssues.forEach((issue) => {
    const d = new Date(issue.createdAt);
    const dateStr = `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;

    if (!dateCounts[dateStr]) {
      dateCounts[dateStr] = { total: 0, resolved: 0, timestamp: d.getTime() };
    }

    dateCounts[dateStr].total += 1;
    if (['RESOLVED', 'FIXED'].includes(issue.status)) {
      dateCounts[dateStr].resolved += 1;
    }
  });

  const chartData = Object.entries(dateCounts).map(([date, counts]) => ({
    date,
    Total: counts.total,
    Resolved: counts.resolved,
  }));

  return (
    <Card className="border shadow-xs bg-card">
      <CardHeader className="p-4 sm:p-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span>Historical Issue Trends</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Cumulative detection and resolution trajectory
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-2">
        {chartData.length > 0 ? (
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="totalColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="resolvedColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
                />
                <Area
                  type="monotone"
                  dataKey="Total"
                  name="Detected Issues"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#totalColor)"
                />
                <Area
                  type="monotone"
                  dataKey="Resolved"
                  name="Resolved Issues"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#resolvedColor)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No historical trend telemetry available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
