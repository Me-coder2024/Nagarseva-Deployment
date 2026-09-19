import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Issue } from '@/types';
import { getIssueTypeLabel, getStatusColor } from '@/lib/issueUtils';
import { BACKEND_URL } from '@/lib/backendUrl';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, MapPin } from 'lucide-react';

interface RecentIssuesTableProps {
  issues: Issue[];
}

export const RecentIssuesTable = ({ issues }: RecentIssuesTableProps) => {
  return (
    <Card className="border shadow-xs bg-card">
      <CardHeader className="p-4 sm:p-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-foreground">
              Recent Incident Feed
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Latest surveyor road detections and citizen complaints
            </CardDescription>
          </div>
          <Link
            to="/issues"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-2">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/70">
                <TableHead className="w-[45%] text-xs font-semibold">Issue Details</TableHead>
                <TableHead className="text-xs font-semibold">Location</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold text-right">Reported</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.slice(0, 5).map((issue) => (
                <TableRow key={issue.id} className="hover:bg-secondary/40 transition-colors">
                  <TableCell className="py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-border/80 shrink-0 bg-muted/30">
                        <img
                          src={
                            issue.imageUrl?.startsWith('data:') || issue.imageUrl?.startsWith('http')
                              ? issue.imageUrl
                              : issue.imageUrl?.startsWith('/')
                              ? `${BACKEND_URL}${issue.imageUrl}`
                              : issue.imageUrl
                              ? `${BACKEND_URL}/${issue.imageUrl}`
                              : 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=200&q=80'
                          }
                          alt={issue.type}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const fallback =
                              'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=200&q=80';
                            if (e.currentTarget.src !== fallback) {
                              e.currentTarget.src = fallback;
                            }
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {getIssueTypeLabel(issue.type)}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {issue.routeName || 'Survey Corridor'}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-xs py-2.5">
                    <span className="text-foreground font-medium">{issue.wardName || 'Vadodara'}</span>
                  </TableCell>

                  <TableCell className="py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(issue.status)}`} />
                      <span className="text-xs font-medium text-foreground">
                        {issue.status.replace('_', ' ')}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground text-right py-2.5 font-mono text-[11px]">
                    {new Date(issue.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {issues.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-6">
            No live issues currently recorded.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
