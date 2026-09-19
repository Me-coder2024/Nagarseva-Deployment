// API service for the NagarSeva Civic Issue Monitoring System using axios
import api from './axiosClient';
import type { Employee, Issue, Route, Ward } from '@/types';
import type { AuthUser } from '@/atoms/authAtom';

// API response types
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    const response = await api.post<ApiResponse<{ user: AuthUser; token: string }>>(
      '/api/admin/login',
      { email, password }
    );
    return response.data;
  },
};

// Employee API
export const employeeApi = {
  getAll: async () => {
    const response = await api.get<ApiResponse<Employee[]>>('/api/admin/employees');
    return response.data;
  },

  getSurveyors: async () => {
    const response = await api.get<ApiResponse<Employee[]>>('/api/admin/surveyors');
    return response.data;
  },

  getEngineers: async () => {
    const response = await api.get<ApiResponse<Employee[]>>('/api/admin/engineers');
    return response.data;
  },

  create: async (data: { name: string; email: string; password: string; role: string; wardId: string }) => {
    const response = await api.post<ApiResponse<Employee>>('/api/admin/createEmployee', data);
    return response.data;
  },

  update: async (employeeId: string, data: { name?: string; email?: string; role?: string; wardId?: string }) => {
    const response = await api.put<ApiResponse<Employee>>(`/api/admin/updateEmployee/${employeeId}`, data);
    return response.data;
  },

  delete: async (employeeId: string) => {
    const response = await api.delete<ApiResponse<any>>(`/api/admin/deleteEmployee/${employeeId}`);
    return response.data;
  },
};

// Ward API
export const wardApi = {
  getAll: async () => {
    const response = await api.get<ApiResponse<Ward[]>>('/api/admin/wards');
    return response.data;
  },
};

// Route API
export const routeApi = {
  getAll: async () => {
    const response = await api.get<ApiResponse<Route[]>>('/api/admin/routes');
    return response.data;
  },

  assignSurveyor: async (surveyorId: string, routeId: string) => {
    const response = await api.post<ApiResponse<any>>('/api/admin/assignRoute', {
      surveyorId,
      routeId,
    });
    return response.data;
  },

  getRoadHealth: async () => {
    const response = await api.get<ApiResponse<any>>('/api/admin/roadHealth');
    return response.data;
  },

  getMonsoonRisk: async () => {
    const response = await api.get<ApiResponse<any>>('/api/admin/monsoonRisk');
    return response.data;
  },

  createRoute: async (payload: { name: string; wardId: string; distance?: number; startLat?: number; startLon?: number; endLat?: number; endLon?: number }) => {
    const response = await api.post<ApiResponse<Route>>('/api/admin/createRoute', payload);
    return response.data;
  },

  update: async (routeId: string, payload: { name?: string; wardId?: string; distance?: number; startLat?: number; startLon?: number; endLat?: number; endLon?: number }) => {
    const response = await api.put<ApiResponse<Route>>(`/api/admin/updateRoute/${routeId}`, payload);
    return response.data;
  },

  delete: async (routeId: string) => {
    const response = await api.delete<ApiResponse<any>>(`/api/admin/deleteRoute/${routeId}`);
    return response.data;
  },
};

// Issue API
export const issueApi = {
  getAll: async () => {
    const response = await api.get<ApiResponse<Issue[]>>('/api/admin/allIssues');
    return response.data;
  },

  getByStatus: async (status: string) => {
    const response = await api.get<ApiResponse<Issue[]>>('/api/admin/issues', {
      params: { status },
    });
    return response.data;
  },

  assignEngineer: async (issueId: string, engineerId: string) => {
    const response = await api.post<ApiResponse<any>>('/api/admin/assignSolver', {
      issueId,
      engineerId,
    });
    return response.data;
  },

  verifyResolution: async (issueId: string, resolution: 'APPROVED' | 'REJECTED', feedback?: string) => {
    const response = await api.put<ApiResponse<any>>(`/api/admin/issueResolution/${issueId}`, {
      resolution,
      feedback,
    });
    return response.data;
  },

  analyzeIssue: async (issueId: string) => {
    const response = await api.post<ApiResponse<any>>(`/api/admin/analyzeIssue/${issueId}`);
    return response.data;
  },

  auditResolution: async (issueId: string) => {
    const response = await api.post<ApiResponse<any>>(`/api/admin/auditResolution/${issueId}`);
    return response.data;
  },

  getExportUrl: (params?: { startDate?: string; endDate?: string; wardId?: string; status?: string }) => {
    const base = '/api/admin/exportIssues';
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.wardId && params.wardId !== 'all') query.set('wardId', params.wardId);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    return `${query.toString() ? `${base}?${query.toString()}` : base}`;
  },

  delete: async (issueId: string) => {
    const response = await api.delete<ApiResponse<any>>(`/api/admin/issue/${issueId}`);
    return response.data;
  },

  bulkDelete: async (issueIds: string[]) => {
    const response = await api.post<ApiResponse<any>>('/api/admin/bulkDeleteIssues', { issueIds });
    return response.data;
  },
};

// Dashboard API - computed from other endpoints
export const dashboardApi = {
  getStats: async () => {
    // Fetch all required data
    const [employeesRes, issuesRes, routesRes, wardsRes] = await Promise.all([
      employeeApi.getAll(),
      issueApi.getAll(),
      routeApi.getAll(),
      wardApi.getAll(),
    ]);

    const employees = employeesRes.data;
    const issues = issuesRes.data;
    const routes = routesRes.data;
    const wards = wardsRes.data;

    const stats = {
      totalWards: wards.length,
      totalRoutes: routes.length,
      activeSurveyors: employees.filter((e) => e.role === 'SURVEYOR').length,
      openIssues: issues.filter((i) => !['CLOSED', 'RESOLVED', 'REJECTED'].includes(i.status)).length,
      issuesByStatus: {
        DETECTED: issues.filter((i) => i.status === 'DETECTED').length,
        ASSIGNED: issues.filter((i) => i.status === 'ASSIGNED').length,
        IN_PROGRESS: issues.filter((i) => i.status === 'IN_PROGRESS').length,
        FIXED: issues.filter((i) => i.status === 'FIXED').length,
        CLOSED: issues.filter((i) => ['CLOSED', 'RESOLVED', 'REJECTED'].includes(i.status)).length,
      },
    };

    return { success: true, data: { stats, employees, issues, routes, wards } };
  },
};

// Pavement Condition Index (PCI) API
export const pciApi = {
  getWardsPci: async () => {
    const response = await api.get<ApiResponse<any>>('/api/admin/pci/wards');
    return response.data;
  },
  getRoutesPci: async () => {
    const response = await api.get<ApiResponse<any>>('/api/admin/pci/routes');
    return response.data;
  },
};

// Route Optimization (TSP) API
export const routeOptimizationApi = {
  getEngineerOptimizedRoute: async (engineerId: string, lat?: number, lon?: number) => {
    const params: Record<string, any> = {};
    if (lat !== undefined) params.lat = lat;
    if (lon !== undefined) params.lon = lon;
    const response = await api.get<ApiResponse<any>>(`/api/admin/engineers/${engineerId}/optimized-route`, { params });
    return response.data;
  },
};

