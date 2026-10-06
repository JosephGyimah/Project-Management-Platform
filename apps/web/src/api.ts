import type {
  ApiError,
  ApiResponse,
  CreateProjectInput,
  CreateTaskInput,
  PaginatedApiResponse,
  Project,
  ProjectFilters,
  RealtimeEvent,
  Task,
  TaskFilters,
  UpdateProjectInput,
  UpdateTaskInput
} from '@pmp/contracts';

const API_URL =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_URL ??
  'http://localhost:4000';

const WEBSOCKET_OPEN = 1;

type RequestErrorPayload = {
  code: string;
  message: string;
  issues?: Array<{ message: string }>;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues?: Array<{ message: string }>;

  constructor(payload: RequestErrorPayload, status: number) {
    super(payload.issues?.[0]?.message ?? payload.message);
    this.name = 'ApiClientError';
    this.code = payload.code;
    this.status = status;
    this.issues = payload.issues;
  }
}

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

const toRealtimeUrl = (): string => {
  const url = new URL(API_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/api/events';
  return url.toString();
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const fallbackError: RequestErrorPayload = { code: 'REQUEST_FAILED', message: `Request failed with status ${response.status}.` };

    try {
      const error = (await response.json()) as ApiError;
      throw new ApiClientError(
        {
          code: error.error.code ?? fallbackError.code,
          message: error.error.message ?? fallbackError.message,
          issues: error.error.issues
        },
        response.status
      );
    } catch {
      throw new ApiClientError(fallbackError, response.status);
    }
  }

  return response.json() as Promise<T>;
};

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) {
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
};

type RealtimeHandlers = {
  onEvent: (event: RealtimeEvent) => void;
  onError: (message: string) => void;
};

export const api = {
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
    }),
  subscribeToRealtimeEvents: ({ onEvent, onError }: RealtimeHandlers): (() => void) => {
    if (typeof WebSocket === 'undefined') {
      return () => undefined;
    }

    const socket = new WebSocket(toRealtimeUrl());

    socket.addEventListener('message', (event) => {
      try {
        onEvent(JSON.parse(String(event.data)) as RealtimeEvent);
      } catch {
        onError('Received an invalid realtime payload.');
      }
    });

    socket.addEventListener('error', () => {
      onError('Realtime connection error.');
    });

    socket.addEventListener('close', () => {
      if (socket.readyState !== WEBSOCKET_OPEN) {
        onError('Realtime updates disconnected.');
      }
    });

    return () => {
      if (socket.readyState === WEBSOCKET_OPEN) {
        socket.close();
      }
    };
  }
};
