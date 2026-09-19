import { useDashboardStats, useIssues, useWards, useRealTimeSync } from '@/hooks/useData';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { IssueStatusChart } from '@/components/dashboard/IssueStatusChart';
import { WardBreakdownChart } from '@/components/dashboard/WardBreakdownChart';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { RecentIssuesTable } from '@/components/dashboard/RecentIssuesTable';
import { MonsoonRiskCard } from '@/components/dashboard/MonsoonRiskCard';
import { PciScoreCard } from '@/components/dashboard/PciScoreCard';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Building2, Route, Users, AlertTriangle, RefreshCw, Map, AlertCircle, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const { data: stats } = useDashboardStats();
  const { data: issues } = useIssues();
  const { data: wards } = useWards();
  const { t } = useTranslation();
  const { lastSyncTime, isSyncing, refetchAll } = useRealTimeSync(5000);

  const recentIssues = issues?.slice(0, 5) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-8">
        {/* Top Header & Live Sync Status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {t('dashboard.title')}
              </h1>
              <Badge variant="outline" className="text-xs font-normal">
                NagarSeva Control Room
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {t('dashboard.overview')} &bull; Real-time municipal intelligence
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Sync Badge & Manual Refresh Button */}
            <div className="flex items-center gap-2 bg-card border border-border/80 px-3 py-1.5 rounded-xl shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-foreground">
                Live Sync (5s)
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={refetchAll}
                disabled={isSyncing}
                className="h-6 w-6 text-muted-foreground hover:text-foreground -mr-1"
                title="Force refresh all datasets"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-primary' : ''}`} />
              </Button>
            </div>

            <Link to="/map">
              <Button size="sm" variant="default" className="text-xs flex items-center gap-1.5 shadow-xs">
                <Map className="w-3.5 h-3.5" />
                <span>Open Map</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Summary Stats Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title={t('dashboard.totalWards')}
            value={stats?.totalWards || 0}
            icon={Building2}
            variant="primary"
            subtext="Administrative Wards"
          />
          <StatsCard
            title={t('dashboard.totalRoutes')}
            value={stats?.totalRoutes || 0}
            icon={Route}
            variant="secondary"
            subtext="Monitored Road Corridors"
          />
          <StatsCard
            title={t('dashboard.activeSurveyors')}
            value={stats?.activeSurveyors || 0}
            icon={Users}
            variant="accent"
            subtext="Field Patrol Surveyors"
          />
          <StatsCard
            title={t('dashboard.openIssues')}
            value={stats?.openIssues || 0}
            icon={AlertTriangle}
            variant="warning"
            subtext="Pending Resolution"
          />
        </div>

        {/* Monsoon & Rain Risk Predictor Section */}
        <MonsoonRiskCard />

        {/* Pavement Condition Index (PCI) Section */}
        <PciScoreCard />

        {/* Primary Analytics Grid: Status Distribution & Ward Breakdown */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          <IssueStatusChart data={stats?.issuesByStatus} />
          <WardBreakdownChart issues={issues || []} wards={wards || []} />
        </div>

        {/* Historical Trends & Recent Incident Table Grid */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          <TrendChart issues={issues || []} />
          <RecentIssuesTable issues={recentIssues} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
