export type ProjectStatus = 'active' | 'archived';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface User { id: string; email: string; displayName: string; }
export interface Project { id: string; name: string; description?: string; status: ProjectStatus; ownerId: string; createdAt: string; }
export interface Task { id: string; projectId: string; title: string; description?: string; status: TaskStatus; assigneeId?: string; }
export interface Comment { id: string; taskId: string; authorId: string; body: string; createdAt: string; }

export interface CreateProjectInput { name: string; description?: string; }
export interface CreateTaskInput { projectId: string; title: string; description?: string; }
export interface CreateCommentInput { body: string; }
export interface ApiResponse<T> { data: T; }
export interface ApiError { error: { code: string; message: string }; }
