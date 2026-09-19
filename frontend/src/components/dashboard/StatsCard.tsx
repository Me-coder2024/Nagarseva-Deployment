import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  variant?: 'primary' | 'secondary' | 'accent' | 'warning';
  subtext?: string;
}

const variantStyles = {
  primary: {
    iconBg: 'bg-blue-600/10 text-primary border-primary/20',
    topBorder: 'before:bg-blue-500',
    accentText: 'text-blue-600 dark:text-blue-400',
  },
  secondary: {
    iconBg: 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    topBorder: 'before:bg-indigo-500',
    accentText: 'text-indigo-600 dark:text-indigo-400',
  },
  accent: {
    iconBg: 'bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    topBorder: 'before:bg-emerald-500',
    accentText: 'text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    iconBg: 'bg-rose-600/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    topBorder: 'before:bg-rose-500',
    accentText: 'text-rose-600 dark:text-rose-400',
  },
};

export const StatsCard = ({
  title,
  value,
  icon: Icon,
  variant = 'primary',
  subtext,
}: StatsCardProps) => {
  const current = variantStyles[variant];

  return (
    <Card className="relative overflow-hidden border border-border/80 shadow-xs hover:shadow-md transition-all duration-200 group bg-card">
      <div className={cn('absolute top-0 left-0 right-0 h-1', current.topBorder)} />
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {title}
            </p>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                {value}
              </span>
            </div>
            {subtext && (
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                {subtext}
              </p>
            )}
          </div>

          <div
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 transition-transform duration-200 group-hover:scale-105',
              current.iconBg
            )}
          >
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
