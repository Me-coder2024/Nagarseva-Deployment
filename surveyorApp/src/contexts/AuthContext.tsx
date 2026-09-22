import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import api from '../services/api';
import offlineQueue from '../services/offlineQueue';

export type Role = 'SURVEYOR' | 'ENGINEER' | null;

interface AuthContextType {
    user: User | null;
    role: Role;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string, selectedRole: Role) => Promise<{ success: boolean; message?: string }>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<Role>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        try {
            const token = await AsyncStorage.getItem('authToken');
            const userData = await AsyncStorage.getItem('userData');
            const storedRole = await AsyncStorage.getItem('userRole');

            if (token && userData && storedRole) {
                setUser(JSON.parse(userData));
                setRole(storedRole as Role);
                api.setToken(token);
            }
        } catch (error) {
            console.error('Auth check failed:', error);
        } finally {
            setIsLoading(false);
        }
    }

    async function login(email: string, password: string, selectedRole: Role): Promise<{ success: boolean; message?: string }> {
        try {
            let response;
            if (selectedRole === 'SURVEYOR') {
                response = await api.login(email, password);
            } else if (selectedRole === 'ENGINEER') {
                response = await api.engineerLogin(email, password);
            } else {
                return { success: false, message: 'Invalid role selected.' };
            }

            console.log(`${selectedRole} Login response:`, JSON.stringify(response, null, 2));

            if (response.token) {
                const cleanToken = response.token.replace(/^"|"$/g, "").trim();
                const userData: User = (response as any).user || {
                    id: email,
                    name: email.split('@')[0],
                    email: email,
                    role: selectedRole as 'SURVEYOR' | 'ENGINEER' | 'ADMIN',
                };

                await AsyncStorage.setItem('authToken', cleanToken);
                await AsyncStorage.setItem('userData', JSON.stringify(userData));
                await AsyncStorage.setItem('userRole', selectedRole as string);
                
                api.setToken(cleanToken);
                await offlineQueue.resumeQueue();
                setUser(userData);
                setRole(selectedRole);
                return { success: true };
            }

            return {
                success: false,
                message: response.message || 'Login failed'
            };
        } catch (error) {
            console.error('Login failed:', error);
            return {
                success: false,
                message: 'Network error. Please check your connection.'
            };
        }
    }

    async function logout(): Promise<void> {
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('userData');
        await AsyncStorage.removeItem('userRole');
        api.setToken(null);
        setUser(null);
        setRole(null);
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                role,
                isLoading,
                isAuthenticated: !!user,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
