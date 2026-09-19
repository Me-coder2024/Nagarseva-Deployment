import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Badge } from '@/components/ui/badge';

interface IssueStatusChartProps {
  data?: {
    DETECTED: number;
    ASSIGNED: number;
    IN_PROGRESS: number;
    FIXED: number;
    RESOLVED: number;
    REJECTED: number;
  };
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  DETECTED: { label: 'Detected', color: '#ef4444', bg: 'bg-red-500' },
  ASSIGNED: { label: 'Assigned', color: '#64748b', bg: 'bg-slate-500' },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', bg: 'bg-blue-500' },
  FIXED: { label: 'Fixed', color: '#0ea5e9', bg: 'bg-sky-500' },
  RESOLVED: { label: 'Resolved', color: '#10b981', bg: 'bg-emerald-500' },
  REJECTED: { label: 'Rejected', color: '#f97316', bg: 'bg-orange-500' },
};

export const IssueStatusChart = ({ data }: IssueStatusChartProps) => {
  if (!data) return null;

  const total = Object.values(data).reduce((a, b) => a + b, 0);

  const chartData = [
    { name: 'Detected', key: 'DETECTED', value: data.DETECTED, color: statusConfig.DETECTED.color },
    { name: 'Assigned', key: 'ASSIGNED', value: data.ASSIGNED, color: statusConfig.ASSIGNED.color },
    { name: 'In Progress', key: 'IN_PROGRESS', value: data.IN_PROGRESS, color: statusConfig.IN_PROGRESS.color },
    { name: 'Fixed', key: 'FIXED', value: data.FIXED, color: statusConfig.FIXED.color },
    { name: 'Resolved', key: 'RESOLVED', value: data.RESOLVED, color: statusConfig.RESOLVED.color },
    { name: 'Rejected', key: 'REJECTED', value: data.REJECTED, color: statusConfig.REJECTED.color },
  ];

  return (
    <Card className="border shadow-xs bg-card">
      <CardHeader className="p-4 sm:p-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-foreground">
              Issues by Lifecycle Status
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Live distribution of civic complaints across stages
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs font-semibold">
            {total} Total Issues
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-2">
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: 35, left: 10, bottom: 5 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={85}
                tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
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
                  `${value} issues (${total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)`,
                  'Count',
                ]}
                labelStyle={{ fontWeight: 'bold', color: 'hsl(var(--foreground))' }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  style={{ fontSize: '11px', fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Legend Chips */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-3 border-t border-border/60">
          {chartData.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5 p-1 rounded bg-secondary/40 text-center justify-center">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] text-muted-foreground truncate">{item.name}: <strong className="text-foreground">{item.value}</strong></span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
