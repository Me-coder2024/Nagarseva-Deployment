import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    RefreshControl,
    TouchableOpacity,
    StatusBar,
    ActivityIndicator,
    Animated,
    Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';
import { Card, StatusBadge } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { RouteAssignment } from '../../types';
import { SurveyorStackParamList } from '../../navigation/SurveyorNavigator';
import api from '../../services/api';
import offlineQueue from '../../services/offlineQueue';

type NavigationProp = NativeStackNavigationProp<SurveyorStackParamList, 'Dashboard'>;
type FilterTab = 'all' | 'pending' | 'active' | 'completed';

export default function DashboardScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<NavigationProp>();
    const { user, logout } = useAuth();
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [assignments, setAssignments] = useState<RouteAssignment[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<FilterTab>('all');

    const [offlineCount, setOfflineCount] = useState<number>(0);
    const [isSyncing, setIsSyncing] = useState<boolean>(false);
    const [activeUpload, setActiveUpload] = useState<{
        assignmentId: string;
        routeName: string;
        total: number;
        surveySessionId: string;
        startedAt: string;
        isCompleted?: boolean;
    } | null>(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;

    const checkActiveUpload = useCallback(async () => {
        try {
            const raw = await AsyncStorage.getItem('@nagarseva_active_survey_upload');
            if (raw) {
                const parsed = JSON.parse(raw);
                setActiveUpload(parsed);
            } else {
                setActiveUpload(null);
            }
        } catch (e) {
            console.error('Failed to load active survey upload state', e);
        }
    }, []);

    const performSync = useCallback(async () => {
        const count = await offlineQueue.getTotalPendingPhotosCount();
        setOfflineCount(count);
        checkActiveUpload();

        if (count > 0 && !offlineQueue.isQueuePaused()) {
            setIsSyncing(true);
            try {
                await offlineQueue.syncQueue(async (item) => {
                    try {
                        if (item.frames && item.frames.length === 1) {
                            const r = await api.reportDetection(
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
                            return { success: r.success, message: r.message, httpStatus: r.httpStatus };
                        } else {
                            const r = await api.uploadFrames(
                                item.frames,
                                item.routeId,
                                item.wardId,
                                item.surveySessionId,
                                item.assignmentId,
                                item.latitude,
                                item.longitude
                            );
                            return { success: r.success };
                        }
                    } catch (e: any) {
                        return { success: false, message: e?.message };
                    }
                });
            } finally {
                setIsSyncing(false);
                const remaining = await offlineQueue.getTotalPendingPhotosCount();
                setOfflineCount(remaining);
            }
        }
    }, [checkActiveUpload]);

    const handleManualSync = async () => {
        setIsSyncing(true);
        try {
            await offlineQueue.resumeQueue();
            const res = await offlineQueue.syncQueue(async (item) => {
                try {
                    if (item.frames && item.frames.length === 1) {
                        const r = await api.reportDetection(
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
                        return { success: r.success, message: r.message, httpStatus: r.httpStatus };
                    } else {
                        const r = await api.uploadFrames(
                            item.frames,
                            item.routeId,
                            item.wardId,
                            item.surveySessionId,
                            item.assignmentId,
                            item.latitude,
                            item.longitude
                        );
                        return { success: r.success };
                    }
                } catch (e: any) {
                    return { success: false, message: e?.message };
                }
            }, true);

            const remaining = await offlineQueue.getTotalPendingPhotosCount();
            setOfflineCount(remaining);
            checkActiveUpload();

            if (res.synced > 0) {
                Alert.alert(
                    '✅ Sync Complete',
                    `Successfully uploaded ${res.synced} photo(s) to server. Issues are now live on Admin Dashboard!`
                );
            } else if (remaining === 0) {
                Alert.alert(
                    '☁️ Synced',
                    'All survey photos and assignments are fully up to date with the server.'
                );
            } else {
                Alert.alert(
                    '⚠️ Sync Incomplete',
                    `${res.remaining} photo(s) still queued. Please check your internet connection.`
                );
            }
        } catch (err: any) {
            Alert.alert('Sync Error', err?.message || 'Failed to sync with server.');
        } finally {
            setIsSyncing(false);
        }
    };

    // Auto-complete survey when active upload photos reach 0
    useEffect(() => {
        if (activeUpload && !activeUpload.isCompleted && offlineCount === 0) {
            if (activeUpload.surveySessionId) {
                api.endSurvey(activeUpload.surveySessionId, new Date().toISOString()).catch(console.warn);
            }
            AsyncStorage.setItem(`@nagarseva_completed_${activeUpload.assignmentId}`, 'true').catch(console.warn);

            const completed = { ...activeUpload, isCompleted: true };
            setActiveUpload(completed);
            AsyncStorage.setItem('@nagarseva_active_survey_upload', JSON.stringify(completed)).catch(console.warn);

            loadAssignments();

            Alert.alert(
                '🎉 Survey Complete!',
                `All ${activeUpload.total} photos for "${activeUpload.routeName}" have been successfully uploaded to Admin.`
            );
        }
    }, [activeUpload, offlineCount, loadAssignments]);

    const handleDismissUploadCard = async () => {
        await AsyncStorage.removeItem('@nagarseva_active_survey_upload');
        setActiveUpload(null);
    };

    // Subscribe to queue changes and keep syncing in background
    useEffect(() => {
        const unsubscribe = offlineQueue.subscribe((count) => {
            setOfflineCount(count);
            checkActiveUpload();
        });

        performSync();
        const syncInterval = setInterval(performSync, 4000);

        return () => {
            unsubscribe();
            clearInterval(syncInterval);
        };
    }, [performSync, checkActiveUpload]);

    useFocusEffect(
        useCallback(() => {
            loadAssignments();
            performSync();
            checkActiveUpload();
        }, [user?.id, performSync, checkActiveUpload])
    );

    useEffect(() => {
        if (!loading) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();
        }
    }, [loading]);

    async function loadAssignments() {
        try {
            setError(null);

            if (!user?.id) {
                setError('Not authenticated. Please log in again.');
                setAssignments([]);
                return;
            }

            const response = await api.getAssignments(user.id);
            const list = (response && response.assignments && Array.isArray(response.assignments))
                ? response.assignments
                : [];

            const updatedList = await Promise.all(
                list.map(async (a: any) => {
                    const isDone = await AsyncStorage.getItem(`@nagarseva_completed_${a.id}`);
                    if (isDone === 'true') {
                        return { ...a, status: 'COMPLETED' as const };
                    }
                    return a;
                })
            );
            setAssignments(updatedList);
            setError(null);
        } catch (err) {
            console.error('Failed to load assignments:', err);
            setAssignments([]);
            setError('Unable to load assignments. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAssignments();
        setRefreshing(false);
    }, [user?.id]);

    const filteredAssignments = assignments.filter(a => {
        if (activeTab === 'all') return true;
        if (activeTab === 'pending') return a.status === 'PENDING';
        if (activeTab === 'active') return a.status === 'IN_PROGRESS';
        if (activeTab === 'completed') return a.status === 'COMPLETED';
        return true;
    });

    const stats = {
        pending: assignments.filter(a => a.status === 'PENDING').length,
        active: assignments.filter(a => a.status === 'IN_PROGRESS').length,
        completed: assignments.filter(a => a.status === 'COMPLETED').length,
    };

    function renderAssignment({ item, index }: { item: RouteAssignment, index: number }) {
        const isCompleted = item.status === 'COMPLETED';
        const isPending = item.status === 'PENDING';

        return (
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20 + index * 10, 0] }) }] }}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('AssignmentDetail', { assignment: item })}
                    activeOpacity={0.8}
                    style={styles.assignmentPressable}
                >
                    <View style={[styles.assignmentCard, isCompleted && styles.completedCard]}>
                        <View style={styles.assignmentHeader}>
                            <View style={[styles.routeIconContainer, isCompleted && { backgroundColor: colors.completedBg }]}>
                                <Text style={styles.routeIcon}>{isCompleted ? '🏆' : '📍'}</Text>
                            </View>
                            <View style={{ flex: 1, marginRight: spacing.sm }}>
                                <Text style={[styles.routeName, isCompleted && styles.completedText]} numberOfLines={1}>{item.route?.name}</Text>
                                <Text style={styles.routeWard}>{item.route?.ward?.name}</Text>
                            </View>
                            <StatusBadge status={item.status} />
                        </View>
                        
                        <View style={styles.assignmentDetails}>
                            <View style={styles.detailItem}>
                                <Text style={styles.detailLabel}>Distance</Text>
                                <Text style={styles.detailValue}>{item.route?.distance} km</Text>
                            </View>
                            <View style={styles.detailItem}>
                                <Text style={styles.detailLabel}>Assigned</Text>
                                <Text style={styles.detailValue}>
                                    {new Date(item.assignedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </Text>
                            </View>
                            <View style={styles.progressBarContainer}>
                                <View style={[styles.progressBar, { width: isCompleted ? '100%' : isPending ? '0%' : '40%' }]} />
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    }

    if (loading) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
                <View style={[styles.headerHero, { paddingTop: insets.top, height: 120 }]} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </View>
        );
    }

    const renderHeader = () => (
        <View style={styles.headerWrapper}>
            <View style={[styles.headerHero, { paddingTop: insets.top + spacing.sm }]}>
                <View style={styles.headerContent}>
                    <View style={styles.userSection}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'S'}</Text>
                        </View>
                        <View>
                            <Text style={styles.greeting}>Good morning,</Text>
                            <Text style={styles.userName}>{user?.name || 'Surveyor'}</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                        <Text style={styles.logoutText}>Logout</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.statsContainer}>
                    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                        <View style={[styles.statIconBg, { backgroundColor: colors.pendingBg }]}>
                            <Text style={styles.statIcon}>⏳</Text>
                        </View>
                        <Text style={styles.statNumber}>{stats.pending}</Text>
                        <Text style={styles.statLabel}>Pending</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                        <View style={[styles.statIconBg, { backgroundColor: colors.activeBg }]}>
                            <Text style={styles.statIcon}>🚀</Text>
                        </View>
                        <Text style={styles.statNumber}>{stats.active}</Text>
                        <Text style={styles.statLabel}>Active</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                        <View style={[styles.statIconBg, { backgroundColor: colors.completedBg }]}>
                            <Text style={styles.statIcon}>✅</Text>
                        </View>
                        <Text style={styles.statNumber}>{stats.completed}</Text>
                        <Text style={styles.statLabel}>Completed</Text>
                    </View>
                </View>
            </View>

            {/* Live Survey Upload Progress Card or Background Cloud Sync Status Banner */}
            {activeUpload && !activeUpload.isCompleted && (
                <View style={styles.activeUploadCard}>
                    <View style={styles.activeUploadHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            {isSyncing ? (
                                <ActivityIndicator size="small" color="#2563EB" style={{ marginRight: spacing.sm }} />
                            ) : (
                                <Text style={styles.activeUploadIcon}>📤</Text>
                            )}
                            <View style={{ flex: 1 }}>
                                <Text style={styles.activeUploadTitle}>
                                    {isSyncing ? 'Uploading Survey Photos...' : 'Survey Upload Queued'}
                                </Text>
                                <Text style={styles.activeUploadRoute} numberOfLines={1}>
                                    📍 {activeUpload.routeName}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={styles.activeSyncButton}
                            onPress={handleManualSync}
                            disabled={isSyncing}
                        >
                            <Text style={styles.activeSyncButtonText}>{isSyncing ? 'Syncing...' : '⚡ Sync Now'}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.uploadProgressTrack}>
                        <View
                            style={[
                                styles.uploadProgressFill,
                                {
                                    width: `${Math.min(
                                        100,
                                        Math.max(5, Math.round(((Math.max(0, activeUpload.total - offlineCount)) / (activeUpload.total || 1)) * 100))
                                    )}%`,
                                },
                            ]}
                        />
                    </View>

                    {/* Counter Text */}
                    <View style={styles.uploadCountRow}>
                        <Text style={styles.uploadCountText}>
                            ✅ Uploaded {Math.max(0, activeUpload.total - offlineCount)} of {activeUpload.total} photos
                        </Text>
                        <Text style={styles.uploadRemainingText}>
                            ⏳ {offlineCount} remaining
                        </Text>
                    </View>
                </View>
            )}

            {activeUpload && activeUpload.isCompleted && (
                <View style={styles.activeCompletedCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 24, marginRight: spacing.sm }}>🎉</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.completedCardTitle}>Survey Completed & Uploaded!</Text>
                            <Text style={styles.completedCardSubtitle}>
                                All {activeUpload.total} photos for "{activeUpload.routeName}" are live on Admin Dashboard.
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity style={styles.dismissButton} onPress={handleDismissUploadCard}>
                        <Text style={styles.dismissButtonText}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {!activeUpload && offlineCount > 0 && (
                <View style={styles.syncBanner}>
                    <View style={styles.syncLeft}>
                        {isSyncing ? (
                            <ActivityIndicator size="small" color="#B45309" style={{ marginRight: spacing.sm }} />
                        ) : (
                            <Text style={styles.syncIcon}>⏳</Text>
                        )}
                        <View style={{ flex: 1 }}>
                            <Text style={styles.syncTitle}>
                                {isSyncing ? 'Syncing Photos to Server...' : 'Photos Pending Upload'}
                            </Text>
                            <Text style={styles.syncSubtitle}>
                                {offlineCount} photo{offlineCount === 1 ? '' : 's'} uploading in background
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.syncButton}
                        onPress={handleManualSync}
                        disabled={isSyncing}
                    >
                        <Text style={styles.syncButtonText}>{isSyncing ? 'Syncing...' : 'Sync Now'}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {!activeUpload && offlineCount === 0 && (
                <View style={styles.syncedBanner}>
                    <Text style={styles.syncedIcon}>☁️</Text>
                    <Text style={styles.syncedText}>Cloud Sync Active • All photos & survey data uploaded</Text>
                </View>
            )}

            <View style={styles.tabsContainer}>
                {(['all', 'pending', 'active', 'completed'] as FilterTab[]).map(tab => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.activeTab]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
            <FlatList
                data={filteredAssignments}
                keyExtractor={item => item.id}
                renderItem={renderAssignment}
                ListHeaderComponent={renderHeader}
                style={{ flex: 1 }}
                contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 60, 90) }]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                }
                ListEmptyComponent={
                    error ? (
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconBg}>
                                <Text style={styles.emptyIcon}>⚠️</Text>
                            </View>
                            <Text style={styles.emptyText}>Unable to load assignments</Text>
                            <Text style={styles.emptySubtext}>{error}</Text>
                            <TouchableOpacity style={styles.retryButton} onPress={() => loadAssignments()}>
                                <Text style={styles.retryButtonText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconBg}>
                                <Text style={styles.emptyIcon}>📭</Text>
                            </View>
                            <Text style={styles.emptyText}>No assignments found</Text>
                            <Text style={styles.emptySubtext}>You have no route assignments. Contact your supervisor.</Text>
                        </View>
                    )
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    headerWrapper: {
        marginBottom: spacing.md,
    },
    headerHero: {
        backgroundColor: colors.primary,
        borderBottomLeftRadius: borderRadius.xxl,
        borderBottomRightRadius: borderRadius.xxl,
        paddingBottom: spacing.lg,
        ...shadows.md,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
    },
    userSection: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
        ...shadows.sm,
    },
    avatarText: {
        ...typography.heading3,
        color: colors.primary,
    },
    greeting: {
        ...typography.small,
        color: colors.primaryLight,
        fontWeight: '600',
    },
    userName: {
        ...typography.heading2,
        color: colors.textInverse,
    },
    logoutButton: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.full,
    },
    logoutText: {
        ...typography.small,
        color: colors.textInverse,
        fontWeight: '700',
    },
    statsContainer: {
        flexDirection: 'row',
        paddingHorizontal: spacing.lg,
        marginTop: spacing.sm,
        gap: spacing.md,
    },
    statCard: {
        flex: 1,
        padding: spacing.md,
        borderRadius: borderRadius.xl,
        alignItems: 'center',
        ...shadows.md,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    statIconBg: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.sm,
    },
    statIcon: {
        fontSize: 20,
    },
    statNumber: {
        ...typography.heading2,
        color: colors.textPrimary,
    },
    statLabel: {
        ...typography.caption,
        color: colors.textSecondary,
    },
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: spacing.lg,
        marginTop: spacing.xl,
        gap: spacing.sm,
    },
    tab: {
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        borderRadius: borderRadius.full,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    activeTab: {
        backgroundColor: colors.primaryDark,
        borderColor: colors.primaryDark,
    },
    tabText: {
        ...typography.small,
        color: colors.textSecondary,
    },
    activeTabText: {
        color: colors.textInverse,
    },
    listContent: {
        padding: spacing.lg,
        paddingBottom: spacing.xxxl,
    },
    assignmentPressable: {
        marginBottom: spacing.md,
    },
    assignmentCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.xl,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.sm,
    },
    completedCard: {
        backgroundColor: colors.completedBg + '20',
        borderColor: colors.completedBg,
    },
    completedText: {
        color: colors.completedText,
    },
    assignmentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    routeIconContainer: {
        width: 48,
        height: 48,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.md,
    },
    routeIcon: {
        fontSize: 24,
    },
    routeName: {
        ...typography.bodyBold,
        color: colors.textPrimary,
        marginBottom: 2,
    },
    routeWard: {
        ...typography.small,
        color: colors.textSecondary,
    },
    assignmentDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        paddingTop: spacing.md,
    },
    detailItem: {
        minWidth: 70,
    },
    detailLabel: {
        ...typography.small,
        color: colors.textMuted,
        marginBottom: 2,
        fontSize: 10,
        textTransform: 'uppercase',
    },
    detailValue: {
        ...typography.caption,
        color: colors.textPrimary,
        fontWeight: '700',
    },
    progressBarContainer: {
        flex: 1,
        height: 6,
        backgroundColor: colors.borderLight,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: 3,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: spacing.xxxl,
    },
    emptyIconBg: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
    },
    emptyIcon: {
        fontSize: 36,
    },
    emptyText: {
        ...typography.heading3,
        color: colors.textPrimary,
    },
    emptySubtext: {
        ...typography.body,
        color: colors.textMuted,
        marginTop: spacing.xs,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorContainer: {
        backgroundColor: colors.danger + '15',
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: borderRadius.md,
    },
    errorText: {
        ...typography.caption,
        color: colors.danger,
        textAlign: 'center',
    },
    retryButton: {
        marginTop: spacing.md,
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
    },
    retryButtonText: {
        ...typography.caption,
        color: '#fff',
        textAlign: 'center',
    },
    syncBanner: {
        backgroundColor: '#FEF3C7',
        borderWidth: 1,
        borderColor: '#F59E0B',
        borderRadius: borderRadius.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...shadows.sm,
    },
    syncLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: spacing.sm,
    },
    syncIcon: {
        fontSize: 20,
        marginRight: spacing.sm,
    },
    syncTitle: {
        ...typography.caption,
        fontWeight: '700',
        color: '#92400E',
    },
    syncSubtitle: {
        ...typography.small,
        color: '#B45309',
        marginTop: 1,
    },
    syncButton: {
        backgroundColor: '#F59E0B',
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: borderRadius.md,
    },
    syncButtonText: {
        ...typography.small,
        color: '#FFFFFF',
        fontWeight: '700',
    },
    syncedBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
        borderRadius: borderRadius.md,
        paddingVertical: 6,
        paddingHorizontal: spacing.md,
        marginHorizontal: spacing.lg,
        marginTop: spacing.sm,
    },
    syncedIcon: {
        fontSize: 14,
        marginRight: spacing.xs,
    },
    syncedText: {
        ...typography.small,
        color: '#065F46',
        fontWeight: '600',
    },
    activeUploadCard: {
        backgroundColor: '#EFF6FF',
        borderWidth: 1.5,
        borderColor: '#3B82F6',
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        ...shadows.md,
    },
    activeUploadHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.sm,
    },
    activeUploadIcon: {
        fontSize: 22,
        marginRight: spacing.sm,
    },
    activeUploadTitle: {
        ...typography.caption,
        fontWeight: '800',
        color: '#1E40AF',
        fontSize: 14,
    },
    activeUploadRoute: {
        ...typography.small,
        color: '#3B82F6',
        fontWeight: '600',
        marginTop: 2,
    },
    activeSyncButton: {
        backgroundColor: '#2563EB',
        paddingHorizontal: spacing.md,
        paddingVertical: 7,
        borderRadius: borderRadius.md,
    },
    activeSyncButtonText: {
        ...typography.small,
        color: '#FFFFFF',
        fontWeight: '700',
    },
    uploadProgressTrack: {
        height: 10,
        backgroundColor: '#DBEAFE',
        borderRadius: 5,
        overflow: 'hidden',
        marginVertical: spacing.xs,
    },
    uploadProgressFill: {
        height: '100%',
        backgroundColor: '#2563EB',
        borderRadius: 5,
    },
    uploadCountRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: spacing.xs,
    },
    uploadCountText: {
        ...typography.small,
        color: '#1E40AF',
        fontWeight: '700',
    },
    uploadRemainingText: {
        ...typography.small,
        color: '#D97706',
        fontWeight: '700',
    },
    activeCompletedCard: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1.5,
        borderColor: '#10B981',
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...shadows.md,
    },
    completedCardTitle: {
        ...typography.caption,
        fontWeight: '800',
        color: '#065F46',
        fontSize: 14,
    },
    completedCardSubtitle: {
        ...typography.small,
        color: '#047857',
        marginTop: 2,
    },
    dismissButton: {
        backgroundColor: '#D1FAE5',
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: spacing.sm,
    },
    dismissButtonText: {
        color: '#065F46',
        fontWeight: '700',
        fontSize: 14,
    },
});
