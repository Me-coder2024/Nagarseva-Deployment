// Core types for the NagarSeva Civic Issue Monitoring System

export type UserRole = "ADMIN" | "SURVEYOR" | "ENGINEER";

// NagarSeva currently tracks potholes and garbage issues
export type IssueType = "POTHOLE" | "GARBAGE";

// Issue workflow: DETECTED -> ASSIGNED -> IN_PROGRESS -> FIXED -> RESOLVED/REJECTED
export type IssueStatus =
  | "DETECTED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "FIXED"
  | "RESOLVED"
  | "REJECTED";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Ward {
  id: string;
  name: string;
  code: string;
}

export interface Route {
  id: string;
  name: string;
  wardId: string;
  wardName: string;
  assignedSurveyorId?: string;
  assignedSurveyorName?: string;
  status: "UNASSIGNED" | "ASSIGNED";
  distance?: number;
  startLat?: number;
  startLon?: number;
  endLat?: number;
  endLon?: number;
}

export interface IssueAnalysis {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  depthEstimateCm?: number;
  surfaceAreaPercent?: number;
  repairPatchClass?: "SPOT_COLD_MIX" | "SECTION_ASPHALT_CUTOUT" | "FULL_LANE_RESURFACING" | "NO_ACTION" | string;
  edgeRoughness?: "SMOOTH" | "MODERATE" | "SEVERE_CRUMBLING" | string;
  waterlogged?: boolean;
  sizeClass: "NONE" | "SMALL" | "MEDIUM" | "LARGE" | "CRITICAL" | string;
  priorityScore: number;
  recommendations: string;
}

export interface ResolutionAudit {
  repairQualityScore?: number;
  qualityRating?: string;
  aiVerdict?: string;
  approved?: boolean;
  feedback?: string;
  isGeofenceVerified?: boolean;
  fixDistanceMeters?: number;
  fixLatitude?: number;
  fixLongitude?: number;
  sceneSimilarityScore?: number;
  antiSpoofFlags?: string;
  isAuthenticFix?: boolean;
}

export interface Issue {
  id: string;
  type: IssueType;
  status: IssueStatus;
  confidence?: number;
  wardId: string;
  wardName: string;
  routeId: string;
  routeName: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
  description?: string;
  assignedEngineerId?: string;
  assignedEngineerName?: string;
  feedback?: string;
  analysis?: IssueAnalysis | null;
  resolutionAudit?: ResolutionAudit | null;
  createdAt: string;
  updatedAt: string;
  afterImageUrl: string;
}

export interface PciWardData {
  wardId: string;
  wardName: string;
  wardNumber: number;
  pciScore: number;
  conditionRating: "EXCELLENT" | "SATISFACTORY" | "FAIR" | "POOR" | "CRITICAL";
  totalRoadDistanceKm: number;
  openIssuesCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  resolvedCount: number;
  potholeDensityPerKm: number;
  recommendation: string;
  color: string;
}

export interface MunicipalPciSummary {
  cityOverallPci: number;
  cityConditionRating: "EXCELLENT" | "SATISFACTORY" | "FAIR" | "POOR" | "CRITICAL";
  totalWardsEvaluated: number;
  totalRoadKilometers: number;
  totalActivePotholes: number;
  totalResolvedPotholes: number;
  wardsAtCriticalRisk: number;
  wardScores: PciWardData[];
}

export interface OptimizedStop {
  stopNumber: number;
  issueId: string;
  type: string;
  severity: string;
  status: string;
  latitude: number;
  longitude: number;
  wardName: string;
  routeName: string;
  distanceFromPrevKm: number;
  cumulativeDistanceKm: number;
  estimatedTransitMinutes: number;
  imageUrl: string;
  navigationUrl: string;
}

export interface TspRouteResult {
  engineerId: string;
  engineerName: string;
  totalStops: number;
  startLocation: { latitude: number; longitude: number };
  totalDistanceKm: number;
  estimatedTotalDurationMinutes: number;
  unoptimizedDistanceKm: number;
  distanceSavedKm: number;
  efficiencyImprovementPct: number;
  stops: OptimizedStop[];
  googleMapsTurnByTurnUrl: string;
}

export interface DashboardStats {
  totalWards: number;
  totalRoutes: number;
  activeSurveyors: number;
  openIssues: number;
  issuesByStatus: {
    DETECTED: number;
    ASSIGNED: number;
    IN_PROGRESS: number;
    FIXED: number;
    RESOLVED: number;
    REJECTED: number;
  };
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: "SURVEYOR" | "ENGINEER";
  wardId?: string;
  createdAt: string;
}
