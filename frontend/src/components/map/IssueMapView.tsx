import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Issue } from '@/types';
import { getStatusColor, getIssueTypeLabel } from '@/lib/issueUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LocateFixed, Maximize2, AlertCircle, Droplets, Flame } from 'lucide-react';
import { BACKEND_URL } from '@/lib/backendUrl';

interface IssueMapViewProps {
  issues: Issue[];
  selectedIssue: Issue | null;
  onMarkerClick: (issue: Issue) => void;
  viewMode?: 'markers' | 'heatmap' | 'monsoon';
  focusedRouteCoords?: [number, number] | null;
}

// Custom marker icons based on NagarSeva issue status
const createMarkerIcon = (status: string, isSelected: boolean = false) => {
  const colors: Record<string, { bg: string; ring: string }> = {
    DETECTED: { bg: '#ef4444', ring: 'rgba(239, 68, 68, 0.4)' },
    ASSIGNED: { bg: '#64748b', ring: 'rgba(100, 116, 139, 0.4)' },
    IN_PROGRESS: { bg: '#3b82f6', ring: 'rgba(59, 130, 246, 0.4)' },
    FIXED: { bg: '#0ea5e9', ring: 'rgba(14, 165, 233, 0.4)' },
    RESOLVED: { bg: '#10b981', ring: 'rgba(16, 185, 129, 0.4)' },
    REJECTED: { bg: '#f97316', ring: 'rgba(249, 115, 22, 0.4)' },
  };

  const current = colors[status] || { bg: '#64748b', ring: 'rgba(100, 116, 139, 0.4)' };

  return L.divIcon({
    className: 'custom-pin-wrapper',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
        ${
          isSelected
            ? `<div style="position: absolute; inset: -4px; border-radius: 9999px; background: ${current.ring}; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
            : ''
        }
        <div style="
          width: 22px;
          height: 22px;
          background-color: ${current.bg};
          border: 2.5px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 4px 10px rgba(0,0,0,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
        ">
          <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 50%;"></div>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Component to handle map centering & animations
const MapCenterHandler = ({
  selectedIssue,
  focusedRouteCoords,
}: {
  selectedIssue: Issue | null;
  focusedRouteCoords?: [number, number] | null;
}) => {
  const map = useMap();

  useEffect(() => {
    if (selectedIssue) {
      map.flyTo([selectedIssue.latitude, selectedIssue.longitude], 16, {
        duration: 1.2,
      });
    }
  }, [selectedIssue, map]);

  useEffect(() => {
    if (focusedRouteCoords) {
      map.flyTo(focusedRouteCoords, 15, { duration: 1.2 });
    }
  }, [focusedRouteCoords, map]);

  return null;
};

// Map Controls Overlay Component
const MapOverlayControls = ({ onResetView }: { onResetView: () => void }) => {
  return (
    <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
      <Button
        variant="secondary"
        size="icon"
        onClick={onResetView}
        className="h-8 w-8 rounded-lg bg-background/90 backdrop-blur-md shadow-md hover:bg-background border text-foreground"
        title="Reset Map View"
      >
        <LocateFixed className="w-4 h-4" />
      </Button>
    </div>
  );
};

export const IssueMapView = ({
  issues,
  selectedIssue,
  onMarkerClick,
  viewMode = 'markers',
  focusedRouteCoords,
}: IssueMapViewProps) => {
  // Vadodara City Center Coordinates
  const defaultCenter: [number, number] = [22.3072, 73.1812];
  const defaultZoom = 13;

  const handleResetView = (mapInstance?: any) => {
    // will be handled by MapContainer ref if needed
  };

  return (
    <div className="relative w-full h-[520px] lg:h-[620px] rounded-xl overflow-hidden border border-border bg-card shadow-xs">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapCenterHandler
          selectedIssue={selectedIssue}
          focusedRouteCoords={focusedRouteCoords}
        />

        {/* MODE 1: PIN MARKERS */}
        {viewMode === 'markers' &&
          issues.map((issue) => {
            const isSelected = selectedIssue?.id === issue.id;
            return (
              <Marker
                key={issue.id}
                position={[issue.latitude, issue.longitude]}
                icon={createMarkerIcon(issue.status, isSelected)}
                eventHandlers={{
                  click: () => onMarkerClick(issue),
                }}
              >
                <Popup className="nagar-map-popup">
                  <div className="p-2 min-w-[200px] max-w-[240px] space-y-2">
                    {issue.imageUrl && (
                      <img
                        src={
                          issue.imageUrl.startsWith('data:') || issue.imageUrl.startsWith('http')
                            ? issue.imageUrl
                            : `${BACKEND_URL}${issue.imageUrl.startsWith('/') ? '' : '/'}${issue.imageUrl}`
                        }
                        alt="Issue thumbnail"
                        className="w-full h-20 object-cover rounded-md border"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {getIssueTypeLabel(issue.type)}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white ${getStatusColor(issue.status)}`}>
                          {issue.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {issue.wardName} &bull; {issue.routeName}
                      </p>
                    </div>

                    <button
                      onClick={() => onMarkerClick(issue)}
                      className="w-full py-1 text-center text-[11px] font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* MODE 2: DENSITY HEATMAP HOTSPOTS */}
        {viewMode === 'heatmap' &&
          issues.map((issue) => {
            const isCritical = issue.analysis?.severity === 'CRITICAL';
            const isHigh = issue.analysis?.severity === 'HIGH';
            const fillColor = isCritical ? '#dc2626' : isHigh ? '#f97316' : '#eab308';
            const strokeColor = isCritical ? '#991b1b' : isHigh ? '#c2410c' : '#ca8a04';
            const radius = isCritical ? 36 : isHigh ? 28 : 20;

            return (
              <CircleMarker
                key={`heat-${issue.id}`}
                center={[issue.latitude, issue.longitude]}
                radius={radius}
                pathOptions={{
                  fillColor: fillColor,
                  fillOpacity: 0.42,
                  color: strokeColor,
                  weight: 2,
                  dashArray: isCritical ? undefined : '2, 4',
                }}
                eventHandlers={{
                  click: () => onMarkerClick(issue),
                }}
              >
                <Popup>
                  <div className="p-2 min-w-[210px] space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: fillColor }}>
                      <Flame className="w-3.5 h-3.5" />
                      <span>{isCritical ? 'Critical Pothole Cluster' : isHigh ? 'High Density Hotspot' : 'Surface Wear Hotspot'}</span>
                    </div>
                    <p className="text-xs font-medium text-foreground">
                      {issue.wardName} - {issue.routeName}
                    </p>
                    {issue.analysis && (
                      <div className="text-[11px] bg-muted/60 p-1.5 rounded space-y-0.5 border">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Severity:</span>
                          <span className="font-semibold">{issue.analysis.severity}</span>
                        </div>
                        {issue.analysis.depthEstimateCm && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Est. Depth:</span>
                            <span className="font-semibold">{issue.analysis.depthEstimateCm} cm</span>
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => onMarkerClick(issue)}
                      className="w-full py-1 text-center text-[11px] font-medium bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 border"
                    >
                      Inspect Hotspot
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {/* MODE 3: MONSOON WATERLOGGING RISK */}
        {viewMode === 'monsoon' &&
          issues.map((issue) => (
            <CircleMarker
              key={`rain-${issue.id}`}
              center={[issue.latitude, issue.longitude]}
              radius={34}
              pathOptions={{
                fillColor: '#06b6d4',
                fillOpacity: 0.45,
                color: '#0284c7',
                weight: 2,
                dashArray: '5, 5',
              }}
              eventHandlers={{
                click: () => onMarkerClick(issue),
              }}
            >
              <Popup>
                <div className="p-2 min-w-[210px] space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-600">
                    <Droplets className="w-3.5 h-3.5" />
                    <span>Monsoon Flood Risk Zone</span>
                  </div>
                  <p className="text-xs font-medium text-foreground">
                    {issue.wardName} - {issue.routeName}
                  </p>
                  <p className="text-[11px] text-muted-foreground bg-cyan-50 dark:bg-cyan-950/30 p-1.5 rounded border border-cyan-200 dark:border-cyan-800">
                    ⚠️ Road depressions prone to runoff ponding during heavy showers.
                  </p>
                  <button
                    onClick={() => onMarkerClick(issue)}
                    className="w-full py-1 text-center text-[11px] font-medium bg-cyan-600 text-white rounded hover:bg-cyan-700"
                  >
                    View Flood Risk Details
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>

      {/* Floating Status Pill */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-lg border shadow-xs text-xs flex items-center gap-2 pointer-events-none">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-medium text-foreground">
          {issues.length} {issues.length === 1 ? 'Location' : 'Locations'} Active
        </span>
      </div>
    </div>
  );
};
