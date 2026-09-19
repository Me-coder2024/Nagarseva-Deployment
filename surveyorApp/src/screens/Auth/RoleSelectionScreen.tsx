import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, StatusBar, Animated, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

type AuthStackParamList = {
    RoleSelection: undefined;
    Login: { role: 'SURVEYOR' | 'ENGINEER' };
};

type RoleSelectionScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'RoleSelection'>;

function RoleCard({ title, description, icon, onPress }: { title: string, description: string, icon: string, onPress: () => void }) {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true, speed: 20 }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
    };

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Pressable
                style={({ pressed }) => [
                    styles.card,
                    pressed && styles.cardPressed
                ]}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={onPress}
            >
                <View style={styles.cardIconContainer}>
                    <Text style={styles.cardIcon}>{icon}</Text>
                </View>
                <View style={styles.cardTextContainer}>
                    <Text style={styles.cardTitle}>{title}</Text>
                    <Text style={styles.cardDescription}>{description}</Text>
                </View>
                <View style={styles.cardArrow}>
                    <Text style={styles.arrowIcon}>→</Text>
                </View>
            </Pressable>
        </Animated.View>
    );
}

export default function RoleSelectionScreen() {
    const navigation = useNavigation<RoleSelectionScreenNavigationProp>();

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
            
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.heroSection}>
                    <View style={styles.emblemContainer}>
                        <Text style={styles.emblemIcon}>🏛️</Text>
                    </View>
                    <Text style={styles.governmentText}>Government of Gujarat</Text>
                    <Text style={styles.title}>NagarSeva</Text>
                    <Text style={styles.subtitle}>Civic Operations Portal</Text>
                </View>

                <View style={styles.content}>
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.welcomeText}>Welcome back</Text>
                        <Text style={styles.instruction}>Select your operational role to securely log in to the portal.</Text>
                    </View>
                    
                    <RoleCard 
                        title="Surveyor" 
                        description="Conduct field surveys and report active civic issues." 
                        icon="🔍" 
                        onPress={() => navigation.navigate('Login', { role: 'SURVEYOR' })}
                    />

                    <RoleCard 
                        title="Engineer" 
                        description="View assignments and update issue resolution status." 
                        icon="🛠️" 
                        onPress={() => navigation.navigate('Login', { role: 'ENGINEER' })}
                    />
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: spacing.xxxl,
    },
    heroSection: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.primary,
        borderBottomLeftRadius: 36,
        borderBottomRightRadius: 36,
        paddingTop: spacing.xxl + 20, 
        ...shadows.xl,
        zIndex: 10,
        overflow: 'hidden',
    },
    emblemContainer: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.md,
        ...shadows.lg,
        borderWidth: 4,
        borderColor: colors.primaryLight + '30',
    },
    emblemIcon: {
        fontSize: 48,
    },
    governmentText: {
        ...typography.small,
        color: colors.primaryLight,
        fontWeight: '800',
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    title: {
        ...typography.heading1,
        color: colors.textInverse,
        marginTop: spacing.xs,
        textAlign: 'center',
        fontSize: 42,
        letterSpacing: -1,
    },
    subtitle: {
        ...typography.bodyBold,
        color: colors.textInverse,
        opacity: 0.9,
        marginTop: spacing.xs,
        letterSpacing: 1,
    },
    content: {
        flex: 1,
        padding: spacing.xl,
        paddingTop: spacing.xxl,
        backgroundColor: colors.background,
    },
    headerTextContainer: {
        marginBottom: spacing.xxl,
        alignItems: 'center',
    },
    welcomeText: {
        ...typography.heading2,
        color: colors.textPrimary,
        marginBottom: spacing.sm,
        fontSize: 28,
    },
    instruction: {
        ...typography.body,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
        ...shadows.lg,
    },
    cardPressed: {
        borderColor: colors.primaryLight,
        backgroundColor: colors.accent,
    },
    cardIconContainer: {
        width: 56,
        height: 56,
        borderRadius: borderRadius.md,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.lg,
    },
    cardIcon: {
        fontSize: 28,
    },
    cardTextContainer: {
        flex: 1,
    },
    cardTitle: {
        ...typography.heading3,
        color: colors.textPrimary,
        marginBottom: spacing.xs,
    },
    cardDescription: {
        ...typography.caption,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    cardArrow: {
        marginLeft: spacing.md,
        padding: spacing.sm,
    },
    arrowIcon: {
        fontSize: 24,
        color: colors.primaryLight,
    },
});
