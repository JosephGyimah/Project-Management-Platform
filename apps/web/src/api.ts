import type {
  ApiError,
  ApiResponse,
  AuthResponse,
  AuthUser,
  CreateProjectInput,
  CreateTaskInput,
  LoginInput,
  PaginatedApiResponse,
  Project,
  ProjectFilters,
  Task,
  TaskFilters,
  UpdateProjectInput,
  UpdateTaskInput
} from '@pmp/contracts';

const API_URL =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_URL ??
  'http://localhost:4000';

const ACCESS_TOKEN_KEY = 'pmp_access_token';

let accessToken = typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? '' : '';
let refreshInFlight: Promise<string | null> | null = null;

const toQueryString = (params: Record<string, string | number | undefined>): string => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.append(key, String(value));
    }
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

const setAccessToken = (token: string) => {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }
};

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const error = (await response.json()) as ApiError;
    return error.error.issues?.[0]?.message ?? error.error.message;
  } catch {
    return 'Request failed.';
  }
};

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      setAccessToken('');
      return null;
    }

    const payload = (await response.json()) as AuthResponse;
    setAccessToken(payload.data.accessToken);
    return payload.data.accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
};

const request = async <T>(path: string, init?: RequestInit, retry = true): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (response.status === 401 && retry && !path.startsWith('/api/auth/')) {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      return request<T>(path, init, false);
    }
  }

  if (!response.ok) {
    throw new Error(await toErrorMessage(response));
  }

  return response.json() as Promise<T>;
};

export const api = {
  login: async (payload: LoginInput): Promise<AuthResponse> => {
    const response = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    }, false);
    setAccessToken(response.data.accessToken);
    return response;
  },
  me: () => request<ApiResponse<AuthUser>>('/api/auth/me'),
  logout: async () => {
    await request<{ data: { loggedOut: true } }>('/api/auth/logout', { method: 'POST' }, false);
    setAccessToken('');
  },
  listProjects: (filters: ProjectFilters) =>
    request<PaginatedApiResponse<Project>>(
      `/api/projects${toQueryString({
        search: filters.search,
        status: filters.status,
        page: filters.page,
        pageSize: filters.pageSize
      })}`
    ),
  createProject: (payload: CreateProjectInput) =>
    request<ApiResponse<Project>>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateProject: (projectId: string, payload: UpdateProjectInput) =>
    request<ApiResponse<Project>>(`/api/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteProject: (projectId: string) =>
    request<{ data: { deleted: boolean } }>(`/api/projects/${projectId}`, {
      method: 'DELETE'
    }),
  listTasks: (filters: TaskFilters) =>
    request<PaginatedApiResponse<Task>>(
      `/api/projects/${filters.projectId}/tasks${toQueryString({
        search: filters.search,
        status: filters.status,
        page: filters.page,
        pageSize: filters.pageSize
      })}`
    ),
  createTask: (payload: CreateTaskInput) =>
    request<ApiResponse<Task>>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateTask: (taskId: string, payload: UpdateTaskInput) =>
    request<ApiResponse<Task>>(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteTask: (taskId: string) =>
    request<{ data: { deleted: boolean } }>(`/api/tasks/${taskId}`, {
      method: 'DELETE'
    })
};
