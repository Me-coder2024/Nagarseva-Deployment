import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import type { Issue, Ward } from '@/types';
import { Badge } from '@/components/ui/badge';

interface WardBreakdownChartProps {
  issues?: Issue[];
  wards?: Ward[];
}

const WARD_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
];

export const WardBreakdownChart = ({ issues = [], wards = [] }: WardBreakdownChartProps) => {
  // Aggregate counts per ward
  const wardCounts: Record<string, number> = {};

  // Initialize with all known wards so even wards with 0 issues appear
  wards.forEach((w) => {
    wardCounts[w.name] = 0;
  });

  issues.forEach((issue) => {
    const wardName = issue.wardName || 'Unassigned';
    wardCounts[wardName] = (wardCounts[wardName] || 0) + 1;
  });

  const chartData = Object.entries(wardCounts).map(([name, count], index) => ({
    name,
    count,
    color: WARD_COLORS[index % WARD_COLORS.length],
  }));

  const totalIssues = issues.length;

  return (
    <Card className="border shadow-xs bg-card">
      <CardHeader className="p-4 sm:p-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-foreground">
              Ward-wise Issue Distribution
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Civic issue concentration across municipal wards
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-semibold">
            {chartData.length} Wards Monitored
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-2">
        {chartData.length > 0 ? (
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
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
                  formatter={(value: any) => [
                    `${value} issues (${totalIssues > 0 ? Math.round((Number(value) / totalIssues) * 100) : 0}% of city total)`,
                    'Reported Issues',
                  ]}
                  labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                />
                <Bar dataKey="count" name="Issues" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No ward issue data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
