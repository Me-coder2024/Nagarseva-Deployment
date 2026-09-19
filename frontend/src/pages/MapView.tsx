import { BACKEND_URL } from "@/lib/backendUrl";
import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useIssues, useWards } from '@/hooks/useData';
import { IssueMapView } from '@/components/map/IssueMapView';
import { IssueFilters } from '@/components/issues/IssueFilters';
import type { IssueType, IssueStatus, Issue } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  MapPin,
  Layers,
  Activity,
  CloudRain,
  Flame,
  X,
  Navigation,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { getStatusColor, getIssueTypeLabel } from '@/lib/issueUtils';
import { useTranslation } from 'react-i18next';
import { routeApi } from '@/lib/api';
import { Link } from 'react-router-dom';

const MapView = () => {
  const { data: issues } = useIssues();
  const { data: wards } = useWards();
  const { t } = useTranslation();

  const [filters, setFilters] = useState({
    wardId: 'all',
    type: 'all' as IssueType | 'all',
    status: 'all' as IssueStatus | 'all',
    fromDate: '',
    toDate: '',
  });

  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [focusedRouteCoords, setFocusedRouteCoords] = useState<[number, number] | null>(null);
  const [viewMode, setViewMode] = useState<'markers' | 'heatmap' | 'monsoon'>('markers');
  const [roadHealth, setRoadHealth] = useState<any[]>([]);

  useEffect(() => {
    routeApi.getRoadHealth().then(res => {
      if (res && res.success && res.data?.routes) {
        setRoadHealth(res.data.routes);
      }
    }).catch(console.error);
  }, [issues]);

  const filteredIssues = useMemo(() => {
    return issues?.filter(issue => {
      const matchesWard = filters.wardId === 'all' || issue.wardId === filters.wardId;
      const matchesType = filters.type === 'all' || issue.type === filters.type;
      const matchesStatus = filters.status === 'all' || issue.status === filters.status;

      let matchesDate = true;
      if (filters.fromDate && issue.createdAt) {
        matchesDate = matchesDate && new Date(issue.createdAt) >= new Date(filters.fromDate);
      }
      if (filters.toDate && issue.createdAt) {
        const toDateEnd = new Date(filters.toDate);
        toDateEnd.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && new Date(issue.createdAt) <= toDateEnd;
      }

      return matchesWard && matchesType && matchesStatus && matchesDate;
    }) || [];
  }, [issues, filters]);

  const handleMarkerClick = (issue: Issue) => {
    setSelectedIssue(issue);
  };

  const handleRouteClick = (route: any) => {
    setSelectedRouteId(route.id);
    if (route.startLat && route.startLon) {
      setFocusedRouteCoords([route.startLat, route.startLon]);
    }
  };

  const getHealthStatusBadge = (status: string) => {
    switch (status) {
      case 'EXCELLENT':
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] px-2 py-0.5">EXCELLENT</Badge>;
      case 'GOOD':
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[10px] px-2 py-0.5">GOOD</Badge>;
      case 'NEEDS_MAINTENANCE':
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-[10px] px-2 py-0.5">MAINTENANCE</Badge>;
      case 'CRITICAL':
        return <Badge className="bg-red-600 hover:bg-red-700 text-white font-semibold text-[10px] px-2 py-0.5">CRITICAL</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">GOOD</Badge>;
    }
  };

  const getProgressColor = (health: number) => {
    if (health >= 85) return 'bg-emerald-500';
    if (health >= 70) return 'bg-blue-500';
    if (health >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const averageHealthIndex = useMemo(() => {
    if (!roadHealth.length) return 96;
    const total = roadHealth.reduce((acc, curr) => acc + (curr.healthIndex || 0), 0);
    return Math.round(total / roadHealth.length);
  }, [roadHealth]);

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-7xl mx-auto pb-6">
        {/* Page Header with Mode Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {t('mapView.title')}
              </h1>
              <Badge variant="outline" className="text-xs font-normal">
                Vadodara Smart City
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('mapView.subtitle')} &bull; Real-time AI road monitoring & risk analysis
            </p>
          </div>

          {/* Mode Selector Pill */}
          <div className="flex items-center gap-1 bg-secondary/80 dark:bg-card p-1 rounded-xl border shadow-2xs w-fit">
            <button
              onClick={() => setViewMode('markers')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'markers'
                  ? 'bg-background text-foreground shadow-xs border border-border/50 font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span>Pin Markers</span>
            </button>

            <button
              onClick={() => setViewMode('heatmap')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'heatmap'
                  ? 'bg-background text-orange-600 dark:text-orange-400 shadow-xs border border-border/50 font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              <span>Density Heatmap</span>
            </button>

            <button
              onClick={() => setViewMode('monsoon')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'monsoon'
                  ? 'bg-background text-cyan-600 dark:text-cyan-400 shadow-xs border border-border/50 font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              <CloudRain className="w-3.5 h-3.5 text-cyan-500" />
              <span>Rain Risk Overlay</span>
            </button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <IssueFilters
          filters={filters}
          onFiltersChange={setFilters}
          wards={wards || []}
          totalCount={issues?.length || 0}
          filteredCount={filteredIssues.length}
        />

        {/* Main Map & Intelligence Sidebar Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Map Column */}
          <div className="lg:col-span-2">
            <IssueMapView
              issues={filteredIssues}
              selectedIssue={selectedIssue}
              onMarkerClick={handleMarkerClick}
              viewMode={viewMode}
              focusedRouteCoords={focusedRouteCoords}
            />
          </div>

          {/* Right Sidebar Column */}
          <div className="space-y-4 lg:h-[620px] lg:overflow-y-auto lg:pr-1">
            {/* Selected Issue Card (if clicked) */}
            {selectedIssue && (
              <Card className="border-primary/40 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <CardHeader className="p-3.5 pb-2 border-b bg-muted/30">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-1.5 text-foreground font-semibold">
                      <MapPin className="w-4 h-4 text-primary shrink-0" />
                      <span>{t('mapView.issueDetails')}</span>
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full hover:bg-muted"
                      onClick={() => setSelectedIssue(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-3.5 space-y-3">
                  <div className="relative group overflow-hidden rounded-lg border bg-muted/20">
                    <img
                      src={
                        selectedIssue.imageUrl?.startsWith("data:") || selectedIssue.imageUrl?.startsWith("http")
                          ? selectedIssue.imageUrl
                          : selectedIssue.imageUrl?.startsWith("/")
                            ? `${BACKEND_URL}${selectedIssue.imageUrl}`
                            : selectedIssue.imageUrl
                              ? `${BACKEND_URL}/${selectedIssue.imageUrl}`
                              : "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80"
                      }
                      alt={selectedIssue.type}
                      className="w-full h-32 object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        const fallback = "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80";
                        if (e.currentTarget.src !== fallback) {
                          e.currentTarget.src = fallback;
                        }
                      }}
                    />
                    <div className="absolute top-2 left-2 flex gap-1.5">
                      <Badge className="text-[10px] bg-background/90 text-foreground backdrop-blur-xs border shadow-xs">
                        {getIssueTypeLabel(selectedIssue.type)}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">
                        {selectedIssue.routeName}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${getStatusColor(selectedIssue.status)}`}>
                        {selectedIssue.status}
                      </span>
                    </div>

                    <p className="text-muted-foreground text-xs">
                      Ward: <span className="text-foreground font-medium">{selectedIssue.wardName}</span>
                    </p>

                    {selectedIssue.analysis && (
                      <div className="p-2 rounded-md bg-secondary/50 border border-border/60 space-y-1">
                        <div className="flex items-center justify-between font-semibold text-primary text-[11px]">
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> AI Defect Assessment
                          </span>
                          <span className="font-bold text-foreground">{selectedIssue.analysis.severity || 'HIGH'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[11px] pt-0.5">
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Patch: </span>
                            <span className="font-bold text-primary">
                              {selectedIssue.analysis.repairPatchClass
                                ? selectedIssue.analysis.repairPatchClass.replace(/_/g, ' ')
                                : 'SECTION ASPHALT CUTOUT'}
                            </span>
                          </div>
                          {selectedIssue.analysis.surfaceAreaPercent != null && (
                            <div>
                              <span className="text-muted-foreground">Spread: </span>
                              <span className="font-bold text-foreground">{selectedIssue.analysis.surfaceAreaPercent}%</span>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">Moisture: </span>
                            <span className="font-bold text-foreground">{selectedIssue.analysis.waterlogged ? '💧 Waterlogged' : '☀️ Dry'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1 pt-1 border-t text-[11px] font-mono text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Lat / Long:</span>
                        <span className="text-foreground">{selectedIssue.latitude.toFixed(5)}, {selectedIssue.longitude.toFixed(5)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-0.5">
                        <span>GPS Precision:</span>
                        {(selectedIssue as any).gpsAccuracy != null ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            📡 Real GPS ±{Math.round((selectedIssue as any).gpsAccuracy)}m
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            ⚠️ Standard GPS
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Road Quality Scorecard */}
            <Card className="border shadow-xs">
              <CardHeader className="p-4 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <span>Road Quality Scorecard</span>
                  </CardTitle>
                  <Badge variant="secondary" className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
                    City Avg: {averageHealthIndex}%
                  </Badge>
                </div>
                <CardDescription className="text-xs mt-0.5">
                  Real-time health index per surveyed corridor
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2.5">
                {roadHealth.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground italic">
                    Loading surveyed road quality metrics...
                  </div>
                ) : (
                  roadHealth.slice(0, 4).map(route => {
                    const isSelected = selectedRouteId === route.id;
                    return (
                      <div
                        key={route.id}
                        onClick={() => handleRouteClick(route)}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary/5 border-primary/40 shadow-xs'
                            : 'bg-card hover:bg-secondary/40 border-border/80'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold gap-2 mb-1.5">
                          <span className="truncate text-foreground max-w-[150px] sm:max-w-[170px]" title={route.name}>
                            {route.name}
                          </span>
                          {getHealthStatusBadge(route.status)}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Road Health</span>
                            <span className="font-bold text-foreground">{route.healthIndex}%</span>
                          </div>
                          <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getProgressColor(route.healthIndex)}`}
                              style={{ width: `${Math.max(5, route.healthIndex)}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5">
                          <span>{route.distanceKm} km route</span>
                          <span className={route.openPotholes > 0 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>
                            {route.openPotholes} open {route.openPotholes === 1 ? 'pothole' : 'potholes'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Contextual Legend Card (Matches active View Mode) */}
            <Card className="border shadow-xs">
              <CardHeader className="p-3.5 pb-2.5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                    {t('mapView.legend')}
                  </CardTitle>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {viewMode === 'markers'
                      ? 'Status Markers'
                      : viewMode === 'heatmap'
                      ? 'Density Heatmap'
                      : 'Monsoon Vulnerability'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-3.5 pt-0">
                {/* 1. PIN MARKERS LEGEND */}
                {viewMode === 'markers' && (
                  <div className="grid grid-cols-2 gap-2">
                    {(['DETECTED', 'ASSIGNED', 'IN_PROGRESS', 'FIXED', 'RESOLVED', 'REJECTED'] as IssueStatus[]).map(status => (
                      <div key={status} className="flex items-center gap-2 p-1 rounded-sm">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusColor(status)} ring-2 ring-background`} />
                        <span className="text-[11px] font-medium text-foreground truncate">
                          {status.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. HEATMAP HOTSPOT LEGEND */}
                {viewMode === 'heatmap' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-600 ring-2 ring-red-200 dark:ring-red-950 shrink-0" />
                        <span className="font-semibold text-foreground text-[11px]">Resurfacing Zone</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">&gt; 15% spread / cluster</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-orange-500 ring-2 ring-orange-200 dark:ring-orange-950 shrink-0" />
                        <span className="font-semibold text-foreground text-[11px]">Section Cutout</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">5–15% spread</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500 ring-2 ring-yellow-200 dark:ring-yellow-950 shrink-0" />
                        <span className="font-semibold text-foreground text-[11px]">Spot Patching</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">&lt; 5% spread</span>
                    </div>

                    <p className="text-[10px] text-muted-foreground pt-1 border-t italic">
                      Hotspots aggregate multiple pothole detections and surface defect density.
                    </p>
                  </div>
                )}

                {/* 3. RAIN RISK LEGEND */}
                {viewMode === 'monsoon' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-cyan-500 ring-2 ring-cyan-200 dark:ring-cyan-950 shrink-0" />
                        <span className="font-semibold text-foreground text-[11px]">High Flood Risk Zone</span>
                      </div>
                      <Badge variant="outline" className="text-[9px] text-cyan-600 border-cyan-300">
                        Priority
                      </Badge>
                    </div>

                    <p className="text-[10px] text-muted-foreground pt-1 border-t">
                      Identifies road depressions vulnerable to runoff accumulation during heavy monsoon rain.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MapView;
