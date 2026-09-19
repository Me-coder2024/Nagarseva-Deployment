import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useRoutes, useSurveyors, useWards } from "@/hooks/useData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Route as RouteIcon, MapPin, Plus, Navigation, ChevronDown, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

// Preset Vadodara Landmarks for municipal survey corridor selection
const VADODARA_LANDMARKS = [
  { id: 'alkapuri', name: 'Alkapuri Railway Station Circle', lat: 22.3085, lon: 73.1732 },
  { id: 'oproad', name: 'OP Road Junction', lat: 22.3012, lon: 73.1610 },
  { id: 'birdcircle', name: 'Bird Circle (Old Padra Road)', lat: 22.3150, lon: 73.1850 },
  { id: 'sayajigunj', name: 'Sayajigunj Clock Tower', lat: 22.3100, lon: 73.1812 },
  { id: 'fatehgunj', name: 'Fatehgunj Circle', lat: 22.3250, lon: 73.1900 },
  { id: 'akota', name: 'Akota Stadium Road', lat: 22.2980, lon: 73.1700 },
  { id: 'gotri', name: 'Gotri Medical Campus', lat: 22.3200, lon: 73.1450 },
  { id: 'karelibaug', name: 'Karelibaug Water Tank', lat: 22.3310, lon: 73.2050 },
  { id: 'manjalpur', name: 'Manjalpur Cross Road', lat: 22.2750, lon: 73.1920 },
  { id: 'makarpura', name: 'Makarpura GIDC Estate', lat: 22.2500, lon: 73.1950 },
  { id: 'gorwa', name: 'Gorwa Industrial Area', lat: 22.3380, lon: 73.1550 },
  { id: 'tarsali', name: 'Tarsali Bypass Junction', lat: 22.2580, lon: 73.2100 },
  { id: 'subhanpura', name: 'Subhanpura High Street', lat: 22.3250, lon: 73.1600 },
  { id: 'sama', name: 'Sama Lake Park', lat: 22.3420, lon: 73.2020 },
  { id: 'waghodia', name: 'Waghodia Ring Road', lat: 22.3050, lon: 73.2350 },
  { id: 'custom', name: '✏️ Custom Location Coordinates', lat: 22.3000, lon: 73.1800 },
];

const calculateHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Math.max(0.5, Math.round(dist * 10) / 10).toString();
};

import { RouteMapPicker } from "@/components/map/RouteMapPicker";

const Routes = () => {
  const { data: routes, assignSurveyor, createRoute, updateRoute, deleteRoute } = useRoutes();
  const { data: surveyors } = useSurveyors();
  const { data: wards } = useWards();
  const { t } = useTranslation();
  const [filterWard, setFilterWard] = useState<string>("all");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [editingRoute, setEditingRoute] = useState<any>(null);
  const [selectedSurveyor, setSelectedSurveyor] = useState<string>("");

  // Survey Route Corridor State
  const [startLandmarkId, setStartLandmarkId] = useState<string>("alkapuri");
  const [endLandmarkId, setEndLandmarkId] = useState<string>("birdcircle");
  const [newRouteName, setNewRouteName] = useState("Alkapuri Railway Station Circle to Bird Circle (Old Padra Road)");
  const [newWardId, setNewWardId] = useState("");
  const [newDistance, setNewDistance] = useState("2.5");
  const [newStartLat, setNewStartLat] = useState("22.3085");
  const [newStartLon, setNewStartLon] = useState("73.1732");
  const [newEndLat, setNewEndLat] = useState("22.3150");
  const [newEndLon, setNewEndLon] = useState("73.1850");
  const [activeMapMode, setActiveMapMode] = useState<'START' | 'END' | null>('START');
  const [showAdvancedCoords, setShowAdvancedCoords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Route state
  const [editRouteName, setEditRouteName] = useState("");
  const [editWardId, setEditWardId] = useState("");
  const [editDistance, setEditDistance] = useState("2.5");

  const handleOpenEditRoute = (route: any) => {
    setEditingRoute(route);
    setEditRouteName(route.name);
    setEditWardId(route.wardId);
    setEditDistance(route.distance ? route.distance.toString() : "2.5");
    setEditDialogOpen(true);
  };

  const handleUpdateRoute = async () => {
    if (!editingRoute || !editRouteName.trim() || !editWardId) {
      toast.error("Please fill in route name and ward");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await updateRoute(editingRoute.id, {
        name: editRouteName.trim(),
        wardId: editWardId,
        distance: parseFloat(editDistance) || 2.5,
      });
      if (res && res.success) {
        toast.success("Route updated successfully");
        setEditDialogOpen(false);
        setEditingRoute(null);
      } else {
        toast.error(res?.message || "Failed to update route");
      }
    } catch (err: any) {
      toast.error(err.message || "Error updating route");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRoute = async (route: any) => {
    if (route.status === "ASSIGNED") {
      toast.error("Cannot delete route with assigned surveyor. Please unassign first.");
      return;
    }
    if (window.confirm(`Are you sure you want to delete route "${route.name}"?`)) {
      try {
        const res = await deleteRoute(route.id);
        if (res && res.success) {
          toast.success("Route deleted successfully");
        } else {
          toast.error(res?.message || "Failed to delete route. Check if route has active assignments or issues.");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to delete route.");
      }
    }
  };

  const handleSelectStartOnMap = (lat: number, lon: number) => {
    setNewStartLat(lat.toString());
    setNewStartLon(lon.toString());
    setStartLandmarkId('custom');
    const eLat = parseFloat(newEndLat) || 22.3150;
    const eLon = parseFloat(newEndLon) || 73.1850;
    const dist = calculateHaversineDistance(lat, lon, eLat, eLon);
    setNewDistance(dist);
  };

  const handleSelectEndOnMap = (lat: number, lon: number) => {
    setNewEndLat(lat.toString());
    setNewEndLon(lon.toString());
    setEndLandmarkId('custom');
    const sLat = parseFloat(newStartLat) || 22.3085;
    const sLon = parseFloat(newStartLon) || 73.1732;
    const dist = calculateHaversineDistance(sLat, sLon, lat, lon);
    setNewDistance(dist);
  };

  const handleStartLandmarkChange = (landmarkId: string) => {
    setStartLandmarkId(landmarkId);
    const landmark = VADODARA_LANDMARKS.find(l => l.id === landmarkId);
    if (landmark && landmarkId !== 'custom') {
      const sLat = landmark.lat;
      const sLon = landmark.lon;
      const eLat = parseFloat(newEndLat) || 22.3150;
      const eLon = parseFloat(newEndLon) || 73.1850;

      setNewStartLat(sLat.toString());
      setNewStartLon(sLon.toString());

      const dist = calculateHaversineDistance(sLat, sLon, eLat, eLon);
      setNewDistance(dist);

      const endLandmark = VADODARA_LANDMARKS.find(l => l.id === endLandmarkId);
      if (endLandmark && endLandmark.id !== 'custom') {
        setNewRouteName(`${landmark.name} to ${endLandmark.name}`);
      }
    }
  };

  const handleEndLandmarkChange = (landmarkId: string) => {
    setEndLandmarkId(landmarkId);
    const landmark = VADODARA_LANDMARKS.find(l => l.id === landmarkId);
    if (landmark && landmarkId !== 'custom') {
      const sLat = parseFloat(newStartLat) || 22.3085;
      const sLon = parseFloat(newStartLon) || 73.1732;
      const eLat = landmark.lat;
      const eLon = landmark.lon;

      setNewEndLat(eLat.toString());
      setNewEndLon(eLon.toString());

      const dist = calculateHaversineDistance(sLat, sLon, eLat, eLon);
      setNewDistance(dist);

      const startLandmark = VADODARA_LANDMARKS.find(l => l.id === startLandmarkId);
      if (startLandmark && startLandmark.id !== 'custom') {
        setNewRouteName(`${startLandmark.name} to ${landmark.name}`);
      }
    }
  };


  const filteredRoutes =
    routes?.filter((route) => {
      return filterWard === "all" || route.wardId === filterWard;
    }) || [];

  // Group routes by ward
  const groupedRoutes = filteredRoutes.reduce(
    (acc, route) => {
      if (!acc[route.wardName]) {
        acc[route.wardName] = [];
      }
      acc[route.wardName].push(route);
      return acc;
    },
    {} as Record<string, typeof filteredRoutes>,
  );

  const handleAssign = async () => {
    if (!selectedRoute || !selectedSurveyor) {
      toast.error(t('routesPage.selectSurveyorError'));
      return;
    }
    const surveyor = surveyors?.find((s) => s.id === selectedSurveyor);
    if (surveyor) {
      setIsSubmitting(true);
      try {
        const res = await assignSurveyor(selectedRoute, surveyor.id, surveyor.name);
        if (res && res.success) {
          toast.success(t('routesPage.surveyorAssignedSuccess'));
          setAssignDialogOpen(false);
          setSelectedRoute(null);
          setSelectedSurveyor("");
        } else {
          toast.error(res?.message || "Failed to assign route.");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to assign route.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleCreateRoute = async () => {
    if (!newRouteName.trim()) {
      toast.error("Please enter a route name");
      return;
    }
    if (!newWardId) {
      toast.error("Please select a ward");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createRoute({
        name: newRouteName.trim(),
        wardId: newWardId,
        distance: parseFloat(newDistance) || 2.5,
        startLat: parseFloat(newStartLat) || 22.3085,
        startLon: parseFloat(newStartLon) || 73.1732,
        endLat: parseFloat(newEndLat) || 22.3150,
        endLon: parseFloat(newEndLon) || 73.1850,
      });

      if (res && res.success) {
        toast.success("Custom Route Created Successfully!");
        setCreateDialogOpen(false);
        setNewRouteName("");
        setNewWardId("");
      } else {
        toast.error(res?.message || "Failed to create route");
      }
    } catch (err: any) {
      toast.error(err.message || "Error creating route");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAssignDialog = (routeId: string) => {
    setSelectedRoute(routeId);
    setAssignDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {t('routesPage.title')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('routesPage.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Select value={filterWard} onValueChange={setFilterWard}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('routesPage.filterByWard')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('mapView.allWards')}</SelectItem>
                {wards?.map((ward) => (
                  <SelectItem key={ward.id} value={ward.id}>
                    {ward.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Create Custom Route Button */}
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white"
            >
              <Plus className="w-4 h-4" /> Create Custom Route
            </Button>
          </div>
        </div>

        {Object.entries(groupedRoutes).map(([wardName, wardRoutes]) => (
          <Card key={wardName}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                {wardName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('routesPage.routeName')}</TableHead>
                    <TableHead>{t('routesPage.assignedSurveyor')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wardRoutes.map((route) => (
                    <TableRow key={route.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <RouteIcon className="w-4 h-4 text-muted-foreground" />
                          {route.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {route.assignedSurveyorName || (
                          <span className="text-muted-foreground italic">
                            {t('routesPage.unassigned')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            route.status === "ASSIGNED" ? "default" : "outline"
                          }
                        >
                          {route.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={route.status === "ASSIGNED"}
                            onClick={() => openAssignDialog(route.id)}
                          >
                            <UserPlus className="w-4 h-4 mr-1" />
                            {route.status === "ASSIGNED" ? t('routesPage.assigned') : t('routesPage.assign')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditRoute(route)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRoute(route)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        {Object.keys(groupedRoutes).length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <RouteIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">{t('routesPage.noRoutesFound')}</p>
            </CardContent>
          </Card>
        )}

        {/* Assign Surveyor Modal */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('routesPage.assignSurveyor')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('routesPage.selectSurveyor')}</label>
                <Select
                  value={selectedSurveyor}
                  onValueChange={setSelectedSurveyor}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('routesPage.chooseSurveyor')} />
                  </SelectTrigger>
                  <SelectContent>
                    {surveyors?.map((surveyor) => (
                      <SelectItem key={surveyor.id} value={surveyor.id}>
                        {surveyor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAssign} className="w-full">
                {t('routesPage.confirmAssignment')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Custom Survey Route Modal */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Navigation className="w-5 h-5 text-primary animate-pulse" /> Create Municipal Route
              </DialogTitle>
              <DialogDescription>
                Define road survey start corridor and end destination coordinates.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Survey Corridor Selection Card */}
              <div className="p-4 rounded-xl bg-gradient-to-b from-muted/50 to-muted/20 border border-border/80 relative space-y-3">
                {/* Vertical Dotted Connector Line */}
                <div className="absolute left-[27px] top-[42px] bottom-[42px] w-0.5 border-l-2 border-dashed border-primary/50 z-0" />

                {/* Start Location (Green Start Corridor) */}
                <div className="relative z-10 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/40 flex items-center justify-center font-bold text-xs shrink-0 mt-1 shadow-sm">
                    🟢
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                        Survey Start Point (Start Corridor)
                      </label>
                      <button
                        type="button"
                        onClick={() => setActiveMapMode('START')}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-all flex items-center gap-1 ${
                          activeMapMode === 'START'
                            ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                            : 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
                        }`}
                      >
                        📍 {activeMapMode === 'START' ? 'Active on Map' : 'Mark on Map'}
                      </button>
                    </div>
                    <Select value={startLandmarkId} onValueChange={handleStartLandmarkChange}>
                      <SelectTrigger className="bg-background font-medium text-xs h-9 border-emerald-200 dark:border-emerald-950 focus:ring-emerald-500">
                        <SelectValue placeholder="Select Starting Point" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {VADODARA_LANDMARKS.map((landmark) => (
                          <SelectItem key={landmark.id} value={landmark.id} className="text-xs">
                            {landmark.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* End Location (Red End Corridor) */}
                <div className="relative z-10 flex items-start gap-3 pt-1">
                  <div className="w-7 h-7 rounded-full bg-rose-500/15 text-rose-600 border border-rose-500/40 flex items-center justify-center font-bold text-xs shrink-0 mt-1 shadow-sm">
                    🔴
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
                        Survey End Point (End Corridor)
                      </label>
                      <button
                        type="button"
                        onClick={() => setActiveMapMode('END')}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-all flex items-center gap-1 ${
                          activeMapMode === 'END'
                            ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400'
                            : 'bg-rose-500/10 text-rose-700 hover:bg-rose-500/20'
                        }`}
                      >
                        📍 {activeMapMode === 'END' ? 'Active on Map' : 'Mark on Map'}
                      </button>
                    </div>
                    <Select value={endLandmarkId} onValueChange={handleEndLandmarkChange}>
                      <SelectTrigger className="bg-background font-medium text-xs h-9 border-rose-200 dark:border-rose-950 focus:ring-rose-500">
                        <SelectValue placeholder="Select Destination Point" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {VADODARA_LANDMARKS.map((landmark) => (
                          <SelectItem key={landmark.id} value={landmark.id} className="text-xs">
                            {landmark.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Interactive Corridor Map Picker View */}
              <RouteMapPicker
                startLat={parseFloat(newStartLat) || 22.3085}
                startLon={parseFloat(newStartLon) || 73.1732}
                endLat={parseFloat(newEndLat) || 22.3150}
                endLon={parseFloat(newEndLon) || 73.1850}
                activeMode={activeMapMode}
                onSelectStart={handleSelectStartOnMap}
                onSelectEnd={handleSelectEndOnMap}
              />

              {/* Calculated Distance & Route Info Badge */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-primary/10 text-primary font-bold text-xs px-2.5 py-0.5">
                    📍 Calculated Distance: {newDistance} KM
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedCoords(!showAdvancedCoords)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-primary underline transition-colors"
                >
                  {showAdvancedCoords ? "Hide Coordinates" : "View Coordinates (Lat/Lon)"}
                </button>
              </div>

              {/* Advanced Lat/Lon view (Collapsible) */}
              {showAdvancedCoords && (
                <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Start Lat</label>
                      <Input value={newStartLat} onChange={(e) => setNewStartLat(e.target.value)} className="h-7 text-xs font-mono" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Start Lon</label>
                      <Input value={newStartLon} onChange={(e) => setNewStartLon(e.target.value)} className="h-7 text-xs font-mono" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">End Lat</label>
                      <Input value={newEndLat} onChange={(e) => setNewEndLat(e.target.value)} className="h-7 text-xs font-mono" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">End Lon</label>
                      <Input value={newEndLon} onChange={(e) => setNewEndLon(e.target.value)} className="h-7 text-xs font-mono" />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Route Title *</label>
                <Input
                  placeholder="e.g. OP Road to Bird Circle"
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Municipal Ward *</label>
                <Select value={newWardId} onValueChange={setNewWardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Ward" />
                  </SelectTrigger>
                  <SelectContent>
                    {wards?.map((ward) => (
                      <SelectItem key={ward.id} value={ward.id}>
                        {ward.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleCreateRoute}
                disabled={isSubmitting}
                className="w-full mt-2 bg-primary hover:bg-primary/90 text-white shadow-md font-semibold"
              >
                {isSubmitting ? "Creating Route..." : "✨ Create Survey Route"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Route Modal */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Pencil className="w-5 h-5 text-primary" /> Edit Municipal Route
              </DialogTitle>
              <DialogDescription>
                Update route details and ward assignment.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Route Title *</label>
                <Input
                  placeholder="Route Name"
                  value={editRouteName}
                  onChange={(e) => setEditRouteName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Municipal Ward *</label>
                <Select value={editWardId} onValueChange={setEditWardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Ward" />
                  </SelectTrigger>
                  <SelectContent>
                    {wards?.map((ward) => (
                      <SelectItem key={ward.id} value={ward.id}>
                        {ward.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Distance (KM)</label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Distance in KM"
                  value={editDistance}
                  onChange={(e) => setEditDistance(e.target.value)}
                />
              </div>

              <Button
                onClick={handleUpdateRoute}
                disabled={isSubmitting}
                className="w-full mt-2 bg-primary hover:bg-primary/90 text-white shadow-md font-semibold"
              >
                {isSubmitting ? "Updating Route..." : "Update Route"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Routes;
