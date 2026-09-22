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
                        const safeLat = (item.latitude && item.latitude !== 0) ? item.latitude : 22.3072;
                        const safeLon = (item.longitude && item.longitude !== 0) ? item.longitude : 73.1812;
                        if (item.frames && item.frames.length === 1) {
                            const r = await api.reportDetection(
                                item.frames[0],
                                item.routeId,
                                item.wardId,
                                item.surveySessionId,
                                item.assignmentId,
                                safeLat,
                                safeLon,
                                0.90,
                                undefined,
                                item.accuracy,
                                item.capturedAt,
                                item.id
                            );
                            return { success: !!(r && r.success), message: r?.message, httpStatus: r?.httpStatus };
                        } else {
                            const r = await api.uploadFrames(
                                item.frames,
                                item.routeId,
                                item.wardId,
                                item.surveySessionId,
                                item.assignmentId,
                                safeLat,
                                safeLon
                            );
                            return { success: !!(r && r.success) };
                        }
                    } catch (e: any) {
                        return { success: false, message: e?.message };
                    }
                });
            } finally {
                setIsSyncing(false);
                const remaining = await offlineQueue.getTotalPendingPhotosCount().catch(() => 0);
                setOfflineCount(remaining);
            }
        }
    }, [checkActiveUpload]);

    const handleManualSync = async () => {
        setIsSyncing(true);
        try {
            await offlineQueue.resumeQueue();
            const res = (await offlineQueue.syncQueue(async (item) => {
                try {
                    const safeLat = (item.latitude && item.latitude !== 0) ? item.latitude : 22.3072;
                    const safeLon = (item.longitude && item.longitude !== 0) ? item.longitude : 73.1812;
                    if (item.frames && item.frames.length === 1) {
                        const r = await api.reportDetection(
                            item.frames[0],
                            item.routeId,
                            item.wardId,
                            item.surveySessionId,
                            item.assignmentId,
                            safeLat,
                            safeLon,
                            0.90,
                            undefined,
                            item.accuracy,
                            item.capturedAt,
                            item.id
                        );
                        return { success: !!(r && r.success), message: r?.message, httpStatus: r?.httpStatus };
                    } else {
                        const r = await api.uploadFrames(
                            item.frames,
                            item.routeId,
                            item.wardId,
                            item.surveySessionId,
                            item.assignmentId,
                            safeLat,
                            safeLon
                        );
                        return { success: !!(r && r.success) };
                    }
                } catch (e: any) {
                    return { success: false, message: e?.message };
                }
            }, true)) || { synced: 0, remaining: 0, failed: 0 };

            const remaining = await offlineQueue.getTotalPendingPhotosCount().catch(() => 0);
            setOfflineCount(remaining);
            checkActiveUpload();

            const syncedCount = res?.synced ?? 0;
            const remainingCount = res?.remaining ?? remaining;

            if (syncedCount > 0) {
                Alert.alert(
                    '✅ Sync Complete',
                    `Successfully uploaded ${syncedCount} photo(s) to server. Issues are now live on Admin Dashboard!`
                );
            } else if (remainingCount === 0) {
                Alert.alert(
                    '☁️ Synced',
                    'All survey photos and assignments are fully up to date with the server.'
                );
            } else if (res?.lastHttpStatus === 401 || (res?.lastErrorMessage && res.lastErrorMessage.includes('expired')) || offlineQueue.getPauseReason() === 'Authentication required') {
                Alert.alert(
                    '🔑 Session Expired',
                    'Your login session needs to be refreshed. Please tap "Log Out" and log in again to sync all queued photos to the server.',
                    [
                        { text: 'Log Out Now', style: 'destructive', onPress: logout },
                        { text: 'Cancel', style: 'cancel' }
                    ]
                );
            } else {
                Alert.alert(
                    '⚠️ Sync Incomplete',
                    `${remainingCount} photo(s) still queued. ${res?.lastErrorMessage ? `Server message: ${res.lastErrorMessage}` : 'Please check your connection and try again.'}`
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

    const handleClearQueue = () => {
        Alert.alert(
            '🗑️ Clear Stuck Queue',
            'Do you want to reset and clear any stuck offline photos from your device?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear Queue',
                    style: 'destructive',
                    onPress: async () => {
                        await offlineQueue.clearQueue();
                        await AsyncStorage.removeItem('@nagarseva_active_survey_upload');
                        setActiveUpload(null);
                        setOfflineCount(0);
                        Alert.alert('✅ Queue Reset', 'All stuck photo records have been cleared. You can now start new surveys smoothly.');
                    }
                }
            ]
        );
    };

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
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [16 + index * 6, 0] }) }] }}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('AssignmentDetail', { assignment: item })}
                    activeOpacity={0.75}
                    style={styles.assignmentPressable}
                >
                    <View style={[styles.assignmentCard, isCompleted && styles.completedCard]}>
                        <View style={styles.assignmentHeader}>
                            <View style={[styles.routeIconContainer, isCompleted && { backgroundColor: '#D1FAE5' }]}>
                                <Text style={styles.routeIcon}>{isCompleted ? '🏆' : '📍'}</Text>
                            </View>
                            <View style={{ flex: 1, marginRight: spacing.xs }}>
                                <Text style={[styles.routeName, isCompleted && styles.completedRouteName]} numberOfLines={1}>
                                    {item.route?.name || 'Assigned Route'}
                                </Text>
                                <Text style={styles.routeWard} numberOfLines={1}>
                                    {item.route?.ward?.name || 'General Ward'}
                                </Text>
                            </View>
                            <StatusBadge status={item.status} />
                        </View>
                        
                        <View style={styles.assignmentDetails}>
                            <View style={styles.detailItem}>
                                <Text style={styles.detailLabel}>DISTANCE</Text>
                                <Text style={styles.detailValue}>{item.route?.distance ?? 0} km</Text>
                            </View>
                            <View style={styles.detailItem}>
                                <Text style={styles.detailLabel}>ASSIGNED</Text>
                                <Text style={styles.detailValue}>
                                    {item.assignedAt
                                        ? new Date(item.assignedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                        : 'Today'}
                                </Text>
                            </View>
                            <View style={styles.detailActionItem}>
                                <Text style={styles.detailActionText}>
                                    {isCompleted ? 'View Results →' : 'Start Survey →'}
                                </Text>
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
                <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
                <View style={[styles.headerHero, { paddingTop: Math.max(insets.top + spacing.sm, 24) }]}>
                    <View style={styles.headerContent}>
                        <View style={styles.userSection}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>S</Text>
                            </View>
                            <View>
                                <Text style={styles.greeting}>Welcome,</Text>
                                <Text style={styles.userName}>Surveyor</Text>
                            </View>
                        </View>
                    </View>
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </View>
        );
    }

    const renderHeader = () => (
        <View style={styles.headerWrapper}>
            <View style={[styles.headerHero, { paddingTop: Math.max(insets.top + spacing.xs, 16) }]}>
                <View style={styles.headerContent}>
                    <View style={styles.userSection}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() || 'S'}</Text>
                        </View>
                        <View>
                            <Text style={styles.greeting}>Logged in as</Text>
                            <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Surveyor'}</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={styles.logoutButton} onPress={logout} activeOpacity={0.8}>
                        <Text style={styles.logoutText}>Logout</Text>
                    </TouchableOpacity>
                </View>

                {/* Stat Cards */}
                <View style={styles.statsContainer}>
                    <View style={styles.statCard}>
                        <View style={[styles.statIconBg, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={styles.statIcon}>⏳</Text>
                        </View>
                        <Text style={styles.statNumber}>{stats.pending}</Text>
                        <Text style={styles.statLabel} numberOfLines={1}>Pending</Text>
                    </View>
                    <View style={styles.statCard}>
                        <View style={[styles.statIconBg, { backgroundColor: '#DBEAFE' }]}>
                            <Text style={styles.statIcon}>🚀</Text>
                        </View>
                        <Text style={styles.statNumber}>{stats.active}</Text>
                        <Text style={styles.statLabel} numberOfLines={1}>Active</Text>
                    </View>
                    <View style={styles.statCard}>
                        <View style={[styles.statIconBg, { backgroundColor: '#D1FAE5' }]}>
                            <Text style={styles.statIcon}>✅</Text>
                        </View>
                        <Text style={styles.statNumber}>{stats.completed}</Text>
                        <Text style={styles.statLabel} numberOfLines={1}>Completed</Text>
                    </View>
                </View>
            </View>

            {/* Live Survey Upload Progress Card */}
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
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                                style={styles.activeSyncButton}
                                onPress={handleManualSync}
                                disabled={isSyncing}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.activeSyncButtonText}>{isSyncing ? 'Syncing...' : '⚡ Sync'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.activeSyncButton, { backgroundColor: '#DC2626' }]}
                                onPress={handleClearQueue}
                                disabled={isSyncing}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.activeSyncButtonText}>🗑️ Clear</Text>
                            </TouchableOpacity>
                        </View>
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
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                            style={styles.syncButton}
                            onPress={handleManualSync}
                            disabled={isSyncing}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.syncButtonText}>{isSyncing ? 'Syncing...' : 'Sync'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.syncButton, { backgroundColor: '#DC2626' }]}
                            onPress={handleClearQueue}
                            disabled={isSyncing}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.syncButtonText}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {!activeUpload && offlineCount === 0 && (
                <View style={styles.syncedBanner}>
                    <Text style={styles.syncedIcon}>☁️</Text>
                    <Text style={styles.syncedText}>Cloud Sync Active • All data uploaded</Text>
                </View>
            )}

            {/* Filter Tabs */}
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Route Assignments</Text>
                <Text style={styles.sectionCountBadge}>{filteredAssignments.length}</Text>
            </View>

            <View style={styles.tabsContainer}>
                {(['all', 'pending', 'active', 'completed'] as FilterTab[]).map(tab => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.activeTab]}
                        onPress={() => setActiveTab(tab)}
                        activeOpacity={0.7}
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
            <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
            <FlatList
                data={filteredAssignments}
                keyExtractor={item => item.id}
                renderItem={renderAssignment}
                ListHeaderComponent={renderHeader}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 60, 90) }}
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
                            <TouchableOpacity style={styles.retryButton} onPress={() => loadAssignments()} activeOpacity={0.8}>
                                <Text style={styles.retryButtonText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconBg}>
                                <Text style={styles.emptyIcon}>📭</Text>
                            </View>
                            <Text style={styles.emptyText}>No assignments found</Text>
                            <Text style={styles.emptySubtext}>You have no route assignments under this tab.</Text>
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
        marginBottom: spacing.sm,
    },
    headerHero: {
        backgroundColor: colors.primary,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        paddingBottom: spacing.lg,
        ...shadows.sm,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.md,
    },
    userSection: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.sm,
        ...shadows.xs,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.primary,
    },
    greeting: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.75)',
        fontWeight: '600',
    },
    userName: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.textInverse,
    },
    logoutButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.18)',
        paddingVertical: 6,
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.full,
    },
    logoutText: {
        fontSize: 12,
        color: colors.textInverse,
        fontWeight: '700',
    },
    statsContainer: {
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
    },
    statCard: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 14,
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: colors.border,
        ...shadows.xs,
    },
    statIconBg: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    statIcon: {
        fontSize: 16,
    },
    statNumber: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.textPrimary,
        marginBottom: 1,
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    sectionCountBadge: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.primary,
        backgroundColor: colors.primaryFaded,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        marginVertical: spacing.sm,
        gap: 6,
    },
    tab: {
        flex: 1,
        paddingVertical: 7,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    activeTab: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    tabText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    activeTabText: {
        color: colors.textInverse,
        fontWeight: '700',
    },
    assignmentPressable: {
        paddingHorizontal: spacing.md,
        marginBottom: spacing.sm,
    },
    assignmentCard: {
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        ...shadows.xs,
    },
    completedCard: {
        backgroundColor: '#F0FDF4',
        borderColor: '#BBF7D0',
    },
    completedRouteName: {
        color: '#065F46',
    },
    assignmentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    routeIconContainer: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.md,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.sm,
    },
    routeIcon: {
        fontSize: 20,
    },
    routeName: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.textPrimary,
        marginBottom: 2,
    },
    routeWard: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '500',
    },
    assignmentDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        paddingTop: spacing.xs,
        marginTop: 2,
    },
    detailItem: {
        marginRight: spacing.md,
    },
    detailLabel: {
        fontSize: 9,
        color: colors.textMuted,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 1,
    },
    detailValue: {
        fontSize: 13,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    detailActionItem: {
        marginLeft: 'auto',
    },
    detailActionText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.primary,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
    },
    emptyIconBg: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
    },
    emptyIcon: {
        fontSize: 28,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    emptySubtext: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 4,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
    },
    retryButton: {
        marginTop: spacing.md,
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
    },
    retryButtonText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
    },
    syncBanner: {
        backgroundColor: '#FEF3C7',
        borderWidth: 1,
        borderColor: '#FDE68A',
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        marginHorizontal: spacing.md,
        marginTop: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...shadows.xs,
    },
    syncLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: spacing.sm,
    },
    syncIcon: {
        fontSize: 18,
        marginRight: spacing.xs,
    },
    syncTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#92400E',
    },
    syncSubtitle: {
        fontSize: 11,
        color: '#B45309',
    },
    syncButton: {
        backgroundColor: '#F59E0B',
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
        borderRadius: borderRadius.sm,
    },
    syncButtonText: {
        fontSize: 11,
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
        marginHorizontal: spacing.md,
        marginTop: spacing.xs,
    },
    syncedIcon: {
        fontSize: 14,
        marginRight: spacing.xs,
    },
    syncedText: {
        fontSize: 11,
        color: '#065F46',
        fontWeight: '600',
    },
    activeUploadCard: {
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#BFDBFE',
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginHorizontal: spacing.md,
        marginTop: spacing.sm,
        ...shadows.xs,
    },
    activeUploadHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xs,
    },
    activeUploadIcon: {
        fontSize: 20,
        marginRight: spacing.xs,
    },
    activeUploadTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E40AF',
    },
    activeUploadRoute: {
        fontSize: 11,
        color: '#3B82F6',
        fontWeight: '600',
        marginTop: 1,
    },
    activeSyncButton: {
        backgroundColor: '#2563EB',
        paddingHorizontal: spacing.sm,
        paddingVertical: 5,
        borderRadius: borderRadius.sm,
    },
    activeSyncButtonText: {
        fontSize: 11,
        color: '#FFFFFF',
        fontWeight: '700',
    },
    uploadProgressTrack: {
        height: 8,
        backgroundColor: '#DBEAFE',
        borderRadius: 4,
        overflow: 'hidden',
        marginVertical: spacing.xs,
    },
    uploadProgressFill: {
        height: '100%',
        backgroundColor: '#2563EB',
        borderRadius: 4,
    },
    uploadCountRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 2,
    },
    uploadCountText: {
        fontSize: 11,
        color: '#1E40AF',
        fontWeight: '700',
    },
    uploadRemainingText: {
        fontSize: 11,
        color: '#D97706',
        fontWeight: '700',
    },
    activeCompletedCard: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginHorizontal: spacing.md,
        marginTop: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...shadows.xs,
    },
    completedCardTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#065F46',
    },
    completedCardSubtitle: {
        fontSize: 11,
        color: '#047857',
        marginTop: 1,
    },
    dismissButton: {
        backgroundColor: '#D1FAE5',
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: spacing.sm,
    },
    dismissButtonText: {
        color: '#065F46',
        fontWeight: '700',
        fontSize: 12,
    },
});
