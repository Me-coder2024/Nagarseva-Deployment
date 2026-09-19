import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface RouteMapPickerProps {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  activeMode: 'START' | 'END' | null;
  onSelectStart: (lat: number, lon: number) => void;
  onSelectEnd: (lat: number, lon: number) => void;
}

// Custom Green Start Marker Icon
const startIcon = L.divIcon({
  className: 'custom-start-marker',
  html: `<div style="
    width: 32px;
    height: 32px;
    background-color: #10b981;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 14px;
  ">🟢</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Custom Red End Marker Icon
const endIcon = L.divIcon({
  className: 'custom-end-marker',
  html: `<div style="
    width: 32px;
    height: 32px;
    background-color: #f43f5e;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 4px 12px rgba(244, 63, 94, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 14px;
  ">🔴</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Map click event listener component
function MapEvents({ activeMode, onSelectStart, onSelectEnd }: {
  activeMode: 'START' | 'END' | null;
  onSelectStart: (lat: number, lon: number) => void;
  onSelectEnd: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      const lat = Math.round(e.latlng.lat * 10000) / 10000;
      const lon = Math.round(e.latlng.lng * 10000) / 10000;

      if (activeMode === 'START') {
        onSelectStart(lat, lon);
      } else if (activeMode === 'END') {
        onSelectEnd(lat, lon);
      } else {
        onSelectStart(lat, lon);
      }
    },
  });
  return null;
}

export const RouteMapPicker: React.FC<RouteMapPickerProps> = ({
  startLat,
  startLon,
  endLat,
  endLon,
  activeMode,
  onSelectStart,
  onSelectEnd,
}) => {
  const centerLat = (startLat + endLat) / 2 || 22.3072;
  const centerLon = (startLon + endLon) / 2 || 73.1812;

  const routePolyline: [number, number][] = [
    [startLat, startLon],
    [endLat, endLon],
  ];

  return (
    <div className="relative w-full h-56 rounded-xl overflow-hidden border border-border shadow-inner my-2">
      {/* Overlay Banner showing active map picking mode */}
      <div className={`absolute top-2 left-2 right-2 z-[1000] px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md backdrop-blur-md flex items-center justify-between transition-colors ${
        activeMode === 'START' 
          ? 'bg-emerald-500/90 text-white animate-pulse' 
          : activeMode === 'END'
          ? 'bg-rose-500/90 text-white animate-pulse'
          : 'bg-background/90 text-foreground border border-border'
      }`}>
        <span>
          {activeMode === 'START' && '🟢 Click on map to set Survey Start Location'}
          {activeMode === 'END' && '🔴 Click on map to set Survey End Location'}
          {!activeMode && '🗺️ Click map or drag markers to pick corridor coordinates'}
        </span>
        <span className="text-[10px] opacity-80 uppercase tracking-wider font-mono">Survey Map View</span>
      </div>

      <MapContainer
        center={[centerLat, centerLon]}
        zoom={13}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Start Location Marker */}
        <Marker
          position={[startLat, startLon]}
          icon={startIcon}
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const position = marker.getLatLng();
              onSelectStart(
                Math.round(position.lat * 10000) / 10000,
                Math.round(position.lng * 10000) / 10000
              );
            },
          }}
        >
          <Popup>🟢 Survey Start Corridor</Popup>
        </Marker>

        {/* End Location Marker */}
        <Marker
          position={[endLat, endLon]}
          icon={endIcon}
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const position = marker.getLatLng();
              onSelectEnd(
                Math.round(position.lat * 10000) / 10000,
                Math.round(position.lng * 10000) / 10000
              );
            },
          }}
        >
          <Popup>🔴 Survey End Corridor</Popup>
        </Marker>

        {/* Route Connecting Line (Corridor Polyline) */}
        <Polyline
          positions={routePolyline}
          pathOptions={{
            color: '#3b82f6',
            weight: 4,
            dashArray: '8, 8',
            opacity: 0.8,
          }}
        />

        <MapEvents
          activeMode={activeMode}
          onSelectStart={onSelectStart}
          onSelectEnd={onSelectEnd}
        />
      </MapContainer>
    </div>
  );
};
