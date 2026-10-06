export type ProjectStatus = 'active' | 'archived';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export type UserRole = 'admin' | 'project_lead' | 'member';

export interface AuthUser extends User {
  role: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  data: {
    user: AuthUser;
    accessToken: string;
  };
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  exp: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  ownerId: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeId?: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedApiResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ProjectFilters {
  search?: string;
  status?: ProjectStatus;
  page?: number;
  pageSize?: number;
}

export interface TaskFilters {
  projectId: string;
  search?: string;
  status?: TaskStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
}

export interface CreateCommentInput {
  body: string;
}

export interface ApiResponse<T> {
  data: T;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    issues?: ValidationIssue[];
  };
}
