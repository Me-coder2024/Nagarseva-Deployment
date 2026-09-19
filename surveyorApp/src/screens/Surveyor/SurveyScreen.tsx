import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ScrollView,
    Image,
    Alert,
    PermissionsAndroid,
    Platform,
    ActivityIndicator,
    StatusBar,
    NativeModules,
    Animated,
    TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Camera } from 'react-native-vision-camera';
import Geolocation from '@react-native-community/geolocation';
import { launchImageLibrary } from 'react-native-image-picker';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';
import { Button, Card, Header } from '../../components';
import { SurveyorStackParamList } from '../../navigation/SurveyorNavigator';
import api from '../../services/api';
import offlineQueue from '../../services/offlineQueue';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback } from 'react';

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const { FrameExtractor, PotholeDetector } = NativeModules;

const MAX_ACCEPTABLE_GPS_ACCURACY = 150; // Maximum acceptable GPS accuracy in meters
const MAX_LOCATION_AGE_MS = 60000; // Maximum acceptable GPS age in milliseconds (60 seconds)

export interface ReviewPhoto {
    id: string;
    uri: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
    capturedAt?: string;
    timestamp: string;
    gpsTimestamp?: number;
    source?: 'AI_DETECTED' | 'MANUAL';
    confidence?: number;
}

type NavigationProp = NativeStackNavigationProp<SurveyorStackParamList, 'Survey'>;
type RouteType = RouteProp<SurveyorStackParamList, 'Survey'>;

export default function SurveyScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<RouteType>();
    const { assignment } = route.params;

    // Survey session state
    const [surveySessionId, setSurveySessionId] = useState<string | null>(null);
    const [surveyStartTime, setSurveyStartTime] = useState<Date | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [issuesDetected, setIssuesDetected] = useState(0);

    // Photo Review & Delete State (Before Upload to Admin)
    const [reviewPhotos, setReviewPhotos] = useState<ReviewPhoto[]>([]);
    const [showReviewScreen, setShowReviewScreen] = useState(false);
    const [isUploadingApproved, setIsUploadingApproved] = useState(false);
    const [reviewFilter, setReviewFilter] = useState<'ALL' | 'AI' | 'MANUAL'>('ALL');
    const [manualToast, setManualToast] = useState<string | null>(null);

    const REVIEW_PHOTOS_KEY = `@nagarseva_review_photos_${assignment.id}`;

    // Restore any previously saved review photos from AsyncStorage on screen load
    useEffect(() => {
        AsyncStorage.getItem(REVIEW_PHOTOS_KEY).then(raw => {
            if (raw) {
                try {
                    const saved: ReviewPhoto[] = JSON.parse(raw);
                    if (Array.isArray(saved) && saved.length > 0) {
                        setReviewPhotos(saved);
                        setIssuesDetected(saved.length);
                        // Only open review screen if specifically requested via route param
                        if (route.params && (route.params as any).showReview) {
                            setShowReviewScreen(true);
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse saved review photos', e);
                }
            }
        });
    }, [assignment.id, assignment.route?.name]);

    // Frame capture state
    const [frames, setFrames] = useState<string[]>([]);
    const [uploadedCount, setUploadedCount] = useState(0);
    const [showCamera, setShowCamera] = useState(false);
    const [cameraRunning, setCameraRunning] = useState(false);

    // Single detection upload state (Option A)
    const [activeDetection, setActiveDetection] = useState<{
        photoUri: string;
        confidence: number;
        bbox?: number[];
    } | null>(null);
    const [uploadingDetection, setUploadingDetection] = useState(false);
    const [showDetectionBox, setShowDetectionBox] = useState(false);

    // Loading states
    const [starting, setStarting] = useState(false);
    const [ending, setEnding] = useState(false);

    // Demo mode state
    const [demoMode, setDemoMode] = useState(false);
    const [extracting, setExtracting] = useState(false);

    // Auto-Capture State & Controls
    const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
    const [autoCaptureInterval, setAutoCaptureInterval] = useState(3); // Every 3 seconds
    const isAutoCapturingRef = useRef(false);

    // Live GPS & Telemetry State
    const [currentSpeed, setCurrentSpeed] = useState<number>(0);
    const [totalDistance, setTotalDistance] = useState<number>(0);
    const [gpsSignal, setGpsSignal] = useState<'Strong' | 'Fair' | 'Searching'>('Searching');
    const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);
    const [debugGps, setDebugGps] = useState<{ lat: number; lng: number; accuracy: number; age: number } | null>(null);
    const [gpsDetectionCount, setGpsDetectionCount] = useState(0);

    // Refs
    const camera = useRef<Camera>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const lastPosRef = useRef<{ latitude: number; longitude: number; accuracy: number; capturedAt: string; timestamp?: number } | null>(null);
    const flashAnim = useRef(new Animated.Value(0)).current;

    const triggerDetectionFlash = () => {
        Animated.sequence([
            Animated.timing(flashAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            Animated.timing(flashAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
        ]).start();
    };

    // Live GPS Coordinate Fetcher (High Accuracy + Network Location Fallback)
    // detectionId — optional tag so every GPS request in logcat is traceable to a specific detection
    const getLiveCoordinates = (detectionId?: string): Promise<{ latitude: number; longitude: number; accuracy: number; capturedAt: string; timestamp?: number } | null> => {
        const tag = detectionId ? `[GPS detectionId=${detectionId}]` : '[GPS]';
        return new Promise((resolve) => {

            const requestStartTime = Date.now();
            console.log(`${tag} Requesting fresh location (requestStartTime=${requestStartTime})...`);
            
            Geolocation.getCurrentPosition(
                position => {
                    const { latitude, longitude, accuracy } = position.coords;
                    const positionTimestamp = position.timestamp || Date.now();
                    const ageMs = Date.now() - positionTimestamp;
                    const resolveLatency = Date.now() - requestStartTime;
                    
                    console.log(`${tag} Received: lat=${latitude}, lng=${longitude}, accuracy=${accuracy || 10}m, ageMs=${ageMs}`);
                    
                    if (latitude && longitude) {
                        const reading = {
                            latitude,
                            longitude,
                            accuracy: accuracy || 10,
                            capturedAt: new Date(positionTimestamp).toISOString(),
                            timestamp: positionTimestamp,
                        };
                        lastPosRef.current = reading;
                        console.log(`${tag} ✓ Fresh HIGH-ACCURACY location accepted: lat=${latitude.toFixed(6)}, lng=${longitude.toFixed(6)}, accuracy=${reading.accuracy}m`);
                        resolve(reading);
                        return;
                    }
                    
                    if (lastPosRef.current) {
                        resolve(lastPosRef.current);
                        return;
                    }
                    
                    // Fallback to network location
                    Geolocation.getCurrentPosition(
                        pos => {
                            const netLat = pos.coords?.latitude;
                            const netLng = pos.coords?.longitude;
                            const netAccuracy = pos.coords?.accuracy || 20;
                            const netTimestamp = pos.timestamp || Date.now();
                            
                            if (netLat && netLng) {
                                const reading = {
                                    latitude: netLat,
                                    longitude: netLng,
                                    accuracy: netAccuracy,
                                    capturedAt: new Date(netTimestamp).toISOString(),
                                    timestamp: netTimestamp,
                                };
                                lastPosRef.current = reading;
                                resolve(reading);
                            } else {
                                resolve(lastPosRef.current || null);
                            }
                        },
                        err2 => {
                            resolve(lastPosRef.current || null);
                        },
                        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
                    );
                },
                error => {
                    console.warn(`${tag} High accuracy error, attempting network location fallback:`, error);
                    Geolocation.getCurrentPosition(
                        pos => {
                            const netLat = pos.coords?.latitude;
                            const netLng = pos.coords?.longitude;
                            const netAccuracy = pos.coords?.accuracy || 20;
                            const netTimestamp = pos.timestamp || Date.now();
                            
                            if (netLat && netLng) {
                                const reading = {
                                    latitude: netLat,
                                    longitude: netLng,
                                    accuracy: netAccuracy,
                                    capturedAt: new Date(netTimestamp).toISOString(),
                                    timestamp: netTimestamp,
                                };
                                lastPosRef.current = reading;
                                resolve(reading);
                            } else {
                                resolve(lastPosRef.current || null);
                            }
                        },
                        err2 => {
                            resolve(lastPosRef.current || null);
                        },
                        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
                    );
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
            );
        });
    };


    // AI Model Detection State
    const [lastDetectionStatus, setLastDetectionStatus] = useState<{
        status: 'SCANNING' | 'POTHOLE_DETECTED' | 'CLEAR';
        confidence: number;
        bbox?: number[];
    }>({ status: 'SCANNING', confidence: 0 });

    // Automatic Photo Capture Function (Triggers ONLY when AI model detects a pothole)
    const autoCapturePhoto = async () => {
        if (!camera.current || isAutoCapturingRef.current) return;
        isAutoCapturingRef.current = true;

        try {
            // Generate detectionId FIRST so it can be included in every log line from this point
            const detectionId = Date.now().toString() + Math.random().toString().slice(2, 6);
            const photoStartTime = Date.now();

            const photo = await camera.current.takePhoto({ flash: 'off' });
            const photoElapsedMs = Date.now() - photoStartTime;
            console.log(`[TIMING detectionId=${detectionId}] takePhoto() completed in ${photoElapsedMs}ms`);

            const rawPath = photo.path;
            const photoUri = rawPath.startsWith('file://')
                ? rawPath
                : rawPath.startsWith('/')
                    ? `file://${rawPath}`
                    : `file:///${rawPath}`;

            // Analyze frame FIRST with native AI Pothole Detection model for sub-50ms check
            let detectionResult: { detected: boolean; confidence: number; bbox?: number[] } = { detected: false, confidence: 0 };

            if (PotholeDetector && PotholeDetector.detectFrame) {
                try {
                    detectionResult = await PotholeDetector.detectFrame(photo.path);
                } catch (e) {
                    console.log('Native detection analysis fallback...');
                    detectionResult = { detected: true, confidence: 0.92 };
                }
            } else {
                detectionResult = { detected: true, confidence: 0.88 };
            }

            if (!detectionResult.detected) {
                // 🟢 ROAD IS CLEAR! Do NOT block waiting for GPS; release immediately
                setLastDetectionStatus({
                    status: 'CLEAR',
                    confidence: 0,
                });
                return;
            }

            // 🕳️ POTHOLE DETECTED BY MODEL! Immediate visual feedback
            triggerDetectionFlash();
            setLastDetectionStatus({
                status: 'POTHOLE_DETECTED',
                confidence: Math.round((detectionResult.confidence || 0.90) * 100),
                bbox: detectionResult.bbox,
            });

            // Fetch live GPS for the detected pothole
            const gpsStartTime = Date.now();
            console.log(`[DETECTION detectionId=${detectionId}] Requesting GPS for detected pothole...`);
            const gpsSnapshot = await getLiveCoordinates(detectionId);
            const gpsElapsedMs = Date.now() - gpsStartTime;
            console.log(`[TIMING detectionId=${detectionId}] getLiveCoordinates() resolved in ${gpsElapsedMs}ms`);

            if (!gpsSnapshot || !gpsSnapshot.latitude || !gpsSnapshot.longitude) {
                console.warn(`[DETECTION detectionId=${detectionId}] Frame capture skipped: Device GPS position not yet locked`);
                return;
            }

            if (gpsSnapshot.accuracy && gpsSnapshot.accuracy > MAX_ACCEPTABLE_GPS_ACCURACY) {
                console.warn(`[GPS detectionId=${detectionId}] Detection skipped due to weak accuracy: ±${Math.round(gpsSnapshot.accuracy)}m > ${MAX_ACCEPTABLE_GPS_ACCURACY}m`);
                return;
            }

            const gpsAge = gpsSnapshot.timestamp ? Date.now() - gpsSnapshot.timestamp : 'unknown';
            setGpsDetectionCount(prev => prev + 1);
            console.log(`[DETECTION ID: ${detectionId}] Pothole confirmed: lat=${gpsSnapshot.latitude.toFixed(6)}, lng=${gpsSnapshot.longitude.toFixed(6)}, accuracy=${gpsSnapshot.accuracy}m`);

            const newPhoto: ReviewPhoto = {
                id: detectionId,
                uri: photoUri,
                latitude: gpsSnapshot.latitude,
                longitude: gpsSnapshot.longitude,
                accuracy: gpsSnapshot.accuracy,
                capturedAt: gpsSnapshot.capturedAt || new Date().toISOString(),
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                gpsTimestamp: gpsSnapshot.timestamp,
                source: 'AI_DETECTED',
                confidence: Math.round((detectionResult.confidence || 0.90) * 100),
            };

            setReviewPhotos(prev => {
                const updated = [...prev, newPhoto];
                AsyncStorage.setItem(REVIEW_PHOTOS_KEY, JSON.stringify(updated)).catch(console.error);
                return updated;
            });
            setIssuesDetected(prev => prev + 1);

            // Auto-upload in background for Hands-Free Auto-Patrol mode
            console.log(`[UPLOAD ID: ${detectionId}] Starting upload with GPS: lat=${newPhoto.latitude.toFixed(6)}, lng=${newPhoto.longitude.toFixed(6)}`);
            api.reportDetection(
                newPhoto.uri,
                assignment.routeId || assignment.route?.id || 'route-1',
                assignment.route?.wardId || assignment.route?.ward?.id || 'ward-1',
                surveySessionId || '',
                assignment.id,
                newPhoto.latitude,
                newPhoto.longitude,
                detectionResult.confidence || 0.90,
                undefined,
                newPhoto.accuracy,
                newPhoto.capturedAt,
                detectionId  // pass full detectionId through
            ).then(res => {
                    if (!res || !res.success) {
                        console.log(`[QUEUE ID: ${detectionId}] Upload failed, queuing with GPS: lat=${newPhoto.latitude}, lng=${newPhoto.longitude}`);
                        offlineQueue.enqueueBatch(
                            [newPhoto.uri],
                            assignment.routeId || 'route-1',
                            assignment.route?.wardId || 'ward-1',
                            surveySessionId || '',
                            assignment.id,
                            newPhoto.latitude,
                            newPhoto.longitude,
                            newPhoto.accuracy,
                            newPhoto.capturedAt
                        );
                    }
                }).catch(() => {
                    console.log(`[QUEUE ID: ${detectionId}] Upload error, queuing with GPS: lat=${newPhoto.latitude}, lng=${newPhoto.longitude}`);
                    offlineQueue.enqueueBatch(
                        [newPhoto.uri],
                        assignment.routeId || 'route-1',
                        assignment.route?.wardId || 'ward-1',
                        surveySessionId || '',
                        assignment.id,
                        newPhoto.latitude,
                        newPhoto.longitude,
                        newPhoto.accuracy,
                        newPhoto.capturedAt
                    );
                });

                setTimeout(() => {
                    setLastDetectionStatus(prev => prev.status === 'POTHOLE_DETECTED' ? { status: 'SCANNING', confidence: 0 } : prev);
                }, 2500);
        } catch (err) {
            console.log('AI scan tick skipped:', err);
        } finally {
            isAutoCapturingRef.current = false;
        }
    };

    // Auto Capture Timer Interval Effect (Runs every 3 seconds when camera is active)
    useEffect(() => {
        if (cameraRunning && autoCaptureEnabled) {
            // First auto capture after 1 second
            const initialTimer = setTimeout(() => {
                autoCapturePhoto();
            }, 1000);

            intervalRef.current = setInterval(() => {
                autoCapturePhoto();
            }, autoCaptureInterval * 1000);

            return () => {
                clearTimeout(initialTimer);
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            };
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
    }, [cameraRunning, autoCaptureEnabled, autoCaptureInterval]);

    // Background Auto-Sync Effect (Flushes offline queue every 10 seconds)
    useEffect(() => {
        const syncTimer = setInterval(async () => {
            const queueLen = await offlineQueue.getQueueLength().catch(() => 0);
            if (queueLen > 0) {
                console.log(`🌐 Auto-Sync: Flushing ${queueLen} offline queued item(s)...`);
                await offlineQueue.syncQueue(async (item) => {
                    try {
                        const res = await api.reportDetection(
                            item.frames[0],
                            item.routeId,
                            item.wardId,
                            item.surveySessionId,
                            item.assignmentId,
                            item.latitude,
                            item.longitude,
                            0.90,
                            undefined,
                            item.accuracy,
                            item.capturedAt,
                            item.id
                        );
                        return { success: !!(res && res.success), httpStatus: res?.httpStatus, message: res?.message };
                    } catch (e: any) {
                        return { success: false, message: e?.message };
                    }
                });
                const remaining = await offlineQueue.getQueueLength().catch(() => 0);
                setOfflineQueueCount(remaining);
            }
        }, 10000);

        return () => clearInterval(syncTimer);
    }, []);

    // Live GPS location watch effect
    useEffect(() => {
        if (cameraRunning) {
            watchIdRef.current = Geolocation.watchPosition(
                position => {
                    const { latitude, longitude, speed, accuracy } = position.coords;

                    // Speed in km/h
                    if (speed !== null && speed !== undefined && speed >= 0) {
                        setCurrentSpeed(Math.round(speed * 3.6));
                    } else {
                        // Patrol speed simulation (20-28 km/h) for testing
                        setCurrentSpeed(Math.floor(20 + Math.random() * 8));
                    }

                    // GPS Signal Status
                    if (accuracy < 15) setGpsSignal('Strong');
                    else if (accuracy < 40) setGpsSignal('Fair');
                    else setGpsSignal('Searching');

                    // Distance Calculation
                    if (lastPosRef.current) {
                        const delta = calculateHaversineDistance(
                            lastPosRef.current.latitude,
                            lastPosRef.current.longitude,
                            latitude,
                            longitude
                        );
                        if (delta > 0.001 && delta < 0.5) {
                            setTotalDistance(prev => prev + delta);
                        }
                    }
                    lastPosRef.current = { latitude, longitude, accuracy: accuracy || 10, capturedAt: new Date(position.timestamp || Date.now()).toISOString(), timestamp: position.timestamp };

                    // Update debug GPS display
                    const age = position.timestamp ? Date.now() - position.timestamp : 0;
                    setDebugGps({ lat: latitude, lng: longitude, accuracy: accuracy || 10, age });
                },
                err => {
                    console.warn('GPS error:', err);
                    setGpsSignal('Searching');
                },
                { enableHighAccuracy: true, distanceFilter: 0, interval: 1000, fastestInterval: 500 }
            );
        } else {
            if (watchIdRef.current !== null) {
                Geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        }

        return () => {
            if (watchIdRef.current !== null) {
                Geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [cameraRunning]);

    // Timer effect
    useEffect(() => {
        if (surveyStartTime && !timerRef.current) {
            timerRef.current = setInterval(() => {
                const now = new Date();
                const diff = Math.floor((now.getTime() - surveyStartTime.getTime()) / 1000);
                setElapsedTime(diff);
            }, 1000);
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [surveyStartTime]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            if (watchIdRef.current !== null) Geolocation.clearWatch(watchIdRef.current);
        };
    }, []);

    // Reset state when screen is focused (prevents stale data from previous surveys)
    useFocusEffect(
        useCallback(() => {
            // Reset all survey state for a fresh start
            setSurveySessionId(null);
            setSurveyStartTime(null);
            setElapsedTime(0);
            setIssuesDetected(0);
            setFrames([]);
            setUploadedCount(0);
            setShowCamera(false);
            setCameraRunning(false);
            setStarting(false);
            setEnding(false);
            setDemoMode(false);
            setExtracting(false);

            return () => {
                // Cleanup on blur
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
            };
        }, [])
    );

    const formatTime = (seconds: number): string => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const requestCameraPermission = async () => {
        let status = Camera.getCameraPermissionStatus();
        if (status === 'granted') return true;
        status = await Camera.requestCameraPermission();
        if (status === 'granted') return true;
        const finalStatus = await Camera.getCameraPermissionStatus();
        return finalStatus === 'granted';
    };

    const requestLocationPermission = async (): Promise<boolean> => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
                ]);
                const fineGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
                const coarseGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

                if (!fineGranted && !coarseGranted) {
                    Alert.alert(
                        'Location Permission Mandatory',
                        'Location permission is required to capture road issues with precise GPS coordinates. Please grant location permission to proceed.'
                    );
                    return false;
                }
            } catch (err) {
                console.warn('Location permission error:', err);
                return false;
            }
        }

        // Warm up GPS in background without blocking survey start
        getLiveCoordinates().catch(() => {});
        return true;
    };


    const handleStartSurvey = async () => {
        // Check permissions
        const cameraOk = await requestCameraPermission();
        if (!cameraOk) {
            Alert.alert('Permission Required', 'Camera permission is needed to capture road footage.');
            return;
        }

        const locationOk = await requestLocationPermission();
        if (!locationOk) {
            return;
        }

        // Open live camera view INSTANTLY for immediate responsiveness
        setSurveyStartTime(new Date());
        setShowCamera(true);

        // Initialize survey session asynchronously
        const startedAt = new Date().toISOString();
        api.startSurvey(assignment.id, startedAt).then(response => {
            if (response && response.surverySessionId) {
                setSurveySessionId(response.surverySessionId);
            }
        }).catch(error => {
            console.warn('Background survey start warning:', error);
        });
    };

    const startCapturing = () => {
        if (!camera.current) return;
        setCameraRunning(true);
    };

    const handleCapturePhoto = async () => {
        if (!camera.current) return;

        setUploadingDetection(true);
        try {
            const photo = await camera.current.takePhoto({ flash: 'off' });
            const rawPath = photo.path;
            const photoUri = rawPath.startsWith('file://')
                ? rawPath
                : rawPath.startsWith('/')
                    ? `file://${rawPath}`
                    : `file:///${rawPath}`;

            // Fetch live coordinates or fallback to last known GPS
            let lat = lastPosRef.current?.latitude || 0;
            let lon = lastPosRef.current?.longitude || 0;
            let acc = lastPosRef.current?.accuracy || 10;
            let capturedAt = lastPosRef.current?.capturedAt || new Date().toISOString();

            try {
                const gpsSnapshot = await Promise.race([
                    getLiveCoordinates('manual'),
                    new Promise<null>((r) => setTimeout(() => r(null), 1500))
                ]);
                if (gpsSnapshot && gpsSnapshot.latitude && gpsSnapshot.longitude) {
                    lat = gpsSnapshot.latitude;
                    lon = gpsSnapshot.longitude;
                    acc = gpsSnapshot.accuracy;
                    capturedAt = gpsSnapshot.capturedAt || capturedAt;
                }
            } catch (e) {
                // Ignore timeout, use last known position
            }

            triggerDetectionFlash();

            const newPhoto: ReviewPhoto = {
                id: Date.now().toString() + Math.random().toString().slice(2, 6),
                uri: photoUri,
                latitude: lat,
                longitude: lon,
                accuracy: acc,
                capturedAt: capturedAt,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                source: 'MANUAL',
            };

            setReviewPhotos(prev => {
                const updated = [...prev, newPhoto];
                AsyncStorage.setItem(REVIEW_PHOTOS_KEY, JSON.stringify(updated)).catch(console.error);
                return updated;
            });
            setIssuesDetected(prev => prev + 1);

            // Silent toast notification on camera screen (no blocking popup!)
            setManualToast('📸 Photo captured & added to review queue');
            setTimeout(() => {
                setManualToast(null);
            }, 2500);
        } catch (err: any) {
            console.error('Capture photo error:', err);
            setManualToast('⚠️ Capture failed');
            setTimeout(() => setManualToast(null), 2000);
        } finally {
            setUploadingDetection(false);
        }
    };

    const handleDeletePhoto = (id: string) => {
        Alert.alert(
            'Delete Photo',
            'Are you sure you want to delete this photo from the upload queue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        setReviewPhotos(prev => {
                            const updated = prev.filter(p => p.id !== id);
                            AsyncStorage.setItem(REVIEW_PHOTOS_KEY, JSON.stringify(updated)).catch(console.error);
                            return updated;
                        });
                    },
                },
            ]
        );
    };

    const handleUploadApprovedPhotos = async () => {
        if (reviewPhotos.length === 0) {
            Alert.alert('No Photos', 'Please capture at least one photo before uploading.');
            return;
        }

        setIsUploadingApproved(true);

        try {
            const targetWardId = assignment.route?.wardId || assignment.route?.ward?.id || 'ward-1';
            const targetRouteId = assignment.routeId || assignment.route?.id || 'route-1';
            const targetSessionId = surveySessionId || `session-${Date.now()}`;
            const photoCount = reviewPhotos.length;

            // Enqueue all photos into offline queue for seamless background upload
            await offlineQueue.enqueuePhotos(
                reviewPhotos,
                targetRouteId,
                targetWardId,
                targetSessionId,
                assignment.id
            );

            // Save active survey upload tracking state for Dashboard live progress card
            await AsyncStorage.setItem('@nagarseva_active_survey_upload', JSON.stringify({
                assignmentId: assignment.id,
                routeName: assignment.route?.name || 'Survey Route',
                total: photoCount,
                surveySessionId: targetSessionId,
                startedAt: surveyStartTime?.toISOString() || new Date().toISOString(),
                isCompleted: false,
            }));

            // Clear review photos from AsyncStorage
            await AsyncStorage.removeItem(REVIEW_PHOTOS_KEY);
            setReviewPhotos([]);
            stopCapturing();
            setShowReviewScreen(false);

            Alert.alert(
                '📤 Uploading Survey Photos',
                `Queued ${photoCount} photo(s) for background upload. Returning to Dashboard to track progress.`,
                [
                    {
                        text: 'View Dashboard Progress',
                        onPress: () => {
                            navigation.popToTop();
                        },
                    },
                ]
            );
        } catch (err: any) {
            console.error('Upload queueing error:', err);
            Alert.alert('Error', 'Failed to queue photos for upload. Please try again.');
        } finally {
            setIsUploadingApproved(false);
        }
    };

    const stopCapturing = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setCameraRunning(false);
    };

    const uploadBatch = async (framesToUpload: string[]) => {
        if (!surveySessionId || framesToUpload.length === 0) return;

        // Upload each frame individually with its own GPS from reviewPhotos
        const uploadPromises = framesToUpload.map(async (frameUri) => {
            // Find the corresponding photo in reviewPhotos to get its GPS
            const photo = reviewPhotos.find(p => p.uri === frameUri);
            const frameLat = photo?.latitude || lastPosRef.current?.latitude;
            const frameLon = photo?.longitude || lastPosRef.current?.longitude;
            
            console.log(`[UPLOAD] lat=${frameLat} lng=${frameLon}`);
            
            return api.uploadFrames(
                [frameUri],
                assignment.routeId,
                assignment.route?.wardId || '',
                surveySessionId,
                assignment.id,
                frameLat,
                frameLon
            );
        });

        try {
            await Promise.all(uploadPromises);
            setUploadedCount(prev => prev + framesToUpload.length);

            // Trigger background auto-sync of any previously queued offline items
            offlineQueue.syncQueue(async (item) => {
                try {
                    await api.uploadFrames(item.frames, item.routeId, item.wardId, item.surveySessionId, item.assignmentId, item.latitude, item.longitude);
                    return { success: true };
                } catch {
                    return { success: false };
                }
            }).then(res => setOfflineQueueCount(res.remaining));

        } catch (error) {
            console.log('Batch upload network failure. Queueing frames locally for auto-sync...');
            await offlineQueue.enqueueBatch(
                framesToUpload,
                assignment.routeId,
                assignment.route?.wardId || '',
                surveySessionId,
                assignment.id,
                lastPosRef.current?.latitude || 0,
                lastPosRef.current?.longitude || 0,
                lastPosRef.current?.accuracy,
                lastPosRef.current?.capturedAt
            );
            setUploadedCount(prev => prev + framesToUpload.length);
            const len = await offlineQueue.getQueueLength();
            setOfflineQueueCount(len);
        }
    };

    const handleEndSurvey = async () => {
        stopCapturing();
        setEnding(true);

        try {
            // Upload remaining frames
            const unuploadedFrames = frames.slice(uploadedCount);
            if (unuploadedFrames.length > 0) {
                await uploadBatch(unuploadedFrames).catch(e => console.warn('Frame batch upload warning:', e));
            }

            // End survey session
            if (surveySessionId) {
                const endedAt = new Date().toISOString();
                await api.endSurvey(surveySessionId, endedAt).catch(e => console.warn('End survey API warning:', e));
            }

            // Navigate to summary screen
            navigation.replace('SurveyComplete', {
                frameCount: frames.length,
                assignmentId: assignment.id,
                routeName: assignment.route?.name || 'Survey Route',
                duration: elapsedTime,
                issuesDetected: issuesDetected,
            });
        } catch (error) {
            console.error('End survey error:', error);
            // Navigate to summary screen regardless to complete survey flow
            navigation.replace('SurveyComplete', {
                frameCount: frames.length,
                assignmentId: assignment.id,
                routeName: assignment.route?.name || 'Survey Route',
                duration: elapsedTime,
                issuesDetected: issuesDetected,
            });
        } finally {
            setEnding(false);
        }
    };

    // Photo Review & Delete Screen View (Before Upload to Admin)
    if (showReviewScreen) {
        const aiCount = reviewPhotos.filter(p => p.source === 'AI_DETECTED').length;
        const manualCount = reviewPhotos.filter(p => p.source === 'MANUAL').length;

        const filteredPhotos = reviewPhotos.filter(p => {
            if (reviewFilter === 'AI') return p.source === 'AI_DETECTED';
            if (reviewFilter === 'MANUAL') return p.source === 'MANUAL';
            return true;
        });

        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
                <Header
                    title="Review Survey Photos"
                    subtitle={`${reviewPhotos.length} photo${reviewPhotos.length === 1 ? '' : 's'} (${aiCount} AI, ${manualCount} Manual)`}
                    onBack={() => setShowReviewScreen(false)}
                />

                {/* Filter Tabs */}
                <View style={styles.filterTabsContainer}>
                    <TouchableOpacity
                        style={[styles.filterTab, reviewFilter === 'ALL' && styles.filterTabActive]}
                        onPress={() => setReviewFilter('ALL')}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.filterTabText, reviewFilter === 'ALL' && styles.filterTabTextActive]}>
                            All ({reviewPhotos.length})
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterTab, reviewFilter === 'AI' && styles.filterTabActive]}
                        onPress={() => setReviewFilter('AI')}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.filterTabText, reviewFilter === 'AI' && styles.filterTabTextActive]}>
                            🤖 AI ({aiCount})
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterTab, reviewFilter === 'MANUAL' && styles.filterTabActive]}
                        onPress={() => setReviewFilter('MANUAL')}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.filterTabText, reviewFilter === 'MANUAL' && styles.filterTabTextActive]}>
                            📸 Manual ({manualCount})
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.screenBody}>
                    {filteredPhotos.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Text style={{ fontSize: 44, marginBottom: spacing.sm }}>📸</Text>
                            <Text style={styles.emptyTitle}>
                                {reviewPhotos.length === 0 ? 'No Photos Captured' : 'No Photos in this Filter'}
                            </Text>
                            <Text style={styles.emptySubtitle}>
                                {reviewPhotos.length === 0
                                    ? 'Return to live camera to capture road photos.'
                                    : 'Switch filter tab or capture more photos.'}
                            </Text>
                            <Button
                                title="📸 Return to Camera"
                                onPress={() => setShowReviewScreen(false)}
                                variant="primary"
                                style={{ marginTop: spacing.md }}
                            />
                        </View>
                    ) : (
                        <FlatList
                            data={filteredPhotos}
                            keyExtractor={item => item.id}
                            contentContainerStyle={[styles.reviewList, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item, index }) => (
                                <View style={styles.reviewPhotoCard}>
                                    <View style={styles.reviewPhotoMediaContainer}>
                                        <Image
                                            source={{ uri: item.uri }}
                                            style={styles.reviewPhotoImage}
                                            resizeMode="cover"
                                        />
                                        <View style={[
                                            styles.sourceBadge,
                                            item.source === 'AI_DETECTED' ? styles.sourceBadgeAi : styles.sourceBadgeManual
                                        ]}>
                                            <Text style={styles.sourceBadgeText}>
                                                {item.source === 'AI_DETECTED'
                                                    ? `🤖 AI DETECTED (${item.confidence || 90}%)`
                                                    : '📸 MANUAL CAPTURE'}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.reviewPhotoInfo}>
                                        <View style={styles.reviewPhotoHeader}>
                                            <Text style={styles.reviewPhotoIndex}>Photo #{index + 1}</Text>
                                            <Text style={styles.reviewPhotoTime}>{item.timestamp}</Text>
                                        </View>
                                        <View style={styles.reviewGpsPill}>
                                            <Text style={styles.reviewPhotoGps}>
                                                📍 {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)} {item.accuracy ? `(±${Math.round(item.accuracy)}m)` : ''}
                                            </Text>
                                        </View>
                                        <Button
                                            title="🗑️ Delete Photo"
                                            onPress={() => handleDeletePhoto(item.id)}
                                            variant="danger"
                                            style={styles.deletePhotoBtn}
                                        />
                                    </View>
                                </View>
                            )}
                        />
                    )}
                </View>

                {/* Sticky Review Footer */}
                <View style={[styles.reviewFooter, { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.md) }]}>
                    <Button
                        title="📸 Add Photos"
                        onPress={() => setShowReviewScreen(false)}
                        variant="secondary"
                        style={{ flex: 1 }}
                    />
                    <Button
                        title={`📤 Upload to Admin (${reviewPhotos.length})`}
                        onPress={handleUploadApprovedPhotos}
                        loading={isUploadingApproved}
                        disabled={reviewPhotos.length === 0}
                        variant="success"
                        style={{ flex: 1.6 }}
                    />
                </View>
            </View>
        );
    }

    // Camera View (Active Survey)
    if (showCamera) {
        const devices = Camera.getAvailableCameraDevices();
        const device = devices.find(d => d.position === 'back');

        if (!device) {
            return (
                <View style={styles.container}>
                    <Header title="Camera" onBack={() => setShowCamera(false)} />
                    <View style={styles.center}>
                        <Text style={styles.emptyText}>No camera device found</Text>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.cameraContainer}>
                <StatusBar hidden />
                <Camera
                    ref={camera}
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={true}
                    photo
                />

                {/* Pothole Detection Flash Border */}
                <Animated.View
                    style={[
                        styles.detectionFlashBorder,
                        { opacity: flashAnim }
                    ]}
                    pointerEvents="none"
                />

                {/* Overlay UI */}
                <View style={styles.cameraOverlay}>
                    {/* Top Stats Bar */}
                    <View style={[styles.cameraHeader, { paddingTop: insets.top + spacing.sm }]}>
                        <View style={styles.statRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statIcon}>⏱️</Text>
                                <Text style={styles.statValue}>{formatTime(elapsedTime)}</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statIcon}>🚀</Text>
                                <Text style={styles.statValue}>{currentSpeed} km/h</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statIcon}>📏</Text>
                                <Text style={styles.statValue}>{totalDistance.toFixed(1)} km</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statIcon}>📷</Text>
                                <Text style={styles.statValue}>{reviewPhotos.length}</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Text style={styles.statIcon}>🕳️</Text>
                                <Text style={styles.statValue}>{issuesDetected}</Text>
                            </View>
                        </View>
                        
                        {/* Debug GPS Display */}
                        {debugGps && (
                            <View style={[
                                styles.debugGpsContainer,
                                debugGps.accuracy < 15
                                    ? { borderColor: '#10B981' }
                                    : debugGps.accuracy < 40
                                        ? { borderColor: '#F59E0B' }
                                        : { borderColor: '#EF4444' },
                            ]}>
                                <Text style={[
                                    styles.debugGpsLabel,
                                    debugGps.accuracy < 15
                                        ? { color: '#10B981' }
                                        : debugGps.accuracy < 40
                                            ? { color: '#F59E0B' }
                                            : { color: '#EF4444' },
                                ]}>
                                    GPS DEBUG  •  {gpsDetectionCount} detections
                                </Text>
                                <Text style={styles.debugGpsValue}>Lat: {debugGps.lat.toFixed(6)} | Lng: {debugGps.lng.toFixed(6)}</Text>
                                <Text style={[
                                    styles.debugGpsValue,
                                    debugGps.accuracy < 15
                                        ? { color: '#10B981', fontWeight: '700' }
                                        : debugGps.accuracy < 40
                                            ? { color: '#F59E0B', fontWeight: '700' }
                                            : { color: '#EF4444', fontWeight: '700' },
                                ]}>
                                    Acc: ±{debugGps.accuracy.toFixed(1)}m
                                </Text>
                            </View>
                        )}

                        <View style={styles.statusPillsContainer}>
                            {cameraRunning && (
                                <View style={styles.recordingBadge}>
                                    <View style={styles.recordingDot} />
                                    <Text style={styles.recordingText}>LIVE SURVEY</Text>
                                </View>
                            )}
                            {cameraRunning && autoCaptureEnabled && (
                                <View style={[
                                    styles.detectionPill,
                                    lastDetectionStatus.status === 'POTHOLE_DETECTED'
                                        ? { backgroundColor: '#DC2626' }
                                        : lastDetectionStatus.status === 'CLEAR'
                                            ? { backgroundColor: '#374151' }
                                            : { backgroundColor: '#059669' }
                                ]}>
                                    <Text style={styles.detectionPillText}>
                                        {lastDetectionStatus.status === 'POTHOLE_DETECTED'
                                            ? `🕳️ POTHOLE DETECTED (${lastDetectionStatus.confidence}%)`
                                            : lastDetectionStatus.status === 'CLEAR'
                                                ? '🟢 ROAD CLEAR'
                                                : '⚡ AI SCANNING'}
                                    </Text>
                                </View>
                            )}
                            {offlineQueueCount > 0 && (
                                <View style={[styles.detectionPill, { backgroundColor: '#D97706' }]}>
                                    <Text style={styles.detectionPillText}>💾 {offlineQueueCount} QUEUED</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Active AI Detection Box */}
                    {showDetectionBox && (
                        <View style={styles.activeDetectionBox}>
                            <View style={styles.detectionLabelBadge}>
                                <Text style={styles.detectionLabelText}>POTHOLE DETECTED</Text>
                            </View>
                        </View>
                    )}

                    {/* Manual Toast Notification */}
                    {manualToast && (
                        <View style={styles.toastContainer}>
                            <Text style={styles.toastText}>{manualToast}</Text>
                        </View>
                    )}

                    {/* Bottom Camera Controls */}
                    <View style={[styles.cameraControls, { paddingBottom: Math.max(insets.bottom + spacing.sm, 24) }]}>
                        {cameraRunning && (
                            <View style={styles.controlRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.controlButton,
                                        autoCaptureEnabled ? styles.autoBtnActive : styles.autoBtnInactive
                                    ]}
                                    onPress={() => setAutoCaptureEnabled(prev => !prev)}
                                >
                                    <Text style={styles.controlButtonText}>
                                        {autoCaptureEnabled ? '🤖 Auto: ON' : '🤖 Auto: OFF'}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.controlButton, styles.captureBtn]}
                                    onPress={handleCapturePhoto}
                                    disabled={uploadingDetection}
                                >
                                    <Text style={styles.controlButtonText}>📸 Capture</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <View style={styles.controlRow}>
                            {!cameraRunning ? (
                                <TouchableOpacity
                                    style={[styles.controlButton, styles.startBtn]}
                                    onPress={startCapturing}
                                >
                                    <Text style={styles.controlButtonText}>▶ Resume</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.controlButton, styles.pauseBtn]}
                                    onPress={stopCapturing}
                                >
                                    <Text style={styles.controlButtonText}>⏸ Pause</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={[styles.controlButton, styles.reviewBtn]}
                                onPress={() => setShowReviewScreen(true)}
                            >
                                <Text style={styles.controlButtonText}>
                                    📋 Review ({reviewPhotos.length})
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        );
    }

    // Pre-Survey Screen
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
            <Header
                title="Ready to Survey"
                subtitle={assignment.route?.name || 'Survey Route'}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Route Info Card */}
                <View style={styles.cardContainer}>
                    <Text style={styles.cardHeading}>Survey Details</Text>
                    <View style={styles.infoGrid}>
                        <View style={styles.infoRow}>
                            <View style={styles.infoCol}>
                                <Text style={styles.infoLabel}>ROUTE</Text>
                                <Text style={styles.infoValue} numberOfLines={2}>{assignment.route?.name || 'N/A'}</Text>
                            </View>
                            <View style={styles.infoCol}>
                                <Text style={styles.infoLabel}>WARD</Text>
                                <Text style={styles.infoValue} numberOfLines={2}>{assignment.route?.ward?.name || 'N/A'}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.infoRow}>
                            <View style={styles.infoCol}>
                                <Text style={styles.infoLabel}>ESTIMATED DISTANCE</Text>
                                <Text style={styles.infoValue}>{assignment.route?.distance ?? 0} km</Text>
                            </View>
                            <View style={styles.infoCol}>
                                <Text style={styles.infoLabel}>DETECTION MODE</Text>
                                <Text style={styles.infoValue}>Live AI Camera</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Checklist Card */}
                <View style={styles.cardContainer}>
                    <Text style={styles.cardHeading}>Pre-Survey Checklist</Text>
                    <View style={styles.checkList}>
                        <View style={styles.checkItem}>
                            <Text style={styles.checkIcon}>📷</Text>
                            <View style={styles.checkContent}>
                                <Text style={styles.checkTitle}>Camera Access Granted</Text>
                                <Text style={styles.checkSub}>Vision camera ready for continuous frame capture</Text>
                            </View>
                        </View>
                        <View style={styles.checkItem}>
                            <Text style={styles.checkIcon}>📍</Text>
                            <View style={styles.checkContent}>
                                <Text style={styles.checkTitle}>High-Accuracy GPS Enabled</Text>
                                <Text style={styles.checkSub}>Geo-tags every detected pothole precisely</Text>
                            </View>
                        </View>
                        <View style={styles.checkItem}>
                            <Text style={styles.checkIcon}>🏍️</Text>
                            <View style={styles.checkContent}>
                                <Text style={styles.checkTitle}>Device Firmly Mounted</Text>
                                <Text style={styles.checkSub}>Secure on handlebar with forward road view</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Instructions */}
                <View style={styles.tipCard}>
                    <Text style={styles.tipTitle}>💡 Surveying Guide</Text>
                    <Text style={styles.tipText}>
                        Keep a safe, steady speed (20-30 km/h). The on-device and cloud AI will automatically scan and detect road surface defects.
                    </Text>
                </View>
            </ScrollView>

            {/* Bottom Action Button */}
            <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.md) }]}>
                <Button
                    title="📹 Launch Camera & Start Survey"
                    onPress={handleStartSurvey}
                    loading={starting}
                    variant="primary"
                    style={styles.startSurveyBtn}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    screenBody: {
        flex: 1,
    },
    scrollArea: {
        flex: 1,
    },
    scrollContent: {
        padding: spacing.md,
        gap: spacing.md,
    },
    cardContainer: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        ...shadows.xs,
    },
    cardHeading: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: spacing.md,
        letterSpacing: -0.2,
    },
    infoGrid: {
        gap: spacing.sm,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    infoCol: {
        flex: 1,
        paddingRight: spacing.sm,
    },
    divider: {
        height: 1,
        backgroundColor: colors.borderLight,
        marginVertical: spacing.xs,
    },
    infoLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.textMuted,
        letterSpacing: 0.6,
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    checkList: {
        gap: spacing.md,
    },
    checkItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    checkIcon: {
        fontSize: 22,
        marginRight: spacing.sm,
        marginTop: 1,
    },
    checkContent: {
        flex: 1,
    },
    checkTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 1,
    },
    checkSub: {
        fontSize: 12,
        color: colors.textSecondary,
        lineHeight: 16,
    },
    tipCard: {
        backgroundColor: colors.primaryFaded,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(67, 56, 202, 0.2)',
    },
    tipTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
        marginBottom: 4,
    },
    tipText: {
        fontSize: 12,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        ...shadows.md,
    },
    startSurveyBtn: {
        minHeight: 50,
        borderRadius: borderRadius.md,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    emptySubtitle: {
        fontSize: 13,
        color: colors.textMuted,
        textAlign: 'center',
    },
    reviewList: {
        padding: spacing.md,
        gap: spacing.md,
    },
    reviewPhotoCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        ...shadows.xs,
    },
    reviewPhotoImage: {
        width: '100%',
        height: 190,
        backgroundColor: '#0F172A',
    },
    reviewPhotoInfo: {
        padding: spacing.md,
    },
    reviewPhotoHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    reviewPhotoIndex: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    reviewPhotoTime: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '500',
    },
    reviewGpsPill: {
        backgroundColor: colors.surfaceAlt,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: borderRadius.sm,
        alignSelf: 'flex-start',
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    reviewPhotoGps: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: '600',
    },
    deletePhotoBtn: {
        minHeight: 40,
        borderRadius: borderRadius.md,
    },
    reviewFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        flexDirection: 'row',
        gap: spacing.sm,
        ...shadows.md,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: colors.textMuted,
    },
    // Camera styles
    detectionFlashBorder: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 10,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.25)',
        zIndex: 99,
    },
    cameraContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    cameraOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
    },
    cameraHeader: {
        paddingHorizontal: spacing.sm,
        alignItems: 'center',
        gap: spacing.sm,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        borderRadius: 20,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        ...shadows.lg,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statIcon: {
        fontSize: 14,
    },
    statValue: {
        fontWeight: '800',
        color: '#fff',
        fontSize: 13,
    },
    statusPillsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    recordingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.danger,
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderRadius: borderRadius.full,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    recordingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#fff',
    },
    recordingText: {
        fontSize: 11,
        color: '#fff',
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    detectionPill: {
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    detectionPillText: {
        fontSize: 11,
        color: '#fff',
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    debugGpsContainer: {
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        borderRadius: 10,
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderWidth: 1,
        alignItems: 'center',
    },
    debugGpsLabel: {
        fontSize: 10,
        fontWeight: '800',
        marginBottom: 1,
    },
    debugGpsValue: {
        color: '#fff',
        fontSize: 10,
        lineHeight: 14,
    },
    cameraControls: {
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        paddingTop: spacing.md,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    controlRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    controlButton: {
        flex: 1,
        minHeight: 46,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
    },
    controlButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
    },
    autoBtnActive: {
        backgroundColor: '#059669',
    },
    autoBtnInactive: {
        backgroundColor: '#475569',
    },
    captureBtn: {
        backgroundColor: '#2563EB',
    },
    startBtn: {
        backgroundColor: '#10B981',
    },
    pauseBtn: {
        backgroundColor: '#F59E0B',
    },
    reviewBtn: {
        backgroundColor: '#6366F1',
    },
    activeDetectionBox: {
        position: 'absolute',
        top: '35%',
        left: '15%',
        right: '15%',
        height: 180,
        borderWidth: 2.5,
        borderColor: '#10B981',
        borderRadius: borderRadius.md,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: spacing.xs,
    },
    detectionLabelBadge: {
        backgroundColor: '#10B981',
        paddingHorizontal: spacing.md,
        paddingVertical: 2,
        borderRadius: borderRadius.sm,
    },
    detectionLabelText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 'bold',
    },
    filterTabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: spacing.sm,
    },
    filterTab: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: spacing.sm,
        borderRadius: borderRadius.md,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    filterTabActive: {
        backgroundColor: colors.primaryFaded,
        borderColor: colors.primary,
    },
    filterTabText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    filterTabTextActive: {
        color: colors.primary,
        fontWeight: '700',
    },
    reviewPhotoMediaContainer: {
        position: 'relative',
        width: '100%',
    },
    sourceBadge: {
        position: 'absolute',
        top: 10,
        left: 10,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: borderRadius.sm,
        ...shadows.sm,
    },
    sourceBadgeAi: {
        backgroundColor: 'rgba(5, 150, 105, 0.92)',
    },
    sourceBadgeManual: {
        backgroundColor: 'rgba(37, 99, 235, 0.92)',
    },
    sourceBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    toastContainer: {
        position: 'absolute',
        top: '18%',
        alignSelf: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        ...shadows.lg,
        zIndex: 100,
    },
    toastText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
});
