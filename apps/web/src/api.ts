import type {
  ApiError,
  ApiResponse,
  CreateProjectInput,
  CreateTaskInput,
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

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.error.issues?.[0]?.message ?? error.error.message);
  }

  return response.json() as Promise<T>;
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
    })
};
