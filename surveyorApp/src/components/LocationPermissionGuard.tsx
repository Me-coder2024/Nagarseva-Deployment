import React, { useEffect, useState, useCallback } from 'react';
import {
    Platform,
    PermissionsAndroid,
    BackHandler,
    View,
    Text,
    ActivityIndicator,
    StyleSheet,
    TouchableOpacity,
    Linking,
    AppState,
    AppStateStatus,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import { colors, borderRadius, spacing } from '../theme';

interface Props {
    children: React.ReactNode;
}

export default function LocationPermissionGuard({ children }: Props) {
    const [status, setStatus] = useState<'CHECKING' | 'GRANTED' | 'PERMISSION_DENIED' | 'GPS_DISABLED'>('CHECKING');

    const verifyLocation = useCallback(async () => {
        if (Platform.OS !== 'android') {
            setStatus('GRANTED');
            return;
        }

        try {
            const grantedFine = await PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
            );
            const grantedCoarse = await PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
            );

            if (!grantedFine && !grantedCoarse) {
                const requestResult = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
                ]);

                const fineStatus = requestResult[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
                const coarseStatus = requestResult[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];

                if (
                    fineStatus !== PermissionsAndroid.RESULTS.GRANTED &&
                    coarseStatus !== PermissionsAndroid.RESULTS.GRANTED
                ) {
                    setStatus('PERMISSION_DENIED');
                    return;
                }
            }

            // Test if location provider is enabled without hanging on indoor satellite lock
            Geolocation.getCurrentPosition(
                (position) => {
                    if (position && position.coords) {
                        setStatus('GRANTED');
                    } else {
                        setStatus('GRANTED');
                    }
                },
                (error) => {
                    console.log('Location check in guard:', error);
                    // Error code 2 = POSITION_UNAVAILABLE (GPS/location service completely switched off)
                    if (error && (error.code === 2 || error.message?.toLowerCase().includes('no location provider') || error.message?.toLowerCase().includes('disabled'))) {
                        // Double check with network provider
                        Geolocation.getCurrentPosition(
                            () => setStatus('GRANTED'),
                            (netErr) => {
                                if (netErr && (netErr.code === 2 || netErr.message?.toLowerCase().includes('no location provider'))) {
                                    setStatus('GPS_DISABLED');
                                } else {
                                    // Timeout or temporary delay: location is enabled
                                    setStatus('GRANTED');
                                }
                            },
                            { enableHighAccuracy: false, timeout: 3000, maximumAge: 600000 }
                        );
                    } else {
                        // Code 3 (TIMEOUT) or other: GPS is enabled, fix is just pending/indoor
                        setStatus('GRANTED');
                    }
                },
                { enableHighAccuracy: false, timeout: 4000, maximumAge: 600000 }
            );
        } catch (err) {
            console.error('Location check error:', err);
            setStatus('GRANTED');
        }
    }, []);

    const handleOpenSettings = async () => {
        try {
            if (Platform.OS === 'android') {
                await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
                    Linking.openSettings();
                });
            } else {
                Linking.openSettings();
            }
        } catch (e) {
            Linking.openSettings();
        }
    };

    useEffect(() => {
        verifyLocation();

        // Re-verify immediately when user returns from system settings
        const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                verifyLocation();
            }
        });

        return () => {
            subscription.remove();
        };
    }, [verifyLocation]);

    if (status === 'CHECKING') {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Verifying Device GPS & Location Services...</Text>
            </View>
        );
    }

    if (status === 'PERMISSION_DENIED' || status === 'GPS_DISABLED') {
        const isGpsOff = status === 'GPS_DISABLED';

        return (
            <View style={styles.centerContainer}>
                <View style={styles.iconCircle}>
                    <Text style={styles.iconText}>📍</Text>
                </View>
                <Text style={styles.errorTitle}>
                    {isGpsOff ? 'Device Location (GPS) is OFF' : 'Location Permission Mandatory'}
                </Text>
                <Text style={styles.errorSubtitle}>
                    {isGpsOff
                        ? 'NagarSeva requires your device GPS to be turned ON to record road surveys and pothole coordinates. Please enable Location in your device settings.'
                        : 'Location permission is required for the NagarSeva Surveyor app. Please grant Location permission to continue.'}
                </Text>

                <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={isGpsOff ? handleOpenSettings : verifyLocation}
                    activeOpacity={0.8}
                >
                    <Text style={styles.btnText}>
                        {isGpsOff ? '⚙️ Open Location Settings' : '📍 Grant Location Permission'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={verifyLocation}
                    activeOpacity={0.8}
                >
                    <Text style={styles.retryBtnText}>🔄 Re-check Status</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.retryBtn, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
                    onPress={() => setStatus('GRANTED')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.retryBtnText, { color: '#4338CA', fontWeight: '700' }]}>
                        ✓ Location is ON — Continue
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.exitBtn}
                    onPress={() => BackHandler.exitApp()}
                    activeOpacity={0.8}
                >
                    <Text style={styles.exitBtnText}>Exit App</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return <>{children}</>;
}

const styles = StyleSheet.create({
    centerContainer: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    iconText: {
        fontSize: 36,
    },
    loadingText: {
        color: colors.textSecondary,
        fontSize: 14,
        marginTop: spacing.md,
        fontWeight: '600',
        textAlign: 'center',
    },
    errorTitle: {
        color: '#0F172A',
        fontSize: 20,
        fontWeight: '800',
        marginBottom: spacing.sm,
        textAlign: 'center',
        letterSpacing: -0.3,
    },
    errorSubtitle: {
        color: '#64748B',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: spacing.xl,
        lineHeight: 22,
    },
    primaryBtn: {
        backgroundColor: '#4338CA',
        paddingVertical: 14,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
        width: '100%',
        alignItems: 'center',
        marginBottom: spacing.sm,
        elevation: 2,
    },
    btnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
    retryBtn: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingVertical: 12,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
        width: '100%',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    retryBtnText: {
        color: '#334155',
        fontSize: 14,
        fontWeight: '600',
    },
    exitBtn: {
        paddingVertical: 10,
        paddingHorizontal: spacing.lg,
        width: '100%',
        alignItems: 'center',
    },
    exitBtnText: {
        color: '#EF4444',
        fontSize: 14,
        fontWeight: '600',
    },
});
