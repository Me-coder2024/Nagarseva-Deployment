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

        // Open Google Maps with directions to the starting point
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
                subtitle={assignment.route?.ward?.name}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Status Card */}
                <Card style={styles.statusCard}>
                    <View style={styles.statusHeader}>
                        <Text style={styles.sectionTitle}>Current Status</Text>
                        <StatusBadge status={currentStatus} />
                    </View>
                </Card>

                {/* Route Info Card */}
                <Card>
                    <Text style={styles.sectionTitle}>Route Information</Text>
                    <View style={styles.infoGrid}>
                        <View style={styles.infoItem}>
                            <Text style={styles.infoLabel}>Route Name</Text>
                            <Text style={styles.infoValue}>{assignment.route?.name}</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Text style={styles.infoLabel}>Ward</Text>
                            <Text style={styles.infoValue}>{assignment.route?.ward?.name}</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Text style={styles.infoLabel}>Distance</Text>
                            <Text style={styles.infoValue}>{assignment.route?.distance} km</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Text style={styles.infoLabel}>Assigned On</Text>
                            <Text style={styles.infoValue}>
                                {new Date(assignment.assignedAt).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                })}
                            </Text>
                        </View>
                    </View>
                </Card>

                {/* Map Placeholder */}
                <Card style={styles.mapCard}>
                    <Text style={styles.sectionTitle}>Route Preview</Text>
                    <View style={styles.mapPlaceholder}>
                        <Text style={styles.mapIcon}>🗺️</Text>
                        <Text style={styles.mapText}>Map view coming soon</Text>
                        <Text style={styles.coordsText}>
                            Start: {assignment.route?.startLat?.toFixed(4) ?? 'N/A'}°, {assignment.route?.startLon?.toFixed(4) ?? 'N/A'}°
                        </Text>
                        <Text style={styles.coordsText}>
                            End: {assignment.route?.endLat?.toFixed(4) ?? 'N/A'}°, {assignment.route?.endLon?.toFixed(4) ?? 'N/A'}°
                        </Text>
                    </View>
                    <Button
                        title="📍 Get Directions"
                        onPress={handleGetDirections}
                        variant="primary"
                        style={styles.directionsBtn}
                    />
                </Card>

                {/* Instructions Card */}
                <Card>
                    <Text style={styles.sectionTitle}>Survey Instructions</Text>
                    <View style={styles.instructions}>
                        <View style={styles.instructionItem}>
                            <Text style={styles.instructionNumber}>1</Text>
                            <Text style={styles.instructionText}>
                                Accept the assignment to begin
                            </Text>
                        </View>
                        <View style={styles.instructionItem}>
                            <Text style={styles.instructionNumber}>2</Text>
                            <Text style={styles.instructionText}>
                                Travel along the route and capture road footage
                            </Text>
                        </View>
                        <View style={styles.instructionItem}>
                            <Text style={styles.instructionNumber}>3</Text>
                            <Text style={styles.instructionText}>
                                Upload captured frames for pothole detection
                            </Text>
                        </View>
                    </View>
                </Card>
            </ScrollView>

            {/* Action Buttons */}
            <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg, gap: spacing.sm }]}>
                {currentStatus === 'PENDING' ? (
                    <Button
                        title="Accept Assignment"
                        onPress={handleAccept}
                        loading={loading}
                        variant="primary"
                    />
                ) : currentStatus === 'IN_PROGRESS' ? (
                    <>
                        <Button
                            title="📹 Start Live Camera Survey"
                            onPress={handleStartSurvey}
                            variant="primary"
                        />
                        <Button
                            title="📁 Import Photos from Gallery (Optional)"
                            onPress={() => navigation.navigate('Survey', { assignment: { ...assignment, status: 'IN_PROGRESS' }, pickFromGallery: true })}
                            variant="secondary"
                        />
                    </>
                ) : (
                    <View style={styles.completedBanner}>
                        <Text style={styles.completedText}>✓ Survey Completed</Text>
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
        padding: spacing.lg,
        gap: spacing.md,
        paddingBottom: 140,
    },
    statusCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    sectionTitle: {
        ...typography.bodyBold,
        color: colors.textPrimary,
        marginBottom: spacing.md,
    },
    infoGrid: {
        gap: spacing.md,
    },
    infoItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    infoLabel: {
        ...typography.caption,
        color: colors.textMuted,
    },
    infoValue: {
        ...typography.caption,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    mapCard: {},
    mapPlaceholder: {
        height: 160,
        backgroundColor: colors.surfaceAlt,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mapIcon: {
        fontSize: 40,
        marginBottom: spacing.sm,
    },
    mapText: {
        ...typography.body,
        color: colors.textMuted,
    },
    coordsText: {
        ...typography.small,
        color: colors.textMuted,
        marginTop: spacing.xs,
    },
    directionsBtn: {
        marginTop: spacing.md,
    },
    instructions: {
        gap: spacing.md,
    },
    instructionItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
    },
    instructionNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.primaryFaded,
        color: colors.primary,
        textAlign: 'center',
        lineHeight: 24,
        fontWeight: '600',
        fontSize: 12,
    },
    instructionText: {
        ...typography.body,
        color: colors.textSecondary,
        flex: 1,
    },
    actions: {
        padding: spacing.lg,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        ...shadows.sm,
    },
    completedBanner: {
        backgroundColor: colors.completedBg,
        padding: spacing.lg,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    completedText: {
        ...typography.bodyBold,
        color: colors.completedText,
    },
});
