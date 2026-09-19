import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CloudRain,
  CloudLightning,
  ShieldAlert,
  Thermometer,
  Droplets,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { routeApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

export const MonsoonRiskCard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);

  const fetchRisk = useCallback(async (showSpin = false) => {
    if (showSpin) setRefreshing(true);
    try {
      const res = await routeApi.getMonsoonRisk();
      if (res && res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load monsoon risk metrics', err);
    } finally {
      setLoading(false);
      if (showSpin) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRisk();

    // Poll live monsoon risk telemetry every 10 seconds
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchRisk(false);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchRisk]);

  if (loading) {
    return (
      <Card className="border shadow-xs bg-card/80">
        <CardContent className="py-10 text-center text-xs text-muted-foreground">
          <CloudRain className="w-7 h-7 mx-auto mb-2 text-primary animate-bounce opacity-80" />
          <p className="font-medium text-foreground">Syncing Live Vadodara Monsoon &amp; Rain Risk...</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Fetching Open-Meteo radar telemetry &amp; ward issue density</p>
        </CardContent>
      </Card>
    );
  }

  const weather = data?.weather;
  const wardRisks = data?.wardRisks || [];
  const citywideRisk = data?.citywideRisk || 'LOW RISK';
  const avgScore = data?.avgVulnerabilityScore || 0;

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
      case 'CRITICAL ALERT':
        return (
          <Badge className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-2.5 py-0.5 animate-pulse shadow-xs">
            🔴 CRITICAL ALERT
          </Badge>
        );
      case 'HIGH':
      case 'HIGH RISK':
        return (
          <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-2.5 py-0.5 shadow-xs">
            ⚠️ HIGH RISK
          </Badge>
        );
      case 'MODERATE':
        return (
          <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-2.5 py-0.5 shadow-xs">
            🌧️ MODERATE
          </Badge>
        );
      default:
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2.5 py-0.5 shadow-xs">
            🟢 LOW RISK
          </Badge>
        );
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-red-600 dark:text-red-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    if (score >= 30) return 'text-blue-600 dark:text-blue-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  const getProgressBarClass = (score: number) => {
    if (score >= 75) return 'bg-red-500';
    if (score >= 50) return 'bg-amber-500';
    if (score >= 30) return 'bg-blue-500';
    return 'bg-emerald-500';
  };

  return (
    <Card className="border shadow-xs bg-card overflow-hidden">
      {/* Header */}
      <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/70 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
              <CloudLightning className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-foreground">
                  Monsoon &amp; Rain Risk Predictor
                </CardTitle>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-medium border-primary/30 text-primary">
                  AI Model
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Vadodara Rain &amp; Waterlogging Vulnerability Assessment
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {getRiskBadge(citywideRisk)}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => fetchRisk(true)}
              disabled={refreshing}
              title="Refresh radar telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Live Weather Forecast Bar */}
        {weather ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-secondary/50 dark:bg-card border border-border/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Thermometer className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Temperature</div>
                <div className="text-sm font-bold text-foreground">{weather.temperature != null ? `${weather.temperature}°C` : 'N/A'}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Droplets className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Precipitation</div>
                <div className="text-sm font-bold text-foreground">{weather.precipitationMm != null ? `${weather.precipitationMm} mm` : '0 mm'}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <CloudRain className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rain Probability</div>
                <div className="text-sm font-bold text-foreground">{weather.rainProbability != null ? `${weather.rainProbability}%` : '0%'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-muted/40 border text-xs text-muted-foreground flex items-center justify-between">
            <span>🌦️ Live weather radar telemetry offline. Calculating vulnerability strictly from open municipal issues.</span>
          </div>
        )}

        {/* Citywide Vulnerability Progress */}
        <div className="space-y-1.5 p-3 rounded-lg border bg-card/60">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-foreground">
              <ShieldAlert className="w-4 h-4 text-primary" />
              <span>Citywide Degradation Vulnerability Score</span>
            </span>
            <span className={`font-bold font-mono ${getScoreColor(avgScore)}`}>
              {avgScore} / 100
            </span>
          </div>
          <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getProgressBarClass(avgScore)}`}
              style={{ width: `${Math.max(5, avgScore)}%` }}
            />
          </div>
        </div>

        {/* Ward Breakdown List */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-foreground flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <span>Vulnerable Ward Predictions</span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              Sorted by Pothole &amp; Rain Exposure
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
            {wardRisks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic col-span-2 text-center py-4">
                No ward vulnerability data available.
              </p>
            ) : (
              wardRisks.map((w: any) => (
                <div
                  key={w.wardId}
                  className="p-3.5 rounded-xl bg-card border border-border/80 hover:border-primary/50 hover:shadow-xs transition-all space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                        {w.wardCode}
                      </span>
                      <span className="font-semibold text-xs text-foreground truncate">{w.wardName}</span>
                    </div>
                    {getRiskBadge(w.riskLevel)}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <span>
                      Open Potholes: <strong className="text-foreground font-semibold">{w.openPotholes}</strong>
                    </span>
                    <span>
                      Vulnerability: <strong className={getScoreColor(w.vulnerabilityScore)}>{w.vulnerabilityScore}%</strong>
                    </span>
                  </div>

                  <div className="text-[11px] text-muted-foreground bg-secondary/60 p-2 rounded-lg border border-border/50 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="leading-tight">{w.recommendedAction}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
