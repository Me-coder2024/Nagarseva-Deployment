import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, borderRadius, spacing } from '../theme';
import { AssignmentStatus } from '../types';

interface StatusBadgeProps {
    status: AssignmentStatus;
}

const statusConfig: Record<
    AssignmentStatus,
    { bg: string; text: string; label: string }
> = {
    PENDING: {
        bg: colors.pendingBg,
        text: colors.pendingText,
        label: 'Pending',
    },
    IN_PROGRESS: {
        bg: colors.activeBg,
        text: colors.activeText,
        label: 'In Progress',
    },
    COMPLETED: {
        bg: colors.completedBg,
        text: colors.completedText,
        label: 'Completed',
    },
    CANCELLED: {
        bg: colors.surfaceAlt,
        text: colors.textMuted,
        label: 'Cancelled',
    },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
    const config = statusConfig[status] || statusConfig.PENDING;

    return (
        <View style={[styles.badge, { backgroundColor: config.bg }]}>
            <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: borderRadius.full,
        alignSelf: 'flex-start',
    },
    text: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
});
