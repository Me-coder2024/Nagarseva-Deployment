import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Alert,
    StatusBar,
    Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';
import { Button, Card, Header, StatusBadge } from '../../components';
import { SurveyorStackParamList } from '../../navigation/SurveyorNavigator';
import api from '../../services/api';
import { getMobileErrorMessage } from '../../services/mobileApiUtils';

type NavigationProp = NativeStackNavigationProp<SurveyorStackParamList, 'AssignmentDetail'>;
type RouteType = RouteProp<SurveyorStackParamList, 'AssignmentDetail'>;

export default function AssignmentDetailScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<RouteType>();
    const { assignment } = route.params;
    const [loading, setLoading] = useState(false);
    const [currentStatus, setCurrentStatus] = useState(assignment.status);
    const [savedPhotosCount, setSavedPhotosCount] = useState<number>(0);

    useFocusEffect(
        useCallback(() => {
            const key = `@nagarseva_review_photos_${assignment.id}`;
            AsyncStorage.getItem(key).then(raw => {
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setSavedPhotosCount(parsed.length);
                            return;
                        }
                    } catch (e) {}
                }
                setSavedPhotosCount(0);
            });
        }, [assignment.id, assignment.route?.name])
    );

    async function handleAccept() {
        setLoading(true);
        try {
            const response = await api.acceptAssignment(assignment.id);
            if (response && response.success) {
                setCurrentStatus('IN_PROGRESS');
                Alert.alert('Success', 'Assignment accepted! You can now start the survey.');
            } else {
                Alert.alert('Error', response?.message || 'Failed to accept assignment');
            }
        } catch (error: any) {
            const msg = getMobileErrorMessage(error, 'Failed to accept assignment');
            Alert.alert('Error', msg);
        } finally {
            setLoading(false);
        }
    }

    function handleStartSurvey() {
        navigation.navigate('Survey', { assignment: { ...assignment, status: currentStatus } });
    }

    function handleGetDirections() {
        const startLat = assignment.route?.startLat;
        const startLon = assignment.route?.startLon;

        if (!startLat || !startLon) {
            Alert.alert('Error', 'Route coordinates not available');
            return;
        }

        const url = `https://www.google.com/maps/dir/?api=1&destination=${startLat},${startLon}`;
        Linking.openURL(url).catch(() => {
            Alert.alert('Error', 'Could not open Google Maps');
        });
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
            <Header
                title="Assignment Details"
                subtitle={assignment.route?.name || 'Survey Assignment'}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                style={styles.content}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 110, 130) }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Status Card */}
                <View style={styles.statusCard}>
                    <View style={styles.statusHeader}>
                        <View>
                            <Text style={styles.statusLabel}>ASSIGNMENT STATUS</Text>
                            <Text style={styles.statusTitle}>
                                {currentStatus === 'PENDING'
                                    ? 'Awaiting Acceptance'
                                    : currentStatus === 'IN_PROGRESS'
                                    ? 'Ready to Survey'
                                    : 'Completed'}
                            </Text>
                        </View>
                        <StatusBadge status={currentStatus} />
                    </View>
                </View>

                {/* Route Info Card */}
                <View style={styles.cardContainer}>
                    <Text style={styles.sectionHeading}>Route Information</Text>
                    <View style={styles.infoGrid}>
                        <View style={styles.infoRow}>
                            <View style={styles.infoCol}>
                                <Text style={styles.infoLabel}>ROUTE</Text>
                                <Text style={styles.infoValue} numberOfLines={2}>
                                    {assignment.route?.name || 'N/A'}
                                </Text>
                            </View>
                            <View style={styles.infoCol}>
                                <Text style={styles.infoLabel}>WARD</Text>
                                <Text style={styles.infoValue} numberOfLines={2}>
                                    {assignment.route?.ward?.name || 'N/A'}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.infoRow}>
                            <View style={styles.infoCol}>
                                <Text style={styles.infoLabel}>ESTIMATED DISTANCE</Text>
                                <Text style={styles.infoValue}>{assignment.route?.distance ?? 0} km</Text>
                            </View>
                            <View style={styles.infoCol}>
                                <Text style={styles.infoLabel}>ASSIGNED DATE</Text>
                                <Text style={styles.infoValue}>
                                    {assignment.assignedAt
                                        ? new Date(assignment.assignedAt).toLocaleDateString('en-IN', {
                                              day: 'numeric',
                                              month: 'short',
                                              year: 'numeric',
                                          })
                                        : 'Today'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Map Preview Card */}
                <View style={styles.cardContainer}>
                    <Text style={styles.sectionHeading}>Route Coordinates</Text>
                    <View style={styles.mapPlaceholder}>
                        <Text style={styles.mapIcon}>🗺️</Text>
                        <View style={styles.coordsContainer}>
                            <Text style={styles.coordsBadge}>
                                Start: {assignment.route?.startLat?.toFixed(4) ?? 'N/A'}°, {assignment.route?.startLon?.toFixed(4) ?? 'N/A'}°
                            </Text>
                            <Text style={styles.coordsBadge}>
                                End: {assignment.route?.endLat?.toFixed(4) ?? 'N/A'}°, {assignment.route?.endLon?.toFixed(4) ?? 'N/A'}°
                            </Text>
                        </View>
                    </View>
                    <Button
                        title="📍 Open in Google Maps"
                        onPress={handleGetDirections}
                        variant="secondary"
                        style={styles.directionsBtn}
                    />
                </View>

                {/* Survey Instructions Card */}
                <View style={styles.cardContainer}>
                    <Text style={styles.sectionHeading}>Survey Checklist</Text>
                    <View style={styles.instructionList}>
                        <View style={styles.instructionItem}>
                            <View style={styles.instructionNumber}>
                                <Text style={styles.instructionNumberText}>1</Text>
                            </View>
                            <View style={styles.instructionBody}>
                                <Text style={styles.instructionTitle}>Accept Assignment</Text>
                                <Text style={styles.instructionDesc}>Confirm assignment before heading out.</Text>
                            </View>
                        </View>
                        <View style={styles.instructionItem}>
                            <View style={styles.instructionNumber}>
                                <Text style={styles.instructionNumberText}>2</Text>
                            </View>
                            <View style={styles.instructionBody}>
                                <Text style={styles.instructionTitle}>Mount Phone on Vehicle</Text>
                                <Text style={styles.instructionDesc}>Ensure clean camera view of the road surface.</Text>
                            </View>
                        </View>
                        <View style={styles.instructionItem}>
                            <View style={styles.instructionNumber}>
                                <Text style={styles.instructionNumberText}>3</Text>
                            </View>
                            <View style={styles.instructionBody}>
                                <Text style={styles.instructionTitle}>Capture & Auto-Sync</Text>
                                <Text style={styles.instructionDesc}>AI detects potholes automatically with GPS tags.</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Sticky Action Footer */}
            <View style={[styles.actionsFooter, { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.md) }]}>
                {currentStatus === 'PENDING' ? (
                    <Button
                        title="Accept Assignment"
                        onPress={handleAccept}
                        loading={loading}
                        variant="primary"
                        style={styles.primaryActionButton}
                    />
                ) : currentStatus === 'IN_PROGRESS' ? (
                    <Button
                        title="📹 Start Camera Survey"
                        onPress={handleStartSurvey}
                        variant="primary"
                        style={styles.primaryActionButton}
                    />
                ) : (
                    <View style={styles.completedBanner}>
                        <Text style={styles.completedText}>✓ Survey Completed & Uploaded</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: spacing.md,
        gap: spacing.md,
    },
    statusCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        ...shadows.xs,
    },
    statusHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.textMuted,
        letterSpacing: 0.8,
        marginBottom: 2,
    },
    statusTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    cardContainer: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        ...shadows.xs,
    },
    sectionHeading: {
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
    mapPlaceholder: {
        backgroundColor: colors.surfaceAlt,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    mapIcon: {
        fontSize: 32,
        marginBottom: spacing.xs,
    },
    coordsContainer: {
        alignItems: 'center',
        gap: 4,
    },
    coordsBadge: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: borderRadius.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    directionsBtn: {
        marginTop: spacing.md,
        minHeight: 46,
    },
    instructionList: {
        gap: spacing.md,
    },
    instructionItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    instructionNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.primaryFaded,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.sm,
        marginTop: 2,
    },
    instructionNumberText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.primary,
    },
    instructionBody: {
        flex: 1,
    },
    instructionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 1,
    },
    instructionDesc: {
        fontSize: 12,
        color: colors.textSecondary,
        lineHeight: 16,
    },
    actionsFooter: {
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
    primaryActionButton: {
        minHeight: 50,
        borderRadius: borderRadius.md,
    },
    completedBanner: {
        backgroundColor: colors.completedBg,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    completedText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.completedText,
    },
});
