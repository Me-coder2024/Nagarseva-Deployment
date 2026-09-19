import { prisma } from "../lib/prisma.js";

export interface GeoPoint {
  id: string;
  latitude: number;
  longitude: number;
  type?: string;
  severity?: string;
  wardName?: string;
  routeName?: string;
  status?: string;
  imageUrl?: string;
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

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates.
 */
export function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Solves Traveling Salesperson Problem using Nearest Neighbor followed by 2-opt iterative improvement.
 */
function solveTsp(start: { latitude: number; longitude: number }, points: GeoPoint[]): GeoPoint[] {
  if (points.length <= 1) return [...points];

  // 1. Initial Nearest Neighbor Tour
  const unvisited = [...points];
  const tour: GeoPoint[] = [];
  let currentLat = start.latitude;
  let currentLon = start.longitude;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const pt = unvisited[i];
      if (!pt) continue;
      const d = calculateHaversineKm(currentLat, currentLon, pt.latitude, pt.longitude);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }

    const next = unvisited.splice(nearestIdx, 1)[0];
    if (next) {
      tour.push(next);
      currentLat = next.latitude;
      currentLon = next.longitude;
    }
  }

  // 2. 2-opt Heuristic Improvement
  if (tour.length >= 4) {
    let improved = true;
    let iterations = 0;
    const maxIterations = 50;

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;

      for (let i = 0; i < tour.length - 1; i++) {
        for (let k = i + 1; k < tour.length; k++) {
          const prevA = i === 0 ? start : (tour[i - 1] || start);
          const nodeA = tour[i];
          const nodeB = tour[k];
          const nextB = k === tour.length - 1 ? null : tour[k + 1];

          if (!nodeA || !nodeB) continue;

          const currentDist =
            calculateHaversineKm(prevA.latitude, prevA.longitude, nodeA.latitude, nodeA.longitude) +
            (nextB ? calculateHaversineKm(nodeB.latitude, nodeB.longitude, nextB.latitude, nextB.longitude) : 0);

          const newDist =
            calculateHaversineKm(prevA.latitude, prevA.longitude, nodeB.latitude, nodeB.longitude) +
            (nextB ? calculateHaversineKm(nodeA.latitude, nodeA.longitude, nextB.latitude, nextB.longitude) : 0);

          if (newDist < currentDist - 0.001) {
            // Reverse sub-array between i and k
            const reversedChunk = tour.slice(i, k + 1).reverse();
            tour.splice(i, reversedChunk.length, ...reversedChunk);
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }
  }

  return tour;
}

/**
 * Generates an optimal sequential repair route for an engineer.
 */
export async function optimizeEngineerRoute(
  engineerId: string,
  originLat?: number,
  originLon?: number
): Promise<TspRouteResult> {
  const engineer = await prisma.user.findUnique({
    where: { id: engineerId },
    include: {
      ward: true,
      issueAssigned: {
        include: {
          issue: {
            include: {
              ward: true,
              route: true,
              analysis: true,
            },
          },
        },
      },
    },
  });

  if (!engineer) {
    throw new Error("Engineer not found");
  }

  // Filter for active issues that need repair
  const activeAssignments = engineer.issueAssigned.filter(
    (a) => a.issue.status === "ASSIGNED" || a.issue.status === "IN_PROGRESS"
  );

  const points: GeoPoint[] = activeAssignments.map((a) => ({
    id: a.issue.id,
    latitude: a.issue.latitude,
    longitude: a.issue.longitude,
    type: a.issue.type,
    severity: a.issue.analysis?.severity || "MEDIUM",
    wardName: a.issue.ward?.name || engineer.ward?.name || "City Ward",
    routeName: a.issue.route?.name || "City Route",
    status: a.issue.status,
    imageUrl: a.issue.imageUrl,
  }));

  // Determine starting point (provided GPS origin, or first issue, or Vadodara Municipal default)
  const start = {
    latitude: originLat || points[0]?.latitude || 22.3072,
    longitude: originLon || points[0]?.longitude || 73.1812,
  };

  if (points.length === 0) {
    return {
      engineerId,
      engineerName: engineer.name,
      totalStops: 0,
      startLocation: start,
      totalDistanceKm: 0,
      estimatedTotalDurationMinutes: 0,
      unoptimizedDistanceKm: 0,
      distanceSavedKm: 0,
      efficiencyImprovementPct: 0,
      stops: [],
      googleMapsTurnByTurnUrl: "",
    };
  }

  // Compute Unoptimized Baseline Distance (order as assigned)
  let unoptimizedDist = 0;
  let prevLat = start.latitude;
  let prevLon = start.longitude;
  for (const pt of points) {
    unoptimizedDist += calculateHaversineKm(prevLat, prevLon, pt.latitude, pt.longitude);
    prevLat = pt.latitude;
    prevLon = pt.longitude;
  }

  // Solve 2-opt TSP
  const optimizedTour = solveTsp(start, points);

  // Build sequential stops
  let cumulativeDist = 0;
  prevLat = start.latitude;
  prevLon = start.longitude;

  const stops: OptimizedStop[] = optimizedTour.map((pt, idx) => {
    const distFromPrev = calculateHaversineKm(prevLat, prevLon, pt.latitude, pt.longitude);
    cumulativeDist += distFromPrev;
    prevLat = pt.latitude;
    prevLon = pt.longitude;

    // Estimate transit time: assume avg urban speed 25 km/h + 15 min repair per stop
    const drivingTimeMins = (distFromPrev / 25) * 60;
    const transitTimeMins = Math.round(drivingTimeMins);

    return {
      stopNumber: idx + 1,
      issueId: pt.id,
      type: pt.type || "POTHOLE",
      severity: pt.severity || "MEDIUM",
      status: pt.status || "ASSIGNED",
      latitude: pt.latitude,
      longitude: pt.longitude,
      wardName: pt.wardName || "Ward",
      routeName: pt.routeName || "Route",
      distanceFromPrevKm: Number(distFromPrev.toFixed(2)),
      cumulativeDistanceKm: Number(cumulativeDist.toFixed(2)),
      estimatedTransitMinutes: Math.max(1, transitTimeMins),
      imageUrl: pt.imageUrl || "",
      navigationUrl: `https://www.google.com/maps/dir/?api=1&destination=${pt.latitude},${pt.longitude}`,
    };
  });

  const totalDist = cumulativeDist;
  const distSaved = Math.max(0, unoptimizedDist - totalDist);
  const efficiencyImprovement = unoptimizedDist > 0 ? (distSaved / unoptimizedDist) * 100 : 0;
  const totalDurationMinutes = Math.round((totalDist / 25) * 60 + stops.length * 15);

  // Google Maps Multi-stop URL
  const waypoints = stops.map((s) => `${s.latitude},${s.longitude}`).join("/");
  const googleMapsUrl = `https://www.google.com/maps/dir/${start.latitude},${start.longitude}/${waypoints}`;

  return {
    engineerId,
    engineerName: engineer.name,
    totalStops: stops.length,
    startLocation: start,
    totalDistanceKm: Number(totalDist.toFixed(2)),
    estimatedTotalDurationMinutes: totalDurationMinutes,
    unoptimizedDistanceKm: Number(unoptimizedDist.toFixed(2)),
    distanceSavedKm: Number(distSaved.toFixed(2)),
    efficiencyImprovementPct: Math.round(efficiencyImprovement),
    stops,
    googleMapsTurnByTurnUrl: googleMapsUrl,
  };
}
