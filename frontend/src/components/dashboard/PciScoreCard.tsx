import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { usePciData } from '@/hooks/useData';
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Road,
  TrendingUp,
  MapPin,
  Sparkles,
  ChevronRight,
  Info,
} from 'lucide-react';

export const PciScoreCard = () => {
  const { data, isLoading, error, refetch } = usePciData(20000);
  const [selectedWardFilter, setSelectedWardFilter] = useState<string>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  if (isLoading && !data) {
    return (
      <Card className="border shadow-xs bg-card/80">
        <CardContent className="py-10 text-center text-xs text-muted-foreground">
          <Activity className="w-7 h-7 mx-auto mb-2 text-primary animate-pulse opacity-80" />
          <p className="font-medium text-foreground">Computing Pavement Condition Index (PCI)...</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Evaluating defect density &amp; ASTM D6433 road quality metrics</p>
        </CardContent>
      </Card>
    );
  }

  const overallPci = data?.cityOverallPci ?? 78;
  const rating = data?.cityConditionRating ?? 'SATISFACTORY';
  const wardScores = data?.wardScores || [];

  const filteredWards =
    selectedWardFilter === 'ALL'
      ? wardScores
      : selectedWardFilter === 'CRITICAL'
      ? wardScores.filter((w) => w.conditionRating === 'CRITICAL' || w.conditionRating === 'POOR')
      : wardScores.filter((w) => w.conditionRating === selectedWardFilter);

  const getRatingBadge = (condRating: string) => {
    switch (condRating) {
      case 'EXCELLENT':
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px]">✨ EXCELLENT (85-100)</Badge>;
      case 'SATISFACTORY':
        return <Badge className="bg-sky-600 hover:bg-sky-700 text-white text-[11px]">🟢 SATISFACTORY (70-84)</Badge>;
      case 'FAIR':
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[11px]">🟡 FAIR (55-69)</Badge>;
      case 'POOR':
        return <Badge className="bg-orange-600 hover:bg-orange-700 text-white text-[11px]">🟠 POOR (40-54)</Badge>;
      case 'CRITICAL':
        return <Badge className="bg-red-600 hover:bg-red-700 text-white text-[11px] animate-pulse">🔴 CRITICAL (0-39)</Badge>;
      default:
        return <Badge variant="outline">{condRating}</Badge>;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 70) return 'text-sky-600 dark:text-sky-400';
    if (score >= 55) return 'text-amber-500 dark:text-amber-400';
    if (score >= 40) return 'text-orange-500 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getProgressColor = (score: number) => {
    if (score >= 85) return 'bg-emerald-500';
    if (score >= 70) return 'bg-sky-500';
    if (score >= 55) return 'bg-amber-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <Card className="border shadow-xs overflow-hidden bg-card">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold text-foreground">
                  Pavement Condition Index (PCI) Rating
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-normal tracking-wide">
                  ASTM D6433 Standard
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Automated 1–100 road quality scoring across municipal wards and road corridors
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="h-8 text-xs flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Recalculate</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* City-wide Header Metric */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/40 border">
          {/* Main PCI Score Gauge */}
          <div className="md:col-span-1 flex flex-col justify-center items-center text-center p-2 border-b md:border-b-0 md:border-r border-border/70 pr-0 md:pr-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Citywide PCI Index
            </span>
            <div className="flex items-baseline gap-1 my-1">
              <span className={`text-4xl font-extrabold tracking-tight ${getScoreColor(overallPci)}`}>
                {overallPci}
              </span>
              <span className="text-xs text-muted-foreground font-semibold">/100</span>
            </div>
            <div className="mt-1">{getRatingBadge(rating)}</div>
          </div>

          {/* Quick Metrics */}
          <div className="md:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-3 items-center">
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3 text-primary" /> Evaluated Wards
              </span>
              <p className="text-lg font-bold text-foreground">{data?.totalWardsEvaluated || wardScores.length}</p>
              <p className="text-[10px] text-muted-foreground">Administrative zones</p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-blue-500" /> Network Distance
              </span>
              <p className="text-lg font-bold text-foreground">{data?.totalRoadKilometers || 0} km</p>
              <p className="text-[10px] text-muted-foreground">Scanned road network</p>
            </div>

            <div className="space-y-1 col-span-2 sm:col-span-1">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500" /> Active vs Resolved
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-red-600 dark:text-red-400">
                  {data?.totalActivePotholes || 0} Open
                </span>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {data?.totalResolvedPotholes || 0} Fixed
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">Repair recovery rate</p>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-muted-foreground font-medium mr-1 text-[11px]">Filter:</span>
            {['ALL', 'CRITICAL', 'POOR', 'FAIR', 'SATISFACTORY', 'EXCELLENT'].map((filterKey) => (
              <Button
                key={filterKey}
                size="sm"
                variant={selectedWardFilter === filterKey ? 'default' : 'outline'}
                onClick={() => setSelectedWardFilter(filterKey)}
                className="h-7 text-[11px] px-2.5 py-0 rounded-lg"
              >
                {filterKey === 'CRITICAL' ? '⚠️ High Risk' : filterKey}
              </Button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground font-medium">
            Showing {filteredWards.length} of {wardScores.length} Wards
          </span>
        </div>

        {/* Ward PCI Breakdown Table */}
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
              <tr>
                <th className="py-2.5 px-3">Ward</th>
                <th className="py-2.5 px-3">PCI Score</th>
                <th className="py-2.5 px-3">Condition Rating</th>
                <th className="py-2.5 px-3">Defect Density</th>
                <th className="py-2.5 px-3">Critical / High</th>
                <th className="py-2.5 px-3">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredWards.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No wards match the selected filter condition.
                  </td>
                </tr>
              ) : (
                filteredWards.map((w) => (
                  <tr key={w.wardId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-3 font-semibold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: w.color }}
                        />
                        <span>{w.wardName}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        Ward #{w.wardNumber} &bull; {w.totalRoadDistanceKm} km
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="w-28 space-y-1">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className={getScoreColor(w.pciScore)}>{w.pciScore}</span>
                          <span className="text-[10px] text-muted-foreground font-normal">/ 100</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getProgressColor(w.pciScore)}`}
                            style={{ width: `${Math.max(5, w.pciScore)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {getRatingBadge(w.conditionRating)}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-foreground">
                        {w.potholeDensityPerKm}
                      </span>
                      <span className="text-[10px] text-muted-foreground"> issues/km</span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        {w.criticalCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 font-bold text-[10px]">
                            {w.criticalCount} Crit
                          </span>
                        )}
                        {w.highCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-bold text-[10px]">
                            {w.highCount} High
                          </span>
                        )}
                        {w.criticalCount === 0 && w.highCount === 0 && (
                          <span className="text-muted-foreground text-[11px]">None</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-muted-foreground max-w-xs truncate" title={w.recommendation}>
                      {w.recommendation}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
