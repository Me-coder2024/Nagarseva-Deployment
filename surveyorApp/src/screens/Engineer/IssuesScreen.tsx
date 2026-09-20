import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Linking,
    ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Geolocation from '@react-native-community/geolocation';
import { Issue } from '../../types';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { EngineerStackParamList } from '../../navigation/EngineerNavigator';
import { Colors, Typography, BorderRadius, Shadows, Spacing, getStatusConfig, getTypeConfig } from '../../engineerTheme';

type NavigationProp = NativeStackNavigationProp<EngineerStackParamList, 'Issues'>;

type FilterTab = 'ALL' | 'ASSIGNED' | 'IN_PROGRESS' | 'FIXED' | 'RESOLVED';

export function IssuesScreen() {
    const insets = useSafeAreaInsets();
    const [issues, setIssues] = useState<Issue[]>([]);
    const [filteredIssues, setFilteredIssues] = useState<Issue[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
    const [showRouteModal, setShowRouteModal] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizedRoute, setOptimizedRoute] = useState<any>(null);
    const navigation = useNavigation<NavigationProp>();
    const { logout, user } = useAuth();

    const fetchIssues = useCallback(async () => {
        try {
            const response = await api.get<any>('/engineer/issues');
            // Backend returns { issues: [...] } not { data: [...] }
            const data: Issue[] = Array.isArray(response.issues) ? response.issues : [];
            setIssues(data);
            filterIssues(data, activeFilter);
        } catch (error: any) {
            if (error.response?.status !== 401) {
                Alert.alert('Error', 'Failed to fetch issues. Pull down to retry.');
            }
        }
    }, [activeFilter]);

    const filterIssues = (data: Issue[], filter: FilterTab) => {
        if (filter === 'ALL') {
            setFilteredIssues(data);
        } else {
            setFilteredIssues(data.filter(issue => issue.status === filter));
        }
    };

    const handleFilterChange = (filter: FilterTab) => {
        setActiveFilter(filter);
        filterIssues(issues, filter);
    };

    useEffect(() => {
        loadIssues();
    }, []);

    const loadIssues = async () => {
        setIsLoading(true);
        await fetchIssues();
        setIsLoading(false);
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchIssues();
        setIsRefreshing(false);
    };

    const handleAcceptIssue = async (issue: Issue) => {
        try {
            const response = await api.engineerAcceptAssignment(issue.id);
            if (response.success) {
                Alert.alert('Success', 'Issue accepted! Status changed to In Progress.');
                handleRefresh();
            } else {
                Alert.alert('Error', response.message || 'Failed to accept issue');
            }
        } catch (error: any) {
            const message = error.message || 'Failed to accept issue';
            Alert.alert('Error', message);
        }
    };

    const handleOptimizeRoute = async () => {
        setIsOptimizing(true);
        Geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const res = await api.getOptimizedRoute(pos.coords.latitude, pos.coords.longitude);
                    if (res && res.success && res.data) {
                        setOptimizedRoute(res.data);
                        setShowRouteModal(true);
                    } else {
                        Alert.alert('Notice', 'No active assigned issues found to optimize.');
                    }
                } catch (e: any) {
                    Alert.alert('Error', 'Failed to generate optimized route.');
                } finally {
                    setIsOptimizing(false);
                }
            },
            async (err) => {
                try {
                    const res = await api.getOptimizedRoute();
                    if (res && res.success && res.data) {
                        setOptimizedRoute(res.data);
                        setShowRouteModal(true);
                    } else {
                        Alert.alert('Notice', 'No active assigned issues found to optimize.');
                    }
                } catch (e: any) {
                    Alert.alert('Error', 'Failed to generate optimized route.');
                } finally {
                    setIsOptimizing(false);
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
        );
    };

    const handleLogout = () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: logout },
        ]);
    };

    const getStats = () => {
        const assigned = issues.filter(i => i.status === 'ASSIGNED').length;
        const inProgress = issues.filter(i => i.status === 'IN_PROGRESS').length;
        const fixed = issues.filter(i => i.status === 'FIXED' || i.status === 'RESOLVED').length;
        return { total: issues.length, assigned, inProgress, fixed };
    };

    const stats = getStats();

    const handleDirectNavigate = (item: Issue) => {
        if (item.latitude && item.longitude) {
            const navUrl = `google.navigation:q=${item.latitude},${item.longitude}`;
            const geoUrl = `geo:${item.latitude},${item.longitude}?q=${item.latitude},${item.longitude}(Pothole%20Site)`;
            const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`;

            Linking.canOpenURL(navUrl).then(supported => {
                if (supported) return Linking.openURL(navUrl);
                return Linking.canOpenURL(geoUrl).then(geoSupported => {
                    if (geoSupported) return Linking.openURL(geoUrl);
                    return Linking.openURL(webUrl);
                });
            }).catch(() => {
                Linking.openURL(webUrl).catch(() => {
                    Alert.alert('Error', 'Could not open Google Maps navigation');
                });
            });
        } else {
            Alert.alert('Error', 'Location coordinates not available');
        }
    };

    const renderIssueCard = ({ item }: { item: Issue }) => {
        const statusConfig = getStatusConfig(item.status);
        const typeConfig = getTypeConfig(item.type);

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('IssueDetail', { issue: item })}
                activeOpacity={0.7}
            >
                {/* Image thumbnail */}
                <View style={styles.cardImageContainer}>
                    {item.imageUrl ? (
                        <Image
                            source={{ uri: item.imageUrl }}
                            style={styles.cardImage}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={styles.cardImagePlaceholder}>
                            <Text style={styles.cardImagePlaceholderIcon}>{typeConfig.icon}</Text>
                        </View>
                    )}
                    <View style={[styles.typeBadge, { backgroundColor: typeConfig.color }]}>
                        <Text style={styles.typeBadgeText}>{typeConfig.label}</Text>
                    </View>
                </View>

                {/* Card content */}
                <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                            <Text style={styles.statusIcon}>{statusConfig.icon}</Text>
                            <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                {item.status.replace('_', ' ')}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.cardDetails}>
                        <View style={styles.detailItem}>
                            <Text style={styles.detailIcon}>📍</Text>
                            <Text style={styles.detailText} numberOfLines={1}>
                                {item.ward?.name || 'Unknown Ward'}
                            </Text>
                        </View>
                        <View style={styles.detailItem}>
                            <Text style={styles.detailIcon}>🛣️</Text>
                            <Text style={styles.detailText} numberOfLines={1}>
                                {item.route?.name || 'Unknown Route'}
                            </Text>
                        </View>
                        {item.assignedAt && (
                            <View style={styles.detailItem}>
                                <Text style={styles.detailIcon}>📅</Text>
                                <Text style={styles.detailText}>
                                    {new Date(item.assignedAt).toLocaleDateString()}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.cardActionsRow}>
                        {item.latitude && item.longitude && (
                            <TouchableOpacity
                                style={styles.cardNavButton}
                                onPress={() => handleDirectNavigate(item)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.cardNavButtonText}>🧭 Navigate</Text>
                            </TouchableOpacity>
                        )}

                        {item.status === 'ASSIGNED' && (
                            <TouchableOpacity
                                style={styles.acceptButton}
                                onPress={() => handleAcceptIssue(item)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.acceptButtonText}>Start Work</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Loading issues...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <View>
                            <Text style={styles.greeting}>Welcome,</Text>
                            <Text style={styles.userName}>{user?.name || 'Engineer'}</Text>
                        </View>
                        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                            <Text style={styles.logoutText}>Logout</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Stats Cards */}
                    <View style={styles.statsContainer}>
                        <View style={[styles.statCard, styles.statCardTotal]}>
                            <Text style={styles.statValue}>{stats.total}</Text>
                            <Text style={styles.statLabel}>Total</Text>
                        </View>
                        <View style={[styles.statCard, styles.statCardPending]}>
                            <Text style={[styles.statValue, { color: Colors.assigned }]}>{stats.assigned}</Text>
                            <Text style={styles.statLabel}>Pending</Text>
                        </View>
                        <View style={[styles.statCard, styles.statCardProgress]}>
                            <Text style={[styles.statValue, { color: Colors.primary }]}>{stats.inProgress}</Text>
                            <Text style={styles.statLabel}>Active</Text>
                        </View>
                        <View style={[styles.statCard, styles.statCardDone]}>
                            <Text style={[styles.statValue, { color: Colors.success }]}>{stats.fixed}</Text>
                            <Text style={styles.statLabel}>Done</Text>
                        </View>
                    </View>

                    {/* AI TSP Route Optimization Action Button */}
                    <TouchableOpacity
                        style={styles.optimizeRouteButton}
                        onPress={handleOptimizeRoute}
                        disabled={isOptimizing}
                        activeOpacity={0.8}
                    >
                        {isOptimizing ? (
                            <ActivityIndicator color={Colors.white} size="small" />
                        ) : (
                            <View style={styles.optimizeButtonContent}>
                                <Text style={styles.optimizeButtonIcon}>🧭</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.optimizeButtonTitle}>
                                        AI Optimize Repair Route (TSP)
                                    </Text>
                                    <Text style={styles.optimizeButtonSubtitle}>
                                        Generate optimal turn-by-turn sequence for active issues
                                    </Text>
                                </View>
                                <Text style={styles.optimizeButtonArrow}>➔</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Filter Tabs */}
                    <View style={styles.filterContainer}>
                        {(['ALL', 'ASSIGNED', 'IN_PROGRESS', 'FIXED', 'RESOLVED'] as FilterTab[]).map((filter) => (
                            <TouchableOpacity
                                key={filter}
                                style={[
                                    styles.filterTab,
                                    activeFilter === filter && styles.filterTabActive
                                ]}
                                onPress={() => handleFilterChange(filter)}
                            >
                                <Text style={[
                                    styles.filterTabText,
                                    activeFilter === filter && styles.filterTabTextActive
                                ]}>
                                    {filter === 'ALL' ? 'All' : filter === 'IN_PROGRESS' ? 'Active' : filter === 'RESOLVED' ? 'Done' : filter.charAt(0) + filter.slice(1).toLowerCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Issues List */}
                <FlatList
                    data={filteredIssues}
                    renderItem={renderIssueCard}
                    keyExtractor={(item, index) => `${item.id}-${index}`}
                    style={{ flex: 1 }}
                    contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 60, 90) }]}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={handleRefresh}
                            tintColor={Colors.primary}
                            colors={[Colors.primary]}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyIcon}>📋</Text>
                            <Text style={styles.emptyText}>
                                {activeFilter === 'ALL'
                                    ? 'No issues assigned yet'
                                    : `No ${activeFilter.toLowerCase().replace('_', ' ')} issues`}
                            </Text>
                            <Text style={styles.emptySubtext}>Pull down to refresh</Text>
                        </View>
                    }
                    showsVerticalScrollIndicator={false}
                />

                {/* AI TSP Route Optimization Modal */}
                <Modal
                    visible={showRouteModal}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setShowRouteModal(false)}
                >
                    <View style={styles.routeModalOverlay}>
                        <View style={styles.routeModalContent}>
                            <View style={styles.routeModalHeader}>
                                <View>
                                    <Text style={styles.routeModalTitle}>🚀 Optimized Repair Route</Text>
                                    <Text style={styles.routeModalSubtitle}>
                                        {optimizedRoute?.totalStops || 0} stops sequenced with Traveling Salesperson AI
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => setShowRouteModal(false)}
                                    style={styles.routeModalClose}
                                >
                                    <Text style={styles.routeModalCloseText}>✕</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Efficiency & Duration Stats Banner */}
                            {optimizedRoute && (
                                <View style={styles.routeStatsBanner}>
                                    <View style={styles.routeStatItem}>
                                        <Text style={styles.routeStatVal}>{optimizedRoute.totalDistanceKm} km</Text>
                                        <Text style={styles.routeStatLbl}>Trip Distance</Text>
                                    </View>
                                    <View style={styles.routeStatDivider} />
                                    <View style={styles.routeStatItem}>
                                        <Text style={styles.routeStatVal}>{optimizedRoute.estimatedTotalDurationMinutes} min</Text>
                                        <Text style={styles.routeStatLbl}>Est. Duration</Text>
                                    </View>
                                    <View style={styles.routeStatDivider} />
                                    <View style={styles.routeStatItem}>
                                        <Text style={[styles.routeStatVal, { color: Colors.success }]}>
                                            +{optimizedRoute.efficiencyImprovementPct}%
                                        </Text>
                                        <Text style={styles.routeStatLbl}>Fuel Savings</Text>
                                    </View>
                                </View>
                            )}

                            {/* Turn-by-Turn Full Route Navigation Button */}
                            {optimizedRoute?.googleMapsTurnByTurnUrl && (
                                <TouchableOpacity
                                    style={styles.fullNavButton}
                                    onPress={() => {
                                        Linking.openURL(optimizedRoute.googleMapsTurnByTurnUrl).catch(() => {
                                            Alert.alert('Error', 'Could not launch Google Maps navigation');
                                        });
                                    }}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.fullNavButtonText}>🗺️ Open Full Route in Google Maps</Text>
                                </TouchableOpacity>
                            )}

                            {/* Ordered Waypoints List */}
                            <ScrollView
                                style={styles.routeStopsScroll}
                                showsVerticalScrollIndicator={false}
                            >
                                <Text style={styles.routeStopsHeading}>Turn-by-Turn Waypoint Sequence</Text>
                                {optimizedRoute?.stops?.map((stop: any) => (
                                    <View key={stop.stopNumber} style={styles.stopCard}>
                                        <View style={styles.stopNumberBadge}>
                                            <Text style={styles.stopNumberText}>#{stop.stopNumber}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={styles.stopHeaderRow}>
                                                <Text style={styles.stopType}>{stop.type}</Text>
                                                <Text style={styles.stopDist}>+{stop.distanceFromPrevKm} km</Text>
                                            </View>
                                            <Text style={styles.stopLocation}>
                                                {stop.wardName} &bull; {stop.routeName}
                                            </Text>
                                            <Text style={styles.stopEta}>
                                                ~{stop.estimatedTransitMinutes} mins travel time
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.stopNavButton}
                                            onPress={() => {
                                                if (stop.navigationUrl) {
                                                    Linking.openURL(stop.navigationUrl).catch(() => {
                                                        Alert.alert('Error', 'Could not open navigation');
                                                    });
                                                }
                                            }}
                                        >
                                            <Text style={styles.stopNavIcon}>🧭</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                <View style={{ height: 30 }} />
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.primary,
    },
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundSecondary,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    loadingText: {
        color: Colors.muted,
        marginTop: Spacing.base,
        fontSize: Typography.fontSize.md,
    },
    header: {
        paddingTop: Spacing.base,
        paddingHorizontal: Spacing.base,
        paddingBottom: Spacing.base,
        backgroundColor: Colors.background,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.base,
    },
    greeting: {
        fontSize: Typography.fontSize.sm,
        color: Colors.muted,
    },
    userName: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.foreground,
    },
    logoutButton: {
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.destructive,
    },
    logoutText: {
        color: Colors.destructive,
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.medium,
    },
    statsContainer: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.base,
    },
    statCard: {
        flex: 1,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    statCardTotal: {
        backgroundColor: Colors.accent,
    },
    statCardPending: {
        backgroundColor: Colors.assignedLight,
    },
    statCardProgress: {
        backgroundColor: Colors.inProgressLight,
    },
    statCardDone: {
        backgroundColor: Colors.successLight,
    },
    statValue: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.foreground,
    },
    statLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.muted,
        marginTop: 2,
    },
    filterContainer: {
        flexDirection: 'row',
        backgroundColor: Colors.accent,
        borderRadius: BorderRadius.lg,
        padding: 3,
    },
    filterTab: {
        flex: 1,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
        borderRadius: BorderRadius.md,
    },
    filterTabActive: {
        backgroundColor: Colors.primary,
    },
    filterTabText: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.medium,
        color: Colors.muted,
    },
    filterTabTextActive: {
        color: Colors.white,
    },
    listContent: {
        padding: Spacing.base,
    },
    card: {
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: Spacing.md,
    },
    cardImageContainer: {
        height: 120,
        backgroundColor: Colors.accent,
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    cardImagePlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardImagePlaceholderIcon: {
        fontSize: 40,
        opacity: 0.5,
    },
    typeBadge: {
        position: 'absolute',
        top: Spacing.sm,
        left: Spacing.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.md,
    },
    typeBadgeText: {
        color: Colors.white,
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.medium,
    },
    cardContent: {
        padding: Spacing.md,
    },
    cardHeader: {
        marginBottom: Spacing.sm,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.md,
    },
    statusIcon: {
        fontSize: 12,
        marginRight: Spacing.xs,
    },
    statusText: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.medium,
    },
    cardDetails: {
        gap: Spacing.xs,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailIcon: {
        fontSize: 12,
        marginRight: Spacing.sm,
        width: 18,
    },
    detailText: {
        color: Colors.muted,
        fontSize: Typography.fontSize.sm,
        flex: 1,
    },
    cardActionsRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginTop: Spacing.md,
    },
    cardNavButton: {
        flex: 1,
        backgroundColor: '#EEF2FF',
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    cardNavButtonText: {
        color: Colors.primary,
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
    },
    acceptButton: {
        flex: 1,
        backgroundColor: Colors.success,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
    },
    acceptButtonText: {
        color: Colors.white,
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: Spacing['5xl'],
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: Spacing.base,
    },
    emptyText: {
        fontSize: Typography.fontSize.md,
        color: Colors.foreground,
        marginBottom: Spacing.xs,
    },
    emptySubtext: {
        fontSize: Typography.fontSize.sm,
        color: Colors.muted,
    },
    optimizeRouteButton: {
        backgroundColor: '#4338ca', // Indigo-700
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginTop: Spacing.md,
        shadowColor: '#4338ca',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 3,
    },
    optimizeButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    optimizeButtonIcon: {
        fontSize: 22,
    },
    optimizeButtonTitle: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.white,
    },
    optimizeButtonSubtitle: {
        fontSize: Typography.fontSize.xs,
        color: '#c7d2fe',
        marginTop: 1,
    },
    optimizeButtonArrow: {
        fontSize: 16,
        color: Colors.white,
        fontWeight: 'bold',
    },
    // Route Modal Styles
    routeModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    routeModalContent: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        padding: Spacing.lg,
        maxHeight: '85%',
    },
    routeModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingBottom: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    routeModalTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.foreground,
    },
    routeModalSubtitle: {
        fontSize: Typography.fontSize.xs,
        color: Colors.muted,
        marginTop: 2,
    },
    routeModalClose: {
        padding: Spacing.xs,
    },
    routeModalCloseText: {
        fontSize: Typography.fontSize.lg,
        color: Colors.muted,
        fontWeight: 'bold',
    },
    routeStatsBanner: {
        flexDirection: 'row',
        backgroundColor: Colors.accent,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginVertical: Spacing.md,
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    routeStatItem: {
        alignItems: 'center',
    },
    routeStatVal: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.foreground,
    },
    routeStatLbl: {
        fontSize: Typography.fontSize.xs,
        color: Colors.muted,
        marginTop: 2,
    },
    routeStatDivider: {
        width: 1,
        height: 24,
        backgroundColor: Colors.border,
    },
    fullNavButton: {
        backgroundColor: Colors.primary,
        borderRadius: BorderRadius.lg,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    fullNavButtonText: {
        color: Colors.white,
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
    },
    routeStopsScroll: {
        maxHeight: 320,
    },
    routeStopsHeading: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.foreground,
        marginBottom: Spacing.sm,
    },
    stopCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        backgroundColor: Colors.backgroundSecondary,
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.sm,
        gap: Spacing.md,
    },
    stopNumberBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#4338ca',
        justifyContent: 'center',
        alignItems: 'center',
    },
    stopNumberText: {
        color: Colors.white,
        fontWeight: 'bold',
        fontSize: Typography.fontSize.xs,
    },
    stopHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    stopType: {
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.foreground,
    },
    stopDist: {
        fontSize: Typography.fontSize.xs,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.primary,
    },
    stopLocation: {
        fontSize: Typography.fontSize.xs,
        color: Colors.muted,
        marginTop: 2,
    },
    stopEta: {
        fontSize: 10,
        color: '#6b7280',
        marginTop: 2,
    },
    stopNavButton: {
        padding: Spacing.sm,
        backgroundColor: Colors.white,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    stopNavIcon: {
        fontSize: 18,
    },
});
