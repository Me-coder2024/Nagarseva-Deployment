import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { BASE_URL } from '../config/server';

// Response types
interface LoginResponse {
    success?: boolean;
    token?: string;
    message?: string;
}

interface AssignmentsResponse {
    success: boolean;
    assignments?: any[];
    message?: string;
}

interface StartSurveyResponse {
    success: boolean;
    surverySessionId?: string;
    message?: string;
}

interface GenericResponse {
    success: boolean;
    message?: string;
    data?: any;
}

class ApiService {
    private token: string | null = null;

    async init() {
        this.token = await AsyncStorage.getItem('authToken');
    }

    setToken(token: string | null) {
        this.token = token;
        if (token) {
            AsyncStorage.setItem('authToken', token);
        } else {
            AsyncStorage.removeItem('authToken');
        }
    }

    getToken(): string | null {
        return this.token;
    }

    private getHeaders(isFormData = false) {
        const headers: Record<string, string> = {};
        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    async get<T>(endpoint: string): Promise<T> {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: this.getHeaders(),
        });
        return response.json();
    }

    async post<T>(endpoint: string, data?: any): Promise<T> {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data),
        });
        return response.json();
    }

    async put<T>(endpoint: string, data?: any): Promise<T> {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: data ? JSON.stringify(data) : undefined,
        });
        return response.json();
    }

    // ==================== AUTH ====================

    async login(email: string, password: string): Promise<LoginResponse> {
        return this.post<LoginResponse>('/surveyor/login', { email, password });
    }

    // ==================== ASSIGNMENTS ====================

    async getAssignments(surveyorId: string): Promise<AssignmentsResponse> {
        try {
            const response = await this.post<AssignmentsResponse>('/surveyor/assignments', { surveyorId });
            if (response && response.success && Array.isArray(response.assignments)) {
                return response;
            }
        } catch (e) {
            console.warn('Network or server error fetching assignments:', e);
        }

        return {
            success: true,
            assignments: [],
        };
    }


    async acceptAssignment(routeAssignmentId: string): Promise<GenericResponse> {
        return this.put<GenericResponse>(`/surveyor/acceptAssignment/${routeAssignmentId}`);
    }

    // ==================== SURVEY SESSION ====================

    async startSurvey(routeAssignmentId: string, startedAt: string): Promise<StartSurveyResponse> {
        try {
            const response = await this.post<StartSurveyResponse>('/surveyor/startSurvey', {
                routeAssignmentId,
                startedAt,
            });
            if (response && response.success && response.surverySessionId) {
                return response;
            }
        } catch (e) {
            console.warn('Network or server error starting survey, using local session fallback:', e);
        }

        return {
            success: true,
            surverySessionId: `session-${Date.now()}`,
        };
    }

    async endSurvey(surverySessionId: string, endedAt: string): Promise<GenericResponse> {
        return this.put<GenericResponse>('/surveyor/endSurvey', {
            surverySessionId,
            endedAt,
        });
    }

    // ==================== ENGINEER ====================

    async engineerLogin(email: string, password: string): Promise<LoginResponse> {
        return this.post<LoginResponse>('/engineer/login', { email, password });
    }

    async engineerAcceptAssignment(issueId: string): Promise<GenericResponse> {
        return this.put<GenericResponse>('/engineer/acceptAssignment', { issueId });
    }

    async engineerSolveIssue(issueId: string, engineerId: string, fixImageUri?: string, fixImageName?: string): Promise<GenericResponse> {
        const formData = new FormData();
        formData.append('issueId', issueId);
        formData.append('engineerId', engineerId);

        if (fixImageUri) {
            formData.append('afterImage', {
                uri: fixImageUri,
                name: fixImageName || `fix_${Date.now()}.jpg`,
                type: 'image/jpeg',
            } as any);
        }

        try {
            const response = await fetch(`${BASE_URL}/engineer/solveIssue`, {
                method: 'PUT',
                headers: this.getHeaders(true),
                body: formData,
            });
            return response.json();
        } catch (error) {
            console.error('engineerSolveIssue network error:', error);
            throw error;
        }
    }

    // ==================== FRAME UPLOAD ====================

    async uploadFrames(
        frames: string[],
        routeId: string,
        wardId: string,
        surverySessionId: string,
        routeAssignmentId: string,
        latitude?: number,
        longitude?: number
    ): Promise<{ success: boolean }> {
        console.log('=== uploadFrames called ===');
        console.log('GPS being sent - lat:', latitude, 'lon:', longitude);
        const formData = new FormData();

        formData.append('routeId', routeId);
        formData.append('wardId', wardId);
        formData.append('surverySessionId', surverySessionId);
        formData.append("routeAssignmentId", routeAssignmentId);

        if (latitude) formData.append('latitude', latitude.toString());
        if (longitude) formData.append('longitude', longitude.toString());
        else console.log('WARNING: No GPS coordinates provided to uploadFrames');

        frames.forEach((uri, index) => {
            console.log(`Adding frame ${index}:`, uri);
            formData.append('frames', {
                uri,
                name: `frame_${index}.jpg`,
                type: 'image/jpeg',
            } as any);
        });

        const uploadUrls = Array.from(new Set([
            `${BASE_URL}/surveyor/upload`,
        ]));

        for (const url of uploadUrls) {
            try {
                console.log('Making fetch request to:', url);
                const response = await fetch(url, {
                    method: 'POST',
                    headers: this.getHeaders(true),
                    body: formData,
                });

                const result = await response.json();
                if (response.ok && result) {
                    console.log('✅ Upload frames succeeded at:', url);
                    return result;
                }
            } catch (error: any) {
                console.warn(`Upload frames attempt to ${url} failed:`, error?.message || error);
            }
        }
        throw new Error('Failed to connect to backend server for frame upload.');
    }

    // ==================== SINGLE DETECTION REPORT ====================

    async reportDetection(
        photoUri: string,
        routeId: string,
        wardId: string,
        surverySessionId: string,
        routeAssignmentId: string,
        latitude: number,
        longitude: number,
        confidence: number,
        photoData?: string,
        accuracy?: number,
        capturedAt?: string,
        detectionId?: string
    ): Promise<{ success: boolean; data?: any; message?: string; httpStatus?: number }> {
        // Use provided detectionId if available; fall back to last 12 chars of URI for backward-compat
        const resolvedDetectionId = detectionId || photoUri.slice(-12);
        console.log(`[UPLOAD FORM DATA] Detection ID=${resolvedDetectionId} lat=${latitude} lng=${longitude} accuracy=${accuracy ?? 'N/A'} capturedAt=${capturedAt ?? 'N/A'}`);
        console.log(`[FORMDATA detectionId=${resolvedDetectionId}] routeId=${routeId} wardId=${wardId} sessionId=${surverySessionId} assignmentId=${routeAssignmentId} confidence=${confidence} accuracy=${accuracy ?? 'N/A'} capturedAt=${capturedAt ?? 'N/A'}`);
        console.log(`[FORMDATA detectionId=${resolvedDetectionId}] photoUri=${photoUri.slice(-40)} hasPhotoData=${!!photoData}`);

        if (!this.token) {
            this.token = await AsyncStorage.getItem('authToken');
        }

        const urlsToTry = Array.from(new Set([
            `${BASE_URL}/surveyor/reportDetection`,
        ]));

        // 1. Try Multipart upload first across available URLs
        const formData = new FormData();
        formData.append('detectionId', resolvedDetectionId);
        if (routeId) formData.append('routeId', routeId);
        if (wardId) formData.append('wardId', wardId);
        if (surverySessionId && !surverySessionId.startsWith('session-') && !surverySessionId.startsWith('default-')) {
            formData.append('surverySessionId', surverySessionId);
        }
        if (routeAssignmentId) formData.append('routeAssignmentId', routeAssignmentId);
        formData.append('latitude', latitude.toString());
        formData.append('longitude', longitude.toString());
        formData.append('confidence', confidence.toString());
        if (accuracy !== undefined && accuracy !== null) {
            formData.append('accuracy', accuracy.toString());
        }
        if (capturedAt) {
            formData.append('capturedAt', capturedAt);
        }
        const cleanUri = photoUri.startsWith('file://')
            ? photoUri
            : photoUri.startsWith('/')
                ? `file://${photoUri}`
                : photoUri;

        formData.append('photoUri', cleanUri);

        const isFileUri = cleanUri && !cleanUri.startsWith('http') && !cleanUri.startsWith('data:');
        if (isFileUri) {
            formData.append('photo', {
                uri: cleanUri,
                name: `pothole_${Date.now()}.jpg`,
                type: 'image/jpeg',
            } as any);
        } else if (photoData) {
            // Only send photoData if no local file URI is present
            formData.append('photoData', photoData);
        }

        for (const url of urlsToTry) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: this.getHeaders(true),
                    body: formData,
                });
                const result = await response.json();
                if (response.ok && result && result.success) {
                    console.log('✅ Multipart upload succeeded at:', url);
                    return { success: true, ...result, httpStatus: response.status };
                }
                // Log non-success responses so developers can diagnose
                console.warn(`[UPLOAD] Multipart non-success at ${url} — HTTP ${response.status}:`, JSON.stringify(result));
                if (response.status === 401) {
                    return { success: false, message: 'Session expired. Please log out and log in again.', httpStatus: response.status };
                }
                if (result?.message) {
                    return { success: false, message: result.message, httpStatus: response.status };
                }
            } catch (err) {
                console.warn(`Multipart upload to ${url} failed:`, err);
            }
        }

        // 2. Fallback to JSON base64 payload across available URLs
        const jsonPayload = JSON.stringify({
            routeId,
            wardId,
            surverySessionId: (surverySessionId && !surverySessionId.startsWith('session-') && !surverySessionId.startsWith('default-')) ? surverySessionId : undefined,
            routeAssignmentId,
            latitude,
            longitude,
            confidence,
            photoData: photoData || (photoUri.startsWith('data:') ? photoUri : undefined),
            photoUri: photoUri.startsWith('http') ? photoUri : undefined,
        });

        for (const url of urlsToTry) {
            try {
                const jsonRes = await fetch(url, {
                    method: 'POST',
                    headers: {
                        ...this.getHeaders(),
                        'Content-Type': 'application/json',
                    },
                    body: jsonPayload,
                });
                const jsonResult = await jsonRes.json();
                if (jsonRes.ok && jsonResult && jsonResult.success) {
                    console.log('✅ JSON base64 upload succeeded at:', url);
                    return { success: true, ...jsonResult, httpStatus: jsonRes.status };
                }
                console.warn(`[UPLOAD] JSON fallback non-success at ${url} — HTTP ${jsonRes.status}:`, JSON.stringify(jsonResult));
                if (jsonRes.status === 401) {
                    return { success: false, message: 'Session expired. Please log out and log in again.', httpStatus: jsonRes.status };
                }
                if (jsonResult?.message) {
                    return { success: false, message: jsonResult.message, httpStatus: jsonRes.status };
                }
            } catch (e) {
                console.warn(`JSON upload to ${url} failed:`, e);
            }
        }

        return {
            success: false,
            message: 'Failed to connect to backend server. Please check your internet connection.',
            httpStatus: undefined
        };
    }
}

export const api = new ApiService();
export default api;
