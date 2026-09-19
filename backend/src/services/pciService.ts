import { prisma } from "../lib/prisma.js";

export interface PciWardScore {
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

export interface PciRouteScore {
  routeId: string;
  routeName: string;
  wardId: string;
  wardName: string;
  distanceKm: number;
  pciScore: number;
  conditionRating: "EXCELLENT" | "SATISFACTORY" | "FAIR" | "POOR" | "CRITICAL";
  openDefectsCount: number;
  criticalDefects: number;
  recommendation: string;
}

export interface MunicipalPciSummary {
  cityOverallPci: number;
  cityConditionRating: "EXCELLENT" | "SATISFACTORY" | "FAIR" | "POOR" | "CRITICAL";
  totalWardsEvaluated: number;
  totalRoadKilometers: number;
  totalActivePotholes: number;
  totalResolvedPotholes: number;
  wardsAtCriticalRisk: number;
  wardScores: PciWardScore[];
}

function determineRating(pci: number): {
  rating: "EXCELLENT" | "SATISFACTORY" | "FAIR" | "POOR" | "CRITICAL";
  recommendation: string;
  color: string;
} {
  if (pci >= 85) {
    return {
      rating: "EXCELLENT",
      recommendation: "Pavement in pristine state. Routine periodic patrol sufficient.",
      color: "#10b981", // emerald
    };
  } else if (pci >= 70) {
    return {
      rating: "SATISFACTORY",
      recommendation: "Satisfactory pavement health. Preventive micro-surfacing suggested.",
      color: "#0ea5e9", // sky/blue
    };
  } else if (pci >= 55) {
    return {
      rating: "FAIR",
      recommendation: "Fair condition. Moderate surface degradation, prioritize cold-mix patching.",
      color: "#eab308", // amber/yellow
    };
  } else if (pci >= 40) {
    return {
      rating: "POOR",
      recommendation: "Poor pavement condition. High pothole density, urgent engineering dispatch needed.",
      color: "#f97316", // orange
    };
  } else {
    return {
      rating: "CRITICAL",
      recommendation: "Critical road failure. Immediate emergency resurfacing and traffic diversion advised.",
      color: "#ef4444", // red
    };
  }
}

/**
 * Calculates ASTM D6433 adapted Pavement Condition Index for all municipal wards.
 */
export async function calculateWardsPci(): Promise<MunicipalPciSummary> {
  const wards = await prisma.ward.findMany({
    include: {
      routes: true,
      issues: {
        include: {
          analysis: true,
          resolutions: true,
        },
      },
    },
    orderBy: { number: "asc" },
  });

  const wardScores: PciWardScore[] = wards.map((ward) => {
    // Total road length in Ward
    const totalRoadDistanceKm = ward.routes.reduce((sum, r) => sum + (r.distance || 0), 0) || 5.0;

    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let garbageCount = 0;
    let resolvedCount = 0;

    ward.issues.forEach((issue) => {
      const isResolved = issue.status === "RESOLVED" || issue.status === "FIXED";
      if (isResolved) {
        resolvedCount++;
        return;
      }

      if (issue.type === "GARBAGE") {
        garbageCount++;
        return;
      }

      const severity = issue.analysis?.severity || "MEDIUM";
      if (severity === "CRITICAL") criticalCount++;
      else if (severity === "HIGH") highCount++;
      else if (severity === "MEDIUM") mediumCount++;
      else lowCount++;
    });

    const openIssuesCount = criticalCount + highCount + mediumCount + lowCount + garbageCount;

    // Deduct values (ASTM D6433 severity weighting)
    const rawDeduct =
      criticalCount * 24 +
      highCount * 14 +
      mediumCount * 7 +
      lowCount * 2.5 +
      garbageCount * 4;

    // Normalize deduct based on ward road distance (standard baseline 8 km)
    const distanceFactor = 8.0 / Math.max(3.0, totalRoadDistanceKm);
    const normalizedDeduct = Math.min(92, rawDeduct * distanceFactor);

    // Resolution bonus (up to +15 pts for resolving defects)
    const resolutionBonus = Math.min(15, resolvedCount * 3);

    const calculatedPci = Math.max(8, Math.min(100, Math.round(100 - normalizedDeduct + resolutionBonus)));
    const ratingInfo = determineRating(calculatedPci);

    const potholeDensity = Number((openIssuesCount / Math.max(1, totalRoadDistanceKm)).toFixed(2));

    return {
      wardId: ward.id,
      wardName: ward.name,
      wardNumber: ward.number,
      pciScore: calculatedPci,
      conditionRating: ratingInfo.rating,
      totalRoadDistanceKm: Number(totalRoadDistanceKm.toFixed(1)),
      openIssuesCount,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      resolvedCount,
      potholeDensityPerKm: potholeDensity,
      recommendation: ratingInfo.recommendation,
      color: ratingInfo.color,
    };
  });

  // Calculate Municipal-wide averages
  const totalWards = wardScores.length || 1;
  const cityOverallPci = Math.round(
    wardScores.reduce((sum, w) => sum + w.pciScore, 0) / totalWards
  );
  const cityRating = determineRating(cityOverallPci).rating;
  const totalKm = Number(wardScores.reduce((sum, w) => sum + w.totalRoadDistanceKm, 0).toFixed(1));
  const totalActive = wardScores.reduce((sum, w) => sum + w.openIssuesCount, 0);
  const totalResolved = wardScores.reduce((sum, w) => sum + w.resolvedCount, 0);
  const criticalWards = wardScores.filter((w) => w.conditionRating === "CRITICAL" || w.conditionRating === "POOR").length;

  return {
    cityOverallPci,
    cityConditionRating: cityRating,
    totalWardsEvaluated: wardScores.length,
    totalRoadKilometers: totalKm,
    totalActivePotholes: totalActive,
    totalResolvedPotholes: totalResolved,
    wardsAtCriticalRisk: criticalWards,
    wardScores,
  };
}

/**
 * Calculates PCI scores on an individual route level.
 */
export async function calculateRoutesPci(): Promise<PciRouteScore[]> {
  const routes = await prisma.route.findMany({
    include: {
      ward: true,
      issues: {
        include: {
          analysis: true,
        },
      },
    },
  });

  return routes.map((route) => {
    const dist = route.distance || 1.5;
    let criticalDefects = 0;
    let highDefects = 0;
    let otherDefects = 0;
    let resolved = 0;

    route.issues.forEach((i) => {
      if (i.status === "RESOLVED" || i.status === "FIXED") {
        resolved++;
      } else {
        const sev = i.analysis?.severity || "MEDIUM";
        if (sev === "CRITICAL") criticalDefects++;
        else if (sev === "HIGH") highDefects++;
        else otherDefects++;
      }
    });

    const openTotal = criticalDefects + highDefects + otherDefects;
    const deduct = Math.min(90, (criticalDefects * 28 + highDefects * 16 + otherDefects * 6) / Math.max(0.5, dist));
    const bonus = Math.min(12, resolved * 4);
    const score = Math.max(10, Math.min(100, Math.round(100 - deduct + bonus)));
    const ratingInfo = determineRating(score);

    return {
      routeId: route.id,
      routeName: route.name,
      wardId: route.wardId,
      wardName: route.ward?.name || "Unknown Ward",
      distanceKm: Number(dist.toFixed(2)),
      pciScore: score,
      conditionRating: ratingInfo.rating,
      openDefectsCount: openTotal,
      criticalDefects,
      recommendation: ratingInfo.recommendation,
    };
  });
}
