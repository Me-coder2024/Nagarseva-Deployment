import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Ward, IssueType, IssueStatus } from "@/types";
import { useTranslation } from "react-i18next";
import { MapPin, Tag, CheckCircle2, Calendar, RotateCcw, Filter } from "lucide-react";

interface IssueFiltersProps {
  filters: {
    wardId: string;
    type: IssueType | "all";
    status: IssueStatus | "all";
    fromDate?: string;
    toDate?: string;
  };
  onFiltersChange: (filters: {
    wardId: string;
    type: IssueType | "all";
    status: IssueStatus | "all";
    fromDate?: string;
    toDate?: string;
  }) => void;
  wards: Ward[];
  totalCount?: number;
  filteredCount?: number;
}

export const IssueFilters = ({
  filters,
  onFiltersChange,
  wards,
  totalCount,
  filteredCount,
}: IssueFiltersProps) => {
  const { t } = useTranslation();

  const issueTypes: { value: IssueType; labelKey: string }[] = [
    { value: "POTHOLE", labelKey: "issues.pothole" },
    { value: "GARBAGE", labelKey: "issues.garbage" },
  ];

  const issueStatuses: { value: IssueStatus; labelKey: string }[] = [
    { value: "DETECTED", labelKey: "issues.detected" },
    { value: "ASSIGNED", labelKey: "issues.assigned" },
    { value: "IN_PROGRESS", labelKey: "issues.inProgress" },
    { value: "FIXED", labelKey: "issues.fixed" },
    { value: "RESOLVED", labelKey: "issues.resolved" },
    { value: "REJECTED", labelKey: "issues.rejected" },
  ];

  const isFiltered =
    filters.wardId !== "all" ||
    filters.type !== "all" ||
    filters.status !== "all" ||
    Boolean(filters.fromDate) ||
    Boolean(filters.toDate);

  const handleReset = () => {
    onFiltersChange({
      wardId: "all",
      type: "all",
      status: "all",
      fromDate: "",
      toDate: "",
    });
  };

  return (
    <Card className="border border-border/80 shadow-xs bg-card/90 backdrop-blur-xs">
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center justify-between">
          {/* Main Dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mr-1">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <span>Filters:</span>
            </div>

            {/* Ward Select */}
            <Select
              value={filters.wardId}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, wardId: value })
              }
            >
              <SelectTrigger className="h-9 w-[150px] sm:w-[170px] text-xs bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder={t("routesPage.filterByWard")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {t("mapView.allWards")}
                </SelectItem>
                {wards.map((ward) => (
                  <SelectItem key={ward.id} value={ward.id} className="text-xs">
                    {ward.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Issue Type Select */}
            <Select
              value={filters.type}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, type: value as IssueType | "all" })
              }
            >
              <SelectTrigger className="h-9 w-[130px] sm:w-[150px] text-xs bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder={t("common.filter")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {t("mapView.allTypes")}
                </SelectItem>
                {issueTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value} className="text-xs">
                    {t(type.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Select */}
            <Select
              value={filters.status}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  status: value as IssueStatus | "all",
                })
              }
            >
              <SelectTrigger className="h-9 w-[140px] sm:w-[160px] text-xs bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder={t("common.filter")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {t("mapView.allStatuses")}
                </SelectItem>
                {issueStatuses.map((status) => (
                  <SelectItem key={status.value} value={status.value} className="text-xs">
                    {t(status.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date range filter & Count / Reset */}
          <div className="flex flex-wrap items-center gap-2.5 justify-between xl:justify-end">
            <div className="flex items-center gap-2 bg-background border rounded-lg px-2.5 py-1">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">From</span>
                <input
                  type="date"
                  value={filters.fromDate || ""}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, fromDate: e.target.value })
                  }
                  className="h-7 text-xs bg-transparent border-0 p-0 focus:outline-hidden font-mono text-foreground"
                />
              </div>
              <span className="text-muted-foreground text-xs">—</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">To</span>
                <input
                  type="date"
                  value={filters.toDate || ""}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, toDate: e.target.value })
                  }
                  className="h-7 text-xs bg-transparent border-0 p-0 focus:outline-hidden font-mono text-foreground"
                />
              </div>
            </div>

            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </Button>
            )}

            {filteredCount !== undefined && totalCount !== undefined && (
              <Badge variant="secondary" className="text-[11px] font-normal">
                {filteredCount} / {totalCount} issues
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
