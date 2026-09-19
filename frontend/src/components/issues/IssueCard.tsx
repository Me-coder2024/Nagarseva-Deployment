import { BACKEND_URL } from "@/lib/backendUrl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Issue } from '@/types';
import { getIssueTypeLabel, getStatusBadgeVariant, getIssueTypeIcon } from '@/lib/issueUtils';
import { MapPin, Clock, User, Wrench, Sparkles, AlertTriangle, Trash2 } from 'lucide-react';
import { useState } from 'react';
const NO_IMAGE_PLACEHOLDER = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300' fill='%231e293b'%3E%3Crect width='400' height='300' fill='%230f172a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='sans-serif' font-size='16'%3ENo Image Uploaded%3C/text%3E%3C/svg%3E";

interface IssueCardProps {
  issue: Issue;
  onAssignClick: (issue: Issue) => void;
  onVerifyClick: (issue: Issue) => void;
  onAnalyzeClick?: (issue: Issue) => Promise<void>;
  onDeleteClick?: (issue: Issue) => void;
}

export const IssueCard = ({ issue, onAssignClick, onVerifyClick, onAnalyzeClick, onDeleteClick }: IssueCardProps) => {
  const canAssign = issue.status === 'DETECTED';
  const canVerify = issue.status === 'FIXED';
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (!onAnalyzeClick) return;
    setAnalyzing(true);
    try {
      await onAnalyzeClick(issue);
    } finally {
      setAnalyzing(false);
    }
  };

  const getSeverityBadgeClass = (severity?: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-600 text-white font-bold';
      case 'HIGH': return 'bg-orange-500 text-white';
      case 'MEDIUM': return 'bg-yellow-500 text-black';
      case 'LOW': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  return (
    <Card className="overflow-hidden hover:shadow-xl hover:border-primary/40 transition-all duration-300 flex flex-col justify-between group border border-border/60 bg-card/95 backdrop-blur-sm">
      <div>
        <div className="aspect-video relative overflow-hidden bg-slate-950">
          <img
            src={
              issue.imageUrl?.startsWith("data:") || issue.imageUrl?.startsWith("http")
                ? issue.imageUrl
                : issue.imageUrl?.startsWith("/")
                  ? `${BACKEND_URL}${issue.imageUrl}`
                  : issue.imageUrl
                    ? `${BACKEND_URL}/${issue.imageUrl}`
                    : NO_IMAGE_PLACEHOLDER
            }
            alt={issue.type}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              if (e.currentTarget.src !== NO_IMAGE_PLACEHOLDER) {
                e.currentTarget.src = NO_IMAGE_PLACEHOLDER;
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none" />

          <div className="absolute top-3 left-3 flex gap-2 z-10">
            <Badge className="bg-black/60 backdrop-blur-md text-white border border-white/20 shadow-sm font-medium">
              {getIssueTypeIcon(issue.type)} {getIssueTypeLabel(issue.type)}
            </Badge>
            {issue.confidence && (
              <Badge className="bg-emerald-500/90 text-white backdrop-blur-md border border-emerald-400/30 text-xs font-semibold shadow-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                {(issue.confidence * 100).toFixed(0)}% Conf
              </Badge>
            )}
          </div>

          <Badge
            variant={getStatusBadgeVariant(issue.status)}
            className="absolute top-3 right-3 z-10 font-semibold shadow-md px-2.5 py-0.5"
          >
            {issue.status.replace('_', ' ')}
          </Badge>

          {onDeleteClick && (
            <Button
              variant="destructive"
              size="icon"
              className="absolute bottom-3 right-3 w-8 h-8 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 shadow-lg"
              onClick={() => onDeleteClick(issue)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">{issue.wardName}</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground truncate">{issue.routeName}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {issue.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {issue.description}
            </p>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 p-2 rounded-md border border-border/40">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-primary/70" />
              {new Date(issue.createdAt).toLocaleDateString()}
            </span>
            <span className="font-mono text-[11px] bg-background/80 px-2 py-0.5 rounded border">
              {issue.latitude.toFixed(4)}, {issue.longitude.toFixed(4)}
            </span>
          </div>

          {/* AI Analysis Panel */}
          {issue.analysis && (
            <div className="p-3 bg-gradient-to-br from-primary/5 via-primary/10 to-background rounded-lg border border-primary/20 text-xs space-y-2 shadow-inner">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5 text-primary">
                  <Sparkles className="w-4 h-4 animate-pulse text-amber-500" /> AI Road Defect Analysis
                </span>
                <Badge className={getSeverityBadgeClass(issue.analysis.severity)}>
                  {issue.analysis.severity}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-muted-foreground pt-1 text-[11px]">
                <div className="col-span-2 bg-primary/5 p-1.5 rounded border border-primary/10 flex items-center justify-between">
                  <span className="text-muted-foreground">Actionable Patch:</span>
                  <strong className="text-primary font-semibold">
                    {issue.analysis.repairPatchClass
                      ? issue.analysis.repairPatchClass.replace(/_/g, ' ')
                      : (issue.analysis.sizeClass || 'SPOT COLD MIX')}
                  </strong>
                </div>
                <div>Spread: <strong className="text-foreground">{issue.analysis.surfaceAreaPercent != null ? `${issue.analysis.surfaceAreaPercent}%` : 'N/A'}</strong></div>
                <div>Priority: <strong className="text-foreground">{issue.analysis.priorityScore}/10</strong></div>
                <div>Crater Edge: <strong className="text-foreground">{issue.analysis.edgeRoughness ? issue.analysis.edgeRoughness.replace(/_/g, ' ') : 'Normal'}</strong></div>
                <div>Moisture: <strong className="text-foreground">{issue.analysis.waterlogged ? '💧 Waterlogged' : '☀️ Dry Surface'}</strong></div>
              </div>
              <p className="text-[11px] text-muted-foreground italic border-t border-border/40 pt-1.5 mt-1">
                "{issue.analysis.recommendations}"
              </p>
            </div>
          )}

          {onAnalyzeClick && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-dashed text-primary border-primary/50 hover:bg-primary/5 mt-2"
              onClick={handleAnalyze}
              disabled={analyzing}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              {analyzing 
                ? 'Running YOLOv8 AI Model Analysis...' 
                : (issue.analysis ? 'Re-Analyze with AI Model' : 'Analyze with AI Model')}
            </Button>
          )}

          {issue.assignedEngineerName && (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-muted-foreground" />
              <span>{issue.assignedEngineerName}</span>
            </div>
          )}
        </CardContent>
      </div>

      <CardContent className="pt-0">
        <div className="flex gap-2 pt-2">
          {canAssign && (
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={() => onAssignClick(issue)}
            >
              <Wrench className="w-4 h-4 mr-1" />
              Assign Engineer
            </Button>
          )}
          {canVerify && (
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={() => onVerifyClick(issue)}
            >
              Verify Resolution
            </Button>
          )}
          {!canAssign && !canVerify && (
            <Button variant="outline" size="sm" className="flex-1" disabled>
              {issue.status === 'RESOLVED' ? 'Resolved' : issue.status === 'REJECTED' ? 'Needs Rework' : 'In Progress'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
